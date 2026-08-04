<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import PlayerCard from '$lib/components/PlayerCard.svelte';
  import PlayerDetailSheet from '$lib/components/PlayerDetailSheet.svelte';
  import OrganizationRosterModal from '$lib/components/OrganizationRosterModal.svelte';
  import ShareRunCard from '$lib/components/ShareRunCard.svelte';
  import DraftHud from '$lib/components/DraftHud.svelte';
  import SeriesViewer from '$lib/components/SeriesViewer.svelte';
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import { translate, translatePlacement } from '$lib/game/i18n';
  import { getRoleLabel, validatePlayerPick } from '$lib/game/roleRules';
  import { playerById, teamById, getTeamPlayers } from '$lib/game/data';
  import { getPickReasonText } from '$lib/game/pickPresentation';
  import { averageOverall, getLineupStrengths, type OrganizationRosterView } from '$lib/game/organizationPresentation';
  import { buildOnlineRunCardReport } from '$lib/game/runCard';
  import { downloadRunImage as saveRunImage } from '$lib/game/shareImage';
  import { buildProRoleEvaluations, PRO_REQUIRED_ROLES, validateProAssignments } from '$lib/game/proMode';
  import { shouldShowPlayerAwards, teamPlacementLabel, teamStyle, teamTags } from '$lib/game/teamViews';
  import { language, theme } from '$lib/game/pageState';
  import type { LineupSlotRole, OrgStyle, Player, SelectedPlayer, SeriesResult } from '$lib/game/types';
  import { OnlineRoomClient, createOnlineRoom } from '$lib/game/online/client';
  import { DEFAULT_ROOM_CONFIG, toPresentationGameMode, type PublicOrganization, type PublicOverviewSeries, type RoomConfig, type RoomSnapshot } from '$lib/game/online/contracts';
  import { getHistoricalTeamOverall } from '$lib/game/online/draft-pool';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { translateOnline, translateOnlineMode, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import '../../app.css';

  let playerName = '';
  let organizationName = '';
  let roomCode = '';
  let snapshot: RoomSnapshot | null = null;
  let connection: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' = 'disconnected';
  let errorMessage = '';
  let toast = '';
  let client: OnlineRoomClient | null = null;
  let config: RoomConfig = { ...DEFAULT_ROOM_CONFIG };
  let creating = false;
  let detailsPlayer: Player | null = null;
  let activeTab: 'current' | 'all' = 'current';
  let expandedTimelineMatch: string | null = null;
  let countdown = '';
  let clockTimer: number | null = null;
  let proAssignments: Record<string, LineupSlotRole> = {};
  let proStyle: OrgStyle = 'balanced';
  let serverOffset = 0;
  let selectedOrganizationId: string | null = null;
  let downloadingImage = false;
  const onlineModes: RoomConfig['mode'][] = ['premier', 'faceit', 'pro', 'fun', 'max_fun'];

  $: t = (key: OnlineTranslationKey) => translateOnline($language, key);
  $: gameT = (key: Parameters<typeof translate>[1]) => translate($language, key);
  $: identityValid = playerName.trim().length >= 2 && organizationName.trim().length >= 2;
  $: self = snapshot?.self ?? null;
  $: me = snapshot?.participants.find((participant) => participant.id === self?.participantId) ?? null;
  $: isHost = Boolean(me?.host);
  $: offeredTeam = self?.rolledTeamId ? teamById.get(self.rolledTeamId) ?? null : null;
  $: offeredPlayers = getTeamPlayers(offeredTeam);
  $: offeredTeamAverage = offeredTeam ? getHistoricalTeamOverall(offeredTeam, offeredPlayers) : null;
  $: presentationMode = snapshot ? toPresentationGameMode(snapshot.config.mode) : 'premier';
  $: currentModePresentation = snapshot ? translateOnlineMode($language, snapshot.config.mode) : translateOnlineMode($language, config.mode);
  $: displayLineup = self ? (snapshot?.config.mode === 'pro' && !self.lineup.length
    ? self.proPickedPlayerIds.map((playerId) => ({ playerId, selectedSlotRole: 'rifler' as const }))
    : self.lineup) : [];
  $: completedSeries = snapshot?.tournament?.rounds.flatMap((round) => round.series) ?? [];
  $: ownCompletedSeries = me ? completedSeries.filter((series) => series.teamA.id === me?.id || series.teamB.id === me?.id) : [];
  $: liveCursor = snapshot?.tournament?.liveCursor ?? null;
  $: liveSeries = liveCursor?.primarySeries ?? null;
  $: myStanding = snapshot?.tournament?.standings.find((standing) => standing.organizationId === me?.id) ?? null;
  $: myCampaign = snapshot?.tournament?.campaigns?.find((campaign) => campaign.organizationId === me?.id) ?? null;
  $: proAssignmentStatus = validateProAssignments(proAssignments, self?.proPickedPlayerIds ?? []);
  $: ownPlayers = (self?.lineup ?? []).map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
  $: ownDisplayPlayers = snapshot?.config.mode === 'pro' && self
    ? buildProRoleEvaluations(ownPlayers, self.proRoleAssignments, self.style ?? 'balanced').map((evaluation) => evaluation.adjustedPlayer)
    : ownPlayers;
  $: onlineRunReport = snapshot?.selfResult && me
    ? buildOnlineRunCardReport(snapshot.selfResult, snapshot.tournament?.championId ?? null, me.id)
    : null;
  $: selectedOrganizationView = selectedOrganizationId ? buildOrganizationView(selectedOrganizationId) : null;

  onMount(() => {
    roomCode = new URL(window.location.href).searchParams.get('room')?.toUpperCase() ?? '';
    clockTimer = window.setInterval(updateCountdown, 250);
    if (roomCode && localStorage.getItem(`cs13a0:online:resume:${roomCode}`)) connect();
  });

  onDestroy(() => {
    client?.stop();
    if (clockTimer !== null) window.clearInterval(clockTimer);
  });

  function updateCountdown() {
    if (!snapshot?.deadlineAt) {
      countdown = '';
      return;
    }
    const remaining = Math.max(0, snapshot.deadlineAt - (Date.now() + serverOffset));
    const seconds = Math.ceil(remaining / 1_000);
    countdown = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  function showToast(message: string) {
    toast = message;
    window.setTimeout(() => { if (toast === message) toast = ''; }, 2_200);
  }

  function validIdentity() {
    return playerName.trim().length >= 2 && organizationName.trim().length >= 2;
  }

  async function hostRoom() {
    if (!validIdentity()) return;
    creating = true;
    errorMessage = '';
    try {
      roomCode = await createOnlineRoom(getOnlineServerUrl(), config);
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomCode);
      replaceState(url, {});
      connect();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Erro ao criar sala.';
    } finally {
      creating = false;
    }
  }

  function joinRoom() {
    roomCode = roomCode.trim().toUpperCase();
    if (!validIdentity() || roomCode.length !== 8) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    replaceState(url, {});
    connect();
  }

  function connect() {
    client?.stop();
    client = new OnlineRoomClient(getOnlineServerUrl(), roomCode, { playerName: playerName.trim(), organizationName: organizationName.trim() }, {
      onConnection: (state) => { connection = state; },
      onSnapshot: (next) => {
        snapshot = next;
        serverOffset = next.serverTime - Date.now();
        config = next.config;
        if (next.self) {
          proStyle = next.self.style ?? 'balanced';
          proAssignments = Object.fromEntries(Object.entries(next.self.proRoleAssignments).filter((entry): entry is [string, LineupSlotRole] => Boolean(entry[1])));
        }
        updateCountdown();
      },
      onError: (message) => { errorMessage = message; }
    });
    client.connect();
  }

  function send(command: Parameters<OnlineRoomClient['send']>[0]) {
    errorMessage = '';
    client?.send(command);
  }

  function saveConfig(patch: Partial<RoomConfig>) {
    const next = { ...config, ...patch };
    if (next.entryStage === 'playoffs' && next.capacity > 8) next.capacity = 8;
    config = next;
    send({ type: 'configure', config: next });
  }

  function choosePlayer(player: Player, role?: LineupSlotRole) {
    send({ type: 'pick-player', playerId: player.id, ...(role ? { role } : {}) });
    detailsPlayer = null;
  }

  function cardValidation(player: Player) {
    return validatePlayerPick(player, self?.lineup ?? [], undefined, (id) => playerById.get(id));
  }

  function reasonText(reason?: string) {
    return getPickReasonText($language, reason);
  }

  function setStyle(style: OrgStyle) {
    send({ type: 'set-style', style });
  }

  function confirmPro() {
    if (!self || !proAssignmentStatus.complete) return;
    send({ type: 'configure-pro', style: proStyle, assignments: proAssignments });
  }

  function assignProRole(playerId: string, value: string) {
    const next = { ...proAssignments };
    if (value) next[playerId] = value as LineupSlotRole;
    else delete next[playerId];
    proAssignments = next;
  }

  async function copyRoomLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/online?room=${roomCode}`);
    showToast(t('shareRoom'));
  }

  function ownTeams(series: SeriesResult) {
    const mine = series.teamA.id === me?.id ? series.teamA : series.teamB;
    const enemy = series.teamA.id === me?.id ? series.teamB : series.teamA;
    const scoreMine = series.teamA.id === me?.id ? series.scoreA : series.scoreB;
    const scoreEnemy = series.teamA.id === me?.id ? series.scoreB : series.scoreA;
    return { mine, enemy, scoreMine, scoreEnemy };
  }

  function phaseLabel(phase: SeriesResult['phase'] | 'swiss') {
    if (phase === 'swiss' || phase === 'stage3') return 'STAGE 3';
    if (phase === 'quarterfinal') return $language === 'en' ? 'QUARTERFINALS' : $language === 'es' ? 'CUARTOS DE FINAL' : 'QUARTAS DE FINAL';
    if (phase === 'semifinal') return $language === 'en' ? 'SEMIFINALS' : 'SEMIFINAIS';
    return $language === 'en' ? 'GRAND FINAL' : $language === 'es' ? 'GRAN FINAL' : 'GRANDE FINAL';
  }

  function configureSimulation(patch: Pick<Partial<RoomConfig>, 'simulationMode' | 'simulationSpeed'>) {
    send({ type: 'configure-simulation', ...patch });
  }

  function phaseOverview(phase: SeriesResult['phase']): PublicOverviewSeries[] {
    const completed: PublicOverviewSeries[] = completedSeries
      .filter((series) => series.phase === phase)
      .map((series) => ({
        id: series.id,
        phase: series.phase,
        bestOf: series.bestOf,
        teamA: { id: series.teamA.id, name: series.teamA.name },
        teamB: { id: series.teamB.id, name: series.teamB.name },
        scoreA: series.scoreA,
        scoreB: series.scoreB,
        status: 'completed'
      }));
    const live = liveCursor?.phase === phase ? liveCursor.overviewSeries : [];
    return [...completed, ...live.filter((series) => !completed.some((item) => item.id === series.id))];
  }

  function organizationPlayers(organization: PublicOrganization) {
    if (!organization.human && organization.sourceTeamId) {
      return getTeamPlayers(teamById.get(organization.sourceTeamId) ?? null);
    }
    const roster = organization.lineup.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
    if (snapshot?.config.mode !== 'pro') return roster;
    const assignments = Object.fromEntries(organization.lineup.map((pick) => [pick.playerId, pick.selectedSlotRole]));
    return buildProRoleEvaluations(roster, assignments, organization.style ?? 'balanced').map((evaluation) => evaluation.adjustedPlayer);
  }

  function buildOrganizationView(organizationId: string): OrganizationRosterView | null {
    const organization = snapshot?.organizations?.find((candidate) => candidate.id === organizationId);
    if (!organization) return null;
    const roster = organizationPlayers(organization);
    const strengths = getLineupStrengths(roster);
    const historicalTeam = organization.sourceTeamId ? teamById.get(organization.sourceTeamId) ?? null : null;
    const style = organization.style ?? (historicalTeam ? teamStyle(historicalTeam, roster) as OrgStyle : 'balanced');
    return {
      id: organization.id,
      name: organization.name,
      avatar: organization.name.slice(0, 2).toUpperCase(),
      eyebrow: organization.human
        ? `${style.toUpperCase()} · POWER ${organization.power.toFixed(1)}`
        : `${historicalTeam?.game ?? 'CS'} · ${historicalTeam?.year ?? '—'} · ${teamPlacementLabel(historicalTeam)}`,
      subtitle: `${style} · OVR ${averageOverall(roster, organization.power)}`,
      tags: organization.human
        ? strengths.slice(0, 3).map((stat) => `${stat.key.toUpperCase()} ${stat.value}`)
        : teamTags(historicalTeam),
      roster,
      stats: strengths
    };
  }

  function openOrganization(organizationId: string) {
    if (snapshot?.organizations?.some((organization) => organization.id === organizationId)) selectedOrganizationId = organizationId;
  }

  async function downloadRunImage() {
    if (downloadingImage || !me) return;
    downloadingImage = true;
    try {
      await saveRunImage('share-card', `${roomCode}-${me.organizationName}`, 'cs13a0-multiplayer');
      showToast(gameT('imageDownloaded'));
    } catch {
      showToast(gameT('imageDownloadFailed'));
    } finally {
      downloadingImage = false;
    }
  }
</script>

<svelte:head>
  <title>{t('title')} · cs13a0</title>
</svelte:head>

<PageLayout wide language={$language} theme={$theme} onLanguage={(value) => $language = value} onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}>
  {#if !isOnlineEnabled()}
    <section class="online-unavailable panel">
      <span class="eyebrow">ONLINE OFFLINE</span>
      <h1>{t('title')}</h1>
      <p>O modo online ainda não está habilitado neste ambiente.</p>
      <a class="primary online-link" href="/">{t('back')}</a>
    </section>
  {:else if !snapshot}
    <section class="online-entry">
      <header class="screen-header centered">
        <div class="screen-kicker"><span class="eyebrow">2–16 PLAYERS · EPHEMERAL</span><span class="multiplayer-tag">MULTIPLAYER</span></div>
        <h1>{t('title')}</h1>
        <p>{t('intro')}</p>
      </header>
      <div class="identity-grid panel">
        <label><span>{t('playerName')}</span><input bind:value={playerName} minlength="2" maxlength="24" autocomplete="nickname" /></label>
        <label><span>{t('orgName')}</span><input bind:value={organizationName} minlength="2" maxlength="24" /></label>
      </div>
      <div class="entry-actions">
        <section class="panel">
          <span class="eyebrow">HOST</span>
          <h2>{t('host')}</h2>
          <button class="primary" type="button" disabled={!identityValid || creating} on:click={hostRoom}>{creating ? '...' : t('host')}</button>
        </section>
        <section class="panel">
          <span class="eyebrow">JOIN</span>
          <h2>{t('join')}</h2>
          <label><span>{t('roomCode')}</span><input class="room-input" bind:value={roomCode} maxlength="8" /></label>
          <button class="secondary" type="button" disabled={!identityValid || roomCode.trim().length !== 8} on:click={joinRoom}>{t('join')}</button>
        </section>
      </div>
      {#if errorMessage}<p class="online-error">{errorMessage}</p>{/if}
    </section>
  {:else}
    <section class="online-room">
      <header class:online-draft-header={snapshot.phase === 'draft'} class="online-header">
        <div><div class="screen-kicker"><span class="eyebrow">{snapshot.phase.toUpperCase()} · {t(connection).toUpperCase()}</span><span class="multiplayer-tag">MULTIPLAYER</span></div><h1>{snapshot.phase === 'lobby' ? t('lobby') : snapshot.phase === 'draft' ? t('draft') : t('title')}</h1></div>
        <div class="room-code"><span>{t('roomCode')}</span><button type="button" on:click={copyRoomLink}>{roomCode}</button></div>
      </header>

      {#if snapshot.phase === 'lobby'}
        <div class="lobby-grid">
          <section class="panel participants-panel">
            <div class="section-heading"><div><span class="eyebrow">LOBBY</span><h2>{t('participants')}</h2></div><span class="counter">{snapshot.participants.length}/{snapshot.config.capacity}</span></div>
            <div class="participant-list">
              {#each snapshot.participants as participant}
                <article class:offline={!participant.connected}><span>{participant.organizationName.slice(0, 2).toUpperCase()}</span><div><strong>{participant.organizationName}</strong><small>{participant.playerName}</small></div><b>{participant.host ? 'HOST' : participant.connected ? 'ONLINE' : 'OFFLINE'}</b></article>
              {/each}
            </div>
          </section>
          <section class="panel room-settings">
            <span class="eyebrow">ROOM CONFIG</span>
            <h2>{t('title')}</h2>
            <label><span>{t('mode')}</span><select value={config.mode} disabled={!isHost} on:change={(event) => saveConfig({ mode: (event.currentTarget as HTMLSelectElement).value as RoomConfig['mode'] })}>{#each onlineModes as mode}<option value={mode}>{translateOnlineMode($language, mode).name}</option>{/each}</select><small class="mode-description">{translateOnlineMode($language, config.mode).description}</small></label>
            <label><span>{t('entryStage')}</span><select value={config.entryStage} disabled={!isHost} on:change={(event) => saveConfig({ entryStage: (event.currentTarget as HTMLSelectElement).value as RoomConfig['entryStage'] })}><option value="stage3">Stage 3</option><option value="playoffs">Playoffs</option></select></label>
            <label><span>{t('capacity')}</span><input type="number" min="2" max={config.entryStage === 'playoffs' ? 8 : 16} value={config.capacity} disabled={!isHost} on:change={(event) => saveConfig({ capacity: Number((event.currentTarget as HTMLInputElement).value) })} /></label>
            <label><span>{t('deadline')}</span><select value={config.draftDeadlineSeconds ?? 'off'} disabled={!isHost} on:change={(event) => saveConfig({ draftDeadlineSeconds: (event.currentTarget as HTMLSelectElement).value === 'off' ? null : Number((event.currentTarget as HTMLSelectElement).value) as 60 | 120 | 180 | 300 })}><option value="60">60s</option><option value="120">120s</option><option value="180">180s</option><option value="300">300s</option><option value="off">{t('deadlineOff')}</option></select></label>
            <label><span>{gameT('simulationMode')}</span><select value={config.simulationMode} disabled={!isHost} on:change={(event) => saveConfig({ simulationMode: (event.currentTarget as HTMLSelectElement).value as RoomConfig['simulationMode'] })}><option value="automatic">{gameT('automatic')}</option><option value="manual">{gameT('manual')}</option></select></label>
            <label><span>{t('speed')}</span><select value={config.simulationSpeed} disabled={!isHost} on:change={(event) => saveConfig({ simulationSpeed: (event.currentTarget as HTMLSelectElement).value as RoomConfig['simulationSpeed'] })}><option value="normal">{gameT('normal')}</option><option value="fast">{gameT('fast')}</option><option value="ultra">{gameT('ultra')}</option></select></label>
            {#if isHost}<button class="primary" type="button" disabled={snapshot.participants.filter((participant) => participant.connected).length < 2} on:click={() => send({ type: 'start' })}>{t('start')}</button>{/if}
          </section>
        </div>
      {:else if snapshot.phase === 'draft' && self}
        <div class="draft-status panel"><div><span>{t('participants')}</span><strong>{snapshot.participants.filter((participant) => participant.ready).length}/{snapshot.participants.length}</strong></div>{#if countdown}<div><span>{t('deadline')}</span><strong>{countdown}</strong></div>{/if}<div><span>STATUS</span><strong>{me?.ready ? 'READY' : `${snapshot.config.mode === 'pro' ? self.proPickedPlayerIds.length : self.lineup.length}/5`}</strong></div></div>
        {#if snapshot.config.mode !== 'pro' && !self.style}
          <section class="style-block panel">
            <div class="section-heading"><div><span class="eyebrow">TACTICAL IDENTITY</span><h2>{gameT('chooseStyle')}</h2></div></div>
            <p class="style-required">{gameT('chooseStyleBeforeRoll')}</p>
            <div class="segmented">{#each ['aggressive', 'balanced', 'tactical'] as style}<button type="button" on:click={() => setStyle(style as OrgStyle)}><strong>{gameT(style as 'aggressive' | 'balanced' | 'tactical')}</strong><small>{gameT(`${style}Desc` as 'aggressiveDesc' | 'balancedDesc' | 'tacticalDesc')}</small></button>{/each}</div>
          </section>
        {/if}
        {#if snapshot.config.mode === 'pro' && self.proPickedPlayerIds.length === 5 && self.lineup.length < 5}
          <section class="panel pro-config">
            <span class="eyebrow">PRO CONFIG</span><h2>{t('completeRoles')}</h2>
            <select bind:value={proStyle}><option value="aggressive">Aggressive</option><option value="balanced">Balanced</option><option value="tactical">Tactical</option></select>
            <div>
              {#each self.proPickedPlayerIds as playerId}
                {@const player = playerById.get(playerId)}
                <label><strong>{player?.nickname ?? playerId}</strong><select value={proAssignments[playerId] ?? ''} on:change={(event) => assignProRole(playerId, (event.currentTarget as HTMLSelectElement).value)}><option value="">{gameT('role')}</option>{#each PRO_REQUIRED_ROLES as role}{@const takenByOther = Object.entries(proAssignments).some(([otherPlayerId, assignedRole]) => otherPlayerId !== playerId && assignedRole === role)}<option value={role} disabled={takenByOther}>{getRoleLabel(role)}</option>{/each}</select></label>
              {/each}
            </div>
            <div class="pro-role-status">{#if proAssignmentStatus.hasDuplicate}<span>{gameT('proRoleDuplicate')}</span>{/if}{#if proAssignmentStatus.unassignedCount}<span>{gameT('proRoleMissing')}: {proAssignmentStatus.unassignedCount}</span>{/if}</div>
            <button class="primary" type="button" disabled={!proAssignmentStatus.complete} on:click={confirmPro}>{t('configurePro')}</button>
          </section>
        {:else if !me?.ready}
          <section class="roll-zone panel">
            {#if offeredTeam}
              {#if snapshot.config.mode === 'pro'}
                <div class="team-banner blind-banner"><div class="team-avatar">?</div><div><span class="eyebrow">PRO BLIND OFFER</span><h2>{gameT('proBlindOffer')}</h2><p>{gameT('proBlindOfferDesc')}</p></div><span class="team-power">?</span></div>
              {:else}
                <div class="team-banner"><div class="team-avatar">{(offeredTeam.name ?? 'T').slice(0, 2).toUpperCase()}</div><div><span class="eyebrow">ROLLED TEAM</span><h2>{offeredTeam.name ?? 'Time'} <b>{offeredTeam.year ?? ''}</b></h2><p>{offeredTeam.game ?? 'CS'} · RANK #{offeredTeam.sourceRank ?? offeredTeam.rank ?? '—'} · {offeredTeam.rarity ?? 'standard'}</p></div><span class="team-power">{snapshot.config.mode === 'fun' || snapshot.config.mode === 'max_fun' ? `AVG ${offeredTeamAverage?.toFixed(1) ?? '—'}` : `PWR ${offeredTeam.teamPowerPreview ?? offeredTeam.power ?? '—'}`}</span></div>
              {/if}
              <div class="reroll-bar"><div><span class="eyebrow">{gameT('teamReroll')}</span><strong>{self.rerollsMax - self.rerollsUsed}/{self.rerollsMax}</strong></div><button class="secondary" type="button" disabled={self.rerollsUsed >= self.rerollsMax} on:click={() => send({ type: 'reroll-team' })}>{gameT('rerollTeam')} <span>↻</span></button></div>
              <p class="pick-instruction">{snapshot.config.mode === 'pro' ? gameT('proBlindOfferDesc') : gameT('pickOne')}</p>
              <div class:pro-offer-grid={snapshot.config.mode === 'pro'} class="player-grid">
                {#each offeredPlayers as player}
                  {@const validation = cardValidation(player)}
                  {#if snapshot.config.mode === 'pro'}<button class="player-card pro-blind-card" type="button" on:click={() => choosePlayer(player)}><div class="pro-name-only">{player.nickname ?? gameT('proHiddenPlayer')}</div></button>{:else}<PlayerCard {player} mode={presentationMode} language={$language} blockedReason={validation.ok ? '' : reasonText(validation.reason)} onOpen={(selected) => detailsPlayer = selected} />{/if}
                {/each}
              </div>
            {:else}
              <div class="roll-empty"><div class="scanner"><span></span></div><span class="eyebrow">TEAM LOTTERY / {(snapshot.config.mode === 'pro' ? self.proPickedPlayerIds.length : self.lineup.length) + 1} OF 5</span><h2>{snapshot.config.mode === 'pro' ? gameT('proBlindDraft') : gameT('emptyTitle')}</h2><p>{snapshot.config.mode === 'pro' ? gameT('proBlindOfferDesc') : gameT('noRepeat')}</p><button class="primary" type="button" disabled={snapshot.config.mode !== 'pro' && !self.style} on:click={() => send({ type: 'draw-team' })}>{gameT('rollTeam')} <span>↻</span></button></div>
            {/if}
          </section>
        {:else}<section class="panel waiting-panel"><div class="scanner"><span></span></div><h2>{t('waiting')}</h2></section>{/if}
        {#if snapshot.config.mode === 'pro' && !me?.ready}
          <section class="hud panel pro-hud"><div><span class="eyebrow">PRO LINEUP / {self.proPickedPlayerIds.length}/5</span><h2>{gameT('proBlindDraft')}</h2></div><div class="pro-hidden-slots">{#each Array(5) as _, index}<span class:filled={index < self.proPickedPlayerIds.length}>{self.proPickedPlayerIds[index] ? playerById.get(self.proPickedPlayerIds[index])?.nickname ?? '?' : '?'}</span>{/each}</div></section>
        {:else}
          <DraftHud selectedPlayers={displayLineup as SelectedPlayer[]} style={self.style ?? 'balanced'} styleLocked={Boolean(self.style)} styleLabel={gameT((self.style ?? 'balanced') as OrgStyle)} mode={presentationMode} revealed={me?.ready ?? false} label={gameT('orgHud')} onOpen={(player) => detailsPlayer = player} />
        {/if}
        <section class="online-progress"><h2>{t('participants')}</h2>{#each snapshot.participants as participant}<article><span>{participant.organizationName}</span><b>{participant.picksCompleted}/5</b><i><em style={`width:${participant.picksCompleted * 20}%`}></em></i></article>{/each}</section>
      {:else if snapshot.tournament}
        <section class="screen match-screen online-major-screen">
          <header class="match-topbar">
            <div><div class="screen-kicker"><span class="eyebrow">MAJOR LIVE · {t(connection).toUpperCase()}</span><span class="multiplayer-tag">MULTIPLAYER</span></div><h1>{liveCursor ? phaseLabel(liveCursor.phase) : snapshot.phase === 'completed' ? gameT('result') : t('title')}</h1></div>
            {#if myStanding && snapshot.phase === 'swiss'}<div class="record"><span>{myStanding.wins}</span><small>W</small><b>:</b><span>{myStanding.losses}</span><small>L</small></div>{/if}
          </header>

          {#if snapshot.phase !== 'completed'}
            <div class="match-controls panel">
              <div class="control-group">
                <span>{gameT('simulationMode')} {isHost ? '' : '· HOST'}</span>
                <SegmentedControl
                  value={snapshot.config.simulationMode}
                  label={gameT('simulationMode')}
                  disabled={!isHost}
                  options={[{ value: 'manual', label: gameT('manual') }, { value: 'automatic', label: gameT('automatic') }]}
                  onChange={(value) => configureSimulation({ simulationMode: value as RoomConfig['simulationMode'] })}
                />
              </div>
              <div class="control-group">
                <span>{gameT('speed')} {isHost ? '' : '· HOST'}</span>
                <SegmentedControl
                  value={snapshot.config.simulationSpeed}
                  label={gameT('speed')}
                  disabled={!isHost}
                  options={[{ value: 'normal', label: gameT('normal') }, { value: 'fast', label: gameT('fast') }, { value: 'ultra', label: gameT('ultra') }]}
                  onChange={(value) => configureSimulation({ simulationSpeed: value as RoomConfig['simulationSpeed'] })}
                />
              </div>
            </div>
          {/if}

          <div class="major-tabs"><SegmentedControl value={activeTab} label={t('title')} options={[{ value: 'current', label: t('currentGame') }, { value: 'all', label: t('allGames') }]} onChange={(value) => activeTab = value as 'current' | 'all'} /></div>

          {#if activeTab === 'current'}
            {#if snapshot.phase === 'completed'}
              <header class:success={snapshot.tournament.championId === me?.id} class="result-hero online-result-hero">
                <span class="eyebrow">FINAL REPORT / {roomCode}</span>
                <h1>{snapshot.tournament.championId === me?.id ? gameT('champion') : gameT('eliminated')}</h1>
                <p>{myCampaign ? translatePlacement($language, myCampaign.placement) : '—'}</p>
              </header>
              {#if myCampaign}
                <div class="campaign-grid">
                  <article><small>{gameT('placement')}</small><strong>{translatePlacement($language, myCampaign.placement)}</strong></article>
                  <article><small>{gameT('seriesWon')}</small><strong>{myCampaign.seriesWon}</strong></article>
                  <article><small>{gameT('seriesLost')}</small><strong>{myCampaign.seriesLost}</strong></article>
                  <article><small>{gameT('mapsWon')}</small><strong>{myCampaign.mapsWon}</strong></article>
                  <article><small>{gameT('mapsLost')}</small><strong>{myCampaign.mapsLost}</strong></article>
                  <article><small>{gameT('roundsWon')}</small><strong>{myCampaign.roundsWon}</strong></article>
                  <article><small>{gameT('roundsLost')}</small><strong>{myCampaign.roundsLost}</strong></article>
                </div>
              {/if}
              {#if snapshot.selfResult && onlineRunReport && self}
                <ShareRunCard
                  seed={roomCode}
                  seedLabel="ROOM"
                  report={onlineRunReport}
                  players={ownDisplayPlayers}
                  lineup={self.lineup}
                  stats={snapshot.selfResult.stats}
                  mode={null}
                  contextTags={['MULTIPLAYER', currentModePresentation.name]}
                  language={$language}
                  labels={{ champion: gameT('champion'), eliminated: gameT('eliminated'), placement: gameT('placement'), record: gameT('record'), maps: gameT('maps'), mvp: gameT('runMvp') }}
                />
                <div class="result-actions online-result-actions"><button class="secondary" type="button" disabled={downloadingImage} on:click={downloadRunImage}>{gameT('downloadRunImage')}</button></div>
              {/if}
            {:else if liveSeries}
              {#key liveSeries.series.id}
                <SeriesViewer
                  series={liveSeries.series}
                  controlled
                  controlledActiveMap={liveSeries.activeMap}
                  controlledVisibleRounds={liveSeries.visibleRounds}
                  controlledStarted={liveSeries.started}
                  controlledFinished={liveSeries.finished}
                  language={$language}
                  interactiveTeamIds={[liveSeries.series.teamA.id, liveSeries.series.teamB.id]}
                  onTeamClick={openOrganization}
                  labels={{ start: gameT('startSeries'), skip: gameT('skipMap'), round: gameT('round'), map: gameT('map'), final: gameT('final'), waiting: gameT('waiting'), pending: gameT('pending'), inProgress: gameT('inProgress'), mapInProgress: gameT('mapInProgress') }}
                />
              {/key}
              {#if liveCursor?.status === 'waiting_host'}
                {#if isHost}<button class="primary wide next-match" type="button" on:click={() => send({ type: 'advance-round' })}>{t('startRound')} →</button>{:else}<p class="host-wait panel">{t('waitingHost')}</p>{/if}
              {/if}
            {:else}
              <section class="panel waiting-panel"><div class="scanner"><span></span></div><h2>{t('noGames')}</h2></section>
            {/if}

            <aside class="timeline panel">
              <span class="eyebrow">RUN TIMELINE</span>
              <div class="timeline-phases">
                {#each ['stage3', 'quarterfinal', 'semifinal', 'final'] as phase}
                  {@const matches = ownCompletedSeries.filter((series) => series.phase === phase)}
                  {#if matches.length}
                    <div class="timeline-phase completed">
                      <div class="timeline-phase-header"><span class="timeline-phase-label">{phaseLabel(phase as SeriesResult['phase'])}</span></div>
                      <div class="timeline-phase-content">
                        {#each matches as match}
                          {@const teams = ownTeams(match)}
                          <div class:user-win={match.winnerId === me?.id} class:user-loss={match.winnerId !== me?.id} class="timeline-match">
                            <button class="organization-link timeline-team-left" type="button" on:click={() => openOrganization(teams.mine.id)}>{teams.mine.name}</button>
                            <button class="timeline-score timeline-expand" type="button" aria-expanded={expandedTimelineMatch === match.id} on:click={() => expandedTimelineMatch = expandedTimelineMatch === match.id ? null : match.id}>{teams.scoreMine} : {teams.scoreEnemy}</button>
                            <button class="organization-link timeline-team-right" type="button" on:click={() => openOrganization(teams.enemy.id)}>{teams.enemy.name}</button>
                          </div>
                          {#if expandedTimelineMatch === match.id}<div class="timeline-maps">{#each match.maps as map}<span class="timeline-map">{gameT('map')} {map.map} · {map.scoreA} x {map.scoreB} {map.overtime ? '· OT' : ''}</span>{/each}</div>{/if}
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
              {#if !ownCompletedSeries.length}<p class="timeline-empty">{gameT('waitingResult')}</p>{/if}
            </aside>
          {:else}
            {#if snapshot.phase === 'swiss'}
              <section class="major-overview-grid">
                <div class="panel overview-rounds">
                  <div class="section-heading"><div><span class="eyebrow">STAGE 3 LIVE</span><h2>{t('allGames')}</h2></div></div>
                  {#each snapshot.tournament.rounds.filter((round) => round.phase === 'swiss') as round}
                    <div class="overview-round"><span class="timeline-phase-label">{gameT('round')} {round.number}</span>{#each round.series as series}<div class="overview-match"><button class="organization-link" type="button" on:click={() => openOrganization(series.teamA.id)}>{series.teamA.name}</button><b>{series.scoreA} : {series.scoreB}</b><button class="organization-link overview-team-right" type="button" on:click={() => openOrganization(series.teamB.id)}>{series.teamB.name}</button><small>{gameT('final')}</small></div>{/each}</div>
                  {/each}
                  {#if liveCursor?.phase === 'swiss'}
                    <div class="overview-round"><span class="timeline-phase-label">{gameT('round')} {liveCursor.tournamentRound}</span>{#each liveCursor.overviewSeries as series}<div class:live={series.status === 'live'} class="overview-match"><button class="organization-link" type="button" on:click={() => openOrganization(series.teamA.id)}>{series.teamA.name}</button><b>{series.scoreA} : {series.scoreB}</b><button class="organization-link overview-team-right" type="button" on:click={() => openOrganization(series.teamB.id)}>{series.teamB.name}</button><small>{series.status === 'live' ? t('live') : gameT('pending')}</small></div>{/each}</div>
                  {/if}
                </div>
                <div class="panel standings"><span class="eyebrow">{t('standings')}</span><h2>W–L / {t('buchholz')}</h2>{#each snapshot.tournament.standings as standing}<article class:champion={standing.status === 'champion'}><span>{standing.seed}</span><button class="organization-link" type="button" on:click={() => openOrganization(standing.organizationId)}>{standing.name}</button><b>{standing.wins}–{standing.losses}</b><small>{standing.buchholz}</small></article>{/each}</div>
              </section>
            {:else}
              <section class="panel online-bracket">
                <div class="section-heading"><div><span class="eyebrow">{t('bracket')}</span><h2>PLAYOFFS</h2></div></div>
                <div class="bracket-columns">
                  {#each ['quarterfinal', 'semifinal', 'final'] as phase}
                    <section><h3>{phaseLabel(phase as SeriesResult['phase'])}</h3>{#each phaseOverview(phase as SeriesResult['phase']) as series}<article class:live={series.status === 'live'}><div><button class="organization-link" type="button" on:click={() => openOrganization(series.teamA.id)}>{series.teamA.name}</button><b>{series.scoreA}</b></div><div><button class="organization-link" type="button" on:click={() => openOrganization(series.teamB.id)}>{series.teamB.name}</button><b>{series.scoreB}</b></div><small>{series.status === 'live' ? t('live') : series.status === 'completed' ? gameT('final') : gameT('pending')}</small></article>{/each}</section>
                  {/each}
                </div>
              </section>
            {/if}
          {/if}
        </section>
      {/if}
      {#if errorMessage}<p class="online-error">{errorMessage}</p>{/if}
    </section>
  {/if}
</PageLayout>

{#if detailsPlayer && snapshot && snapshot.config.mode !== 'pro'}
  <PlayerDetailSheet
    player={detailsPlayer}
    mode={presentationMode}
    language={$language}
    draftComplete={Boolean(me?.ready)}
    lineup={self?.lineup ?? []}
    playerLookup={(id) => playerById.get(id)}
    onConfirm={choosePlayer}
    onClose={() => detailsPlayer = null}
  />
{/if}

<OrganizationRosterModal
  organization={selectedOrganizationView}
  isOpen={Boolean(selectedOrganizationView)}
  language={$language}
  showPlayerAwards={snapshot ? shouldShowPlayerAwards(presentationMode, 'game') : false}
  onClose={() => selectedOrganizationId = null}
/>

{#if toast}<div class="toast">{toast}</div>{/if}

<style>
  .mode-description{color:var(--muted);font-size:.68rem;line-height:1.4}
  .online-entry,.online-room{padding:28px 0 70px}.online-unavailable{margin-top:50px;padding:30px}.online-unavailable h1{font-size:clamp(2.5rem,8vw,5rem)}.online-unavailable p{color:var(--muted)}.online-link{display:inline-flex;align-items:center;min-height:48px;margin-top:18px;padding:0 18px;text-decoration:none}.identity-grid{display:grid;gap:12px;margin:28px 0 14px;padding:18px}.identity-grid label,.room-settings label,.entry-actions label,.pro-config label{display:grid;gap:7px}.identity-grid span,.room-settings label>span,.entry-actions label>span{color:var(--muted);font-size:.6rem;font-weight:800;text-transform:uppercase}.identity-grid input,.room-settings input,.room-settings select,.entry-actions input,.pro-config select{min-height:46px;padding:0 12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text)}.entry-actions{display:grid;gap:14px}.entry-actions section{padding:22px}.entry-actions h2{font-size:2rem}.entry-actions button{width:100%;margin-top:15px}.room-input{text-transform:uppercase;letter-spacing:.2em}.online-error{padding:12px;border:1px solid var(--danger);color:#ff9b90}.online-header{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:20px}.online-header h1{margin:5px 0 0;font-size:clamp(2.6rem,8vw,5rem)}.room-code{display:grid;gap:5px;text-align:right}.room-code span{color:var(--muted);font-size:.55rem;text-transform:uppercase}.room-code button{padding:9px 12px;border:1px solid var(--accent);background:transparent;color:var(--accent);font-weight:900;letter-spacing:.17em}.lobby-grid{display:grid;gap:14px}.participants-panel,.room-settings{padding:20px}.participant-list{display:grid;gap:8px}.participant-list article{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);background:var(--surface-2)}.participant-list article>span{display:grid;place-items:center;width:38px;height:38px;background:var(--accent);color:#0a0d08;font-weight:900}.participant-list strong,.participant-list small{display:block}.participant-list small{margin-top:2px;color:var(--muted)}.participant-list b{color:var(--accent);font-size:.55rem}.participant-list .offline{opacity:.55}.room-settings{display:grid;gap:10px}.room-settings h2{margin:2px 0 7px}.draft-status{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:14px}.draft-status div{padding:13px;border-right:1px solid var(--line)}.draft-status span,.draft-status strong{display:block}.draft-status span{color:var(--muted);font-size:.55rem;text-transform:uppercase}.draft-status strong{margin-top:5px;color:var(--accent);font-size:1.3rem}.pro-config,.waiting-panel{margin-bottom:14px;padding:20px}.waiting-panel{text-align:center}.waiting-panel .scanner{margin:auto}.online-progress{margin-top:18px}.online-progress article{display:grid;grid-template-columns:1fr auto;gap:6px;margin:8px 0}.online-progress i{grid-column:1/-1;height:4px;background:var(--line)}.online-progress em{display:block;height:100%;background:var(--accent)}.pro-config>div{display:grid;gap:8px;margin:14px 0}.pro-config label{grid-template-columns:1fr 1fr;align-items:center}.standings{padding:20px}.standings article{display:grid;grid-template-columns:24px 1fr auto 36px;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}.standings small{text-align:right;color:var(--muted)}.standings .champion{color:var(--accent)}
  @media(min-width:680px){.identity-grid{grid-template-columns:1fr 1fr}.entry-actions,.lobby-grid{grid-template-columns:1fr 1fr}}
  .online-major-screen{max-width:900px;margin:24px auto 0}.major-tabs{margin-bottom:18px}.online-result-hero{margin-top:18px}.host-wait{margin:0 0 18px;padding:16px;color:var(--muted);text-align:center}.control-group{display:grid;gap:6px}.control-group>span{color:var(--muted);font-size:.58rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.major-overview-grid{display:grid;gap:14px;margin-top:18px}.overview-rounds,.standings,.online-bracket{padding:20px}.overview-round{display:grid;gap:6px;margin-top:18px}.overview-match{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto;align-items:center;gap:10px;min-height:44px;padding:8px 10px;border:1px solid var(--line);background:var(--surface-2);font-size:.72rem}.overview-match b{font:900 1.2rem 'Barlow Condensed'}.overview-match small{color:var(--muted);font-size:.5rem;font-weight:900}.overview-match.live{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.overview-match.live small{color:var(--accent)}.standings article{display:grid;grid-template-columns:24px 1fr auto 36px;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}.standings small{text-align:right;color:var(--muted)}.standings .champion{color:var(--accent)}.bracket-columns{display:grid;grid-template-columns:repeat(3,minmax(190px,1fr));gap:14px;overflow-x:auto}.bracket-columns section{display:grid;align-content:center;gap:10px}.bracket-columns h3{margin:10px 0 2px;color:var(--muted);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase}.bracket-columns article{position:relative;padding:10px;border:1px solid var(--line);background:var(--surface-2)}.bracket-columns article.live{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.bracket-columns article>div{display:grid;grid-template-columns:1fr auto;gap:8px;padding:4px 0}.bracket-columns article small{display:block;margin-top:5px;color:var(--muted);font-size:.5rem;font-weight:900}.bracket-columns article.live small{color:var(--accent)}
  @media(min-width:680px){.identity-grid{grid-template-columns:1fr 1fr}.entry-actions,.lobby-grid,.major-overview-grid{grid-template-columns:1fr 1fr}}
  @media(max-width:679px){.online-header{align-items:start;flex-direction:column}.room-code{text-align:left}.draft-status{grid-template-columns:1fr}.draft-status div{border-right:0;border-bottom:1px solid var(--line)}.standings article{font-size:.78rem}.bracket-columns{grid-template-columns:1fr;overflow:visible}.overview-match{grid-template-columns:1fr auto}.overview-team-right{grid-column:1}.overview-match small{grid-column:2;grid-row:1/3}.online-major-screen{margin-top:8px}}
  .screen-kicker{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.screen-header.centered .screen-kicker{justify-content:center}.multiplayer-tag{display:inline-flex;align-items:center;min-height:20px;padding:3px 7px;border:1px solid var(--accent);color:#091006;background:var(--accent);font-size:.48rem;font-weight:900;letter-spacing:.12em;line-height:1;text-transform:uppercase}.organization-link{min-width:0;padding:0;border:0;color:inherit;background:transparent;font:inherit;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.organization-link:hover,.organization-link:focus-visible{color:var(--accent);text-decoration:underline;text-underline-offset:3px}.timeline-match{cursor:default}.timeline-match:hover{background:transparent}.timeline-expand{padding:4px 7px;border:1px solid transparent;color:inherit;background:transparent;font-weight:900;cursor:pointer}.timeline-expand:hover,.timeline-expand:focus-visible{border-color:currentColor}.overview-team-right{text-align:right}.standings .organization-link{font-weight:800}.bracket-columns .organization-link{width:100%}.online-result-actions{width:min(540px,100%);margin:0 auto 24px}.online-result-actions button{width:100%}
</style>
