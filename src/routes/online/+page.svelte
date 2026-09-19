<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import PlayerCard from '$lib/components/PlayerCard.svelte';
  import PlayerDetailSheet from '$lib/components/PlayerDetailSheet.svelte';
  import OrganizationRosterModal from '$lib/components/OrganizationRosterModal.svelte';
  import MajorOverview from '$lib/components/MajorOverview.svelte';
  import RunStatsGrid from '$lib/components/RunStatsGrid.svelte';
  import MajorAwardsPanel from '$lib/components/MajorAwardsPanel.svelte';
  import CollapsibleStats from '$lib/components/CollapsibleStats.svelte';
  import ShareRunCard from '$lib/components/ShareRunCard.svelte';
  import DraftHud from '$lib/components/DraftHud.svelte';
  import SeriesViewer from '$lib/components/SeriesViewer.svelte';
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import AutomationGear from '$lib/components/AutomationGear.svelte';
  import DraftRoulette from '$lib/components/DraftRoulette.svelte';
  import FlyingPick from '$lib/components/FlyingPick.svelte';
  import { playOfflineSound, unlockOfflineAudio, stopOfflineSounds, loadOfflineSound, disposeOfflineAudio, offlineSoundEnabled, setOfflineSound } from '$lib/game/offlineAudio';
  import { answersDecision, autoEcoCall, autoSidePick, autoVetoMap, decisionKey, shouldAnswerAgain, shouldCallTimeout, timeoutTimingFor, type AutomationAttempt } from '$lib/game/online-automation';
  import { DEFAULT_STRATEGIC_AUTOMATION, loadStrategicPreferences, saveStrategicPreferences, type StrategicAutomationPreferences } from '$lib/game/preferences';
  import VetoBoard from '$lib/components/live/VetoBoard.svelte';
  import SidePickPrompt from '$lib/components/live/SidePickPrompt.svelte';
  import EcoCallPrompt from '$lib/components/live/EcoCallPrompt.svelte';
  import TimeoutButton from '$lib/components/live/TimeoutButton.svelte';
  import PublicProfileSheet from '$lib/components/online/PublicProfileSheet.svelte';
  import SeasonPanel from '$lib/components/online/SeasonPanel.svelte';
  import RematchPanel from '$lib/components/online/RematchPanel.svelte';
  import LiveSeriesSwitcher from '$lib/components/online/LiveSeriesSwitcher.svelte';
  import { translate, translatePlacement } from '$lib/game/i18n';
  import { getRoleLabel, validatePlayerPick } from '$lib/game/roleRules';
  import { hasFreeRoles } from '$lib/game/online/draft';
  import { playerById as corePlayerById, secretPlayers, teamById as coreTeamById, getTeamPlayers, teams } from '$lib/game/data';
  import { collectionPlayerById, collectionTeamById } from '$lib/game/online/collection-pool';
  import { findSecretOrganization, isSecretPlayerId, secretPoolOf } from '$lib/game/online/secret-players';
  import { MAP_POOL, getDefaultMapSelection, getLineupMapContributors, getLineupMapYears, getMapFamiliarity, getMapName, isValidLineupMapSelection } from '$lib/game/maps';
  import { getPickReasonText } from '$lib/game/pickPresentation';
  import { averageOverall, getLineupStrengths, type OrganizationRosterView } from '$lib/game/organizationPresentation';
  import { buildOnlineRunCardReport } from '$lib/game/runCard';
  import { downloadRunImage as saveRunImage } from '$lib/game/shareImage';
  import { buildProRoleEvaluations, PRO_REQUIRED_ROLES, validateProAssignments } from '$lib/game/proMode';
  import { shouldShowPlayerAwards, teamPlacementLabel, teamStyle, teamTags } from '$lib/game/teamViews';
  import { language, theme } from '$lib/game/pageState';
  import type { LineupSlotRole, MapId, OrgStyle, Player, RoundDetail, SelectedPlayer, SeriesResult, CombatTeam, MajorTournament } from '$lib/game/types';
  import { checkOnlineRoom, createOnlineRoom, hasOnlineResumeToken, isNewOnlineRun, isValidRoomCode, loadOnlineConfig, loadOnlineIdentity, OnlineRoomClient, OnlineRoomCreationError, saveOnlineConfig, saveOnlineIdentity, type OnlineClientErrorCode } from '$lib/game/online/client';
  import { DEFAULT_ROOM_CONFIG, toPresentationGameMode, type LiveUpdate, type PublicLiveCursor, type PublicLiveSeries, type PublicOrganization, type PublicOverviewSeries, type PublicPendingDecision, type RoomConfig, type RoomSnapshot } from '$lib/game/online/contracts';
  import { getHistoricalTeamOverall } from '$lib/game/online/draft-pool';
  import { getOnlineServerUrl, isOnlineEnabled } from '$lib/game/online/config';
  import { SEO_BY_ROUTE } from '$lib/seo';
  import { translateOnline, translateOnlineMode, type OnlineTranslationKey } from '$lib/game/online/i18n';
  import { accountUser, authFetch, loadAccount, sessionToken } from '$lib/game/online/account';
  import { get } from 'svelte/store';
  import { fetchCollection, startSolo } from '$lib/game/online/collection';
  import { refreshWallet } from '$lib/game/online/wallet';
  import '../../app.css';

  // Collection lineups may bring 2013–2015 cards; the draft itself only ever offers core players.
  const playerById = new Map([...collectionPlayerById, ...corePlayerById]);
  const teamById = new Map([...collectionTeamById, ...coreTeamById]);
  let playerName = '';
  let organizationName = '';
  let roomCode = '';
  // Collection account: when logged in with a saved team, the room can be entered without drafting.
  let hasSavedLineup = false;
  let useCollectionTeam = false;
  let pendingLineupTicket: string | undefined;
  type MajorResultView = { placement: string; lobbySize: number; ranked: boolean; counted: boolean; champion: boolean; basePoints: number; points: number; rewardCoins: number; awardCoins: number; awards: Array<{ kind: string; coins: number; points: number }> };
  let collectionOutcome: { rank: number | null; points: number; majorsWon: number; awards: Array<{ kind: string; count: number }>; result: MajorResultView | null; room: RoomRewardView[] } | null = null;
  type RoomRewardView = { userId: string; teamName: string | null; displayName: string; placement: string; points: number; coins: number };
  let collectionOutcomeFor = '';
  let profileOf: string | null = null;
  // Ranked Majors being played now (queue rooms), refreshed while the entry screen is open.
  type LiveRoom = { id: string; phase: string; round: number; competitive: boolean; champion: string | null; teams: Array<{ name: string; wins: number; losses: number; status: string }> };
  let liveRooms: LiveRoom[] = [];
  let liveTimer: number | null = null;
  async function loadLive() {
    if (snapshot || document.hidden) return;
    try { liveRooms = (await authFetch<{ rooms: LiveRoom[] }>(getOnlineServerUrl(), '/live')).rooms; } catch { /* board is optional */ }
  }
  async function loadCollectionOutcome(key: string) {
    if (!$accountUser || collectionOutcomeFor === key) return;
    collectionOutcomeFor = key;
    const code = roomCode;
    // The server records the run right after the champion is known; retry a few times while the write lands.
    let result: MajorResultView | null = null;
    let room: RoomRewardView[] = [];
    for (let attempt = 0; attempt < 5 && !result; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      if (collectionOutcomeFor !== key) return;
      const reply = await authFetch<{ result: MajorResultView | null; room?: RoomRewardView[] }>(getOnlineServerUrl(), `/me/majors/${code}`).catch(() => ({ result: null, room: [] }));
      result = reply.result; room = reply.room ?? [];
    }
    // The run's coins (and any award prize) land on the wallet bar.
    if (result) void refreshWallet(getOnlineServerUrl());
    try {
      const [season, awards] = await Promise.all([
        authFetch<{ me: { rank: number; points: number; majorsWon: number } | null }>(getOnlineServerUrl(), '/seasons/current'),
        authFetch<{ awards: Array<{ kind: string; count: number }> }>(getOnlineServerUrl(), '/me/awards')
      ]);
      collectionOutcome = { rank: season.me?.rank ?? null, points: season.me?.points ?? 0, majorsWon: season.me?.majorsWon ?? 0, awards: awards.awards.slice(0, 8), result, room };
    } catch { collectionOutcome = result ? { rank: null, points: 0, majorsWon: 0, awards: [], result, room } : null; }
  }
  const awardName = (kind: string) => { const key = `award_${kind}` as Parameters<typeof t>[0]; const label = t(key); return label && label !== key ? label : kind.replace(/_/g, " "); };
  const lobbyShareLabel = (lobby: number) => lobby >= 4 ? '100%' : lobby === 3 ? '1/2' : lobby === 2 ? '1/3' : '0';
  $: if (snapshot?.phase === 'completed' && me?.collection) void loadCollectionOutcome(`${roomCode}:${snapshot.season?.run ?? 0}`);
  let snapshot: RoomSnapshot | null = null;
  /** Round-by-round state of the tournament; null until the first live update after a snapshot. */
  let live: LiveUpdate | null = null;
  /** A resync was asked for and the snapshot has not arrived yet, so live updates keep being ignored quietly. */
  let resyncRequested = false;
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
  let provisionalMapPreferences: MapId[] = [];
  let mapLineupKey = '';
  let proLineupKey = '';
  let decisionCountdown = '';
  let strategicPreferences: StrategicAutomationPreferences = { ...DEFAULT_STRATEGIC_AUTOMATION };
  /** Last answer the gear sent, so a slow snapshot does not repeat it and a refused one is retried. */
  let autoAnsweredDecision: AutomationAttempt | null = null;
  /** Last automatic tactical pause asked for. */
  let autoPausedHalf: AutomationAttempt | null = null;
  let mySide: 'a' | 'b' | null = null;
  /** Kill feed of the live series accumulated per map (indexed by round number) from what this connection received. */
  let liveDetails: { seriesId: string; maps: RoundDetail[][] } = { seriesId: '', maps: [] };
  /** The "secret player joined" toast fires once per draft. */
  let secretToastShown = false;
  /** Seconds left in the rematch window after a run ends (0 when closed). */
  let rematchSeconds = 0;
  const onlineModes: RoomConfig['mode'][] = ['premier', 'faceit', 'pro', 'fun', 'max_fun'];
  // Presentation only: none of these touch the protocol, the server RNG or the draft timers.
  let rouletteSpinning = false;
  let freshOffer = false;
  /** undefined until the first snapshot, so reconnecting to an offer never replays the spin. */
  let lastOfferId: string | null | undefined = undefined;
  let lastPickIds: string[] | undefined = undefined;
  let pendingPickSource: { rect: DOMRect; at: number } | null = null;
  let recentPickId: string | null = null;
  let celebrateLineup = false;
  let flight: { id: number; name: string; source: DOMRect; slot: number } | null = null;
  let flightId = 0;

  $: t = (key: OnlineTranslationKey) => translateOnline($language, key);
  $: gameT = (key: Parameters<typeof translate>[1]) => translate($language, key);
  $: identityValid = playerName.trim().length >= 2 && organizationName.trim().length >= 2;
  $: self = snapshot?.self ?? null;
  $: me = snapshot?.participants.find((participant) => participant.id === self?.participantId) ?? null;
  $: freeRoles = snapshot ? hasFreeRoles(snapshot.config.mode) : false;
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
  // `live ? … :` on purpose: a live update is authoritative, and its null pendingDecision means "nothing to decide".
  $: liveCursor = live ? live.cursor : snapshot?.tournament?.liveCursor ?? null;
  $: myPendingDecision = live ? live.pendingDecision : snapshot?.self?.pendingDecision ?? null;
  $: liveSeries = liveCursor?.primarySeries ?? null;
  $: myDecision = liveSeries?.decision && liveSeries.decision.teamId === me?.id ? liveSeries.decision : null;
  $: mySeriesId = liveSeries?.series.userMatch && me ? liveSeries.series.id : null;
  $: myTimeouts = liveSeries && me ? (liveSeries.series.teamA.id === me.id ? liveSeries.timeouts.a : liveSeries.timeouts.b) : 0;
  /** The user's own series in the round being played, whether or not it is the one on screen. */
  $: myLiveOverview = me ? liveCursor?.overviewSeries.find((series) => series.status === 'live' && (series.teamA.id === me?.id || series.teamB.id === me?.id)) ?? null : null;
  /** True while the viewer shows a series the user is not playing (Major overview → watch). */
  $: watchingOther = Boolean(liveSeries && !liveSeries.series.userMatch && myLiveOverview);
  $: mySide = liveSeries && me ? (liveSeries.series.teamA.id === me.id ? 'a' : 'b') : null;
  $: liveDetailList = liveSeries && liveDetails.seriesId === liveSeries.series.id ? liveDetails.maps[liveSeries.activeMap] ?? null : null;
  /** The live series with the accumulated feed on every map, so decided maps keep their pistols and headlines. */
  $: liveSeriesView = liveSeries ? withAccumulatedDetails(liveSeries.series, liveDetails) : null;
  $: answerAutomatedDecision(myDecision, strategicPreferences);
  $: callAutomaticPause(liveDetailList, strategicPreferences);
  $: liveTeamNames = liveSeries ? { [liveSeries.series.teamA.id]: liveSeries.series.teamA.name, [liveSeries.series.teamB.id]: liveSeries.series.teamB.name } as Record<string, string> : {};
  $: myFamiliarity = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, getMapFamiliarity(onlineMapContributors[mapId].length)])) as Record<MapId, number>;
  $: speedDelay = snapshot?.config.simulationSpeed === 'normal' ? 2400 : snapshot?.config.simulationSpeed === 'fast' ? 1200 : 200;
  $: myStanding = snapshot?.tournament?.standings.find((standing) => standing.organizationId === me?.id) ?? null;
  // The history only changes with a snapshot (rare); the live round is layered on top at every update (cheap).
  $: historyView = snapshot?.tournament ? buildHistoryView(snapshot.tournament) : null;
  $: onlineTournament = historyView ? overlayLiveRound(historyView, liveCursor, me?.id ?? null) : null;
  $: onlineCursor = {
    liveSeriesId: null,
    liveSeriesIds: liveCursor?.overviewSeries.filter((series) => series.status === 'live').map((series) => series.id) ?? [],
    isResolved: (id: string) => completedSeries.some((series) => series.id === id) || (liveCursor?.overviewSeries.some((series) => series.id === id && series.status === 'completed') ?? false),
    complete: snapshot?.phase === 'completed'
  };
  $: myCampaign = snapshot?.tournament?.campaigns?.find((campaign) => campaign.organizationId === me?.id) ?? null;
  $: proAssignmentStatus = validateProAssignments(proAssignments, self?.proPickedPlayerIds ?? []);
  $: ownPlayers = (self?.lineup ?? []).map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
  $: secretPicksLeft = self?.secretPicksLeft ?? 0;
  $: secretInLineup = Boolean(self?.lineup.some((pick) => isSecretPlayerId(pick.playerId)));
  $: secretOrganization = me ? findSecretOrganization(me.organizationName) : null;
  $: secretPoolPlayers = me ? secretPoolOf(me.organizationName).map((alias) => secretPlayers.find((player) => player.nickname === alias.alias)).filter((player): player is Player => Boolean(player)) : [];
  $: if (snapshot?.phase === 'draft' && secretInLineup && !secretToastShown) { secretToastShown = true; showToast(t(self && self.lineup.length >= 5 ? 'secretTeamJoined' : 'secretJoined')); }
  $: if (snapshot?.phase !== 'draft') secretToastShown = false;
  $: onlineMapContributors = getLineupMapContributors(ownPlayers, teams);
  $: onlineMapYears = getLineupMapYears(ownPlayers, teams);
  $: ownDisplayPlayers = snapshot?.config.mode === 'pro' && self
    ? buildProRoleEvaluations(ownPlayers, self.proRoleAssignments, self.style ?? 'balanced').map((evaluation) => evaluation.adjustedPlayer)
    : ownPlayers;
  $: onlineRunReport = snapshot?.selfResult && me
    ? buildOnlineRunCardReport(snapshot.selfResult, snapshot.tournament?.championId ?? null, me.id)
    : null;
  $: selectedOrganizationView = selectedOrganizationId ? buildOrganizationView(selectedOrganizationId) : null;
  $: observeOffer(snapshot?.phase === 'draft' ? self?.rolledTeamId ?? null : null);
  $: observePicks(snapshot?.phase === 'draft' && self ? (snapshot.config.mode === 'pro' ? self.proPickedPlayerIds : self.lineup.map((pick) => pick.playerId)) : null);
  $: if (!offeredTeam) rouletteSpinning = false;

  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Spins only when a new offer arrives for this player; the offer itself is already decided by the server. */
  function observeOffer(offerId: string | null) {
    const previous = lastOfferId;
    lastOfferId = offerId;
    if (previous === undefined || offerId === previous) return;
    freshOffer = false;
    rouletteSpinning = Boolean(offerId) && !reducedMotion();
    if (offerId && !rouletteSpinning) freshOffer = true;
  }

  /** Flies the card the user clicked once the server confirms the pick. */
  function observePicks(ids: string[] | null) {
    const previous = lastPickIds;
    lastPickIds = ids ?? undefined;
    if (!ids) { celebrateLineup = false; recentPickId = null; pendingPickSource = null; return; }
    if (!previous || ids.length !== previous.length + 1) { if (ids.length < 5) celebrateLineup = false; return; }
    const slot = ids.length - 1;
    const playerId = ids[slot];
    recentPickId = playerId;
    const source = pendingPickSource && Date.now() - pendingPickSource.at < 10_000 ? pendingPickSource.rect : null;
    pendingPickSource = null;
    if (reducedMotion()) return;
    if (source) flight = { id: ++flightId, name: playerById.get(playerId)?.nickname ?? '?', source, slot };
    if (slot === 4) { celebrateLineup = true; playOfflineSound('lineup'); }
    else playOfflineSound('pick');
  }

  function capturePickSource(player: Player) {
    unlockOfflineAudio();
    const card = document.querySelector(`[data-offline-player="${CSS.escape(player.id)}"]`);
    pendingPickSource = card ? { rect: card.getBoundingClientRect(), at: Date.now() } : null;
  }


  function setStrategicPreferences(value: StrategicAutomationPreferences) {
    strategicPreferences = value;
    saveStrategicPreferences(value);
  }

  /** Answers the decision waiting on this player whenever its toggle is on, instead of waiting for the deadline. */
  function answerAutomatedDecision(decision: PublicPendingDecision | null, preferences: StrategicAutomationPreferences) {
    if (!decision || !liveSeries || !mySeriesId || !answersDecision(decision, preferences)) return;
    const key = decisionKey(liveSeries.series.id, decision);
    if (!shouldAnswerAgain(autoAnsweredDecision, key, Date.now())) return;
    autoAnsweredDecision = { key, at: Date.now() };
    const style = self?.style ?? 'balanced';
    if (decision.kind === 'veto') {
      const mapId = autoVetoMap(decision.available, myFamiliarity, decision.action);
      if (mapId) send({ type: 'veto-action', seriesId: liveSeries.series.id, action: decision.action, mapId, step: decision.step });
    } else if (decision.kind === 'side') {
      send({ type: 'pick-side', seriesId: mySeriesId, side: autoSidePick(style, decision.mapId) });
    } else {
      send({ type: 'eco-call', seriesId: mySeriesId, call: autoEcoCall(style, decision.money) });
    }
  }

  function callAutomaticPause(rounds: RoundDetail[] | null, preferences: StrategicAutomationPreferences) {
    if (!preferences.autoPause || !rounds?.length || !liveSeries || !mySeriesId || !mySide) return;
    if (liveSeries.phase !== 'live' || liveSeries.finished || myDecision) return;
    if (!shouldCallTimeout(rounds, mySide, myTimeouts)) return;
    const half = `${liveSeries.series.id}:${liveSeries.activeMap}:${myTimeouts}`;
    if (!shouldAnswerAgain(autoPausedHalf, half, Date.now())) return;
    autoPausedHalf = { key: half, at: Date.now() };
    send({ type: 'call-timeout', seriesId: mySeriesId });
  }

  onMount(() => {
    const cachedIdentity = loadOnlineIdentity();
    if (cachedIdentity) {
      playerName = cachedIdentity.playerName;
      organizationName = cachedIdentity.organizationName;
    }
    const cachedConfig = loadOnlineConfig();
    if (cachedConfig) config = cachedConfig;
    strategicPreferences = loadStrategicPreferences();
    roomCode = new URL(window.location.href).searchParams.get('room')?.toUpperCase() ?? '';
    clockTimer = window.setInterval(updateCountdown, 250);
    void loadAccount(getOnlineServerUrl()).then(async (user) => {
      if (!user) return;
      // The profile names the player and the organization once; the room form just starts from them.
      if (!playerName && user.displayName) playerName = user.displayName;
      if (!organizationName && user.teamName) organizationName = user.teamName;
      try { hasSavedLineup = Boolean((await fetchCollection(getOnlineServerUrl())).lineup); useCollectionTeam = hasSavedLineup; } catch { hasSavedLineup = false; }
    }).catch(() => {});
    if (roomCode && hasOnlineResumeToken(roomCode)) connect();
    loadOfflineSound();
    void loadLive();
    liveTimer = window.setInterval(() => void loadLive(), 8_000);
    const unlock = () => { if (snapshot) unlockOfflineAudio(); };
    const visibility = () => { if (document.hidden) stopOfflineSounds(); onQueueVisibility(); };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', leaveQueueOnExit);
    return () => {
      window.removeEventListener('pagehide', leaveQueueOnExit);
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
      disposeOfflineAudio();
    };
  });

  onDestroy(() => {
    if (liveTimer !== null) window.clearInterval(liveTimer);
    leaveQueueOnExit();
    stopQueuePolling();
    clearHiddenTimer();
    stopTitleAlert();
    void queueAudio?.close().catch(() => {});
    client?.stop();
    if (clockTimer !== null) window.clearInterval(clockTimer);
  });

  function describeError(code: OnlineClientErrorCode, fallback: string): string {
    switch (code) {
      case 'RESUME_EXPIRED': return t('sessionExpired');
      case 'CONNECTION_FAILED': return t('connectionFailed');
      case 'CONNECTION_LOST': return t('connectionLost');
      case 'RECONNECT_GAVE_UP': return t('connectionGaveUp');
      case 'ROOM_NOT_FOUND': return t('roomNotFound');
      case 'ROOM_STARTED': return t('roomStarted');
      case 'ROOM_FULL': return t('roomFull');
      case 'NAME_TAKEN': return t('nameTaken');
      case 'NOT_READY': return t('notReady');
      case 'PROTOCOL_MISMATCH':
      case 'DATA_MISMATCH': return t('versionMismatch');
      case 'RATE_LIMITED': return t('rateLimited');
      case 'CREATE_FAILED': return t('createFailed');
      case 'NOT_YOUR_TURN': return t('notYourTurn');
      case 'DECISION_NOT_PENDING': return t('decisionNotPending');
      case 'INVALID_MAP': return t('invalidMap');
      case 'TIMEOUT_UNAVAILABLE': return t('timeoutUnavailable');
      case 'SERIES_MISMATCH': return t('seriesMismatch');
      case 'REMATCH_CLOSED': return t('rematchClosed');
      default: return fallback;
    }
  }

  function updateCountdown() {
    const decisionDeadline = myPendingDecision?.deadlineAt ?? null;
    decisionCountdown = decisionDeadline === null ? '' : `${Math.max(0, Math.ceil((decisionDeadline - (Date.now() + serverOffset)) / 1_000))}s`;
    const rematchDeadline = snapshot?.season?.rematch?.deadlineAt ?? null;
    rematchSeconds = rematchDeadline === null ? 0 : Math.max(0, Math.ceil((rematchDeadline - (Date.now() + serverOffset)) / 1_000));
    // The gear retries a refused answer on this clock: the server no longer repeats the decision in every message.
    answerAutomatedDecision(myDecision, strategicPreferences);
    if (!snapshot?.deadlineAt || (snapshot.config.mode === 'pro' && snapshot.self?.proPickedPlayerIds.length === 5 && snapshot.deadlineStage !== 'confirmation')) {
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

  // Competitive queue: poll the server until it matches this account into a room, then connect with the ticket.
  // The 2 s poll is also the heartbeat: a client that stops polling for 20 s is dropped by the server.
  type QueueStatusResponse = {
    state: 'idle' | 'waiting' | 'matched';
    waiting: number;
    since: number | null;
    match: { roomCode: string; lineupTicket: string } | null;
    closesInMs?: number | null;
    pair?: boolean;
    left?: 'stale' | 'hidden' | null;
  };
  const QUEUE_HIDDEN_LIMIT_MS = 60_000;
  const QUEUE_REJOIN_GAP_MS = 30_000;
  const QUEUE_MAX_FAILURES = 30;
  let queueState: 'idle' | 'waiting' | 'matched' = 'idle';
  let queueWaiting = 0;
  let queueSince = 0;
  let queueElapsed = 0;
  let queueTimer: number | null = null;
  let queueClosesIn: number | null = null;
  let queuePair = false;
  let queueNotice = '';
  /** The player is searching (joined and did not cancel); drives the silent rejoin after a server restart. */
  let queueWanted = false;
  let soloBusy = false;
  let queueFailures = 0;
  let lastAutoRejoin = 0;
  let hiddenTimer: number | null = null;
  let titleTimer: number | null = null;
  let titleBeforeAlert = '';
  let queueAudio: AudioContext | null = null;

  const stopQueuePolling = () => { if (queueTimer !== null) window.clearInterval(queueTimer); queueTimer = null; };
  const clearHiddenTimer = () => { if (hiddenTimer !== null) window.clearTimeout(hiddenTimer); hiddenTimer = null; };
  function stopTitleAlert() {
    if (titleTimer === null) return;
    window.clearInterval(titleTimer);
    titleTimer = null;
    document.title = titleBeforeAlert;
  }

  /** Match found while the tab is in the background: blink the tab title and beep until the player comes back. */
  function alertMatchFound() {
    if (!document.hidden) return;
    let on = false;
    stopTitleAlert();
    titleBeforeAlert = document.title;
    titleTimer = window.setInterval(() => { on = !on; document.title = on ? t('matchFoundTitle') : titleBeforeAlert; }, 900);
    try {
      if (!queueAudio) return;
      const start = queueAudio.currentTime;
      for (const offset of [0, 0.22]) {
        const oscillator = queueAudio.createOscillator();
        const gain = queueAudio.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.18, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.18);
        oscillator.connect(gain).connect(queueAudio.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.2);
      }
    } catch { /* sound is a nicety */ }
  }

  function applyQueueStatus(status: QueueStatusResponse) {
    queueState = status.state;
    queueWaiting = status.waiting;
    if (status.since) queueSince = status.since;
    queueElapsed = Math.max(0, Math.round((Date.now() - queueSince) / 1000));
    queueClosesIn = typeof status.closesInMs === 'number' ? Math.ceil(status.closesInMs / 1000) : null;
    queuePair = Boolean(status.pair);
  }

  async function pollQueue() {
    let status: QueueStatusResponse;
    try {
      status = await authFetch<QueueStatusResponse>(getOnlineServerUrl(), '/queue/status');
      queueFailures = 0;
    } catch (error) {
      // A deploy or restart takes the server away for a few seconds: keep trying for about a minute.
      queueFailures += 1;
      if (queueFailures < QUEUE_MAX_FAILURES) return;
      stopQueuePolling();
      queueWanted = false;
      queueState = 'idle';
      errorMessage = error instanceof Error ? error.message : t('connectionFailed');
      return;
    }
    applyQueueStatus(status);
    if (status.state === 'matched' && status.match) {
      stopQueuePolling();
      queueWanted = false;
      clearHiddenTimer();
      alertMatchFound();
      const user = $accountUser;
      playerName = playerName.trim() || user?.displayName || user?.email.split('@')[0] || 'Player';
      organizationName = organizationName.trim() || user?.teamName || `${playerName} Esports`;
      roomCode = status.match.roomCode;
      pendingLineupTicket = status.match.lineupTicket;
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomCode);
      replaceState(url, {});
      connect();
      queueState = 'idle';
      return;
    }
    if (status.state !== 'idle') return;
    if (status.left) {
      stopQueuePolling();
      clearHiddenTimer();
      queueWanted = false;
      queueNotice = status.left === 'hidden' ? t('queueLeftHidden') : t('queueLeftStale');
      return;
    }
    // Idle with no reason while still searching: the server restarted and lost the queue. Rejoin quietly.
    if (queueWanted && Date.now() - lastAutoRejoin > QUEUE_REJOIN_GAP_MS) {
      lastAutoRejoin = Date.now();
      queueNotice = t('queueRejoining');
      await joinQueue(true);
      return;
    }
    stopQueuePolling();
    queueWanted = false;
  }

  async function joinQueue(silent = false) {
    errorMessage = '';
    if (!silent) {
      queueNotice = '';
      // Created inside the click, so the browser lets it beep later from a background tab.
      try { queueAudio ??= new AudioContext(); void queueAudio.resume(); } catch { queueAudio = null; }
    }
    try {
      const status = await authFetch<QueueStatusResponse>(getOnlineServerUrl(), '/queue/join', { body: {} });
      applyQueueStatus(status);
      queueSince = status.since ?? Date.now();
      queueWanted = true;
      queueFailures = 0;
      if (silent) queueNotice = '';
      stopQueuePolling();
      queueTimer = window.setInterval(() => void pollQueue(), 2_000);
      void pollQueue();
    } catch (error) {
      queueWanted = false;
      errorMessage = error instanceof Error && error.message.includes('NO_LINEUP') ? t('queueNeedsTeam') : (error instanceof Error ? error.message : t('connectionFailed'));
    }
  }

  /** Solo contra bots com o time salvo: o servidor cria a sala e devolve o ticket, como um match da fila. */
  async function playSolo(field: 'random' | 'champions') {
    if (soloBusy) return;
    errorMessage = '';
    soloBusy = true;
    try {
      const result = await startSolo(getOnlineServerUrl(), field);
      const user = $accountUser;
      playerName = playerName.trim() || user?.displayName || user?.email.split('@')[0] || 'Player';
      organizationName = organizationName.trim() || user?.teamName || `${playerName} Esports`;
      roomCode = result.roomCode;
      pendingLineupTicket = result.lineupTicket;
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomCode);
      replaceState(url, {});
      connect();
    } catch (error) {
      errorMessage = error instanceof Error && error.message.includes('NO_LINEUP') ? t('queueNeedsTeam') : (error instanceof Error ? error.message : t('connectionFailed'));
    } finally {
      soloBusy = false;
    }
  }

  async function leaveQueue(reason?: 'hidden') {
    stopQueuePolling();
    clearHiddenTimer();
    queueWanted = false;
    queueState = 'idle';
    queueNotice = reason === 'hidden' ? t('queueLeftHidden') : '';
    try { await authFetch(getOnlineServerUrl(), '/queue/leave', { body: reason ? { reason } : {} }); } catch { /* best effort: the server drops silent clients anyway */ }
  }

  /** Tab or page going away while searching: tell the server now instead of waiting for the 20 s heartbeat cut. */
  function leaveQueueOnExit() {
    if (!queueWanted || queueState !== 'waiting') return;
    queueWanted = false;
    stopQueuePolling();
    const token = get(sessionToken);
    try {
      void fetch(new URL('/queue/leave', getOnlineServerUrl()), { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ reason: 'user' }) }).catch(() => {});
    } catch { /* heartbeat cut covers it */ }
  }

  /** Hidden for more than a minute while searching: leave the queue. Coming back cancels the countdown and the title alert. */
  function onQueueVisibility() {
    if (document.hidden) {
      if (queueWanted && queueState === 'waiting' && hiddenTimer === null) {
        hiddenTimer = window.setTimeout(() => { hiddenTimer = null; if (document.hidden && queueWanted) void leaveQueue('hidden'); }, QUEUE_HIDDEN_LIMIT_MS);
      }
      return;
    }
    clearHiddenTimer();
    stopTitleAlert();
  }

  /** Registers the saved collection lineup for the room and keeps the ticket for the join that follows. */
  async function requestLineupTicket(code: string): Promise<boolean> {
    pendingLineupTicket = undefined;
    if (!useCollectionTeam || !$accountUser) return true;
    try {
      const result = await authFetch<{ lineupTicket: string }>(getOnlineServerUrl(), `/rooms/${code}/lineup`, { body: {} });
      pendingLineupTicket = result.lineupTicket;
      return true;
    } catch (error) {
      errorMessage = error instanceof Error && error.message.includes('NO_LINEUP') ? t('noSavedLineup') : (error instanceof Error ? error.message : t('connectionFailed'));
      return false;
    }
  }

  async function hostRoom() {
    if (!validIdentity()) return;
    creating = true;
    errorMessage = '';
    saveOnlineIdentity({ playerName, organizationName });
    saveOnlineConfig(config);
    try {
      roomCode = await createOnlineRoom(getOnlineServerUrl(), config);
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomCode);
      replaceState(url, {});
      if (!(await requestLineupTicket(roomCode))) return;
      connect();
    } catch (error) {
      errorMessage = error instanceof OnlineRoomCreationError ? describeError(error.code, error.message) : t('createFailed');
    } finally {
      creating = false;
    }
  }

  async function joinRoom() {
    roomCode = roomCode.trim().toUpperCase();
    if (!validIdentity() || creating) return;
    if (!isValidRoomCode(roomCode)) {
      errorMessage = t('invalidCode');
      return;
    }
    errorMessage = '';
    creating = true;
    saveOnlineIdentity({ playerName, organizationName });
    try {
      if (!(await checkOnlineRoom(getOnlineServerUrl(), roomCode))) {
        errorMessage = t('roomNotFound');
        return;
      }
    } catch {
      errorMessage = t('connectionFailed');
      return;
    } finally {
      creating = false;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    replaceState(url, {});
    if (!(await requestLineupTicket(roomCode))) return;
    connect();
  }

  function connect() {
    client?.stop();
    const ticket = pendingLineupTicket;
    pendingLineupTicket = undefined;
    client = new OnlineRoomClient(getOnlineServerUrl(), roomCode, { playerName: playerName.trim(), organizationName: organizationName.trim(), ...(ticket ? { lineupTicket: ticket } : {}) }, {
      onConnection: (state) => {
        if (state === 'expired') {
          // The room moved on without us (or the resume token died): back to the entry screen instead of a frozen snapshot.
          resetTransientRoomState();
          snapshot = null;
          connection = 'disconnected';
          if (!errorMessage) errorMessage = t('sessionExpired');
          return;
        }
        connection = state;
      },
      onSnapshot: (next) => {
        const previous = snapshot;
        const newRun = isNewOnlineRun(previous, next);
        snapshot = next;
        // A snapshot is newer than any live update received before it.
        live = null;
        resyncRequested = false;
        serverOffset = next.serverTime - Date.now();
        config = next.config;
        if (newRun) startNewRun(next);
        mergeLiveDetails(next.tournament?.liveCursor?.primarySeries ?? null);
        // A fresh authoritative snapshot confirms that a transient reconnect error no longer applies.
        errorMessage = '';
        if (next.self) {
          const serverAssignments = Object.fromEntries(Object.entries(next.self.proRoleAssignments).filter((entry): entry is [string, LineupSlotRole] => Boolean(entry[1])));
          const nextProKey = next.self.proPickedPlayerIds.join('|');
          // Only adopt server-side PRO choices when they exist or the picked players changed; otherwise every broadcast would wipe what the user is still filling in.
          if (Object.keys(serverAssignments).length || nextProKey !== proLineupKey) {
            proAssignments = serverAssignments;
            proStyle = next.self.style ?? proStyle;
          }
          proLineupKey = nextProKey;
          const nextLineupKey = next.self.lineup.map((pick) => pick.playerId).join('|');
          if (next.self.mapPreferences.length === 3) provisionalMapPreferences = [...next.self.mapPreferences];
          else if (next.self.lineup.length === 5 && nextLineupKey !== mapLineupKey) {
            const lineupPlayers = next.self.lineup.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
            provisionalMapPreferences = getDefaultMapSelection(lineupPlayers, teams);
          }
          mapLineupKey = nextLineupKey;
        }
        updateCountdown();
      },
      onLive: (next) => {
        if (!snapshot) {
          // A live update without a snapshot on this socket: ask for the whole room once and wait for it.
          if (!resyncRequested) {
            resyncRequested = true;
            client?.resync();
          }
          return;
        }
        live = next;
        serverOffset = next.serverTime - Date.now();
        mergeLiveDetails(next.cursor.primarySeries);
        updateCountdown();
      },
      onError: (message, code) => {
        errorMessage = describeError(code, message);
        // A rejected host edit must not linger in the form.
        if (snapshot) config = snapshot.config;
      }
    });
    client.connect();
  }

  /**
   * Keeps every round of every map of the live series: the server only sends the rounds this connection has not
   * received yet, on whichever map they belong to (a lagging client gets the tail of the previous map along with the new one).
   */
  function mergeLiveDetails(primary: PublicLiveSeries | null) {
    if (!primary) return;
    const maps = liveDetails.seriesId === primary.series.id ? liveDetails.maps.map((rounds) => [...rounds]) : [];
    primary.series.maps.forEach((map, index) => {
      if (!map.details?.length) return;
      const rounds = maps[index] ?? (maps[index] = []);
      for (const detail of map.details) rounds[detail.number - 1] = detail;
    });
    liveDetails = { seriesId: primary.series.id, maps };
  }

  function withAccumulatedDetails(series: SeriesResult, feed: { seriesId: string; maps: RoundDetail[][] }): SeriesResult {
    if (feed.seriesId !== series.id) return series;
    return { ...series, maps: series.maps.map((map, index) => feed.maps[index]?.length ? { ...map, details: feed.maps[index].filter(Boolean) } : map) };
  }

  /** A rematch brought the room back to the draft: nothing from the previous run may linger on screen. */
  function startNewRun(next: RoomSnapshot) {
    resetTransientRoomState();
    showToast(next.season ? `${t('newRun')} · ${t('season')} ${next.season.number}` : t('newRun'));
  }

  /** Clears view-only state; room identity and host preferences remain cached for the next connection. */
  /** Leaves the finished room and lands on the online entry screen, ready to queue or open another room. */
  function exitRoom() {
    client?.stop();
    client = null;
    resetTransientRoomState();
    snapshot = null;
    roomCode = '';
    collectionOutcome = null;
    collectionOutcomeFor = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    replaceState(url, {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetTransientRoomState() {
    proAssignments = {};
    proStyle = 'balanced';
    provisionalMapPreferences = [];
    mapLineupKey = '';
    proLineupKey = '';
    liveDetails = { seriesId: '', maps: [] };
    live = null;
    expandedTimelineMatch = null;
    detailsPlayer = null;
    selectedOrganizationId = null;
    activeTab = 'current';
    countdown = '';
    decisionCountdown = '';
    rematchSeconds = 0;
    downloadingImage = false;
    rouletteSpinning = false;
    freshOffer = false;
    lastOfferId = undefined;
    lastPickIds = undefined;
    pendingPickSource = null;
    recentPickId = null;
    celebrateLineup = false;
    flight = null;
  }

  function voteRematch(accept: boolean) {
    send({ type: 'rematch-vote', accept });
  }

  /** Switches the live viewer to another series of the round (null returns to the user's own). */
  function watchSeries(seriesId: string | null) {
    if (seriesId !== (liveSeries?.series.id ?? null)) liveDetails = { seriesId: '', maps: [] };
    send({ type: 'watch-match', seriesId });
    activeTab = 'current';
  }

  function send(command: Parameters<OnlineRoomClient['send']>[0]) {
    errorMessage = '';
    client?.send(command);
  }

  function saveConfig(patch: Partial<RoomConfig>) {
    const next = { ...config, ...patch };
    if (next.entryStage === 'playoffs' && next.capacity > 8) next.capacity = 8;
    config = next;
    saveOnlineConfig(next);
    send({ type: 'configure', config: next });
  }

  function choosePlayer(player: Player, role?: LineupSlotRole, secondaryRole?: LineupSlotRole) {
    capturePickSource(player);
    if (isSecretPlayerId(player.id) && role) send({ type: 'pick-secret', alias: player.nickname ?? '', role, ...(secondaryRole ? { secondaryRole } : {}) });
    else send({ type: 'pick-player', playerId: player.id, ...(role ? { role } : {}), ...(secondaryRole ? { secondaryRole } : {}) });
    detailsPlayer = null;
  }

  function cardValidation(player: Player) {
    return validatePlayerPick(player, self?.lineup ?? [], undefined, (id) => playerById.get(id), { unlimitedRoles: freeRoles });
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

  function toggleOnlineMap(mapId: MapId) {
    if (provisionalMapPreferences.includes(mapId)) provisionalMapPreferences = provisionalMapPreferences.filter((item) => item !== mapId);
    else if (onlineMapContributors[mapId].length > 0 && provisionalMapPreferences.length < 3) provisionalMapPreferences = [...provisionalMapPreferences, mapId];
  }

  function confirmOnlineMaps() {
    if (!isValidLineupMapSelection(provisionalMapPreferences, ownPlayers, teams)) return;
    send({ type: 'submit-map-preferences', mapPreferences: provisionalMapPreferences as [MapId, MapId, MapId] });
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
    if (phase === 'semifinal') return $language === 'en' ? 'SEMIFINALS' : $language === 'es' ? 'SEMIFINALES' : 'SEMIFINAIS';
    return $language === 'en' ? 'GRAND FINAL' : $language === 'es' ? 'GRAN FINAL' : 'GRANDE FINAL';
  }

  function configureSimulation(patch: Pick<Partial<RoomConfig>, 'simulationMode' | 'simulationSpeed'>) {
    send({ type: 'configure-simulation', ...patch });
  }

  const stubTeam = (team: { id: string; name: string }): CombatTeam => ({ id: team.id, name: team.name, power: 0, mental: 0, clutch: 0, experience: 0 });

  /** Completed rounds in the shape the shared Major overview expects; recomputed only when a snapshot arrives. */
  function buildHistoryView(tournament: NonNullable<RoomSnapshot['tournament']>): MajorTournament {
    return {
      rounds: tournament.rounds.map((round) => ({ number: round.number, phase: round.phase, series: round.series })),
      standings: tournament.standings,
      championId: tournament.championId
    };
  }

  /** Adds the round in progress (running scores from the overview) on top of the completed rounds. */
  function overlayLiveRound(history: MajorTournament, cursor: PublicLiveCursor | null, myId: string | null): MajorTournament {
    if (!cursor || !cursor.overviewSeries.length || history.rounds.some((round) => round.number === cursor.tournamentRound)) return history;
    const liveRound: MajorTournament['rounds'][number] = {
      number: cursor.tournamentRound,
      phase: cursor.phase,
      series: cursor.overviewSeries.map((series): SeriesResult => ({
        id: series.id,
        phase: series.phase,
        bestOf: series.bestOf,
        teamA: stubTeam(series.teamA),
        teamB: stubTeam(series.teamB),
        scoreA: series.scoreA,
        scoreB: series.scoreB,
        winnerId: series.status === 'completed' ? (series.scoreA > series.scoreB ? series.teamA.id : series.teamB.id) : '',
        maps: [],
        userMatch: series.teamA.id === myId || series.teamB.id === myId
      }))
    };
    return { ...history, rounds: [...history.rounds, liveRound] };
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

<SeoHead metadata={SEO_BY_ROUTE['/online']} />

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
        <a class="secondary online-link account-link" href="/online/conta">{$accountUser ? t('myAccount') : t('loginToPlay')}</a>
      </header>
      <div class="mode-choice">
        <article class="panel mode-card collection-mode" class:logged={Boolean($accountUser)}>
          <span class="eyebrow">{$accountUser ? t('loggedReady') : 'LOGIN · E-MAIL'} · {t('competitive').toUpperCase()}</span>
          <h2>{t('findMatch')}</h2>
          <p>{t('findMatchHint')}</p>
          {#if !$accountUser}
            <a class="primary online-link" href="/online/conta">{t('loginToPlay')}</a>
          {:else if queueState === 'waiting' || queueState === 'matched'}
            <div class="queue-live"><i></i><strong>{queueState === 'matched' ? t('matchFound') : t('searching')}</strong><span>{queueWaiting} {t('inQueue')} · {queueElapsed}s</span></div>
            {#if queueState === 'waiting' && queueClosesIn !== null}<p class="queue-hint" class:pair={queuePair}>{(queuePair ? t('queuePairHint') : t('queueStartsIn')).replace('{s}', String(queueClosesIn))}</p>{/if}
            {#if queueState === 'waiting'}<button class="secondary" type="button" on:click={() => leaveQueue()}>{t('cancelSearch')}</button>{/if}
          {:else if !hasSavedLineup}
            <p class="queue-warn">{t('queueNeedsTeam')}</p>
            <a class="primary online-link" href="/online/colecao">{t('collection')}</a>
          {:else}
            {#if queueNotice}<p class="queue-warn" role="status">{queueNotice}</p>{/if}
            <button class="primary" type="button" on:click={() => joinQueue()}>{queueNotice ? t('searchAgain') : t('findMatch')}</button>
          {/if}
        </article>
        {#if $accountUser && hasSavedLineup}
          <article class="panel mode-card solo-mode">
            <span class="eyebrow">{t('notCompetitive').toUpperCase()}</span>
            <h2>{t('soloTitle')}</h2>
            <p>{t('soloHint')}</p>
            <button class="secondary" type="button" disabled={soloBusy} on:click={() => playSolo('random')}>{t('soloRandom')}</button>
            <button class="primary" type="button" disabled={soloBusy} title={t('soloChampionsHint')} on:click={() => playSolo('champions')}>{t('soloChampions')}</button>
            <small>{t('soloChampionsHint')}</small>
          </article>
        {/if}
        <article class="panel mode-card">
          <span class="eyebrow">{t('notCompetitive').toUpperCase()}</span>
          <h2>{t('friendsRoom')}</h2>
          <p>{t('friendsRoomHint')}</p>
          <button class="secondary" type="button" on:click={() => document.getElementById('online-identity')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{t('friendsRoom')}</button>
        </article>
        <article class="panel mode-card">
          <span class="eyebrow">{t('pickMode')}</span>
          <h2>{t('playDraft')}</h2>
          <p>{t('playDraftHint')}</p>
          {#if $accountUser}
            <button class="secondary" type="button" on:click={() => { useCollectionTeam = false; document.getElementById('online-identity')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{t('playDraft')}</button>
          {:else}
            <a class="primary online-link" href="/online/conta">{t('loginToPlay')}</a>
          {/if}
        </article>
      </div>
      <div class="identity-grid panel" id="online-identity">
        <label><span>{t('playerName')}</span><input bind:value={playerName} minlength="2" maxlength="24" autocomplete="nickname" /></label>
        <label><span>{t('orgName')}</span><input bind:value={organizationName} minlength="2" maxlength="24" /></label>
        {#if $accountUser}
          <label class="collection-toggle"><input type="checkbox" bind:checked={useCollectionTeam} disabled={!hasSavedLineup} /><span>{t('useCollectionTeam')}</span><small>{hasSavedLineup ? t('collectionTeamHint') : t('noSavedLineup')} <a href="/online/colecao">{t('viewCollection')}</a></small></label>
        {/if}
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
      {#if errorMessage}<p class="online-error" role="alert">{errorMessage}</p>{/if}
      <section class="panel live-board">
        <div class="section-heading"><div><span class="eyebrow"><i class="live-dot"></i> LIVE</span><h2>{t('liveRanked')}</h2></div><strong class="live-count">{liveRooms.length}</strong></div>
        {#if liveRooms.length}
          <div class="live-grid">
            {#each liveRooms as room (room.id)}
              <article class="live-room" class:done={room.phase === 'completed'}>
                <header><span>{room.phase === 'completed' ? t('liveFinished') : room.phase === 'playoffs' ? 'PLAYOFFS' : `SWISS · R${room.round}`}</span><em>{room.competitive ? t('competitive') : t('notCompetitive')}</em></header>
                <ul>
                  {#each room.teams as team}
                    <li class:out={team.status === 'eliminated'} class:champ={team.status === 'champion'}><span>{team.name}</span><b>{team.wins}–{team.losses}</b></li>
                  {/each}
                </ul>
                {#if room.champion}<p>🏆 {room.champion}</p>{/if}
              </article>
            {/each}
          </div>
        {:else}
          <p class="live-empty">{t('liveEmpty')}</p>
        {/if}
      </section>
    </section>
  {:else}
    <section class="online-room">
      <header class:online-draft-header={snapshot.phase === 'draft'} class="online-header">
        <div><div class="screen-kicker"><span class="eyebrow">{snapshot.phase.toUpperCase()} · {t(connection).toUpperCase()}</span><span class="multiplayer-tag">MULTIPLAYER</span></div>{#if !snapshot.tournament}<h1>{snapshot.phase === 'lobby' ? t('lobby') : t('draft')}</h1>{:else}<p class="online-room-title">{t('title')}</p>{/if}</div>
        <div class="room-code"><span>{t('roomCode')}</span><button type="button" aria-label={`${t('copyLink')} · ${roomCode}`} on:click={copyRoomLink}>{roomCode}</button></div>
      </header>

      {#if snapshot.season && (snapshot.phase === 'lobby' || snapshot.phase === 'draft')}
        <SeasonPanel season={snapshot.season} language={$language} selfParticipantId={self?.participantId ?? null} inProgress compact />
      {/if}

      {#if snapshot.phase === 'lobby'}
        <div class="lobby-grid">
          <section class="panel participants-panel">
            <div class="section-heading"><div><span class="eyebrow">LOBBY</span><h2>{t('participants')}</h2></div><span class="counter">{snapshot.participants.length}/{snapshot.config.capacity}</span></div>
            {#if snapshot.competitive !== undefined}<p class="competitive-badge" class:on={snapshot.competitive}>{snapshot.competitive ? t('competitive') : t('notCompetitive')}{#if snapshot.origin === 'queue'} · {t('findMatch')}{/if}</p>{/if}
            <div class="participant-list">
              {#each snapshot.participants as participant}
                <article class:offline={!participant.connected}><span>{participant.organizationName.slice(0, 2).toUpperCase()}</span><div><strong>{participant.organizationName}{#if participant.collection} <em class="team-badge-tag">{t('teamBadge')}</em>{/if}</strong><small>{participant.playerName}</small></div><b>{participant.host ? 'HOST' : participant.connected ? 'ONLINE' : 'OFFLINE'}</b></article>
              {/each}
            </div>
          </section>
          <section class="panel room-settings">
            <span class="eyebrow">ROOM CONFIG</span>
            <h2>{t('title')}</h2>
            <label><span>{t('mode')}</span><select value={config.mode} disabled={!isHost} on:change={(event) => saveConfig({ mode: (event.currentTarget as HTMLSelectElement).value as RoomConfig['mode'] })}>{#each onlineModes as mode}<option value={mode}>{translateOnlineMode($language, mode).name}</option>{/each}</select><small class="mode-description">{translateOnlineMode($language, config.mode).description}</small></label>
            <label><span>{t('entryStage')}</span><select value={config.entryStage} disabled={!isHost} on:change={(event) => saveConfig({ entryStage: (event.currentTarget as HTMLSelectElement).value as RoomConfig['entryStage'] })}><option value="stage3">Stage 3</option><option value="playoffs">Playoffs</option></select></label>
            <label><span>{t('capacity')}</span><input type="number" min="2" max={config.entryStage === 'playoffs' ? 8 : 16} value={config.capacity} disabled={!isHost} on:change={(event) => saveConfig({ capacity: Number((event.currentTarget as HTMLInputElement).value) })} /></label>
            <label><span>{t('deadline')}</span><select value={String(config.draftDeadlineSeconds ?? 'off')} disabled={!isHost} on:change={(event) => saveConfig({ draftDeadlineSeconds: (event.currentTarget as HTMLSelectElement).value === 'off' ? null : Number((event.currentTarget as HTMLSelectElement).value) as 60 | 120 | 180 | 300 })}><option value="60">60s</option><option value="120">120s</option><option value="180">180s</option><option value="300">300s</option><option value="off">{t('deadlineOff')}</option></select></label>
            <label><span>{gameT('simulationMode')}</span><select value={config.simulationMode} disabled={!isHost} on:change={(event) => saveConfig({ simulationMode: (event.currentTarget as HTMLSelectElement).value as RoomConfig['simulationMode'] })}><option value="automatic">{gameT('automatic')}</option><option value="manual">{gameT('manual')}</option></select></label>
            <label><span>{t('speed')}</span><select value={config.simulationSpeed} disabled={!isHost} on:change={(event) => saveConfig({ simulationSpeed: (event.currentTarget as HTMLSelectElement).value as RoomConfig['simulationSpeed'] })}><option value="normal">{gameT('normal')}</option><option value="fast">{gameT('fast')}</option><option value="ultra">{gameT('ultra')}</option></select></label>
            <label><span>{t('seasonLength')}</span><select value={String(config.seasonRuns)} disabled={!isHost} on:change={(event) => saveConfig({ seasonRuns: Number((event.currentTarget as HTMLSelectElement).value) as RoomConfig['seasonRuns'] })}><option value="1">{t('seasonSingleRun')}</option><option value="2">2 runs</option><option value="3">3 runs</option><option value="4">4 runs</option></select><small class="mode-description">{t('seasonLengthHint')}</small></label>
            {#if isHost && snapshot.origin !== 'queue'}<button class="primary" type="button" disabled={snapshot.participants.filter((participant) => participant.connected).length < 2} on:click={() => send({ type: 'start' })}>{t('start')}</button>{/if}
          </section>
        </div>
      {:else if snapshot.phase === 'draft' && self}
        <div class="draft-status panel"><div><span>{t('participants')}</span><strong>{snapshot.participants.filter((participant) => participant.ready).length}/{snapshot.participants.length}</strong></div>{#if countdown}<div><span>{snapshot.deadlineStage === 'confirmation' ? t('confirmDeadline') : t('deadline')}</span><strong>{countdown}</strong></div>{/if}<div><span>STATUS</span><strong>{me?.ready ? 'READY' : `${snapshot.config.mode === 'pro' ? self.proPickedPlayerIds.length : self.lineup.length}/5`}</strong></div></div>
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
            <select bind:value={proStyle} aria-label={gameT('chooseStyle')}><option value="aggressive">{gameT('aggressive')}</option><option value="balanced">{gameT('balanced')}</option><option value="tactical">{gameT('tactical')}</option></select>
            <div>
              {#each self.proPickedPlayerIds as playerId}
                {@const player = playerById.get(playerId)}
                <label><strong>{player?.nickname ?? playerId}</strong><select value={proAssignments[playerId] ?? ''} on:change={(event) => assignProRole(playerId, (event.currentTarget as HTMLSelectElement).value)}><option value="">{gameT('role')}</option>{#each PRO_REQUIRED_ROLES as role}{@const takenByOther = Object.entries(proAssignments).some(([otherPlayerId, assignedRole]) => otherPlayerId !== playerId && assignedRole === role)}<option value={role} disabled={takenByOther}>{getRoleLabel(role)}</option>{/each}</select></label>
              {/each}
            </div>
            <div class="pro-role-status">{#if proAssignmentStatus.hasDuplicate}<span>{gameT('proRoleDuplicate')}</span>{/if}{#if proAssignmentStatus.unassignedCount}<span>{gameT('proRoleMissing')}: {proAssignmentStatus.unassignedCount}</span>{/if}</div>
            <button class="primary" type="button" disabled={!proAssignmentStatus.complete} on:click={confirmPro}>{t('configurePro')}</button>
          </section>
        {:else if self.lineup.length === 5 && self.mapPreferences.length < 3}
          <section class="panel online-map-selection">
            <div class="section-heading"><div><span class="eyebrow">ACTIVE DUTY 2016–2026</span><h2>{gameT('chooseMapsTitle')}</h2></div><strong>{provisionalMapPreferences.length}/3</strong></div>
            <div class="online-map-grid">
              {#each MAP_POOL as mapId}
                {@const count = onlineMapContributors[mapId].length}
                <button type="button" class:selected={provisionalMapPreferences.includes(mapId)} aria-pressed={provisionalMapPreferences.includes(mapId)} disabled={count === 0 || (!provisionalMapPreferences.includes(mapId) && provisionalMapPreferences.length >= 3)} on:click={() => toggleOnlineMap(mapId)}>
                  <strong>{getMapName(mapId)}</strong><span>{getMapFamiliarity(count)}% · {count}/5</span><small>{onlineMapYears[mapId].join(', ') || '—'}</small>
                </button>
              {/each}
            </div>
            <button class="primary wide" type="button" disabled={!isValidLineupMapSelection(provisionalMapPreferences, ownPlayers, teams)} on:click={confirmOnlineMaps}>{gameT('confirmMaps')}</button>
          </section>
        {:else if !me?.ready}
          {#if secretPicksLeft > 0 && self.lineup.length < 5 && self.style}
            <section class="panel secret-zone">
              <div class="section-heading"><div><span class="eyebrow">{(secretOrganization?.name ?? '').toUpperCase()}</span><h2>{t('secretTeam')}</h2></div><strong>{secretPicksLeft}/{secretOrganization?.picks ?? 0}</strong></div>
              <p class="pick-instruction">{t('secretTeamHint')}</p>
              <div class="player-grid">
                {#each secretPoolPlayers as player (player.id)}
                  {@const validation = cardValidation(player)}
                  <PlayerCard {player} mode={presentationMode} language={$language} blockedReason={validation.ok ? '' : reasonText(validation.reason)} onOpen={(selected) => detailsPlayer = selected} />
                {/each}
              </div>
            </section>
          {/if}
          <section class="roll-zone panel">
            {#if offeredTeam && rouletteSpinning}
              {#key offeredTeam.id}
                <DraftRoulette candidates={teams} result={offeredTeam} anonymous={snapshot.config.mode === 'pro'} language={$language} duration={1500} onComplete={() => { rouletteSpinning = false; freshOffer = true; }} />
              {/key}
            {:else if offeredTeam}
              {#if snapshot.config.mode === 'pro'}
                <div class="team-banner blind-banner" class:roulette-impact={freshOffer}><div class="team-avatar">?</div><div><span class="eyebrow">PRO BLIND OFFER</span><h2>{gameT('proBlindOffer')}</h2><p>{gameT('proBlindOfferDesc')}</p></div><span class="team-power">?</span></div>
              {:else}
                <div class="team-banner" class:roulette-impact={freshOffer}><div class="team-avatar">{(offeredTeam.name ?? 'T').slice(0, 2).toUpperCase()}</div><div><span class="eyebrow">ROLLED TEAM</span><h2>{offeredTeam.name ?? 'Time'} <b>{offeredTeam.year ?? ''}</b></h2><p>{offeredTeam.game ?? 'CS'} · RANK #{offeredTeam.sourceRank ?? offeredTeam.rank ?? '—'} · {offeredTeam.rarity ?? 'standard'}</p></div><span class="team-power">{snapshot.config.mode === 'fun' || snapshot.config.mode === 'max_fun' ? `AVG ${offeredTeamAverage?.toFixed(1) ?? '—'}` : `PWR ${offeredTeam.teamPowerPreview ?? offeredTeam.power ?? '—'}`}</span></div>
              {/if}
              <div class="reroll-bar"><div><span class="eyebrow">{gameT('teamReroll')}</span><strong>{self.rerollsMax - self.rerollsUsed}/{self.rerollsMax}</strong></div><button class="secondary" type="button" disabled={self.rerollsUsed >= self.rerollsMax} on:click={() => send({ type: 'reroll-team' })}>{gameT('rerollTeam')} <span>↻</span></button></div>
              <p class="pick-instruction">{snapshot.config.mode === 'pro' ? gameT('proBlindOfferDesc') : gameT('pickOne')}</p>
              <div class:pro-offer-grid={snapshot.config.mode === 'pro'} class:is-fresh={freshOffer} class="player-grid roulette-reveal">
                {#each offeredPlayers as player, index}
                  {@const validation = cardValidation(player)}
                  <div class="roulette-player" data-offline-player={player.id} style={`--reveal-delay: ${index * 80}ms`}>
                  {#if snapshot.config.mode === 'pro'}<button class="player-card pro-blind-card" type="button" on:click={() => choosePlayer(player)}><div class="pro-name-only">{player.nickname ?? gameT('proHiddenPlayer')}</div></button>{:else}<PlayerCard {player} mode={presentationMode} language={$language} blockedReason={validation.ok ? '' : reasonText(validation.reason)} onOpen={(selected) => detailsPlayer = selected} />{/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="roll-empty"><div class="scanner"><span></span></div><span class="eyebrow">TEAM LOTTERY / {(snapshot.config.mode === 'pro' ? self.proPickedPlayerIds.length : self.lineup.length) + 1} OF 5</span><h2>{snapshot.config.mode === 'pro' ? gameT('proBlindDraft') : gameT('emptyTitle')}</h2><p>{snapshot.config.mode === 'pro' ? gameT('proBlindOfferDesc') : gameT('noRepeat')}</p><button class="primary" type="button" disabled={snapshot.config.mode !== 'pro' && !self.style} on:click={() => send({ type: 'draw-team' })}>{gameT('rollTeam')} <span>↻</span></button></div>
            {/if}
          </section>
        {:else}<section class="panel waiting-panel"><div class="scanner"><span></span></div><h2>{t('waiting')}</h2></section>{/if}
        {#if snapshot.config.mode === 'pro' && !me?.ready}
          <section class="hud panel pro-hud" class:offline-hud-complete={celebrateLineup}><div><span class="eyebrow">PRO LINEUP / {self.proPickedPlayerIds.length}/5</span><h2>{gameT('proBlindDraft')}</h2></div><div class="pro-hidden-slots">{#each Array(5) as _, index}<span data-draft-slot={index} class:offline-slot-arrival={Boolean(recentPickId && self.proPickedPlayerIds[index] === recentPickId)} class:filled={index < self.proPickedPlayerIds.length}>{self.proPickedPlayerIds[index] ? playerById.get(self.proPickedPlayerIds[index])?.nickname ?? '?' : '?'}</span>{/each}</div></section>
        {:else}
          <DraftHud offlineEffects={true} {recentPickId} celebrate={celebrateLineup} selectedPlayers={displayLineup as SelectedPlayer[]} style={self.style ?? 'balanced'} styleLocked={Boolean(self.style)} styleLabel={gameT((self.style ?? 'balanced') as OrgStyle)} mode={presentationMode} revealed={me?.ready ?? false} label={gameT('orgHud')} onOpen={(player) => detailsPlayer = player} />
        {/if}
        <section class="online-progress"><h2>{t('participants')}</h2>{#each snapshot.participants as participant}<article><span>{participant.organizationName}</span><b>{participant.picksCompleted}/5 · {participant.mapsConfirmed ? '3/3' : '0/3'} {t('mapsConfirmed').toUpperCase()}</b><i role="progressbar" aria-label={participant.organizationName} aria-valuemin="0" aria-valuemax="100" aria-valuenow={participant.ready ? 100 : Math.min(90, participant.picksCompleted * 14 + (participant.mapsConfirmed ? 20 : 0))}><em style={`width:${participant.ready ? 100 : Math.min(90, participant.picksCompleted * 14 + (participant.mapsConfirmed ? 20 : 0))}%`}></em></i></article>{/each}</section>
      {:else if snapshot.tournament}
        <section class="screen match-screen online-major-screen">
          <header class="match-topbar">
            <div><div class="screen-kicker"><span class="eyebrow">MAJOR LIVE · {t(connection).toUpperCase()}</span><span class="multiplayer-tag">MULTIPLAYER</span></div><h1>{liveCursor ? phaseLabel(liveCursor.phase) : snapshot.phase === 'completed' ? gameT('result') : t('title')}</h1></div>
            {#if myStanding && snapshot.phase === 'swiss'}<div class="record"><span>{myStanding.wins}</span><small>W</small><b>:</b><span>{myStanding.losses}</span><small>L</small></div>{/if}
          </header>

          {#if snapshot.phase !== 'completed'}
            <div class="match-controls panel">
              <div class="control-group">
                <span>{gameT('simulationMode')} {snapshot.origin === 'queue' ? '· FILA' : isHost ? '' : '· HOST'}</span>
                <SegmentedControl
                  value={snapshot.config.simulationMode}
                  label={gameT('simulationMode')}
                  disabled={!isHost || snapshot.origin === 'queue'}
                  options={[{ value: 'manual', label: gameT('manual') }, { value: 'automatic', label: gameT('automatic') }]}
                  onChange={(value) => configureSimulation({ simulationMode: value as RoomConfig['simulationMode'] })}
                />
              </div>
              <div class="control-group">
                <span>{gameT('speed')} {snapshot.origin === 'queue' ? '· FILA' : isHost ? '' : '· HOST'}</span>
                <div class="control-row">
                  <SegmentedControl
                    value={snapshot.config.simulationSpeed}
                    label={gameT('speed')}
                    disabled={!isHost || snapshot.origin === 'queue'}
                    options={[{ value: 'normal', label: gameT('normal') }, { value: 'fast', label: gameT('fast') }, { value: 'ultra', label: gameT('ultra') }]}
                    onChange={(value) => configureSimulation({ simulationSpeed: value as RoomConfig['simulationSpeed'] })}
                  />
                  <AutomationGear value={strategicPreferences} language={$language} onChange={setStrategicPreferences} soundEnabled={$offlineSoundEnabled} onSoundChange={setOfflineSound} />
                </div>
              </div>
            </div>
          {/if}

          {#if snapshot.phase === 'completed' && snapshot.season}
            {#if snapshot.season.rematch}
              <RematchPanel rematch={snapshot.season.rematch} participants={snapshot.participants} selfParticipantId={self?.participantId ?? null} secondsLeft={rematchSeconds} language={$language} onVote={voteRematch} />
            {/if}
            <!-- A single-run room has no season to show: the run result below already says who won. -->
            {#if snapshot.config.seasonRuns > 1}<SeasonPanel season={snapshot.season} language={$language} selfParticipantId={self?.participantId ?? null} />{/if}
          {/if}
          {#if snapshot.phase === 'completed' && collectionOutcome}
            <section class="panel collection-outcome">
              <div class="section-heading"><div><span class="eyebrow">{t('collection').toUpperCase()}</span><h2>{t('collectionResults')}</h2></div><a class="secondary" href="/online/colecao">{t('viewCollection')}</a></div>
              {#if collectionOutcome.result}
                {@const result = collectionOutcome.result}
                <div class="earned">
                  <h3>{t('youEarned')}</h3>
                  <ul>
                    <li><span>{t('placementCoins')} · {translatePlacement($language, result.placement)}</span><b>+{result.rewardCoins.toLocaleString($language)} coins</b></li>
                    {#each result.awards as award (award.kind)}
                      <li><span>{awardName(award.kind)}</span><b>+{award.coins.toLocaleString($language)} coins{award.points ? ` · +${award.points} pts` : ''}</b></li>
                    {/each}
                    <li class="total"><span>{t('totalCoins')}</span><b>+{(result.rewardCoins + result.awardCoins).toLocaleString($language)} coins</b></li>
                    <li class="total"><span>{t('seasonPointsEarned')} · {t('lobbyShare').replace('{n}', String(result.lobbySize)).replace('{share}', lobbyShareLabel(result.lobbySize))}</span><b>+{result.points} pts</b></li>
                  </ul>
                  {#if !result.ranked}<p class="note">{t('notRanked')}</p>{:else if !result.counted}<p class="note">{t('notCounted')}</p>{/if}
                </div>
              {/if}
              {#if collectionOutcome.room.length > 1}
                <div class="earned">
                  <h3>{t('roomRewards')}</h3>
                  <ul>
                    {#each collectionOutcome.room as row (row.userId)}
                      <li class:total={row.userId === $accountUser?.id}><span><button class="row-link" type="button" on:click={() => profileOf = row.userId}>{row.teamName ?? row.displayName}</button> · {translatePlacement($language, row.placement)}</span><b>+{row.coins.toLocaleString($language)} coins · +{row.points} pts</b></li>
                    {/each}
                  </ul>
                </div>
              {/if}
              <div class="campaign-grid">
                <article><small>{t('seasonRank')}</small><strong>{collectionOutcome.rank ?? '—'}</strong></article>
                <article><small>{t('seasonPointsMine')}</small><strong>{collectionOutcome.points}</strong></article>
                <article><small>{t('champion')}</small><strong>{collectionOutcome.majorsWon}</strong></article>
              </div>
              {#if collectionOutcome.awards.length}<p class="awards-line"><span>{t('awardsEarned')}:</span> {collectionOutcome.awards.map((award) => `${award.kind} ×${award.count}`).join(' · ')}</p>{/if}
            </section>
          {/if}

          {#if snapshot.phase === 'completed'}
            <div class="after-run">
              <button class="secondary" type="button" on:click={exitRoom}>← {t('backToStart')}</button>
              {#if $accountUser}<a class="secondary online-link" href="/online/conta">{t('myAccount')}</a>{/if}
              {#if me?.collection}<a class="primary online-link" href="/online/colecao">{t('editMyTeam')}</a>{/if}
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
              {/if}
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
                <section class="online-stats">
                  <div class="section-heading"><div><span class="eyebrow">MAJOR AWARDS</span><h2>{gameT('majorMvp')}</h2></div></div>
                  <MajorAwardsPanel awards={snapshot.tournament?.awards ?? null} language={$language} userTeamId={me?.id ?? null} onTeam={openOrganization} />
                  <CollapsibleStats eyebrow="POST-MAJOR" title={gameT('stats')} language={$language}>
                    <RunStatsGrid stats={snapshot.selfResult.stats} language={$language} players={ownDisplayPlayers} />
                  </CollapsibleStats>
                </section>
                <div class="result-actions online-result-actions"><button class="secondary" type="button" disabled={downloadingImage} on:click={downloadRunImage}>{gameT('downloadRunImage')}</button></div>
              {/if}
            {:else if liveSeries}
              <LiveSeriesSwitcher series={liveCursor?.overviewSeries ?? []} activeId={liveSeries.series.id} myTeamId={me?.id ?? ''} labels={{ title: t('liveMatches'), myMatch: t('myMatch'), live: t('live') }} onSelect={watchSeries} />
              {#if watchingOther}
                <div class="watch-bar" class:alert={Boolean(myPendingDecision)} role={myPendingDecision ? 'alert' : 'status'}>
                  <div>
                    <span class="eyebrow">{t('watching').toUpperCase()}</span>
                    <strong>{liveSeries.series.teamA.name} <em>x</em> {liveSeries.series.teamB.name}</strong>
                    {#if myPendingDecision}<b>{t('decisionPendingElsewhere')}{#if decisionCountdown} · {decisionCountdown}{/if}</b>{/if}
                  </div>
                  <button class:primary={Boolean(myPendingDecision)} class:secondary={!myPendingDecision} type="button" on:click={() => watchSeries(null)}>{t('backToMyMatch')}</button>
                </div>
              {/if}
              {#if liveSeries.phase === 'veto' && liveSeries.veto}
                <VetoBoard
                  available={liveSeries.veto.available}
                  steps={liveSeries.veto.steps}
                  turnTeamId={liveSeries.veto.turnTeamId}
                  action={liveSeries.veto.action}
                  teamNames={liveTeamNames}
                  myTeamId={me?.id ?? null}
                  familiarity={mySeriesId ? myFamiliarity : {}}
                  countdown={myDecision?.kind === 'veto' ? decisionCountdown : ''}
                  language={$language}
                  onAction={(mapId) => liveSeries?.veto && send({ type: 'veto-action', seriesId: liveSeries.series.id, action: liveSeries.veto.action ?? 'ban', mapId, step: liveSeries.veto.step })}
                />
                {#if mySeriesId}<p class="veto-intro">{t('vetoIntro')}</p>{/if}
              {/if}
              {#if myDecision?.kind === 'side' && mySeriesId}
                <SidePickPrompt mapId={myDecision.mapId} decider={liveSeries.series.maps[myDecision.mapIndex]?.pickedBy === null} countdown={decisionCountdown} language={$language} onPick={(side) => mySeriesId && send({ type: 'pick-side', seriesId: mySeriesId, side })} />
              {:else if myDecision?.kind === 'eco-call' && mySeriesId}
                <EcoCallPrompt roundNumber={myDecision.roundNumber} money={myDecision.money} countdown={decisionCountdown} language={$language} onCall={(call) => mySeriesId && send({ type: 'eco-call', seriesId: mySeriesId, call })} />
              {:else if liveSeries.decision && liveSeries.phase !== 'veto'}
                <p class="host-wait panel decision-wait">{gameT('opponentDeciding')}</p>
              {/if}
              {#if mySeriesId && liveSeries.phase === 'live' && !liveSeries.finished}
                <div class="live-actions">
                  {#if !strategicPreferences.autoPause}<TimeoutButton remaining={myTimeouts} timing={liveDetailList && mySide ? timeoutTimingFor(liveDetailList, mySide) : null} disabled={Boolean(myDecision)} language={$language} onCall={() => mySeriesId && send({ type: 'call-timeout', seriesId: mySeriesId })} />{/if}
                  <small>{gameT('sideLabel')}: {liveSeries.sideA ? (liveSeries.sideA === 'ct' ? 'CT' : $language === 'en' ? 'T' : 'TR') : '—'}</small>
                </div>
              {/if}
              {#key liveSeries.series.id}
                <SeriesViewer
                  series={liveSeriesView ?? liveSeries.series}
                  controlled
                  offlineEffects={Boolean(mySeriesId)}
                  controlledActiveMap={liveSeries.activeMap}
                  controlledVisibleRounds={liveSeries.visibleRounds}
                  controlledStarted={liveSeries.started}
                  controlledFinished={liveSeries.finished}
                  controlledDelay={speedDelay}
                  liveDetails={liveDetailList}
                  simpleFeed={strategicPreferences.simpleFeed}
                  language={$language}
                  interactiveTeamIds={[liveSeries.series.teamA.id, liveSeries.series.teamB.id]}
                  onTeamClick={openOrganization}
                  labels={{ start: gameT('startSeries'), skip: gameT('skipMap'), round: gameT('round'), live: t('live'), map: gameT('map'), final: gameT('final'), waiting: gameT('waiting'), pending: gameT('pending'), inProgress: gameT('inProgress'), mapInProgress: gameT('mapInProgress'), notPlayed: gameT('mapNotPlayed'), mapStart: gameT('mapStart') }}
                />
              {/key}
              {#if liveCursor?.status === 'waiting_host'}
                {#if isHost}<button class="primary wide next-match" type="button" on:click={() => send({ type: 'advance-round' })}>{t('startRound')} →</button>{:else}<p class="host-wait panel">{t('waitingHost')}</p>{/if}
              {/if}
            {:else}
              <LiveSeriesSwitcher series={liveCursor?.overviewSeries ?? []} activeId={null} myTeamId={me?.id ?? ''} labels={{ title: t('liveMatches'), myMatch: t('myMatch'), live: t('live') }} onSelect={watchSeries} />
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
            <MajorOverview tournament={onlineTournament} cursor={onlineCursor} userTeamId={me?.id ?? ''} language={$language} onTeam={openOrganization} onSeries={snapshot.phase === 'completed' ? null : (id) => watchSeries(id)} showLiveScores />
          {/if}
        </section>
      {/if}
      {#if errorMessage}<p class="online-error" role="alert">{errorMessage}</p>{/if}
    </section>
  {/if}
{#if profileOf}<PublicProfileSheet serverUrl={getOnlineServerUrl()} userId={profileOf} language={$language} onClose={() => profileOf = null} />{/if}
</PageLayout>

{#if flight}
  {#key flight.id}
    <FlyingPick name={flight.name} source={flight.source} slot={flight.slot} onComplete={() => { flight = null; }} />
  {/key}
{/if}

{#if detailsPlayer && snapshot && snapshot.config.mode !== 'pro'}
  <PlayerDetailSheet
    player={detailsPlayer}
    mode={presentationMode}
    language={$language}
    draftComplete={Boolean(me?.ready)}
    lineup={self?.lineup ?? []}
    playerLookup={(id) => playerById.get(id)}
    unlimitedRoles={freeRoles}
    allowDualRole={freeRoles}
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

{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<style>
  .mode-description{color:var(--muted);font-size:.68rem;line-height:1.4}
  .online-entry,.online-room{padding:28px 0 70px}.online-unavailable{margin-top:50px;padding:30px}.online-unavailable h1{font-size:clamp(2.5rem,8vw,5rem)}.online-unavailable p{color:var(--muted)}.online-link{display:inline-flex;align-items:center;min-height:48px;margin-top:18px;padding:0 18px;text-decoration:none}.identity-grid{display:grid;gap:12px;margin:28px 0 14px;padding:18px}.identity-grid label,.room-settings label,.entry-actions label,.pro-config label{display:grid;gap:7px}.identity-grid span,.room-settings label>span,.entry-actions label>span{color:var(--muted);font-size:.6rem;font-weight:800;text-transform:uppercase}.identity-grid input,.room-settings input,.room-settings select,.entry-actions input,.pro-config select{min-height:46px;padding:0 12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text)}.entry-actions{display:grid;gap:14px}.entry-actions section{padding:22px}.entry-actions h2{font-size:2rem}.entry-actions button{width:100%;margin-top:15px}.room-input{text-transform:uppercase;letter-spacing:.2em}.online-error{padding:12px;border:1px solid var(--danger);color:#ff9b90}.online-header{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:20px}.online-header h1{margin:5px 0 0;font-size:clamp(2.6rem,8vw,5rem)}.online-room-title{margin:6px 0 0;font:900 1.3rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.02em;text-transform:uppercase}.room-code{display:grid;gap:5px;text-align:right}.room-code span{color:var(--muted);font-size:.55rem;text-transform:uppercase}.room-code button{padding:9px 12px;border:1px solid var(--accent);background:transparent;color:var(--accent);font-weight:900;letter-spacing:.17em}.lobby-grid{display:grid;gap:14px}.participants-panel,.room-settings{padding:20px}.participant-list{display:grid;gap:8px}.participant-list article{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);background:var(--surface-2)}.participant-list article>span{display:grid;place-items:center;width:38px;height:38px;background:var(--accent);color:#0a0d08;font-weight:900}.participant-list strong,.participant-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.participant-list small{margin-top:2px;color:var(--muted)}.participant-list b{color:var(--accent);font-size:.55rem}.participant-list .offline{opacity:.55}.room-settings{display:grid;gap:10px}.room-settings h2{margin:2px 0 7px}.draft-status{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:14px}.draft-status div{padding:13px;border-right:1px solid var(--line)}.draft-status div:last-child{border-right:0}.draft-status span,.draft-status strong{display:block}.draft-status span{color:var(--muted);font-size:.55rem;text-transform:uppercase}.draft-status strong{margin-top:5px;color:var(--accent);font-size:1.3rem}.pro-config,.waiting-panel{margin-bottom:14px;padding:20px}.waiting-panel{text-align:center}.waiting-panel .scanner{margin:auto}.online-progress{margin-top:18px}.online-progress article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin:8px 0}.online-progress article>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.online-progress article>b{font-size:.62rem;white-space:nowrap}.online-progress i{grid-column:1/-1;height:4px;background:var(--line)}.online-progress em{display:block;height:100%;background:var(--accent)}.pro-config>div{display:grid;gap:8px;margin:14px 0}.pro-config label{grid-template-columns:1fr 1fr;align-items:center}
  .watch-bar{position:sticky;top:140px;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);background:var(--surface)}.watch-bar>div{display:grid;gap:3px;min-width:0}.watch-bar strong{overflow:hidden;font-size:.82rem;text-overflow:ellipsis;white-space:nowrap}.watch-bar strong em{color:var(--muted);font-style:normal;font-weight:400}.watch-bar b{color:var(--danger);font-size:.66rem;font-weight:800}.watch-bar.alert{border-color:var(--danger);box-shadow:0 0 18px color-mix(in srgb,var(--danger) 25%,transparent)}.watch-bar button{flex:0 0 auto;min-height:44px;padding:0 14px}
  .secret-zone{display:grid;gap:12px;margin-bottom:14px;padding:20px;border-color:var(--accent-2)}.secret-zone .section-heading>strong{color:var(--accent-2);font-size:1.6rem}
  .live-actions{position:sticky;top:140px;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;margin:0 0 12px;padding:6px 10px;border:1px solid var(--line);background:var(--surface)}.live-actions small{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.veto-intro{margin:-6px 0 14px;color:var(--muted);font-size:.72rem;line-height:1.4}.decision-wait{border-style:dashed}
  .online-major-screen{max-width:900px;margin:24px auto 0}.online-stats{display:grid;gap:12px;margin:18px 0}.online-stats .section-heading h2{margin:6px 0 0;font-size:1.5rem}.major-tabs{margin-bottom:18px}.online-result-hero{margin-top:18px}.after-run{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:14px 0 18px}.after-run .online-link,.after-run button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;text-decoration:none}.host-wait{margin:0 0 18px;padding:16px;color:var(--muted);text-align:center}.control-group{display:grid;gap:6px}.control-group>span{color:var(--muted);font-size:.58rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
  .account-link{margin:12px auto 0;width:fit-content}.live-board{display:grid;gap:14px;margin-top:18px;padding:22px}.live-dot{display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:50%;background:#ff3b3b;animation:queuePulse 1.1s ease-in-out infinite}.live-count{color:var(--accent);font:900 1.6rem 'Arial Narrow',Impact,sans-serif}.live-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.live-room{display:grid;gap:8px;align-content:start;padding:14px;border:1px solid var(--line);background:var(--surface-2)}.live-room.done{opacity:.75}.live-room header{display:flex;justify-content:space-between;gap:8px;color:var(--accent);font-size:.6rem;font-weight:900;letter-spacing:.1em}.live-room header em{color:var(--muted);font-style:normal}.live-room ul{display:grid;gap:3px;margin:0;padding:0;list-style:none}.live-room li{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;background:var(--surface);font-size:.78rem}.live-room li.out{opacity:.45;text-decoration:line-through}.live-room li.champ{border-left:3px solid #d9a441}.live-room p{margin:0;color:#ffd36b;font-weight:800;font-size:.8rem}.live-empty{margin:0;color:var(--muted);font-size:.85rem}.row-link{padding:0;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:3px;cursor:pointer;min-height:0}.earned{display:grid;gap:8px;margin-bottom:14px}.earned h3{margin:0;color:var(--accent);font-size:1.3rem}.earned ul{display:grid;gap:4px;margin:0;padding:0;list-style:none}.earned li{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;background:var(--surface-2);font-size:.8rem;text-transform:capitalize}.earned li b{color:var(--accent);white-space:nowrap}.earned li.total{border-left:3px solid #d9a441;font-weight:900;text-transform:none}.earned .note{margin:0;color:var(--muted);font-size:.75rem}.mode-choice{display:grid;gap:14px;margin-top:24px}.queue-live{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:12px;border:1px solid var(--accent);background:color-mix(in srgb,var(--accent) 7%,var(--surface-2))}.queue-live i{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent);animation:queuePulse 1s ease-in-out infinite}.queue-live span{color:var(--muted);font-size:.72rem}.queue-warn{color:var(--accent-2)!important;font-weight:700}.queue-hint{color:var(--text)!important;font-size:.78rem!important;font-weight:700}.queue-hint.pair{color:var(--accent-2)!important}.competitive-badge{margin:0 0 10px;padding:8px 10px;border:1px dashed var(--line);color:var(--muted);font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.competitive-badge.on{border:1px solid var(--accent);color:var(--accent)}@keyframes queuePulse{50%{opacity:.3}}.mode-card{display:grid;gap:10px;align-content:start;padding:22px}.mode-card h2{margin:0;font-size:1.9rem}.mode-card p{margin:0;color:var(--muted);font-size:.86rem;line-height:1.55}.mode-card button,.mode-card .online-link{margin-top:6px;justify-content:center}.collection-mode{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}.collection-mode.logged{box-shadow:0 0 26px color-mix(in srgb,var(--accent) 10%,transparent)}
  .collection-toggle{grid-column:1/-1;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;align-items:center}.collection-toggle input{width:18px;height:18px;min-height:0}.collection-toggle small{grid-column:2;color:var(--muted);font-size:.7rem;text-transform:none}.collection-toggle small a{color:var(--accent)}.team-badge-tag{display:inline-block;margin-left:6px;padding:1px 6px;border:1px solid var(--accent);color:var(--accent);font-size:.5rem;font-style:normal;font-weight:900;letter-spacing:.1em;vertical-align:middle}.collection-outcome{display:grid;gap:12px;margin-bottom:14px;padding:18px}.collection-outcome .secondary{display:inline-flex;align-items:center;min-height:42px;padding:0 14px;text-decoration:none}.awards-line{margin:0;color:var(--muted);font-size:.74rem}.awards-line span{color:var(--text);font-weight:800}
  @media(min-width:680px){.mode-choice{grid-template-columns:repeat(3,1fr)}.identity-grid{grid-template-columns:1fr 1fr}.entry-actions,.lobby-grid{grid-template-columns:1fr 1fr}}
  /* Below the sticky navbar and wallet bar; on phones the page nav sits at the bottom. */
  @media(max-width:720px){.online-entry,.online-room{padding:8px 0 40px}.watch-bar,.live-actions{top:118px}.after-run>*{flex:1 1 160px}.identity-grid{margin:16px 0 12px;padding:14px}.live-board{padding:14px}.collection-outcome{padding:14px}.online-link{justify-content:center}}
  @media(max-width:679px){.pro-config label{grid-template-columns:1fr}.online-header{align-items:start;flex-direction:column}.room-code{text-align:left}.draft-status{grid-template-columns:1fr}.draft-status div{border-right:0;border-bottom:1px solid var(--line)}.online-major-screen{margin-top:8px}}
  .screen-kicker{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.screen-header.centered .screen-kicker{justify-content:center}.multiplayer-tag{display:inline-flex;align-items:center;min-height:20px;padding:3px 7px;border:1px solid var(--accent);color:#091006;background:var(--accent);font-size:.48rem;font-weight:900;letter-spacing:.12em;line-height:1;text-transform:uppercase}.organization-link{min-width:0;padding:0;border:0;color:inherit;background:transparent;font:inherit;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.organization-link:hover,.organization-link:focus-visible{color:var(--accent);text-decoration:underline;text-underline-offset:3px}.timeline-match{cursor:default}.timeline-match:hover{background:transparent}.timeline-expand{padding:4px 7px;border:1px solid transparent;color:inherit;background:transparent;font-weight:900;cursor:pointer}.timeline-expand:hover,.timeline-expand:focus-visible{border-color:currentColor}.online-result-actions{width:min(540px,100%);margin:0 auto 24px}.online-result-actions button{width:100%}
  .online-map-selection{display:grid;gap:14px;margin-bottom:14px;padding:20px}.online-map-selection .section-heading>strong{color:var(--accent);font-size:1.6rem}.online-map-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px}.online-map-grid button{display:grid;gap:4px;padding:12px;border:1px solid var(--line);color:var(--text);background:var(--surface-2);text-align:left;cursor:pointer}.online-map-grid button.selected{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.online-map-grid button:disabled{opacity:.38;cursor:not-allowed}.online-map-grid span,.online-map-grid small{color:var(--muted);font-size:.58rem}
</style>
