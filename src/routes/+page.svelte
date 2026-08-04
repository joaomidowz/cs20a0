<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { isOnlineEnabled } from '$lib/game/online/config';
  import { replaceState } from '$app/navigation';
  import Navbar from '$lib/components/Navbar.svelte';
  import PlayerCard from '$lib/components/PlayerCard.svelte';
  import PlayerDetailSheet from '$lib/components/PlayerDetailSheet.svelte';
  import OrganizationRosterModal from '$lib/components/OrganizationRosterModal.svelte';
  import DraftHud from '$lib/components/DraftHud.svelte';
  import SeriesViewer from '$lib/components/SeriesViewer.svelte';
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import ShareRunCard from '$lib/components/ShareRunCard.svelte';
  import TeamRosterModal from '$lib/components/TeamRosterModal.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import SupportNudge from '$lib/components/SupportNudge.svelte';
  import { getTeamPlayers, playerById, playerTitle, teamById, teams, players } from '$lib/game/data';
  import { translate, translatePlacement, translateTitle, translateTeamName, type TranslationKey } from '$lib/game/i18n';
  import { getRoleLabel, validatePlayerPick } from '$lib/game/roleRules';
  import {
    buildMajorRun,
    calculateUserTeamPower,
    createSeededRng,
    pickRandomTeam
  } from '$lib/game/simulation';
  import { aggregateRunStats, createRunStats, getRunMvpScore, getRunSummary } from '$lib/game/runStats';
  import { downloadRunImage as saveRunImage } from '$lib/game/shareImage';
  import { getPickReasonText } from '$lib/game/pickPresentation';
  import { averageOverall, getLineupStrengths } from '$lib/game/organizationPresentation';
  import { shouldShowPlayerAwards } from '$lib/game/teamViews';
  import {
    buildProLineup,
    buildProRoleEvaluations,
    PRO_REQUIRED_ROLES,
    PRO_REROLLS_MAX,
    validateProAssignments,
    type ProRoleEvaluation
  } from '$lib/game/proMode';
  import { defaultState, game, makeSeed } from '$lib/game/store';
  import {
    SPEEDS,
    type GameMode,
    type HistoricalTeam,
    type LineupSlotRole,
    type OrgStyle,
    type Player,
    type SeriesResult,
    type SimMode,
    type SimSpeed
  } from '$lib/game/types';
  import '../app.css';

  let detailsPlayer: Player | null = null;
  let toast = '';
  let awaitingAdvance = false;
  let downloadingImage = false;
  let showSupportNudge = false;
  let supportNudgeShownThisRun = false;
  let supportNudgeDismissedThisRun = false;
  let supportNudgeTimer: number | null = null;
  let enemyModalTeam: HistoricalTeam | null = null;
  let enemyModalPinned = false;
  let enemyHoverTimer: number | null = null;
  let showOrgModal = false;
  let expandedTimelineMatch: string | null = null;

  function getPhaseLabel(phase: SeriesResult['phase']): string {
    const labels: Record<string, string> = {
      stage3: t('stage3'),
      quarterfinal: t('quarterfinal'),
      semifinal: t('semifinal'),
      final: t('final')
    };
    return labels[phase] || phase;
  }

  function groupMatchesByPhase(matches: SeriesResult[]) {
    const phases: Array<{ phase: string; label: string; matches: SeriesResult[] }> = [];
    const phaseOrder: SeriesResult['phase'][] = ['stage3', 'quarterfinal', 'semifinal', 'final'];
    for (const phase of phaseOrder) {
      const phaseMatches = matches.filter((match) => match.phase === phase);
      if (phaseMatches.length > 0) {
        phases.push({ phase, label: getPhaseLabel(phase), matches: phaseMatches });
      }
    }
    return phases;
  }

  function getOrgStrengths() {
    return getLineupStrengths(selectedPlayers);
  }

  onMount(() => {
    return game.subscribe((state) => {
      const url = new URL(window.location.href);
      if (state.seed) url.searchParams.set('seed', state.seed);
      else url.searchParams.delete('seed');
      if (url.href !== window.location.href) replaceState(url, {});
    });
  });

  $: t = (key: TranslationKey) => translate($game.language, key);
  $: isProMode = $game.mode === 'pro';
  $: proPickedPlayers = $game.proPickedPlayerIds.map((playerId) => playerById.get(playerId)).filter((player): player is Player => Boolean(player));
  $: proEvaluations = isProMode ? buildProRoleEvaluations(proPickedPlayers, $game.proRoleAssignments, $game.style) : [];
  $: proLineup = buildProLineup(proEvaluations);
  $: proAdjustedPlayers = proEvaluations.map((evaluation) => evaluation.adjustedPlayer);
  $: proAdjustedPlayerById = new Map(proAdjustedPlayers.map((player) => [player.id, player]));
  $: selectedLineup = isProMode && $game.proRevealed ? proLineup : $game.selectedPlayers;
  $: selectedPlayers = isProMode ? ($game.proRevealed ? proAdjustedPlayers : proPickedPlayers) : selectedLineup.map((selected) => playerById.get(selected.playerId)).filter((player): player is Player => Boolean(player));
  $: rolledTeam = $game.rolledTeamId ? teamById.get($game.rolledTeamId) ?? null : null;
  $: rolledPlayers = getTeamPlayers(rolledTeam);
  $: draftComplete = isProMode ? proPickedPlayers.length === 5 : selectedPlayers.length === 5;
  $: rerollsMax = $game.mode === 'premier' ? 3 : $game.mode === 'faceit' ? 1 : $game.mode === 'pro' ? PRO_REROLLS_MAX : 0;
  $: rerollsLeft = Math.max(0, rerollsMax - ($game.rerollsUsed ?? 0));
  $: userTeam = calculateUserTeamPower(selectedPlayers, $game.style, selectedLineup, $game.seed);
  $: ownOrganizationView = selectedPlayers.length ? {
    id: 'user',
    name: t('orgHud'),
    avatar: (selectedPlayers[0]?.nickname ?? 'ORG').slice(0, 2).toUpperCase(),
    eyebrow: `${$game.style.toUpperCase()} · POWER ${userTeam.power.toFixed(1)}`,
    subtitle: `${$game.style} · OVR ${averageOverall(selectedPlayers)}`,
    tags: getOrgStrengths().slice(0, 3).map((stat) => `${stat.key.toUpperCase()} ${stat.value}`),
    roster: selectedPlayers,
    stats: getOrgStrengths()
  } : null;
  $: proAssignmentStatus = validateProAssignments($game.proRoleAssignments, $game.proPickedPlayerIds);
  $: currentSeries = $game.majorRun?.matches[$game.completedSeries] ?? null;
  $: enemyTeamId = currentSeries ? (currentSeries.teamA.id === 'user' ? currentSeries.teamB.id : currentSeries.teamA.id) : null;
  $: completedMatches = $game.majorRun?.matches.slice(0, $game.completedSeries) ?? [];
  $: stageWins = completedMatches.filter((match) => match.phase === 'stage3' && match.winnerId === 'user').length;
  $: stageLosses = completedMatches.filter((match) => match.phase === 'stage3' && match.winnerId !== 'user').length;
  $: hasStageRecord = stageWins + stageLosses > 0;
  $: runMvp = [...$game.stats].sort((a, b) => getRunMvpScore(b) - getRunMvpScore(a))[0];
  $: runWorst = [...$game.stats].sort((a, b) => a.runRating - b.runRating)[0];
  $: runAggregate = $game.majorRun ? aggregateRunStats($game.majorRun, $game.stats) : null;
  $: maybeShowSupportNudge($game.phase, $game.completedSeries);

  const update = (patch: Partial<typeof $game>) => game.update((state) => ({ ...state, ...patch }));
  const lookupPlayer = (id: string) => playerById.get(id);

  onDestroy(() => {
    document.body.classList.remove('modal-open');
    clearSupportNudgeTimer();
    clearEnemyHoverTimer();
  });

  function beginGame() {
    update({ phase: 'mode-select' });
  }

  function goHome() {
    resetSupportNudge();
    closePlayer();
    awaitingAdvance = false;
    const preserved = { language: $game.language, theme: $game.theme, simMode: $game.simMode, simSpeed: $game.simSpeed };
    game.set({ ...defaultState(), ...preserved });
    replaceState(new URL('/', window.location.origin), {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseMode(mode: GameMode) {
    update({
      seed: $game.seed || makeSeed(),
      mode,
      phase: 'draft',
      style: 'balanced',
      styleLocked: false,
      selectedPlayers: [],
      proPickedPlayerIds: [],
      proRoleAssignments: {},
      proRevealed: false,
      usedTeamIds: [],
      rolledTeamId: null,
      rerollsUsed: 0,
      majorRun: null,
      completedSeries: 0,
      stats: []
    });
  }

  function rollTeam() {
    if (!$game.styleLocked && !isProMode) return;
    const pickCount = isProMode ? proPickedPlayers.length : selectedPlayers.length;
    const rng = createSeededRng(`${$game.seed}:draft:${pickCount}:${$game.usedTeamIds.join('|')}`);
    const team = pickRandomTeam(teams, rng, $game.usedTeamIds);
    if (team) update({ rolledTeamId: team.id });
  }

  function rerollTeam() {
    if ((!$game.styleLocked && !isProMode) || !rolledTeam || draftComplete || !rerollsLeft) return;
    const rerollsUsed = ($game.rerollsUsed ?? 0) + 1;
    const excludedIds = [...$game.usedTeamIds, rolledTeam.id];
    const pickCount = isProMode ? proPickedPlayers.length : selectedPlayers.length;
    const rng = createSeededRng(`${$game.seed}:draft-reroll:${pickCount}:${rerollsUsed}:${excludedIds.join('|')}`);
    const team = pickRandomTeam(teams, rng, excludedIds);
    if (!team) {
      showToast(t('noRerollTeams'));
      return;
    }
    update({ rolledTeamId: team.id, rerollsUsed });
    showToast(isProMode ? t('proRerollUsed') : `${t('teamRerolled')} · ${team.name ?? 'Time'} ${team.year ?? ''}`);
  }

  function openPlayer(player: Player) {
    if (isProMode && !$game.proRevealed) return;
    detailsPlayer = player;
    document.body.classList.add('modal-open');
  }

  function closePlayer() {
    detailsPlayer = null;
    document.body.classList.remove('modal-open');
  }

  function clearEnemyHoverTimer() {
    if (enemyHoverTimer !== null) window.clearTimeout(enemyHoverTimer);
    enemyHoverTimer = null;
  }

  function openEnemyTeam(teamId: string, pinned = false) {
    const team = teamById.get(teamId);
    if (!team) return;
    enemyModalPinned = pinned;
    enemyModalTeam = team;
  }

  function hoverEnemyTeam(teamId: string) {
    if (enemyModalPinned) return;
    clearEnemyHoverTimer();
    enemyHoverTimer = window.setTimeout(() => openEnemyTeam(teamId, false), 220);
  }

  function leaveEnemyTeam() {
    clearEnemyHoverTimer();
    if (!enemyModalPinned) enemyModalTeam = null;
  }

  function pinEnemyTeam(teamId: string) {
    clearEnemyHoverTimer();
    openEnemyTeam(teamId, true);
  }

  function closeEnemyTeam() {
    clearEnemyHoverTimer();
    enemyModalPinned = false;
    enemyModalTeam = null;
  }

  function cardValidation(player: Player) {
    return validatePlayerPick(player, selectedLineup, undefined, lookupPlayer);
  }

  function reasonText(reason?: string) {
    return getPickReasonText($game.language, reason);
  }

  function confirmPlayerPick(player: Player, selectedSlotRole: LineupSlotRole) {
    if (!rolledTeam || draftComplete || !$game.mode || !$game.styleLocked) return;
    const validation = validatePlayerPick(player, selectedLineup, selectedSlotRole, lookupPlayer);
    if (!validation.ok) {
      showToast(reasonText(validation.reason));
      return;
    }
    update({
      selectedPlayers: [...selectedLineup, { playerId: player.id, selectedSlotRole }],
      usedTeamIds: [...$game.usedTeamIds, rolledTeam.id],
      rolledTeamId: null
    });
    closePlayer();
    showToast(`${player.nickname ?? 'Player'} · ${getRoleLabel(selectedSlotRole)}`);
  }

  function confirmProBlindPick(player: Player) {
    if (!isProMode || !rolledTeam || draftComplete) return;
    const nextPickedIds = [...$game.proPickedPlayerIds, player.id];
    const nextAssignments = { ...$game.proRoleAssignments, [player.id]: null };
    update({
      proPickedPlayerIds: nextPickedIds,
      proRoleAssignments: nextAssignments,
      usedTeamIds: [...$game.usedTeamIds, rolledTeam.id],
      rolledTeamId: null,
      phase: nextPickedIds.length === 5 ? 'pro-style' : 'draft'
    });
    showToast(`${t('proHiddenPlayer')} ${nextPickedIds.length}/5`);
  }

  function chooseProStyle(style: OrgStyle) {
    if (!isProMode || !draftComplete) return;
    update({ style, styleLocked: true, phase: 'pro-roles' });
  }

  function assignProRole(playerId: string, role: LineupSlotRole | '') {
    update({ proRoleAssignments: { ...$game.proRoleAssignments, [playerId]: role || null } });
  }

  function confirmProRoles() {
    if (!isProMode || !proAssignmentStatus.complete) return;
    update({
      selectedPlayers: proLineup,
      proRevealed: true,
      phase: 'pro-reveal'
    });
  }

  function launchMajor() {
    if (!draftComplete || (isProMode && !$game.proRevealed)) return;
    resetSupportNudge();
    const runPlayers = isProMode ? proAdjustedPlayers : selectedPlayers;
    const runLineup = isProMode ? proLineup : selectedLineup;
    const majorRun = buildMajorRun(runPlayers, $game.style, teams, players, $game.seed, runLineup);
    const stats = createRunStats(runPlayers, majorRun, $game.seed, runLineup);
    awaitingAdvance = false;
    update({ majorRun, stats, selectedPlayers: runLineup, completedSeries: 0, phase: 'stage3' });
    scheduleSupportNudge();
  }

  function maybeShowSupportNudge(phase: string, completedSeries: number) {
    if (supportNudgeShownThisRun || supportNudgeDismissedThisRun) return;
    if (phase !== 'stage3' && phase !== 'playoffs') return;
    if (completedSeries >= 3 || phase === 'playoffs') {
      showSupportNudge = true;
      supportNudgeShownThisRun = true;
      clearSupportNudgeTimer();
    }
  }

  function scheduleSupportNudge() {
    clearSupportNudgeTimer();
    supportNudgeTimer = window.setTimeout(() => {
      if (supportNudgeShownThisRun || supportNudgeDismissedThisRun) return;
      if ($game.phase !== 'stage3' && $game.phase !== 'playoffs') return;
      showSupportNudge = true;
      supportNudgeShownThisRun = true;
    }, 120000);
  }

  function clearSupportNudgeTimer() {
    if (supportNudgeTimer !== null) window.clearTimeout(supportNudgeTimer);
    supportNudgeTimer = null;
  }

  function dismissSupportNudge() {
    showSupportNudge = false;
    supportNudgeDismissedThisRun = true;
    clearSupportNudgeTimer();
  }

  function resetSupportNudge() {
    showSupportNudge = false;
    supportNudgeShownThisRun = false;
    supportNudgeDismissedThisRun = false;
    clearSupportNudgeTimer();
  }

  function seriesCompleted() {
    if ($game.simMode === 'auto') {
      window.setTimeout(advanceSeries, 900);
    } else {
      awaitingAdvance = true;
    }
  }

  async function advanceSeries() {
    awaitingAdvance = false;
    const nextIndex = $game.completedSeries + 1;
    const next = $game.majorRun?.matches[nextIndex];
    if (!next) {
      update({ completedSeries: nextIndex, phase: 'result' });
      return;
    }
    update({ completedSeries: nextIndex, phase: next.phase === 'stage3' ? 'stage3' : 'playoffs' });
    await tick();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function compositionWarnings() {
    const roles = selectedLineup.map((selected) => selected.selectedSlotRole);
    const warnings: string[] = [];
    if (!roles.includes('awper')) warnings.push(t('noAwper'));
    if (!roles.includes('igl')) warnings.push(t('noIgl'));
    if (!roles.includes('support')) warnings.push(t('noSupport'));
    if ($game.style === 'aggressive') warnings.push(t('aggressiveLine'));
    if ($game.style === 'tactical') warnings.push(t('tacticalLine'));
    return warnings;
  }

  function resetRun(newSeed = false) {
    resetSupportNudge();
    const preserved = { language: $game.language, theme: $game.theme, simMode: $game.simMode, simSpeed: $game.simSpeed };
    game.set({ ...defaultState(newSeed ? '' : $game.seed), ...preserved, phase: 'mode-select' });
    closePlayer();
    awaitingAdvance = false;
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', $game.seed);
    if (($game.phase === 'result' || $game.phase === 'stats') && $game.majorRun && selectedLineup.length === 5) {
      url.searchParams.set('result', '1');
      url.searchParams.set('mode', $game.mode ?? 'premier');
      url.searchParams.set('style', $game.style);
      url.searchParams.set('picks', selectedLineup.map((selected) => `${selected.playerId}:${selected.selectedSlotRole}`).join(','));
    } else {
      url.searchParams.delete('result');
      url.searchParams.delete('mode');
      url.searchParams.delete('style');
      url.searchParams.delete('picks');
    }
    await navigator.clipboard.writeText(url.toString());
    showToast(t('copied'));
  }

  async function downloadRunImage() {
    if (downloadingImage) return;
    downloadingImage = true;
    try {
      await saveRunImage('share-card', $game.seed);
      showToast(t('imageDownloaded'));
    } catch {
      showToast(t('imageDownloadFailed'));
    } finally {
      downloadingImage = false;
    }
  }

  function showToast(message: string) {
    toast = message;
    window.setTimeout(() => (toast = ''), 1800);
  }

  function changeSimulationMode(value: string) {
    update({ simMode: value as SimMode });
    showToast(t('configurationSaved'));
  }

  function changeSimulationSpeed(value: string) {
    update({ simSpeed: value as SimSpeed });
    showToast(t('configurationSaved'));
  }

  function phaseLabel() {
    if (currentSeries?.phase === 'stage3') return hasStageRecord ? `${t('stage3')} · ${stageWins}-${stageLosses}` : t('stage3');
    if (currentSeries?.phase === 'quarterfinal') return t('quarterfinal');
    if (currentSeries?.phase === 'semifinal') return t('semifinal');
    if (currentSeries?.phase === 'final') return t('final');
    if ($game.phase === 'stage3') return hasStageRecord ? `${t('stage3')} · ${stageWins}-${stageLosses}` : t('stage3');
    return t('playoffs');
  }

  function rarityClass(player: Player) {
    return `rarity-${(player.rarity ?? 'common').toLowerCase()}`;
  }

  function proFitLabel(fit: ProRoleEvaluation['fit']) {
    if (fit === 'primary') return t('proFitPrimary');
    if (fit === 'secondary') return t('proFitSecondary');
    if (fit === 'severe') return t('proFitSevere');
    return t('proFitIncompatible');
  }
</script>

<svelte:head>
  <title>cs13a0 · Monte sua line e sobreviva ao Major</title>
  <meta name="description" content={t('metaDescription')} />
</svelte:head>

<Navbar
  language={$game.language}
  theme={$game.theme}
  onLanguage={(language) => update({ language })}
  onTheme={() => update({ theme: $game.theme === 'dark' ? 'light' : 'dark' })}
  onHome={goHome}
/>

<main>
  {#if $game.phase === 'home'}
    <section class="hero shell">
      <div class="hero-copy">
        <div class="live-tag"><span></span> MAJOR DRAFT SIMULATOR</div>
        <h1>{t('headline')}</h1>
        <p class="hero-lead">{t('subheadline')}</p>
        <div class="badges">
          <a href="/teams" aria-label="Open all teams">{t('badge55Teams')}</a>
          <a href="/players" aria-label="Open player rankings">{t('badge275Players')}</a>
          <a href="/teams#year-2016" aria-label="Open teams by year">{t('badgeYears')}</a>
          <span>{t('badgeSharedSeed')}</span>
        </div>
        <p class="curated">{t('curated')}</p>
        <div class="hero-actions">
          <button class="primary" type="button" on:click={beginGame}>{t('play')} <span>→</span></button>
          {#if isOnlineEnabled()}<a class="secondary online-home-button" href="/online">{t('playOnline')} <span>↗</span></a>{/if}
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="radar"><i></i><i></i><i></i><i></i><span></span></div>
        <div class="floating-score"><small>LIVE PROTOCOL</small><b>13 : 11</b><span>ROUND 24 / MR12</span></div>
        <div class="crosshair"></div>
      </div>
    </section>
    <section class="feature-strip shell">
      <article><span>01</span><div><strong>{t('featureDraftTitle')}</strong><small>{t('featureDraftDesc')}</small></div></article>
      <article><span>02</span><div><strong>{t('featureSeedTitle')}</strong><small>{t('featureSeedDesc')}</small></div></article>
      <article><span>03</span><div><strong>{t('featureRulesTitle')}</strong><small>{t('featureRulesDesc')}</small></div></article>
    </section>
  {:else if $game.phase === 'mode-select'}
    <section class="screen shell narrow">
      <header class="screen-header centered">
        <span class="eyebrow">QUEUE SELECT</span>
        <h1>{t('chooseMode')}</h1>
        <p>{t('modeIntro')}</p>
      </header>
      <div class="mode-grid">
        <button class="mode-card premier" type="button" on:click={() => chooseMode('premier')}>
          <span class="mode-number">01</span><span class="mode-icon">N</span><h2>{t('premier')}</h2><p>{t('premierDesc')}</p><b>FULL INTEL →</b>
        </button>
        <button class="mode-card faceit" type="button" on:click={() => chooseMode('faceit')}>
          <span class="mode-number">02</span><span class="mode-icon">R</span><h2>{t('faceit')}</h2><p>{t('faceitDesc')}</p><b>BLIND DRAFT →</b>
        </button>
        <button class="mode-card pro" type="button" on:click={() => chooseMode('pro')}>
          <span class="mode-number">03</span><span class="mode-icon">P</span><h2>{t('pro')}</h2><p>{t('proDesc')}</p><b>PROTOCOL LOCKED →</b>
        </button>
      </div>
    </section>
  {:else if $game.phase === 'draft'}
    <section class="screen shell">
      <header class="draft-header">
        <div><span class="eyebrow">DRAFT ROOM · {$game.mode ? t($game.mode) : ''}</span><h1>{draftComplete ? t('complete') : `${t('opportunity')} ${selectedPlayers.length + 1}/5`}</h1></div>
        <button class="seed-button" type="button" on:click={copyLink}>SEED / {$game.seed}</button>
      </header>

      {#if !$game.styleLocked && !isProMode}
        <section class="style-block panel">
          <div class="section-heading"><div><span class="eyebrow">TACTICAL IDENTITY</span><h2>{t('chooseStyle')}</h2></div></div>
          <p class="style-required">{t('chooseStyleBeforeRoll')}</p>
          <div class="segmented">
            {#each ['aggressive', 'balanced', 'tactical'] as style}
              <button type="button" on:click={() => update({ style: style as OrgStyle, styleLocked: true })}>
                <strong>{t(style as 'aggressive' | 'balanced' | 'tactical')}</strong>
                <small>{t(`${style}Desc` as 'aggressiveDesc' | 'balancedDesc' | 'tacticalDesc')}</small>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if !draftComplete}
        <section class="roll-zone panel">
          {#if !$game.styleLocked && !isProMode}
            <div class="roll-empty locked-roll">
              <div class="scanner"><span></span></div>
              <span class="eyebrow">TEAM LOTTERY / {selectedPlayers.length + 1} OF 5</span>
              <p>{t('chooseStyleBeforeRoll')}</p>
              <button class="primary" type="button" disabled>{t('rollTeam')} <span>↻</span></button>
            </div>
          {:else if !rolledTeam}
            <div class="roll-empty">
              <div class="scanner"><span></span></div>
              <span class="eyebrow">TEAM LOTTERY / {selectedPlayers.length + 1} OF 5</span>
              <h2>{isProMode ? t('proBlindDraft') : t('emptyTitle')}</h2>
              <p>{isProMode ? t('proBlindOfferDesc') : t('noRepeat')}</p>
              <button class="primary" type="button" on:click={rollTeam}>{t('rollTeam')} <span>↻</span></button>
            </div>
          {:else}
            {#if isProMode}
              <div class="team-banner blind-banner">
                <div class="team-avatar">?</div>
                <div><span class="eyebrow">PRO BLIND OFFER</span><h2>{t('proBlindOffer')}</h2><p>{t('proBlindOfferDesc')}</p></div>
                <span class="team-power">?</span>
              </div>
            {:else}
              <div class="team-banner">
                <div class="team-avatar">{(rolledTeam.name ?? 'T').slice(0, 2).toUpperCase()}</div>
                <div><span class="eyebrow">ROLLED TEAM</span><h2>{rolledTeam.name ?? 'Time'} <b>{rolledTeam.year ?? ''}</b></h2><p>{rolledTeam.game ?? 'CS'} · RANK #{rolledTeam.sourceRank ?? rolledTeam.rank ?? '—'} · {rolledTeam.rarity ?? 'standard'}</p></div>
                <span class="team-power">PWR {rolledTeam.teamPowerPreview ?? rolledTeam.power ?? '—'}</span>
              </div>
            {/if}
            <div class="reroll-bar">
              <div><span class="eyebrow">{t('teamReroll')}</span><strong>{rerollsLeft}/{rerollsMax}</strong></div>
              <button class="secondary" type="button" disabled={!rerollsLeft} on:click={rerollTeam}>{t('rerollTeam')} <span>↻</span></button>
            </div>
            <p class="pick-instruction">{isProMode ? t('proBlindOfferDesc') : t('pickOne')}</p>
            <div class:pro-offer-grid={isProMode} class="player-grid">
              {#each rolledPlayers as player (player.id)}
                {#if isProMode}
                  <button class="player-card pro-blind-card" type="button" on:click={() => confirmProBlindPick(player)}>
                    <div class="pro-name-only">{player.nickname ?? t('proHiddenPlayer')}</div>
                  </button>
                {:else}
                  {@const validation = cardValidation(player)}
                  <PlayerCard
                    player={player}
                    mode={$game.mode ?? 'premier'}
                    revealed={false}
                    blockedReason={validation.ok ? '' : reasonText(validation.reason)}
                    language={$game.language}
                    onOpen={openPlayer}
                  />
                {/if}
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      {#if isProMode && !$game.proRevealed}
        <section class="hud panel pro-hud">
          <div><span class="eyebrow">PRO LINEUP / {proPickedPlayers.length}/5</span><h2>{t('proBlindDraft')}</h2></div>
          <div class="pro-hidden-slots">
            {#each Array(5) as _, index}
              <span class:filled={index < proPickedPlayers.length}>{proPickedPlayers[index]?.nickname ?? '?'}</span>
            {/each}
          </div>
        </section>
      {:else}
        <DraftHud
          selectedPlayers={selectedLineup}
          style={$game.style}
          styleLocked={$game.styleLocked}
          styleLabel={t($game.style)}
          mode={$game.mode ?? 'premier'}
          revealed={draftComplete}
          label={t('orgHud')}
          onOpen={openPlayer}
        />
      {/if}

      {#if draftComplete && !isProMode}
        <section class="summary-grid">
          <article class="power-panel panel"><span class="eyebrow">ORG POWER INDEX</span><strong>{userTeam.power.toFixed(1)}</strong><div class="power-bar"><span style={`width:${userTeam.power}%`}></span></div><small>{t('estimatedPower')} · {t($game.style)}</small></article>
          <article class="panel composition"><span class="eyebrow">{t('composition')}</span><div class="warning-list">{#each compositionWarnings() as warning}<span>{warning}</span>{/each}{#if !compositionWarnings().length}<span>{t('compositionReady')}</span>{/if}</div></article>
        </section>
        {#if $game.mode === 'faceit'}<div class="reveal-note">INTEL UNLOCKED · {t('revealed')}</div>{/if}
        <button class="primary wide major-button" type="button" on:click={launchMajor}>{t('startMajor')} →</button>
      {/if}
    </section>
  {:else if $game.phase === 'pro-style'}
    <section class="screen shell narrow">
      <header class="screen-header centered">
        <span class="eyebrow">PRO MODE · STEP 2</span>
        <h1>{t('proChooseStyleTitle')}</h1>
        <p>{t('proChooseStyleDesc')}</p>
      </header>
      <section class="style-block panel">
        <div class="segmented pro-style-choice">
          {#each ['aggressive', 'balanced', 'tactical'] as style}
            <button type="button" on:click={() => chooseProStyle(style as OrgStyle)}>
              <strong>{t(style as 'aggressive' | 'balanced' | 'tactical')}</strong>
              <small>{t(`${style}Desc` as 'aggressiveDesc' | 'balancedDesc' | 'tacticalDesc')}</small>
            </button>
          {/each}
        </div>
      </section>
      <section class="hud panel pro-hud">
        <div><span class="eyebrow">PRO LINEUP / 5/5</span><h2>{t('proBlindDraft')}</h2></div>
        <div class="pro-hidden-slots">
          {#each Array(5) as _}<span class="filled">?</span>{/each}
        </div>
      </section>
    </section>
  {:else if $game.phase === 'pro-roles'}
    <section class="screen shell">
      <header class="screen-header centered">
        <span class="eyebrow">PRO MODE · STEP 3</span>
        <h1>{t('proAssignRolesTitle')}</h1>
        <p>{t('proAssignRolesDesc')}</p>
      </header>
      <section class="panel pro-role-panel">
        <div class="pro-role-grid">
          {#each proPickedPlayers as player, index (player.id)}
            <article class="pro-role-card">
              <div>
                <h2>{player.nickname ?? `${t('proHiddenPlayer')} ${index + 1}`}</h2>
              </div>
              <select aria-label={`${t('proHiddenPlayer')} ${index + 1}`} value={$game.proRoleAssignments[player.id] ?? ''} on:change={(event) => assignProRole(player.id, event.currentTarget.value as LineupSlotRole | '')}>
                <option value="">{t('role')}</option>
                {#each PRO_REQUIRED_ROLES as role}
                  {@const takenByOther = Object.entries($game.proRoleAssignments).some(([playerId, assignedRole]) => playerId !== player.id && assignedRole === role)}
                  <option value={role} disabled={takenByOther}>{getRoleLabel(role)}</option>
                {/each}
              </select>
            </article>
          {/each}
        </div>
        <div class="pro-role-status">
          {#if proAssignmentStatus.hasDuplicate}<span>{t('proRoleDuplicate')}</span>{/if}
          {#if proAssignmentStatus.unassignedCount}<span>{t('proRoleMissing')}: {proAssignmentStatus.unassignedCount}</span>{/if}
        </div>
        <button class="primary wide major-button" type="button" disabled={!proAssignmentStatus.complete} on:click={confirmProRoles}>{t('proConfirmRoles')} →</button>
      </section>
    </section>
  {:else if $game.phase === 'pro-reveal'}
    <section class="screen shell">
      <header class="screen-header centered">
        <span class="eyebrow">PRO MODE · REVEAL</span>
        <h1>{t('proRevealTitle')}</h1>
        <p>{t('proRevealDesc')}</p>
      </header>
      <section class="panel pro-reveal-panel">
        <div class="pro-reveal-grid">
          {#each proEvaluations as evaluation (evaluation.player.id)}
            <article class="pro-reveal-card fit-{evaluation.fit}">
              <div class="player-topline">
                <div class="avatar">{(evaluation.player.nickname ?? '?').slice(0, 2).toUpperCase()}</div>
                <span class="rarity-label">{evaluation.player.rarity ?? 'common'}</span>
              </div>
              <h2>{evaluation.player.nickname ?? 'Unknown'}</h2>
              <p>{evaluation.player.teamId ?? ''} · {evaluation.player.year ?? ''}</p>
              <div class="pro-fit-pill">{proFitLabel(evaluation.fit)}</div>
              <dl>
                <div><dt>{t('proChosenRole')}</dt><dd>{getRoleLabel(evaluation.selectedRole)}</dd></div>
                <div><dt>{t('proRealRole')}</dt><dd>{getRoleLabel(evaluation.primaryRole)}</dd></div>
                <div><dt>{t('proBaseOvr')}</dt><dd>{evaluation.baseOverall}</dd></div>
                <div><dt>{t('proEffectiveOvr')}</dt><dd>{evaluation.effectiveOverall}</dd></div>
              </dl>
              <div class="trait-list">
                {#each evaluation.affectedAttributes.slice(0, 4) as attribute}
                  <span>{String(attribute)} {evaluation.adjustedPlayer[attribute] ?? '—'}</span>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      </section>
      <section class="summary-grid">
        <article class="power-panel panel"><span class="eyebrow">PRO POWER INDEX</span><strong>{userTeam.power.toFixed(1)}</strong><div class="power-bar"><span style={`width:${userTeam.power}%`}></span></div><small>{t('estimatedPower')} · {t($game.style)}</small></article>
        <article class="panel composition"><span class="eyebrow">{t('composition')}</span><div class="warning-list">{#each compositionWarnings() as warning}<span>{warning}</span>{/each}{#if !compositionWarnings().length}<span>{t('compositionReady')}</span>{/if}</div></article>
      </section>
      <button class="primary wide major-button" type="button" on:click={launchMajor}>{t('startMajor')} →</button>
    </section>
  {:else if $game.phase === 'stage3' || $game.phase === 'playoffs'}
    <section class="screen shell match-screen">
      <header class="match-topbar"><div><span class="eyebrow">MAJOR LIVE</span><h1>{phaseLabel()}</h1></div>{#if $game.phase === 'stage3' && hasStageRecord}<div class="record"><span>{stageWins}</span><small>W</small><b>:</b><span>{stageLosses}</span><small>L</small></div>{/if}</header>
      <div class="match-controls panel">
        <div class="control-group">
          <span>{t('simulationMode')}</span>
          <SegmentedControl
            value={$game.simMode}
            label={t('simulationMode')}
            options={[{ value: 'manual', label: t('manual') }, { value: 'auto', label: t('automatic') }]}
            onChange={changeSimulationMode}
          />
        </div>
        <div class="control-group">
          <span>{t('speed')}</span>
          <SegmentedControl
            value={$game.simSpeed}
            label={t('speed')}
            options={[{ value: 'normal', label: t('normal') }, { value: 'fast', label: t('fast') }, { value: 'ultra', label: t('ultra') }]}
            onChange={changeSimulationSpeed}
          />
        </div>
      </div>
      {#if currentSeries}
        {#key currentSeries.id}
          <SeriesViewer
            series={currentSeries}
            delay={SPEEDS[$game.simSpeed]}
            auto={$game.simMode === 'auto'}
            language={$game.language}
            interactiveTeamId={enemyTeamId}
            labels={{ start: t('startSeries'), skip: t('skipMap'), round: t('round'), map: t('map'), final: t('final'), waiting: t('waiting'), pending: t('pending'), inProgress: t('inProgress'), mapInProgress: t('mapInProgress') }}
            onComplete={seriesCompleted}
            onTeamHover={hoverEnemyTeam}
            onTeamHoverEnd={leaveEnemyTeam}
            onTeamClick={pinEnemyTeam}
            onOrgClick={() => showOrgModal = true}
          />
        {/key}
        {#if awaitingAdvance}<button class="primary wide next-match" type="button" on:click={advanceSeries}>{t('nextMatch')} →</button>{/if}
      {/if}
      <aside class="timeline panel">
        <span class="eyebrow">RUN TIMELINE</span>
        <div class="timeline-phases">
          {#each groupMatchesByPhase(completedMatches) as phaseGroup, i}
            {@const isLastPhase = i === groupMatchesByPhase(completedMatches).length - 1}
            {@const showLiveInThisPhase = currentSeries && isLastPhase && currentSeries.phase === phaseGroup.phase}
            <div class="timeline-phase" class:completed={true} class:active={showLiveInThisPhase}>
              <div class="timeline-phase-header">
                <span class="timeline-phase-label">{phaseGroup.label}</span>
              </div>
              <div class="timeline-phase-content">
                {#each phaseGroup.matches as match}
                  {@const userTeam = match.teamA.isUser ? match.teamA : match.teamB}
                  {@const enemyTeam = match.teamA.isUser ? match.teamB : match.teamA}
                  <button class="timeline-match" type="button" class:user-win={match.winnerId === 'user'} class:user-loss={match.winnerId !== 'user'} on:click={() => expandedTimelineMatch = expandedTimelineMatch === match.id ? null : match.id}>
                    <span class="timeline-team-left">{translateTeamName($game.language, userTeam.name)}</span>
                    <b class="timeline-score">{match.scoreA} : {match.scoreB}</b>
                    <span class="timeline-team-right">{translateTeamName($game.language, enemyTeam.name)}</span>
                  </button>
                  {#if expandedTimelineMatch === match.id}
                    <div class="timeline-maps">
                      {#each match.maps as map}
                        <span class="timeline-map">{t('map')} {map.map} · {map.scoreA} x {map.scoreB} {map.overtime ? '· OT' : ''}</span>
                      {/each}
                    </div>
                  {/if}
                {/each}
                {#if showLiveInThisPhase}
                  {@const liveUserTeam = currentSeries.teamA.isUser ? currentSeries.teamA : currentSeries.teamB}
                  {@const liveEnemyTeam = currentSeries.teamA.isUser ? currentSeries.teamB : currentSeries.teamA}
                  <div class="timeline-match timeline-live">
                    <span class="timeline-team-left">{translateTeamName($game.language, liveUserTeam.name)}</span>
                    <div class="timeline-live-center">
                      <span class="timeline-live-badge">AO VIVO</span>
                    </div>
                    <span class="timeline-team-right">{translateTeamName($game.language, liveEnemyTeam.name)}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
          {#if currentSeries && !groupMatchesByPhase(completedMatches).some((pg) => pg.phase === currentSeries.phase)}
            {@const liveUserTeam = currentSeries.teamA.isUser ? currentSeries.teamA : currentSeries.teamB}
            {@const liveEnemyTeam = currentSeries.teamA.isUser ? currentSeries.teamB : currentSeries.teamA}
            <div class="timeline-phase active">
              <div class="timeline-phase-header">
                <span class="timeline-phase-label">{getPhaseLabel(currentSeries.phase)}</span>
              </div>
              <div class="timeline-phase-content">
                <div class="timeline-match timeline-live">
                  <span class="timeline-team-left">{translateTeamName($game.language, liveUserTeam.name)}</span>
                  <div class="timeline-live-center">
                    <span class="timeline-live-badge">AO VIVO</span>
                  </div>
                  <span class="timeline-team-right">{translateTeamName($game.language, liveEnemyTeam.name)}</span>
                </div>
              </div>
            </div>
          {/if}
        </div>
        {#if !completedMatches.length && !currentSeries}
          <p class="timeline-empty">{t('waitingResult')}</p>
        {/if}
      </aside>
    </section>
  {:else if $game.phase === 'result'}
    {@const run = $game.majorRun}
    {#if run}
      {@const wonSeries = run.matches.filter((match) => match.winnerId === 'user').length}
      {@const summary = getRunSummary(run)}
      <section class="screen shell result-screen">
        <header class:success={run.champion} class="result-hero"><span class="eyebrow">FINAL REPORT / {$game.seed}</span><h1>{run.champion ? t('champion') : t('eliminated')}</h1><p>{translatePlacement($game.language, run.placement)}</p></header>
        <div class="campaign-grid">
          <article><small>STAGE 3</small><strong>{run.stage3.wins}-{run.stage3.losses}</strong></article><article><small>{t('placement')}</small><strong>{translatePlacement($game.language, run.placement)}</strong></article><article><small>{t('seriesWon')}</small><strong>{wonSeries}</strong></article><article><small>{t('seriesLost')}</small><strong>{run.matches.length - wonSeries}</strong></article><article><small>{t('mapsWon')}</small><strong>{summary.mapsWon}</strong></article><article><small>{t('mapsLost')}</small><strong>{summary.mapsLost}</strong></article><article><small>{t('roundsWon')}</small><strong>{summary.roundsWon}</strong></article><article><small>{t('roundsLost')}</small><strong>{summary.roundsLost}</strong></article>
        </div>
        <section class="panel match-history">
          <div class="section-heading"><div><span class="eyebrow">MATCH LOG</span><h2>{t('allMatches')}</h2></div></div>
          <div class="timeline-phases">
            {#each groupMatchesByPhase(run.matches) as phaseGroup}
              <div class="timeline-phase completed">
                <div class="timeline-phase-header">
                  <span class="timeline-phase-label">{phaseGroup.label}</span>
                </div>
                <div class="timeline-phase-content">
                  {#each phaseGroup.matches as match}
                    {@const userTeam = match.teamA.isUser ? match.teamA : match.teamB}
                    {@const enemyTeam = match.teamA.isUser ? match.teamB : match.teamA}
                    <button class="timeline-match" type="button" class:user-win={match.winnerId === 'user'} class:user-loss={match.winnerId !== 'user'} on:click={() => expandedTimelineMatch = expandedTimelineMatch === match.id ? null : match.id}>
                      <span class="timeline-team-left">{translateTeamName($game.language, userTeam.name)}</span>
                      <b class="timeline-score">{match.scoreA} : {match.scoreB}</b>
                      <span class="timeline-team-right">{translateTeamName($game.language, enemyTeam.name)}</span>
                    </button>
                    {#if expandedTimelineMatch === match.id}
                      <div class="timeline-maps">
                        {#each match.maps as map}
                          <span class="timeline-map">{t('map')} {map.map} · {map.scoreA} x {map.scoreB} {map.overtime ? '· OT' : ''}</span>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>
        <ShareRunCard seed={$game.seed} {run} players={selectedPlayers} lineup={selectedLineup} stats={$game.stats} mode={$game.mode} language={$game.language} labels={{ champion: t('champion'), eliminated: t('eliminated'), placement: t('placement'), record: t('record'), maps: t('maps'), mvp: t('runMvp') }} />
        <div class="result-actions"><button class="primary" type="button" on:click={() => resetRun(true)}>{t('tryAgain')}</button><button class="secondary" type="button" on:click={() => update({ phase: 'stats' })}>{t('seeStats')}</button><button class="secondary" type="button" on:click={copyLink}>{t('copyRunLink')}</button><button class="secondary" type="button" disabled={downloadingImage} on:click={downloadRunImage}>{t('downloadRunImage')}</button><button class="ghost" type="button" on:click={() => resetRun(false)}>{t('playSameSeed')}</button></div>
      </section>
    {/if}
  {:else if $game.phase === 'stats'}
    <section class="screen shell stats-screen">
      <header class="screen-header"><span class="eyebrow">POST-MAJOR ANALYTICS</span><h1>{t('stats')}</h1><p>{t('statsSeed')} {$game.seed}.</p></header>
      {#if runAggregate}
        <div class="campaign-grid stats-overview">
          <article><small>{t('mapsPlayed')}</small><strong>{runAggregate.mapsPlayed}</strong></article><article><small>{t('mapsWon')}</small><strong>{runAggregate.mapsWon}</strong></article><article><small>{t('mapsLost')}</small><strong>{runAggregate.mapsLost}</strong></article><article><small>{t('roundsWon')}</small><strong>{runAggregate.roundsWon}</strong></article><article><small>{t('roundsLost')}</small><strong>{runAggregate.roundsLost}</strong></article><article><small>KILLS</small><strong>{runAggregate.kills}</strong></article><article><small>DEATHS</small><strong>{runAggregate.deaths}</strong></article><article><small>K/D</small><strong>{runAggregate.kdRatio.toFixed(2)}</strong></article><article><small>ADR</small><strong>{runAggregate.adr}</strong></article><article><small>IMPACT</small><strong>{runAggregate.impact.toFixed(2)}</strong></article><article><small>CLUTCHES</small><strong>{runAggregate.clutches}</strong></article><article><small>OPENINGS</small><strong>{runAggregate.openingKills}</strong></article><article><small>RATING</small><strong>{runAggregate.rating.toFixed(2)}</strong></article>
        </div>
      {/if}
      <div class="stats-grid">
        {#each $game.stats as stat}
          {@const player = proAdjustedPlayerById.get(stat.playerId) ?? playerById.get(stat.playerId)}
          {#if player}
            <article class="stat-card {rarityClass(player)}">
              {#if runMvp?.playerId === player.id}<span class="mvp-badge">{t('runMvp')}</span>{/if}
              {#if runWorst?.playerId === player.id}<span class="underperformer-badge">{t('worstRating')}</span>{/if}
              <div class="stat-player"><div class="avatar large">{(player.nickname ?? '?').slice(0, 2).toUpperCase()}</div><div><span class="eyebrow">{getRoleLabel(stat.assignedRole)} · {player.year ?? ''}</span><h2>{player.nickname ?? 'Unknown'}</h2><p>{translateTitle($game.language, playerTitle(player))}</p></div><strong>{player.overall ?? 70}</strong></div>
              <div class="rating"><small>RUN RATING</small><b>{stat.runRating.toFixed(2)}</b></div>
              <div class="stat-numbers"><span><small>K / D</small><b>{stat.kills} / {stat.deaths}</b></span><span><small>K/D</small><b>{stat.kdRatio.toFixed(2)}</b></span><span><small>ADR</small><b>{stat.adr}</b></span><span><small>IMPACT</small><b>{stat.impact.toFixed(2)}</b></span><span><small>CLUTCHES</small><b>{stat.clutches}</b></span><span><small>OPENINGS</small><b>{stat.openingKills}</b></span><span><small>{t('mapsWon')} / {t('mapsLost')}</small><b>{stat.mapsWon} / {stat.mapsLost}</b></span><span><small>{t('roundsWon')} / {t('roundsLost')}</small><b>{stat.roundsWon} / {stat.roundsLost}</b></span><span><small>CONSISTENCY</small><b>{stat.consistency}</b></span></div>
              {#if stat.runRating < 0.85}<footer class="below-expected">{t('belowExpected')}</footer>{/if}
            </article>
          {/if}
        {/each}
      </div>
      <button class="secondary wide" type="button" on:click={() => update({ phase: 'result' })}>{t('backResult')}</button>
    </section>
  {/if}
</main>

{#if $game.phase === 'home'}
  <Footer
    labels={{
      description: t('footerDescription'),
      support: t('supportOnKofi'),
      contact: t('contact'),
      disclaimer: t('footerDisclaimer'),
      about: t('about'),
      privacy: t('privacy'),
      terms: t('terms'),
      contactPage: t('contact'),
      footerNav: t('footerNav')
    }}
  />
{/if}

<SupportNudge
  show={showSupportNudge}
  title={t('supportNudgeTitle')}
  message={t('supportNudgeMessage')}
  supportLabel={t('supportOnKofi')}
  dismissLabel={t('notNow')}
  closeLabel={t('close')}
  onClose={dismissSupportNudge}
  onSupportClick={dismissSupportNudge}
/>

{#if detailsPlayer && $game.mode}
  <PlayerDetailSheet player={detailsPlayer} mode={$game.mode} language={$game.language} {draftComplete} lineup={selectedLineup} playerLookup={lookupPlayer} onConfirm={confirmPlayerPick} onClose={closePlayer} />
{/if}

<TeamRosterModal
  team={enemyModalTeam}
  isOpen={Boolean(enemyModalTeam)}
  language={$game.language}
  showPlayerAwards={shouldShowPlayerAwards($game.mode, 'game')}
  onClose={closeEnemyTeam}
/>

<OrganizationRosterModal organization={ownOrganizationView} isOpen={showOrgModal} language={$game.language} showPlayerAwards={shouldShowPlayerAwards($game.mode, 'game')} onClose={() => showOrgModal = false} />

{#if toast}<div class="toast">{toast}</div>{/if}
