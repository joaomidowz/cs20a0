<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SandboxPlayerPicker from '$lib/components/SandboxPlayerPicker.svelte';
  import SandboxSeriesViewer from '$lib/components/SandboxSeriesViewer.svelte';
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import AutomationGear from '$lib/components/AutomationGear.svelte';
  import { TIMEOUT_LOSS_STREAK } from '$lib/game/bot-policies';
  import type { PendingSeriesDecision } from '$lib/game/online/live-series';
  import VetoBoard from '$lib/components/live/VetoBoard.svelte';
  import SidePickPrompt from '$lib/components/live/SidePickPrompt.svelte';
  import EcoCallPrompt from '$lib/components/live/EcoCallPrompt.svelte';
  import TimeoutButton from '$lib/components/live/TimeoutButton.svelte';
  import MajorOverview from '$lib/components/MajorOverview.svelte';
  import TeamRosterModal from '$lib/components/TeamRosterModal.svelte';
  import RunStatsGrid from '$lib/components/RunStatsGrid.svelte';
  import MajorAwardsPanel from '$lib/components/MajorAwardsPanel.svelte';
  import CollapsibleStats from '$lib/components/CollapsibleStats.svelte';
  import RunHighlights from '$lib/components/RunHighlights.svelte';
  import { createRunStats } from '$lib/game/runStats';
  import { orientSeriesToTeam } from '$lib/game/simulation';
  import { getTeamPlayers, playerById, teamById, teams } from '$lib/game/data';
  import { getLineupMapContributors, getLineupMapYears, getMapFamiliarity, getMapName, MAP_POOL } from '$lib/game/maps';
  import { language, theme } from '$lib/game/pageState';
  import { getEligibleSlotRoles, getRoleLabel } from '$lib/game/roleRules';
  import { DEFAULT_STRATEGIC_AUTOMATION, loadStrategicPreferences, saveStrategicPreferences, type StrategicAutomationPreferences } from '$lib/game/preferences';
  import { advanceSandboxMajor, autoDecideSandbox, applySandboxEcoCall, applySandboxSide, applySandboxVeto, callSandboxTimeout, createSandboxMajor, getSandboxLiveView, pendingSandboxDecision, skipSandboxMap, stepSandboxSeries, type SandboxLiveView } from '$lib/game/sandbox/major';
  import { createRandomSandboxLineup, getDefaultSandboxMapPreferences, previewSandboxLineupPower, validateSandboxLineup } from '$lib/game/sandbox/lineup';
  import { getSandboxCampaignSummary, getSandboxTeamName, getSandboxUserProgress, SANDBOX_PHASE_LABELS } from '$lib/game/sandbox/presentation';
  import type { SandboxLineupSelection, SandboxMajorState } from '$lib/game/sandbox/types';
  import type { MajorRun, PlayerRunStats } from '$lib/game/types';
  import type { HistoricalTeam, LineupSlotRole, MapId, OrgStyle, Player, SelectedPlayer } from '$lib/game/types';
  import '../../app.css';

  const roles: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
  const SELECTION_KEY = 'cs13a0:sandboxSelection';
  const SPEED_KEY = 'cs13a0:sandboxSimulationSpeed';
  const defaultOrganization = teams[0];
  const originalRoster = (organizationId: string) => getTeamPlayers(teamById.get(organizationId) ?? null).slice(0, 5);
  const rosterPicks = (players: Player[]): SelectedPlayer[] => players.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
  const initialRoster = originalRoster(defaultOrganization?.id ?? '');

  let selection: SandboxLineupSelection = {
    organizationId: defaultOrganization?.id ?? '',
    style: 'balanced',
    players: rosterPicks(initialRoster),
    mapPreferences: getDefaultSandboxMapPreferences(rosterPicks(initialRoster))
  };
  let seed = 'sandbox-major';
  let simulationMode: 'automatic' | 'manual' = 'automatic';
  let strategicPreferences: StrategicAutomationPreferences = { ...DEFAULT_STRATEGIC_AUTOMATION };
  /** Marks the half already covered by an automatic pause, so it is asked at most once per half. */
  let autoPausedHalf = '';
  let automationTimer: number | null = null;
  let liveRunning = false;
  let liveTimer: number | null = null;
  let major: SandboxMajorState | null = null;
  let timer: number | null = null;
  let editingSlot: number | null = null;
  let majorView: 'current' | 'all' = 'current';
  let simulationSpeed: 'normal' | 'fast' | 'ultra' | 'insta' = 'normal';
  let currentSeriesReady = false;
  let hydrated = false;
  let viewingTeam: HistoricalTeam | null = null;

  const speedDelays = { normal: 1500, fast: 650, ultra: 180, insta: 0 } as const;
  const speedOptions = [
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Rápido' },
    { value: 'ultra', label: 'Ultra' },
    { value: 'insta', label: 'Insta' }
  ];
  const styleOptions = [
    { value: 'aggressive', label: 'Agressivo' },
    { value: 'balanced', label: 'Equilibrado' },
    { value: 'tactical', label: 'Tático' }
  ];
  const modeOptions = [
    { value: 'automatic', label: 'Automático' },
    { value: 'manual', label: 'Manual' }
  ];
  const viewOptions = [
    { value: 'current', label: 'Jogo atual' },
    { value: 'all', label: 'Todos os jogos' }
  ];

  $: selectedPlayers = selection.players.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
  $: contributors = getLineupMapContributors(selectedPlayers, teams);
  $: mapYears = getLineupMapYears(selectedPlayers, teams);
  $: validation = validateSandboxLineup(selection);
  $: preview = previewSandboxLineupPower(selection.players, selection.style, selection.organizationId);
  $: organization = teamById.get(selection.organizationId) ?? null;
  $: rankedMaps = [...MAP_POOL].sort((left, right) => contributors[right].length - contributors[left].length || left.localeCompare(right));
  $: currentMatch = major?.matches[major.currentMatchIndex] ?? null;
  $: resolvedMatches = major?.matches.filter((match) => match.resolved) ?? [];
  $: userResults = resolvedMatches.filter((match) => match.userMatch);
  $: userWins = userResults.filter((match) => match.winnerId === major?.userTeam.id).length;
  $: userLosses = userResults.length - userWins;
  $: resolvedIds = new Set(resolvedMatches.map((match) => match.id));
  $: campaign = major ? getSandboxCampaignSummary(major) : null;
  $: progress = major ? getSandboxUserProgress(major) : null;
  $: championName = major ? getSandboxTeamName(major, major.championId) : '';
  $: sandboxStats = major?.finished && campaign ? buildSandboxStats(major, campaign.placement) : [];
  $: liveView = major?.interactive ? getSandboxLiveView(major) : null;
  $: pendingDecision = major?.interactive ? pendingSandboxDecision(major) : null;
  $: liveTeamNames = currentMatch ? { [currentMatch.teamA.id]: currentMatch.teamA.name, [currentMatch.teamB.id]: currentMatch.teamB.name } as Record<string, string> : {};
  $: userFamiliarity = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, getMapFamiliarity(contributors[mapId].length)])) as Record<MapId, number>;
  $: if (liveView?.finished && !currentSeriesReady) { liveRunning = false; currentSeriesReady = true; }
  $: if (liveView && !liveView.finished && !liveRunning && simulationMode === 'automatic' && !currentSeriesReady) liveRunning = true;
  $: if (liveRunning && liveView && !liveView.finished && !pendingDecision && liveTimer === null) scheduleLiveTick();
  $: queueAutomation(pendingDecision, liveView, strategicPreferences);

  const placementKey = (state: SandboxMajorState, summary: { champion: boolean; lastPhase: string | null }) =>
    summary.champion ? 'placementChampion' : summary.lastPhase === 'final' ? 'placementRunnerUp' : summary.lastPhase === 'semifinal' ? 'placement3to4' : summary.lastPhase === 'quarterfinal' ? 'placement5to8' : 'placementStage3';

  /** Player statistics and MVP for the Sandbox campaign, generated the same way as the offline Major. */
  function buildSandboxStats(state: SandboxMajorState, _placement: string): PlayerRunStats[] {
    const summary = getSandboxCampaignSummary(state);
    const userId = state.userTeam.id;
    const matches = state.matches.filter((match) => match.userMatch && match.resolved).map((match) => orientSeriesToTeam(match, userId));
    const stage3 = matches.filter((match) => match.phase === 'stage3');
    const wins = stage3.filter((match) => match.winnerId === userId).length;
    const run: MajorRun = {
      stage3: { wins, losses: stage3.length - wins, qualified: wins === 3, matches: stage3 },
      matches,
      champion: summary.champion,
      placement: placementKey(state, summary)
    };
    const lineupPlayers = state.selection.players.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
    return createRunStats(lineupPlayers, run, state.seed, state.selection.players, userId);
  }
  $: if (hydrated) persistSelection(selection);
  $: if (simulationMode === 'automatic' && currentSeriesReady && currentMatch && !major?.finished) scheduleAdvance(currentMatch.id);

  onMount(() => {
    strategicPreferences = loadStrategicPreferences();
    const storedSpeed = localStorage.getItem(SPEED_KEY);
    if (storedSpeed === 'normal' || storedSpeed === 'fast' || storedSpeed === 'ultra' || storedSpeed === 'insta') simulationSpeed = storedSpeed;
    try {
      const stored = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null');
      if (stored && teamById.has(stored.organizationId) && Array.isArray(stored.players) && stored.players.length === 5
        && stored.players.every((pick: SelectedPlayer) => playerById.has(pick?.playerId) && roles.includes(pick?.selectedSlotRole))) {
        selection = {
          organizationId: stored.organizationId,
          style: ['aggressive', 'balanced', 'tactical'].includes(stored.style) ? stored.style : 'balanced',
          players: stored.players.map((pick: SelectedPlayer) => ({ playerId: pick.playerId, selectedSlotRole: pick.selectedSlotRole })),
          mapPreferences: Array.isArray(stored.mapPreferences) ? stored.mapPreferences.filter((mapId: MapId) => MAP_POOL.includes(mapId)).slice(0, 3) : []
        };
        if (typeof stored.seed === 'string' && stored.seed.trim()) seed = stored.seed.slice(0, 48);
        if (stored.simulationMode === 'manual' || stored.simulationMode === 'automatic') simulationMode = stored.simulationMode;
      }
    } catch { /* ignore corrupted storage */ }
    hydrated = true;
  });

  onDestroy(() => {
    if (timer !== null) window.clearTimeout(timer);
    if (liveTimer !== null) window.clearTimeout(liveTimer);
    if (automationTimer !== null) window.clearTimeout(automationTimer);
  });

  function persistSelection(value: SandboxLineupSelection) {
    try { localStorage.setItem(SELECTION_KEY, JSON.stringify({ ...value, seed, simulationMode })); } catch { /* storage unavailable */ }
  }

  /** Interactive mode: plays the user's series one step at a time, pausing whenever a decision is pending. */
  function scheduleLiveTick() {
    if (liveTimer !== null) return;
    const gap = liveView?.phase === 'intermission' ? 900 : speedDelays[simulationSpeed];
    liveTimer = window.setTimeout(() => {
      liveTimer = null;
      if (!major?.interactive || !liveRunning) return;
      if (simulationSpeed === 'insta') {
        let next = major;
        for (let guard = 0; guard < 200 && !pendingSandboxDecision(next) && !getSandboxLiveView(next)?.finished; guard += 1) next = stepSandboxSeries(next);
        major = next;
      } else {
        major = stepSandboxSeries(major);
      }
    }, gap);
  }

  function stopLiveTick() {
    if (liveTimer !== null) window.clearTimeout(liveTimer);
    liveTimer = null;
    liveRunning = false;
  }

  function startLiveSeries() {
    if (!major?.interactive || liveView?.finished) return;
    liveRunning = true;
  }

  function decideVeto(mapId: MapId) {
    if (!major || pendingDecision?.kind !== 'veto') return;
    major = applySandboxVeto(major, pendingDecision.action, mapId);
  }

  function decideSide(side: 'ct' | 't') {
    if (!major || pendingDecision?.kind !== 'side') return;
    major = applySandboxSide(major, side);
  }

  function decideEco(call: 'force' | 'eco') {
    if (!major || pendingDecision?.kind !== 'eco-call') return;
    major = applySandboxEcoCall(major, call);
  }

  function requestTimeout() {
    if (!major) return;
    try { major = callSandboxTimeout(major); } catch { /* no timeout left in this half */ }
  }

  function skipLiveMap() {
    if (!major?.interactive) return;
    major = skipSandboxMap(major);
  }

  function scheduleAdvance(matchId: string) {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (major?.matches[major.currentMatchIndex]?.id === matchId) advanceCurrentMatch();
    }, simulationSpeed === 'insta' ? 0 : simulationSpeed === 'ultra' ? 400 : 900);
  }

  function updateOrganization(organizationId: string) {
    const picks = rosterPicks(originalRoster(organizationId));
    selection = { ...selection, organizationId, players: picks, mapPreferences: getDefaultSandboxMapPreferences(picks) };
  }

  function restoreOriginalRoster() {
    updateOrganization(selection.organizationId);
  }

  function randomizeLineup() {
    const picks = createRandomSandboxLineup(`${seed}:${Date.now()}`);
    if (picks.length !== 5) return;
    selection = { ...selection, players: picks, mapPreferences: getDefaultSandboxMapPreferences(picks) };
  }

  function randomizeSeed() {
    seed = `sandbox-${Math.random().toString(36).slice(2, 8)}`;
    persistSelection(selection);
  }

  function replacePlayer(index: number, player: Player, selectedSlotRole: LineupSlotRole) {
    const players = selection.players.map((pick, slot) => slot === index ? { playerId: player.id, selectedSlotRole } : pick);
    const nextPlayers = players.map((pick) => playerById.get(pick.playerId)).filter((item): item is Player => Boolean(item));
    const nextContributors = getLineupMapContributors(nextPlayers, teams);
    const stillValid = selection.mapPreferences.filter((mapId) => nextContributors[mapId].length > 0);
    selection = { ...selection, players, mapPreferences: stillValid.length === 3 ? stillValid : getDefaultSandboxMapPreferences(players) };
    editingSlot = null;
  }

  function updateRole(index: number, selectedSlotRole: LineupSlotRole) {
    selection = { ...selection, players: selection.players.map((pick, slot) => slot === index ? { ...pick, selectedSlotRole } : pick) };
  }

  function toggleMap(mapId: MapId) {
    const selected = selection.mapPreferences;
    if (selected.includes(mapId)) selection = { ...selection, mapPreferences: selected.filter((item) => item !== mapId) };
    else if (contributors[mapId].length > 0 && selected.length < 3) selection = { ...selection, mapPreferences: [...selected, mapId] };
  }

  function autoSelectMaps() {
    selection = { ...selection, mapPreferences: getDefaultSandboxMapPreferences(selection.players) };
  }

  function startMajor() {
    if (!validation.valid) return;
    persistSelection(selection);
    stopLiveTick();
    major = createSandboxMajor(selection, seed, { interactive: true });
    currentSeriesReady = false;
    majorView = 'current';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setSimulationSpeed(value: string) {
    if (value !== 'normal' && value !== 'fast' && value !== 'ultra' && value !== 'insta') return;
    simulationSpeed = value;
    localStorage.setItem(SPEED_KEY, value);
  }

  function setSimulationMode(value: string) {
    if (value !== 'automatic' && value !== 'manual') return;
    simulationMode = value;
    if (value === 'manual' && timer !== null) { window.clearTimeout(timer); timer = null; }
    persistSelection(selection);
  }

  function setStrategicPreferences(value: StrategicAutomationPreferences) {
    strategicPreferences = value;
    saveStrategicPreferences(value);
  }

  const isAutomated = (decision: PendingSeriesDecision, preferences: StrategicAutomationPreferences) =>
    decision.kind === 'eco-call' ? preferences.autoEconomy : preferences.autoMapPicksAndVetos;

  const pauseKey = (view: SandboxLiveView) => `${view.seriesId}:${view.activeMap}:${view.timeoutsLeft}`;

  const wantsAutomaticPause = (view: SandboxLiveView | null, preferences: StrategicAutomationPreferences) =>
    Boolean(preferences.autoPause && view && view.phase === 'live' && !view.finished
      && view.timeoutsLeft > 0 && view.lossStreak >= TIMEOUT_LOSS_STREAK && autoPausedHalf !== pauseKey(view));

  /** Queues the automation: writing the Major from inside a reactive block would not restart the cycle. */
  function queueAutomation(pending: PendingSeriesDecision | null, view: SandboxLiveView | null, preferences: StrategicAutomationPreferences) {
    if (!major || automationTimer !== null) return;
    const decides = Boolean(pending && isAutomated(pending, preferences));
    if (!decides && !(!pending && wantsAutomaticPause(view, preferences))) return;
    automationTimer = window.setTimeout(runAutomation, 0);
  }

  /** Takes every decision the player left on automatic, then the tactical pause when it is on. */
  function runAutomation() {
    automationTimer = null;
    if (!major) return;
    let next = major;
    for (let guard = 0; guard < 40; guard += 1) {
      const pending = pendingSandboxDecision(next);
      if (!pending || !isAutomated(pending, strategicPreferences)) break;
      next = autoDecideSandbox(next);
    }
    const view = pendingSandboxDecision(next) ? null : getSandboxLiveView(next);
    if (wantsAutomaticPause(view, strategicPreferences) && view) {
      autoPausedHalf = pauseKey(view);
      try { next = callSandboxTimeout(next); } catch { /* no timeout left in this half */ }
    }
    major = next;
  }

  function advanceCurrentMatch() {
    if (!major) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    stopLiveTick();
    currentSeriesReady = false;
    major = advanceSandboxMajor(major);
  }

  function restart() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    stopLiveTick();
    currentSeriesReady = false;
    major = null;
  }

  function playAgainWithNewSeed() {
    restart();
    randomizeSeed();
    startMajor();
  }

  const shortRoleLabel: Record<LineupSlotRole, string> = { igl: 'IGL', awper: 'AWP', entry: 'ENTRY', lurker: 'LURK', support: 'SUP', rifler: 'RIFLE' };
  function openTeam(teamId: string) {
    const team = teamById.get(teamId);
    if (team) viewingTeam = team;
  }

  const initials = (name: string | null | undefined) => (name ?? '?').slice(0, 2).toUpperCase();
  const playerOrigin = (player: Player | undefined) => player ? `${teamById.get(player.teamId ?? '')?.name ?? '—'} · ${(player.teamId ? teamById.get(player.teamId)?.year : null) ?? player.year ?? '—'}` : '—';
  const styleLabel = (style: OrgStyle) => styleOptions.find((option) => option.value === style)?.label ?? style;
</script>

<svelte:head>
  <title>Sandbox · CS13a0</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'} wide>
  {#if !major}
    <header class="sandbox-header"><span class="eyebrow">SANDBOX LOCAL</span><h1>Monte o impossível.</h1><p>Combine cinco jogadores de qualquer era, repita funções se quiser, escolha três mapas conhecidos e simule um Major completo sem alterar sua campanha.</p></header>

    <section class="sandbox-setup panel">
      <label><span>Organização</span><select value={selection.organizationId} on:change={(event) => updateOrganization(event.currentTarget.value)}>{#each teams as team}<option value={team.id}>{team.name} · {team.year}</option>{/each}</select></label>
      <div class="control-group"><span>Estilo</span><SegmentedControl value={selection.style} options={styleOptions} label="Estilo de jogo" onChange={(value) => selection = { ...selection, style: value as OrgStyle }} /></div>
      <div class="control-group"><span>Avanço</span><div class="control-row"><SegmentedControl value={simulationMode} options={modeOptions} label="Avanço das séries" onChange={setSimulationMode} /><AutomationGear value={strategicPreferences} language={$language} onChange={setStrategicPreferences} /></div></div>
      <label class="seed-field"><span>Seed</span><span class="seed-row"><input bind:value={seed} maxlength="48" on:change={() => persistSelection(selection)} /><button class="secondary" type="button" on:click={randomizeSeed} title="Gerar outra seed">Nova</button></span></label>
    </section>

    <div class="sandbox-build">
      <section class="sandbox-roster">
        <header class="section-heading"><div><span class="eyebrow">ELENCO · {organization?.name ?? ''} {organization?.year ?? ''}</span><h2>Cinco slots livres</h2></div><div class="sandbox-roster-actions"><button class="secondary" type="button" on:click={restoreOriginalRoster}>Elenco original</button><button class="secondary" type="button" on:click={randomizeLineup}>Sortear elenco</button></div></header>
        <div class="sandbox-slots">
          {#each selection.players as pick, index}
            {@const player = playerById.get(pick.playerId)}
            {@const eligible = player ? getEligibleSlotRoles(player) : []}
            {@const offRole = Boolean(player) && !eligible.includes(pick.selectedSlotRole)}
            <article class="panel sandbox-slot" class:off-role={offRole}>
              <span class="slot-number">{index + 1}</span>
              <button class="sandbox-player-card" type="button" on:click={() => editingSlot = index} aria-label={`Trocar jogador do slot ${index + 1}`}>
                <span class="avatar">{initials(player?.nickname)}</span>
                <div><strong>{player?.nickname ?? 'Escolher jogador'}</strong><small>{playerOrigin(player)}</small></div>
                <b>{player?.overall ?? '—'}</b>
                <i class="swap-hint">TROCAR</i>
              </button>
              <div class="slot-roles" role="group" aria-label={`Função do slot ${index + 1}`}>
                {#each roles as role}
                  <button type="button" class:active={pick.selectedSlotRole === role} class:eligible={eligible.includes(role)} on:click={() => updateRole(index, role)} aria-pressed={pick.selectedSlotRole === role} aria-label={getRoleLabel(role)} title={`${getRoleLabel(role)} · ${eligible.includes(role) ? 'função natural' : 'fora da função natural'}`}>{shortRoleLabel[role]}</button>
                {/each}
              </div>
              {#if offRole}<small class="slot-note">Fora da função natural ({eligible.map(getRoleLabel).join(', ')})</small>{/if}
              {#if validation.errors[`players.${index}.playerId`]}<small class="error">{validation.errors[`players.${index}.playerId`]}</small>{/if}
            </article>
          {/each}
        </div>
      </section>

      <aside class="sandbox-power panel" aria-live="polite">
        <span class="eyebrow">PRÉVIA DO TIME</span>
        <strong class="power-value">{preview.power.toFixed(1)}</strong>
        <div class="power-bar"><span style={`width:${Math.max(0, Math.min(100, preview.power))}%`}></span></div>
        <small>Poder estimado · {styleLabel(selection.style)}</small>
        <dl class="power-stats">
          <div><dt>OVR médio</dt><dd>{preview.averageOverall || '—'}</dd></div>
          <div><dt>Épocas</dt><dd>{preview.eras.length ? preview.eras.join(' · ') : '—'}</dd></div>
          <div><dt>Mapas em comum</dt><dd>{rankedMaps.filter((mapId) => contributors[mapId].length === 5).length}</dd></div>
        </dl>
        <div class="role-summary">
          {#each roles as role}<span class:filled={preview.roles[role] > 0} class:multi={preview.roles[role] > 1}>{getRoleLabel(role)}{#if preview.roles[role] > 1} ×{preview.roles[role]}{/if}</span>{/each}
        </div>
        {#if preview.missing.length || preview.offRoleCount || preview.duplicates}
          <ul class="power-warnings">
            {#if preview.missing.length}<li>Sem {preview.missing.map(getRoleLabel).join(', ')} — a composição perde bônus.</li>{/if}
            {#if preview.offRoleCount}<li>{preview.offRoleCount} jogador{preview.offRoleCount > 1 ? 'es' : ''} fora da função natural.</li>{/if}
            {#if preview.duplicates}<li>Mesmo jogador em eras diferentes — permitido no Sandbox.</li>{/if}
          </ul>
        {:else}
          <p class="power-ok">Composição completa: IGL, AWPer, entry, lurker e support.</p>
        {/if}
      </aside>
    </div>

    <section class="sandbox-maps panel">
      <header><div><span class="eyebrow">ACTIVE DUTY 2016–2026</span><h2>Três preferências</h2></div><div class="sandbox-maps-actions"><strong>{selection.mapPreferences.length}/3</strong><button class="secondary" type="button" on:click={autoSelectMaps}>Auto</button></div></header>
      <div class="sandbox-map-grid">
        {#each rankedMaps as mapId (mapId)}
          {@const count = contributors[mapId].length}
          {@const order = selection.mapPreferences.indexOf(mapId)}
          <button type="button" class:selected={order >= 0} disabled={count === 0 || (order < 0 && selection.mapPreferences.length >= 3)} on:click={() => toggleMap(mapId)} aria-pressed={order >= 0}>
            <span class="map-order">{order >= 0 ? order + 1 : ''}</span>
            <strong>{getMapName(mapId)}</strong>
            <span class="map-familiarity"><i style={`width:${getMapFamiliarity(count)}%`}></i></span>
            <span class="map-meta">{getMapFamiliarity(count)}% · {count}/5</span>
            <span class="map-contributors">{#each contributors[mapId] as player (player.id)}<em title={player.nickname ?? ''}>{initials(player.nickname)}</em>{/each}</span>
            <small>{mapYears[mapId].join(', ') || 'fora das épocas'}</small>
          </button>
        {/each}
      </div>
      {#if validation.errors.mapPreferences}<p class="error">{validation.errors.mapPreferences}</p>{/if}
    </section>

    <button class="primary sandbox-launch" disabled={!validation.valid} on:click={startMajor}>Criar Major</button>
  {:else}
    <section class="match-screen sandbox-major-screen">
      <header class="match-topbar sandbox-major-header">
        <div>
          <span class="eyebrow">MAJOR SANDBOX · {currentMatch ? SANDBOX_PHASE_LABELS[currentMatch.phase] : 'FINAL'}{progress?.current ? ` · SÉRIE ${progress.current}` : ''}</span>
          <h1>{major.userTeam.name}</h1>
        </div>
        <div class="record" aria-label={`${userWins} vitórias e ${userLosses} derrotas`}><span>{userWins}</span><small>V</small><b>—</b><span>{userLosses}</span><small>D</small></div>
      </header>

      <section class="sandbox-controls panel">
        <div class="control-group"><span>Visão</span><SegmentedControl value={majorView} options={viewOptions} label="Visão do Major" onChange={(value) => majorView = value as 'current' | 'all'} /></div>
        <div class="control-group"><span>Velocidade</span><div class="control-row"><SegmentedControl value={simulationSpeed} options={speedOptions} label="Velocidade da simulação" onChange={setSimulationSpeed} /><AutomationGear value={strategicPreferences} language={$language} onChange={setStrategicPreferences} /></div></div>
        <div class="control-group"><span>Avanço</span><SegmentedControl value={simulationMode} options={modeOptions} label="Avanço das séries" onChange={setSimulationMode} /></div>
        <button class="secondary" type="button" on:click={restart}>Montar outro time</button>
      </section>

      <div hidden={majorView !== 'current'}>
        {#if major.finished && campaign}
          <header class="result-hero" class:success={campaign.champion}>
            <span class="eyebrow">MAJOR SANDBOX · {major.seed}</span>
            <h1>{campaign.champion ? 'Campeão' : 'Eliminado'}</h1>
            <p>{campaign.placement}{!campaign.champion ? ` · Campeão: ${championName}` : ''}</p>
          </header>
          <div class="campaign-grid">
            <article><small>Colocação</small><strong>{campaign.placement}</strong></article>
            <article><small>Séries</small><strong>{campaign.wins}–{campaign.losses}</strong></article>
            <article><small>Mapas</small><strong>{campaign.mapsWon}–{campaign.mapsLost}</strong></article>
            <article><small>Rounds</small><strong>{campaign.roundsWon}–{campaign.roundsLost}</strong></article>
            <article><small>Poder do time</small><strong>{major.userTeam.power.toFixed(1)}</strong></article>
            <article><small>Campeão</small><strong>{championName}</strong></article>
          </div>
          <section class="sandbox-stats">
            <div class="section-heading"><div><span class="eyebrow">MAJOR AWARDS</span><h2>MVP do Major</h2></div></div>
            <MajorAwardsPanel awards={major.tournament.awards ?? null} language="pt-BR" userTeamId={major.userTeam.id} />
            {#if sandboxStats.length}
              <CollapsibleStats eyebrow="POST-MAJOR" title="Estatísticas da run" language="pt-BR">
                <RunStatsGrid stats={sandboxStats} language="pt-BR" />
              </CollapsibleStats>
            {/if}
          </section>
          <RunHighlights matches={major.matches.filter((match) => match.userMatch)} userTeamId={major.userTeam.id} language="pt-BR" />
          <div class="sandbox-final-actions">
            <button class="primary" type="button" on:click={playAgainWithNewSeed}>Mesmo elenco, nova seed</button>
            <button class="secondary" type="button" on:click={restart}>Novo Sandbox</button>
          </div>
        {:else if currentMatch && major.interactive && liveView}
          {#if liveView.phase === 'veto' && liveView.veto}
            <VetoBoard available={liveView.veto.available} steps={liveView.veto.steps} turnTeamId={liveView.veto.turnTeamId} action={liveView.veto.action} teamNames={liveTeamNames} myTeamId={major.userTeam.id} familiarity={userFamiliarity} language="pt-BR" onAction={decideVeto} />
          {/if}
          {#if pendingDecision?.kind === 'side'}
            <SidePickPrompt mapId={pendingDecision.mapId} decider={currentMatch.maps[pendingDecision.mapIndex]?.pickedBy === null} language="pt-BR" onPick={decideSide} />
          {:else if pendingDecision?.kind === 'eco-call'}
            <EcoCallPrompt roundNumber={pendingDecision.roundNumber} money={pendingDecision.money} language="pt-BR" onCall={decideEco} />
          {/if}
          {#if !liveView.finished && liveView.phase !== 'veto' && !pendingDecision}
            <div class="sandbox-live-actions">
              <div class="live-buttons">
                {#if !strategicPreferences.autoPause && liveView.phase === 'live'}<TimeoutButton remaining={liveView.timeoutsLeft} disabled={Boolean(pendingDecision)} language="pt-BR" onCall={requestTimeout} />{/if}
                {#if !liveRunning}
                  <button class="primary live-button" type="button" on:click={startLiveSeries}>Iniciar série</button>
                {:else}
                  <button class="secondary live-button" type="button" on:click={skipLiveMap}>Pular mapa atual</button>
                {/if}
              </div>
              {#if liveView.phase === 'live'}<small>Lado: {liveView.userSide ? (liveView.userSide === 'ct' ? 'CT' : 'TR') : '—'}{liveRunning ? '' : ' · pausado'}</small>{/if}
            </div>
          {/if}
          {#key currentMatch.id}
            <SandboxSeriesViewer
              match={currentMatch}
              delay={speedDelays[simulationSpeed]}
              userTeamId={major.userTeam.id}
              controlled
              controlledActiveMap={liveView.activeMap}
              controlledVisibleRounds={liveView.visibleRounds}
              controlledStarted={liveView.started || liveView.phase === 'side-pick' || liveView.phase === 'live'}
              controlledFinished={liveView.finished}
              simpleFeed={strategicPreferences.simpleFeed}
              showActions={false}
              onTeam={openTeam}
              onStart={startLiveSeries}
              onSkipMap={skipLiveMap}
            />
          {/key}
          {#if currentSeriesReady && simulationMode === 'manual'}
            <button class="primary sandbox-next" type="button" on:click={advanceCurrentMatch}>Confirmar resultado e avançar</button>
          {:else if currentSeriesReady}
            <p class="automatic-note">Preparando a próxima série…</p>
          {/if}
        {:else if currentMatch}
          {#key currentMatch.id}
            <SandboxSeriesViewer match={currentMatch} delay={speedDelays[simulationSpeed]} auto={simulationMode === 'automatic'} userTeamId={major.userTeam.id} onTeam={openTeam} onComplete={() => currentSeriesReady = true} />
          {/key}
          {#if currentSeriesReady && simulationMode === 'manual'}
            <button class="primary sandbox-next" type="button" on:click={advanceCurrentMatch}>Confirmar resultado e avançar</button>
          {:else if currentSeriesReady}
            <p class="automatic-note">Preparando a próxima série…</p>
          {/if}
        {/if}

        {#if userResults.length}
          <aside class="panel timeline sandbox-timeline">
            <span class="eyebrow">SUA CAMPANHA</span>
            <div class="timeline-phases">
              {#each userResults as match (match.id)}
                {@const mine = match.teamA.id === major.userTeam.id}
                <div class="timeline-match" class:user-win={match.winnerId === major.userTeam.id} class:user-loss={match.winnerId !== major.userTeam.id}>
                  <span class="timeline-team-left">{mine ? match.teamA.name : match.teamB.name}</span>
                  <b class="timeline-score">{mine ? match.scoreA : match.scoreB} : {mine ? match.scoreB : match.scoreA}</b>
                  <span class="timeline-team-right">{mine ? match.teamB.name : match.teamA.name}<small>{SANDBOX_PHASE_LABELS[match.phase]} · MD{match.bestOf}</small></span>
                </div>
              {/each}
            </div>
          </aside>
        {/if}
      </div>

      <div hidden={majorView !== 'all'} class="sandbox-overview">
        <MajorOverview tournament={major.tournament} cursor={{ liveSeriesId: currentMatch?.id ?? null, isResolved: (id) => resolvedIds.has(id), complete: major.finished }} userTeamId={major.userTeam.id} language="pt-BR" onTeam={openTeam} />
      </div>
    </section>
  {/if}
</PageLayout>

<TeamRosterModal team={viewingTeam} isOpen={Boolean(viewingTeam)} language={$language} onClose={() => viewingTeam = null} />

<SandboxPlayerPicker
  open={editingSlot !== null}
  slotIndex={editingSlot ?? 0}
  currentRole={editingSlot !== null ? selection.players[editingSlot]?.selectedSlotRole ?? null : null}
  picks={selection.players}
  style={selection.style}
  organizationId={selection.organizationId}
  onPick={(player, role) => replacePlayer(editingSlot ?? 0, player, role)}
  onClose={() => editingSlot = null}
/>

<style>
  .sandbox-header{max-width:760px;margin-bottom:24px}.sandbox-header h1{margin:8px 0;font-size:clamp(3rem,8vw,6rem)}.sandbox-header p{color:var(--muted);line-height:1.6}
  .sandbox-setup{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:12px;padding:14px}
  .sandbox-live-actions{position:sticky;top:8px;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;margin:0 0 12px;padding:6px 10px;border:1px solid var(--line);background:var(--surface)}.sandbox-live-actions small{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  label{display:grid;gap:6px;min-width:0}label>span:first-child{color:var(--muted);font-size:.58rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
  select,input{width:100%;min-width:0;min-height:44px;padding:0 10px;border:1px solid var(--line);border-radius:0;color:var(--text);background:var(--surface-2);font:inherit}
  .seed-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.seed-row .secondary{min-height:44px;padding:0 12px;font-size:.62rem}
  .sandbox-build{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:14px;margin:18px 0}
  .section-heading{margin-bottom:12px}.section-heading h2{margin:6px 0 0;font-size:1.5rem}.sandbox-roster-actions{display:flex;flex-wrap:wrap;gap:6px}.sandbox-roster-actions .secondary{min-height:40px;padding:0 12px;font-size:.62rem}
  .sandbox-slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
  .sandbox-slot{position:relative;display:grid;align-content:start;gap:8px;padding:12px;transition:border-color .2s ease}.sandbox-slot.off-role{border-color:color-mix(in srgb,var(--accent-2) 60%,var(--line))}
  .slot-number{position:absolute;right:8px;top:2px;color:var(--line);font:900 2.2rem 'Arial Narrow',Impact,sans-serif;pointer-events:none}
  .sandbox-player-card{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;align-items:center;gap:6px 10px;padding:10px;border:1px solid var(--line);color:var(--text);background:var(--surface-2);text-align:left;cursor:pointer;transition:border-color .18s ease,transform .18s ease}
  .sandbox-player-card:hover{border-color:var(--accent);transform:translateY(-2px)}.sandbox-player-card:hover .swap-hint{opacity:1}
  .sandbox-player-card .avatar{display:grid;place-items:center;width:40px;height:40px;color:#0b0e09;background:var(--accent);font-weight:900}
  .sandbox-player-card strong,.sandbox-player-card small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sandbox-player-card strong{font-size:1.05rem}.sandbox-player-card small{color:var(--muted);font-size:.58rem}
  .sandbox-player-card b{grid-column:1/-1;font-size:1.6rem;line-height:1}.sandbox-player-card b::before{content:'OVR ';color:var(--muted);font-size:.55rem;letter-spacing:.1em}
  .swap-hint{position:absolute;right:8px;bottom:8px;color:var(--accent);font-size:.5rem;font-style:normal;font-weight:900;letter-spacing:.12em;opacity:.55;transition:opacity .18s ease}
  .slot-roles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
  .slot-roles button{min-height:32px;padding:0 4px;border:1px dashed var(--line);color:var(--muted);background:transparent;font-size:.54rem;font-weight:800;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:.15s ease}
  .slot-roles button.eligible{border-style:solid;color:var(--text)}.slot-roles button:hover{border-color:var(--accent)}
  .slot-roles button.active{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 13%,var(--surface))}
  .slot-note{color:var(--accent-2);font-size:.55rem;line-height:1.3}.error{color:var(--danger);font-size:.68rem}
  .sandbox-power{display:grid;align-content:start;gap:6px;padding:20px}.power-value{font-size:4.2rem;line-height:1;transition:color .2s ease}.sandbox-power>small{color:var(--muted);font-size:.62rem}
  .power-stats{display:grid;gap:6px;margin:10px 0 0}.power-stats div{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}.power-stats dt{color:var(--muted);font-size:.58rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.power-stats dd{margin:0;font-size:.85rem;font-weight:800;text-align:right}
  .role-summary{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}.role-summary span{padding:5px 7px;border:1px dashed var(--line);color:var(--muted);font-size:.52rem;font-weight:900;text-transform:uppercase}.role-summary span.filled{border-style:solid;border-color:color-mix(in srgb,var(--accent) 55%,var(--line));color:var(--text)}.role-summary span.multi{border-color:var(--accent-2);color:var(--accent-2)}
  .power-warnings{margin:10px 0 0;padding-left:16px;color:var(--accent-2);font-size:.66rem;line-height:1.45}.power-ok{margin:10px 0 0;color:var(--accent);font-size:.66rem;line-height:1.45}
  .sandbox-maps{padding:18px}.sandbox-maps>header{display:flex;align-items:center;justify-content:space-between;gap:14px}.sandbox-maps h2{margin:4px 0}.sandbox-maps-actions{display:flex;align-items:center;gap:10px}.sandbox-maps-actions strong{color:var(--accent);font-size:1.8rem}.sandbox-maps-actions .secondary{min-height:40px;padding:0 12px;font-size:.62rem}
  .sandbox-map-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:7px;margin-top:14px}
  .sandbox-map-grid button{position:relative;display:grid;gap:5px;padding:13px;border:1px solid var(--line);color:var(--text);background:var(--surface-2);text-align:left;cursor:pointer;transition:border-color .18s ease,transform .18s ease}
  .sandbox-map-grid button:not(:disabled):hover{border-color:var(--accent);transform:translateY(-2px)}.sandbox-map-grid button.selected{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.sandbox-map-grid button:disabled{opacity:.38;cursor:not-allowed}
  .sandbox-map-grid strong{font-size:1.1rem;text-transform:uppercase}.map-order{position:absolute;right:10px;top:8px;color:var(--accent);font:900 1.3rem 'Arial Narrow',Impact,sans-serif}
  .map-familiarity{display:block;height:4px;background:var(--line);overflow:hidden}.map-familiarity i{display:block;height:100%;background:var(--accent);transition:width .25s ease}
  .map-meta,.sandbox-map-grid small{color:var(--muted);font-size:.6rem}.map-contributors{display:flex;flex-wrap:wrap;gap:3px;min-height:20px}.map-contributors em{display:grid;place-items:center;width:20px;height:20px;border:1px solid var(--line);color:var(--muted);font-size:.5rem;font-style:normal;font-weight:900}
  .sandbox-launch{width:100%;min-height:54px;margin-top:14px}
  .sandbox-major-screen{max-width:900px;margin:24px auto 0}.sandbox-major-header h1{font-size:clamp(2.2rem,7vw,4.4rem)}
  .sandbox-controls{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1.7fr) minmax(0,1.15fr) auto;align-items:end;gap:12px;margin-bottom:18px;padding:14px}.sandbox-controls .secondary{min-height:44px;padding:0 14px;font-size:.62rem}
  .sandbox-next{width:100%;margin-top:10px}.automatic-note{margin:12px 0 0;color:var(--muted);text-align:center;font-size:.72rem}
  .sandbox-final-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}.sandbox-stats{display:grid;gap:12px;margin:4px 0 18px}.sandbox-stats .section-heading h2{margin:6px 0 0;font-size:1.5rem}
  .sandbox-timeline{margin-top:18px}.timeline-team-right small{display:block;color:var(--muted);font-size:.5rem;font-weight:900;letter-spacing:.06em}
  .sandbox-overview{display:grid;gap:14px}
  @media(max-width:1100px){.sandbox-setup{grid-template-columns:1fr 1fr}.sandbox-slots{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:900px){.sandbox-build{grid-template-columns:1fr}.sandbox-power{grid-template-columns:auto minmax(0,1fr);column-gap:18px}.sandbox-power>.eyebrow,.sandbox-power>.power-bar,.sandbox-power>small{grid-column:1/-1}.power-value{font-size:3.4rem}.sandbox-controls{grid-template-columns:1fr 1fr}.sandbox-controls>.secondary{grid-column:1/-1}.sandbox-slots{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:560px){.sandbox-setup,.sandbox-slots,.sandbox-controls,.sandbox-final-actions{grid-template-columns:1fr}.sandbox-power{grid-template-columns:1fr}.sandbox-major-header{align-items:stretch;flex-direction:column}.sandbox-major-header .record{justify-content:start}.section-heading{align-items:stretch;flex-direction:column;gap:10px}.sandbox-roster-actions .secondary{flex:1}.sandbox-maps>header{align-items:flex-start;flex-direction:column}.sandbox-map-grid{grid-template-columns:1fr 1fr}.timeline-team-right small{font-size:.45rem}}
  @media(max-width:380px){.sandbox-map-grid{grid-template-columns:1fr}}
</style>
