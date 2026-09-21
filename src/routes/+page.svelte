<script lang="ts">
  import { formatRating } from '$lib/game/powerRating';
  import { onDestroy, onMount, tick } from 'svelte';
  import { dev } from '$app/environment';
  import { isOnlineEnabled } from '$lib/game/online/config';
  import { replaceState } from '$app/navigation';
  import Navbar from '$lib/components/Navbar.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import PlayerCard from '$lib/components/PlayerCard.svelte';
  import DraftRoulette from '$lib/components/DraftRoulette.svelte';
  import FlyingPick from '$lib/components/FlyingPick.svelte';
  import { playOfflineSound, unlockOfflineAudio, stopOfflineSounds, loadOfflineSound, disposeOfflineAudio, offlineSoundEnabled, setOfflineSound } from '$lib/game/offlineAudio';
  import PlayerDetailSheet from '$lib/components/PlayerDetailSheet.svelte';
  import HeroLive from '$lib/components/HeroLive.svelte';
  import MajorOverview from '$lib/components/MajorOverview.svelte';
  import RunStatsGrid from '$lib/components/RunStatsGrid.svelte';
  import MajorAwardsPanel from '$lib/components/MajorAwardsPanel.svelte';
  import CollapsibleStats from '$lib/components/CollapsibleStats.svelte';
  /** Run statistics panel of the result screen (closed by default; the 'seeStats' button opens it in place). */
  let resultStatsOpen = false;
  import RunHighlights from '$lib/components/RunHighlights.svelte';
  import OrganizationRosterModal from '$lib/components/OrganizationRosterModal.svelte';
  import DraftHud from '$lib/components/DraftHud.svelte';
  import SeriesViewer from '$lib/components/SeriesViewer.svelte';
  import VetoBoard from '$lib/components/live/VetoBoard.svelte';
  import SidePickPrompt from '$lib/components/live/SidePickPrompt.svelte';
  import EcoCallPrompt from '$lib/components/live/EcoCallPrompt.svelte';
  import TimeoutButton from '$lib/components/live/TimeoutButton.svelte';
  import AutomationGear from '$lib/components/AutomationGear.svelte';
  import { TIMEOUT_LOSS_STREAK } from '$lib/game/bot-policies';
  import { DEFAULT_STRATEGIC_AUTOMATION, loadStrategicPreferences, loadTipPreferences, saveStrategicPreferences, saveTipPreferences, type StrategicAutomationPreferences } from '$lib/game/preferences';
  import {
    advanceCampaignMajor,
    applyCampaignEcoCall,
    applyCampaignSide,
    applyCampaignVeto,
    autoDecideCampaign,
    campaignPlayedSeries,
    createCampaignMajor,
    getCampaignLiveView,
    pendingCampaignDecision,
    skipCampaignMap,
    stepCampaignSeries,
    callCampaignTimeout,
    setCampaignSeriesPlan,
    type CampaignLiveView,
    type CampaignMajorState
  } from '$lib/game/campaign-major';
  import { advanceCursor, currentUserSeries, stageRecord } from '$lib/game/campaignProgress';
  import { needsStyleBeforeDraft } from '$lib/game/draftFlow';
  import type { PendingSeriesDecision } from '$lib/game/online/live-series';
  import type { MajorRun } from '$lib/game/types';
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import ShareRunCard from '$lib/components/ShareRunCard.svelte';
  import { buildDynastyLineage } from '$lib/game/runCard';
  import TeamRosterModal from '$lib/components/TeamRosterModal.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import { confirmDialog } from '$lib/game/ui/dialog';
  import Footer from '$lib/components/Footer.svelte';
  import SupportNudge from '$lib/components/SupportNudge.svelte';
  import { HOME_SEO_COPY, HOME_STRUCTURED_DATA, SEO_BY_ROUTE } from '$lib/seo';
  import { catalogStoreOf, CURRENT_CATALOG_VERSION, playerTitle } from '$lib/game/catalog';
  import { setCatalogContext } from '$lib/game/catalogContext';
  import { translate, translatePlacement, translateTitle, translateTeamName, type TranslationKey } from '$lib/game/i18n';
  import { getPlayerBaseId, getRoleLabel, validatePlayerPick } from '$lib/game/roleRules';
  import {
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
  import DynastyHeader from '$lib/components/DynastyHeader.svelte';
  import CoachDraft from '$lib/components/CoachDraft.svelte';
  import DynastyWindow from '$lib/components/DynastyWindow.svelte';
  import DynastyTip from '$lib/components/DynastyTip.svelte';
  import DynastyCircuit from '$lib/components/DynastyCircuit.svelte';
  import { createCircuit, finishCircuit, settleCircuitEvent, skipCircuitEvent } from '$lib/game/dynasty/circuit';
  import { circuitResultFrom, circuitRounds, circuitStatsFrom, createCircuitCampaign, stepCircuitCampaign, type CircuitCampaignInput } from '$lib/game/dynasty/circuitLive';
  import PlayoffBracket from '$lib/components/PlayoffBracket.svelte';
  import { buildBracket, revealRounds } from '$lib/game/majorOverview';
  import { DEFAULT_TIP_STATE, disableTips, markTipSeen, nextTip, type TipContext, type TipState } from '$lib/game/dynasty/tips';
  import DynastySeriesPlan from '$lib/components/DynastySeriesPlan.svelte';
  import DynastyTeamPanel from '$lib/components/DynastyTeamPanel.svelte';
  import DynastyTraining from '$lib/components/DynastyTraining.svelte';
  import { applyCoachToTeam, coachAffinity, COACH_REROLLS } from '$lib/game/dynasty/coach';
  import { offerCoaches } from '$lib/game/dynasty/coachOffer';
  import { awardsBonus, formatUsd, prizeForPlacement } from '$lib/game/dynasty/prizes';
  import { beginNextDynastyMajor, createDynastyState, normalizeTeamName, settleDynastyMajor, TEAM_NAME_MAX } from '$lib/game/dynasty/state';
  import { userTeamLabel } from '$lib/game/dynasty/teamLabel';
  import { resolveDynastyPlayer } from '$lib/game/dynasty/resolve';
  import { confirmWindow, createWindow } from '$lib/game/dynasty/window';
  import { buildDynastyUserTeam, confirmSeriesPlan, createDynastyMajorPlan, studiesLeft } from '$lib/game/dynasty/seriesPlan';
  import { applyTraining, suggestTraining } from '$lib/game/dynasty/training';
  import {
    MAP_POOL,
    getDefaultMapSelection,
    getLineupMapContributors,
    getLineupMapYears,
    getMapAffinity,
    getMapFamiliarity,
    getMapName,
    isValidLineupMapSelection
  } from '$lib/game/maps';
  import {
    isMajorStage,
    MAJOR_STAGES,
    SPEEDS,
    type Coach,
    type GameMode,
    type HistoricalTeam,
    type LineupSlotRole,
    type MajorStage,
    type MapId,
    type MapSide,
    ORG_STYLES,
    type OrgStyle,
    type Player,
    type SeriesResult,
    type SeriesPlan,
    type TrainingFocus,
    type SimMode,
    type SimSpeed,
    type WindowState
  } from '$lib/game/types';
  import '../app.css';

  // The catalog stamped on the run: every lookup here and the shared components (HUD, stats, rosters) resolve on it,
  // so a save from before the expansion keeps replaying on core while a new run drafts from the current catalog.
  const catalogStore = setCatalogContext(catalogStoreOf(game));
  $: catalog = $catalogStore;
  $: teams = catalog.teams;
  $: players = catalog.players;
  $: coaches = catalog.coaches;
  $: playerById = catalog.playerById;
  $: teamById = catalog.teamById;
  $: coachById = catalog.coachById;
  $: getTeamPlayers = catalog.getTeamPlayers;

  let detailsPlayer: Player | null = null;
  let rouletteSpinning = false;
  let rouletteCandidates: HistoricalTeam[] = [];
  let freshOffer = false;
  let recentPickId: string | null = null;
  let celebrateLineup = false;
  let flight: { id: number; name: string; source: DOMRect; slot: number } | null = null;
  let flightId = 0;
  $: if ($game.phase !== 'draft' || !$game.rolledTeamId) rouletteSpinning = false;
  $: if ($game.phase === 'home' || $game.phase === 'mode-select' || $game.phase === 'map-selection') {
    flight = null;
    celebrateLineup = false;
    recentPickId = null;
  }

  function pickFeedback(player: Player, slot: number) {
    unlockOfflineAudio();
    const card = document.querySelector(`[data-offline-player="${CSS.escape(player.id)}"]`);
    const source = card?.getBoundingClientRect();
    recentPickId = player.id;
    if (source && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      flight = { id: ++flightId, name: player.nickname ?? '?', source, slot };
    }
    if (slot === 4) { celebrateLineup = true; playOfflineSound('lineup'); }
    else playOfflineSound('pick');
  }

  function beginRoulette(team: HistoricalTeam, excludedIds: string[], rerollsUsed = $game.rerollsUsed) {
    unlockOfflineAudio();
    freshOffer = false;
    rouletteCandidates = catalog.draftTeams.filter(candidate => !excludedIds.includes(candidate.id));
    rouletteSpinning = true;
    update({ rolledTeamId: team.id, rerollsUsed });
  }
  let toast = '';
  let awaitingAdvance = false;
  let majorTab: 'current' | 'all' | 'team' = 'current';
  let tipState: TipState = DEFAULT_TIP_STATE;
  const tipFor = (context: TipContext, state: TipState) => (isDynasty ? nextTip(context, state) : null);
  function dismissTip(id: string) {
    tipState = markTipSeen(tipState, id);
    saveTipPreferences(tipState);
  }
  function turnOffTips() {
    tipState = disableTips(tipState);
    saveTipPreferences(tipState);
  }
  let downloadingImage = false;
  let showSupportNudge = false;
  let supportNudgeShownThisRun = false;
  let supportNudgeDismissedThisRun = false;
  let supportNudgeTimer: number | null = null;
  let enemyModalTeam: HistoricalTeam | null = null;
  let enemyModalPinned = false;
  let enemyHoverTimer: number | null = null;
  let advanceTimer: number | null = null;
  let toastTimer: number | null = null;
  let showOrgModal = false;
  let expandedTimelineMatch: string | null = null;
  let seedUrlTimer: number | null = null;
  let campaign: CampaignMajorState | null = null;
  let advancing = false;
  let strategicPreferences: StrategicAutomationPreferences = { ...DEFAULT_STRATEGIC_AUTOMATION };
  let liveTimer: number | null = null;
  // Session-only pause of everything that advances the offline campaign on its own.
  let simPaused = false;
  let advanceHeldByPause = false;
  let liveRunning = false;
  let automationTimer: number | null = null;
  /** The saved campaign was already looked at: before that the old viewer must not start playing on its own. */
  let campaignChecked = false;
  /** Half already covered by an automatic tactical pause. */
  let autoPausedHalf = '';

  function getPhaseLabel(phase: SeriesResult['phase']): string {
    const labels: Record<string, string> = {
      stage1: t('stage1'),
      stage2: t('stage2'),
      stage3: t('stage3'),
      quarterfinal: t('quarterfinal'),
      semifinal: t('semifinal'),
      final: t('final')
    };
    return labels[phase] || phase;
  }

  function groupMatchesByPhase(matches: SeriesResult[]) {
    const phases: Array<{ phase: string; label: string; matches: SeriesResult[] }> = [];
    const phaseOrder: SeriesResult['phase'][] = ['stage1', 'stage2', 'stage3', 'quarterfinal', 'semifinal', 'final'];
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
    loadOfflineSound();
    const unlock = () => { if ($game.phase !== 'home') unlockOfflineAudio(); };
    const visibility = () => { if (document.hidden) stopOfflineSounds(); };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
      disposeOfflineAudio();
    };
  });

  onMount(() => {
    strategicPreferences = loadStrategicPreferences();
    tipState = loadTipPreferences();
    restoreCampaign();
    settleDynastyIfNeeded();
    campaignChecked = true;
    return game.subscribe((state) => {
      const url = new URL(window.location.href);
      if (state.seed) url.searchParams.set('seed', state.seed);
      else url.searchParams.delete('seed');
      if (url.href !== window.location.href) {
        if (seedUrlTimer !== null) window.clearTimeout(seedUrlTimer);
        seedUrlTimer = window.setTimeout(() => {
          seedUrlTimer = null;
          replaceState(url, {});
        }, 100);
      }
    });
  });

  $: t = (key: TranslationKey) => translate($game.language, key);
  $: isProMode = $game.mode === 'pro';
  $: isDynasty = $game.mode === 'dynasty';
  /** Dinastia custom org name; undefined everywhere else so other modes keep the translated default. */
  $: dynastyTeamName = isDynasty ? $game.dynasty?.teamName : undefined;
  $: userOrgLabel = isDynasty ? userTeamLabel($game.language, $game.dynasty) : t('yourOrg');
  $: teamNameLabel = $game.language === 'en' ? 'Organization name' : $game.language === 'es' ? 'Nombre de la organización' : 'Nome da organização';

  function setDynastyTeamName(value: string, commit = false) {
    if (!$game.dynasty) return;
    const next = commit ? normalizeTeamName(value) : value.slice(0, TEAM_NAME_MAX) || undefined;
    update({ dynasty: { ...$game.dynasty, teamName: next } });
  }
  $: proPickedPlayers = $game.proPickedPlayerIds.map((playerId) => playerById.get(playerId)).filter((player): player is Player => Boolean(player));
  $: proEvaluations = isProMode ? buildProRoleEvaluations(proPickedPlayers, $game.proRoleAssignments, $game.style) : [];
  $: proLineup = buildProLineup(proEvaluations);
  $: proAdjustedPlayers = proEvaluations.map((evaluation) => evaluation.adjustedPlayer);
  $: proAdjustedPlayerById = new Map(proAdjustedPlayers.map((player) => [player.id, player]));
  $: selectedLineup = isProMode && $game.proRevealed ? proLineup : $game.selectedPlayers;
  $: selectedPlayers = isProMode
    ? ($game.proRevealed ? proAdjustedPlayers : proPickedPlayers)
    : selectedLineup
      .map((selected) => playerById.get(selected.playerId))
      .filter((player): player is Player => Boolean(player))
      // Dinastia: strength, cards, HUD, stats and the Major all read the player with the dynasty's drift.
      .map((player) => (isDynasty ? resolveDynastyPlayer(player, $game.dynasty?.playerOverrides[player.id]) : player))
      .map((player) => isDynasty && $game.dynasty?.major?.training && $game.phase !== 'window' ? applyTraining(player, $game.dynasty.major.training) : player);
  $: rolledTeam = $game.rolledTeamId ? teamById.get($game.rolledTeamId) ?? null : null;
  $: rolledPlayers = getTeamPlayers(rolledTeam);
  $: draftComplete = isProMode ? proPickedPlayers.length === 5 : selectedPlayers.length === 5;
  $: rerollsMax = $game.mode === 'premier' ? 3 : $game.mode === 'dynasty' || $game.mode === 'faceit' ? 1 : $game.mode === 'pro' ? PRO_REROLLS_MAX : 0;
  $: rerollsLeft = Math.max(0, rerollsMax - ($game.rerollsUsed ?? 0));
  $: dynastyCoach = isDynasty && $game.dynasty?.coachId ? coachById.get($game.dynasty.coachId) ?? null : null;
  $: baseUserTeam = calculateUserTeamPower(selectedPlayers, $game.style, selectedLineup, $game.seed);
  $: activeDynastyPlan = ($game.dynasty?.major?.plans[currentSeries?.id ?? ''] ?? $game.dynasty?.major?.basePlan ?? { style: $game.style, tactic: 'standard', study: false }) as SeriesPlan;
  $: userTeam = isDynasty && $game.dynasty?.majorRules === 2
    ? buildDynastyUserTeam({ players: selectedPlayers, lineup: selectedLineup, seed: $game.seed, coach: dynastyCoach, teams, plan: activeDynastyPlan })
    : dynastyCoach ? applyCoachToTeam(baseUserTeam, dynastyCoach, coachAffinity(dynastyCoach, selectedPlayers, teams)) : baseUserTeam;
  $: coachOffer = $game.phase === 'coach-draft' && $game.dynasty ? offerCoaches(coaches, $game.seed, $game.usedTeamIds, $game.dynasty.coachRerollsUsed) : [];
  $: mapContributors = getLineupMapContributors(selectedPlayers, teams);
  $: mapYears = getLineupMapYears(selectedPlayers, teams);
  $: ownOrganizationView = selectedPlayers.length ? {
    id: 'user',
    name: t('orgHud'),
    avatar: (selectedPlayers[0]?.nickname ?? 'ORG').slice(0, 2).toUpperCase(),
    eyebrow: `${$game.style.toUpperCase()} · POWER ${formatRating(userTeam.power)}`,
    subtitle: `${$game.style} · OVR ${averageOverall(selectedPlayers)}`,
    tags: getOrgStrengths().slice(0, 3).map((stat) => `${stat.key.toUpperCase()} ${stat.value}`),
    roster: selectedPlayers,
    stats: getOrgStrengths()
  } : null;
  $: proAssignmentStatus = validateProAssignments($game.proRoleAssignments, $game.proPickedPlayerIds);
  $: confirmedSeriesIds = campaign?.confirmedSeriesIds ?? $game.majorRun?.matches.slice(0, $game.completedSeries).map((match) => match.id) ?? [];
  $: currentSeries = $game.majorRun ? currentUserSeries($game.majorRun.matches, confirmedSeriesIds) : null;
  $: dynastySeriesPlanned = !isDynasty || $game.dynasty?.majorRules !== 2 || Boolean(currentSeries && $game.dynasty?.major?.plans[currentSeries.id]);
  $: dynastyStudiesLeft = $game.dynasty?.major ? studiesLeft($game.dynasty.major, dynastyCoach) : 0;
  $: dynastyTrainingSuggestion = suggestTraining(selectedLineup.flatMap((selected) => {
    const player = playerById.get(selected.playerId);
    return player ? [resolveDynastyPlayer(player, $game.dynasty?.playerOverrides[player.id])] : [];
  }));
  $: dynastyPlanInitial = $game.dynasty?.major ? { ...(Object.values($game.dynasty.major.plans).at(-1) ?? $game.dynasty.major.basePlan), study: false } as SeriesPlan : null;
  $: campaignView = campaign ? getCampaignLiveView(campaign) : null;
  $: campaignPending = campaign ? pendingCampaignDecision(campaign) : null;
  $: queueAutomation(campaignPending, campaignView, strategicPreferences, simPaused);
  $: if (campaignView && !campaignView.finished && !liveRunning && $game.simMode === 'auto') liveRunning = true;
  $: if (!simPaused && liveRunning && dynastySeriesPlanned && campaignView && !campaignView.finished && !campaignPending && liveTimer === null) scheduleLiveTick();
  $: if (campaignView?.finished && !awaitingAdvance) { stopLiveTick(); seriesCompleted(); }
  $: circuitView = circuitCampaign ? getCampaignLiveView(circuitCampaign) : null;
  $: circuitSeries = circuitCampaign ? currentUserSeries(circuitCampaign.run.matches, circuitCampaign.confirmedSeriesIds) : null;
  $: circuitEnemyTeamId = circuitSeries ? (circuitSeries.teamA.id === 'user' ? circuitSeries.teamB.id : circuitSeries.teamA.id) : null;
  $: circuitBracket = circuitCampaign ? buildBracket(revealRounds(circuitRounds(circuitCampaign), { liveSeriesId: circuitSeries?.id ?? null }), { liveScores: true }) : [];
  $: if (!simPaused && circuitCampaign && !circuitCampaign.finished && circuitLiveRunning) scheduleCircuitTick();
  $: if (circuitCampaign?.finished) settleFinishedCircuit();
  $: enemyTeamId = currentSeries ? (currentSeries.teamA.id === 'user' ? currentSeries.teamB.id : currentSeries.teamA.id) : null;
  $: completedMatches = $game.majorRun?.matches.filter((match) => confirmedSeriesIds.includes(match.id)) ?? [];
  $: liveStage = currentSeries && isMajorStage(currentSeries.phase) ? currentSeries.phase : null;
  $: liveStageRecord = stageRecord($game.majorRun?.matches ?? [], liveStage ?? 'stage3', confirmedSeriesIds, 'user');
  $: stageWins = liveStageRecord.wins;
  $: stageLosses = liveStageRecord.losses;
  $: hasStageRecord = stageWins + stageLosses > 0;
  $: runAggregate = $game.majorRun ? aggregateRunStats($game.majorRun, $game.stats) : null;
  $: maybeShowSupportNudge($game.phase, $game.completedSeries);
  $: userFamiliarity = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, getMapFamiliarity(mapContributors[mapId].length)])) as Record<MapId, number>;
  $: liveTeamNames = currentSeries ? { [currentSeries.teamA.id]: translateTeamName($game.language, currentSeries.teamA.name, dynastyTeamName), [currentSeries.teamB.id]: translateTeamName($game.language, currentSeries.teamB.name, dynastyTeamName) } as Record<string, string> : {};

  const update = (patch: Partial<typeof $game>) => game.update((state) => ({ ...state, ...patch }));
  const lookupPlayer = (id: string) => playerById.get(id);

  onDestroy(() => {
    document.body.classList.remove('modal-open');
    clearSupportNudgeTimer();
    clearEnemyHoverTimer();
    clearAdvanceTimer();
    stopLiveTick();
    stopCircuitTick();
    if (automationTimer !== null) window.clearTimeout(automationTimer);
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    if (seedUrlTimer !== null) window.clearTimeout(seedUrlTimer);
  });

  function beginGame() {
    update({ phase: 'mode-select' });
  }

  function goHome() {
    stopOfflineSounds();
    resetSupportNudge();
    closePlayer();
    closeEnemyTeam();
    clearAdvanceTimer();
    awaitingAdvance = false;
    const preserved = { language: $game.language, theme: $game.theme, simMode: $game.simMode, simSpeed: $game.simSpeed };
    game.set({ ...defaultState(), ...preserved });
    replaceState(new URL('/', window.location.origin), {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseMode(mode: GameMode) {
    freshOffer = false;
    recentPickId = null;
    celebrateLineup = false;
    stopCircuitTick();
    update({
      seed: $game.seed || makeSeed(),
      // A new run always drafts from the current catalog, even when the previous save was stamped on an older one.
      catalogVersion: CURRENT_CATALOG_VERSION,
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
      selectedMaps: [],
      majorRun: null,
      completedSeries: 0,
      stats: [],
      dynasty: mode === 'dynasty' ? createDynastyState() : null,
    });
  }

  function rollTeam() {
    if (rouletteSpinning || draftComplete || rolledTeam) return;
    if (!$game.styleLocked && needsStyleBeforeDraft($game.mode)) return;
    const pickCount = isProMode ? proPickedPlayers.length : selectedPlayers.length;
    const rng = createSeededRng(`${$game.seed}:draft:${pickCount}:${$game.usedTeamIds.join('|')}`);
    const team = pickRandomTeam(catalog.draftTeams, rng, $game.usedTeamIds);
    if (team) beginRoulette(team, $game.usedTeamIds);
  }

  function rerollTeam() {
    if (rouletteSpinning) return;
    if ((!$game.styleLocked && needsStyleBeforeDraft($game.mode)) || !rolledTeam || draftComplete || !rerollsLeft) return;
    const rerollsUsed = ($game.rerollsUsed ?? 0) + 1;
    const excludedIds = [...$game.usedTeamIds, rolledTeam.id];
    const pickCount = isProMode ? proPickedPlayers.length : selectedPlayers.length;
    const rng = createSeededRng(`${$game.seed}:draft-reroll:${pickCount}:${rerollsUsed}:${excludedIds.join('|')}`);
    const team = pickRandomTeam(catalog.draftTeams, rng, excludedIds);
    if (!team) {
      showToast(t('noRerollTeams'));
      return;
    }
    beginRoulette(team, excludedIds, rerollsUsed);
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

  // The blocking roster modal opens on click only: opening it on hover/focus made it flicker (the modal steals focus and covers the button).
  function hoverEnemyTeam(_teamId: string) {
    clearEnemyHoverTimer();
  }

  function leaveEnemyTeam() {
    clearEnemyHoverTimer();
  }

  function openOverviewTeam(teamId: string) {
    if (teamId === 'user') showOrgModal = true;
    else pinEnemyTeam(teamId);
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
    if (rouletteSpinning) return;
    if (!rolledTeam || draftComplete || !$game.mode || (!$game.styleLocked && needsStyleBeforeDraft($game.mode))) return;
    const validation = validatePlayerPick(player, selectedLineup, selectedSlotRole, lookupPlayer);
    if (!validation.ok) {
      showToast(reasonText(validation.reason));
      return;
    }
    pickFeedback(player, selectedLineup.length);
    update({
      selectedPlayers: [...selectedLineup, { playerId: player.id, selectedSlotRole }],
      usedTeamIds: [...$game.usedTeamIds, rolledTeam.id],
      rolledTeamId: null
    });
    closePlayer();
    showToast(`${player.nickname ?? 'Player'} · ${getRoleLabel(selectedSlotRole)}`);
  }

  function confirmProBlindPick(player: Player) {
    if (rouletteSpinning) return;
    if (!isProMode || !rolledTeam || draftComplete) return;
    const alreadyPicked = $game.proPickedPlayerIds.some((pickedId) => {
      const picked = playerById.get(pickedId);
      return picked ? getPlayerBaseId(picked) === getPlayerBaseId(player) : false;
    });
    if (alreadyPicked) {
      showToast(t('samePlayerPicked'));
      return;
    }
    pickFeedback(player, $game.proPickedPlayerIds.length);
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
    celebrateLineup = true;
    playOfflineSound('lineup');
    update({
      selectedPlayers: proLineup,
      proRevealed: true,
      phase: 'pro-reveal'
    });
  }

  function beginMapSelection() {
    if (!draftComplete || (isProMode && !$game.proRevealed)) return;
    if (isDynasty && $game.dynasty && (!$game.dynasty.coachId || !$game.styleLocked)) {
      update({ phase: 'coach-draft' });
      return;
    }
    update({ phase: 'map-selection', selectedMaps: [] });
  }

  function pickCoach(coach: Coach) {
    if (!$game.dynasty) return;
    const major = createDynastyMajorPlan($game.dynasty.majorNumber, $game.style);
    update({ dynasty: { ...$game.dynasty, coachId: coach.id, major }, phase: 'map-selection', selectedMaps: [] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseDynastyStyle(style: OrgStyle) {
    if (!isDynasty) return;
    update({ style, styleLocked: true });
  }

  function confirmDynastyPlan(plan: SeriesPlan) {
    if (!campaign || !currentSeries || !$game.dynasty?.major) return;
    try {
      const major = confirmSeriesPlan($game.dynasty.major, currentSeries.id, plan, dynastyCoach);
      const team = buildDynastyUserTeam({ players: selectedPlayers, lineup: selectedLineup, seed: $game.seed, coach: dynastyCoach, teams, plan });
      commitCampaign(setCampaignSeriesPlan(campaign, team));
      update({ dynasty: { ...$game.dynasty, major }, style: plan.style });
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function rerollCoaches() {
    if (!$game.dynasty || $game.dynasty.coachRerollsUsed >= COACH_REROLLS) return;
    update({ dynasty: { ...$game.dynasty, coachRerollsUsed: $game.dynasty.coachRerollsUsed + 1 } });
  }

  const coachTeamLabel = (teamId: string) => {
    const team = teamById.get(teamId);
    return team ? `${translateTeamName($game.language, team.name ?? teamId)} ${team.year ?? ''}`.trim() : teamId;
  };

  function toggleMap(mapId: MapId) {
    const selected = $game.selectedMaps;
    if (selected.includes(mapId)) {
      update({ selectedMaps: selected.filter((item) => item !== mapId) });
      return;
    }
    if (mapContributors[mapId].length > 0 && selected.length < 3) update({ selectedMaps: [...selected, mapId] });
  }

  function chooseTraining(focus: TrainingFocus) {
    if (!$game.dynasty?.major || $game.dynasty.majorRules !== 2) return;
    update({ dynasty: { ...$game.dynasty, major: { ...$game.dynasty.major, training: focus } } });
  }

  function autoSelectMaps() {
    update({ selectedMaps: getDefaultMapSelection(selectedPlayers, teams) });
  }

  function returnToLineup() {
    update({ phase: isProMode ? 'pro-reveal' : 'draft', selectedMaps: [] });
  }

  function launchMajor() {
    if (!draftComplete || (isProMode && !$game.proRevealed) || (isDynasty && $game.dynasty?.majorRules === 2 && !$game.dynasty.major?.training) || !isValidLineupMapSelection($game.selectedMaps, selectedPlayers, teams)) return;
    resetSupportNudge();
    const runPlayers = isProMode ? proAdjustedPlayers : selectedPlayers;
    const runLineup = isProMode ? proLineup : selectedLineup;
    const dynastyRules = isDynasty && $game.dynasty ? (!$game.majorRun ? 2 : $game.dynasty.majorRules) : undefined;
    const dynastyMajor = isDynasty && $game.dynasty && dynastyRules === 2 ? ($game.dynasty.major ?? createDynastyMajorPlan($game.dynasty.majorNumber, $game.style)) : null;
    const dynastyPlan = dynastyMajor?.basePlan;
    // Opponents come only from the main-event, non-retired team-years of the run's catalog.
    campaign = createCampaignMajor(runPlayers, $game.style, catalog.botTeams, catalog.players, $game.seed, runLineup, {
      selectedMaps: $game.selectedMaps,
      mode: $game.mode ?? 'premier',
      ...(isDynasty && $game.dynasty ? { dynastyEntryStage: $game.dynasty.entryStage, dynastyRules, dynastyPlan } : {}),
      ...(isDynasty && dynastyCoach ? { coach: dynastyCoach } : {}),
    });
    const majorRun = campaign.run;
    const stats = createRunStats(runPlayers, majorRun, $game.seed, runLineup);
    awaitingAdvance = false;
    autoPausedHalf = '';
    liveRunning = false;
    simPaused = false;
    advanceHeldByPause = false;
    update({ majorRun, stats, playedSeries: {}, selectedPlayers: runLineup, completedSeries: 0, phase: 'stage3', ...(isDynasty && $game.dynasty && dynastyRules ? { dynasty: { ...$game.dynasty, majorRules: dynastyRules, major: dynastyMajor } } : {}) });
    scheduleSupportNudge();
  }


  /** Series a run saved before the live campaign already played, taken from the run itself. */
  function playedFromSavedRun(run: MajorRun, completed: number): Record<string, SeriesResult> {
    const played: Record<string, SeriesResult> = {};
    for (const match of run.matches.slice(0, completed)) {
      if (match.winnerId) played[match.id] = match;
    }
    return played;
  }

  /**
   * A campaign saved in the browser comes back with the series it already played, ready to keep deciding. A save the
   * engine cannot reproduce keeps the Major exactly as it was: the run is never rebuilt on top of the player.
   */
  function restoreCampaign() {
    if (campaign || !$game.majorRun || ($game.phase !== 'stage3' && $game.phase !== 'playoffs')) return;
    const runPlayers = isProMode ? proAdjustedPlayers : selectedPlayers;
    const runLineup = isProMode ? proLineup : selectedLineup;
    if (runPlayers.length !== 5) return;
    // Um save antigo traz o campo vazio, então as séries jogadas saem da própria run guardada.
    const saved = $game.playedSeries;
    const played = saved && Object.keys(saved).length > 0 ? saved : playedFromSavedRun($game.majorRun, $game.completedSeries);
    try {
      const restored = createCampaignMajor(runPlayers, $game.style, catalog.botTeams, catalog.players, $game.seed, runLineup, {
        selectedMaps: $game.selectedMaps,
        mode: $game.mode ?? 'premier',
        played,
        ...(isDynasty && $game.dynasty ? { dynastyEntryStage: $game.dynasty.entryStage, dynastyRules: $game.dynasty.majorRules, dynastyPlan: $game.dynasty.major?.basePlan } : {}),
        ...(isDynasty && dynastyCoach ? { coach: dynastyCoach } : {}),
      });
      const expected = Object.keys(played).length;
      const wonBack = restored.run.matches.filter((match) => match.winnerId).length;
      if (restored.restoredSeriesIds.length !== expected || wonBack < expected) { showToast(t('campaignRestoreFailed')); return; }
      campaign = restored;
      const restoredCurrent = currentUserSeries(restored.run.matches, restored.confirmedSeriesIds);
      const restoredPlan = restoredCurrent ? $game.dynasty?.major?.plans[restoredCurrent.id] : null;
      if (restoredPlan) {
        const team = buildDynastyUserTeam({ players: runPlayers, lineup: runLineup, seed: $game.seed, coach: dynastyCoach, teams, plan: restoredPlan });
        campaign = setCampaignSeriesPlan(restored, team);
      }
      update({ majorRun: campaign.run, playedSeries: campaignPlayedSeries(campaign) });
    } catch { showToast(t('campaignRestoreFailed')); }
  }

  function setStrategicPreferences(value: StrategicAutomationPreferences) {
    strategicPreferences = value;
    saveStrategicPreferences(value);
  }

  const isAutomated = (decision: PendingSeriesDecision, preferences: StrategicAutomationPreferences) =>
    decision.kind === 'eco-call' ? preferences.autoEconomy : preferences.autoMapPicksAndVetos;

  const pauseKey = (view: CampaignLiveView) => `${view.seriesId}:${view.activeMap}:${view.timeoutsLeft}`;

  const wantsAutomaticPause = (view: CampaignLiveView | null, preferences: StrategicAutomationPreferences) =>
    Boolean(preferences.autoPause && view && view.phase === 'live' && !view.finished
      && view.timeoutsLeft > 0 && view.lossStreak >= TIMEOUT_LOSS_STREAK && autoPausedHalf !== pauseKey(view));

  /** Queues the automation: writing the campaign from inside a reactive block would not restart the cycle. */
  function queueAutomation(pending: PendingSeriesDecision | null, view: CampaignLiveView | null, preferences: StrategicAutomationPreferences, paused: boolean) {
    if (paused || !campaign || automationTimer !== null) return;
    if (!dynastySeriesPlanned) return;
    const decides = Boolean(pending && isAutomated(pending, preferences));
    if (!decides && !(!pending && wantsAutomaticPause(view, preferences))) return;
    automationTimer = window.setTimeout(runAutomation, 0);
  }

  /** Takes every decision the player left on automatic, then the tactical pause when it is on. */
  function runAutomation() {
    automationTimer = null;
    if (!campaign || simPaused) return;
    let next = campaign;
    for (let guard = 0; guard < 40; guard += 1) {
      const pending = pendingCampaignDecision(next);
      if (!pending || !isAutomated(pending, strategicPreferences)) break;
      next = autoDecideCampaign(next);
    }
    const view = pendingCampaignDecision(next) ? null : getCampaignLiveView(next);
    if (wantsAutomaticPause(view, strategicPreferences) && view) {
      autoPausedHalf = pauseKey(view);
      try { next = callCampaignTimeout(next); } catch { /* no timeout left in this half */ }
    }
    commitCampaign(next);
  }

  /** Publishes the campaign state into the store so the timeline, the overview and the statistics follow along. */
  function commitCampaign(next: CampaignMajorState) {
    campaign = next;
    const runPlayers = isProMode ? proAdjustedPlayers : selectedPlayers;
    const runLineup = isProMode ? proLineup : selectedLineup;
    update({ majorRun: next.run, playedSeries: campaignPlayedSeries(next), stats: createRunStats(runPlayers, next.run, $game.seed, runLineup) });
  }

  /** Plays the user's series one step at a time, stopping whenever a decision is pending. */
  function scheduleLiveTick() {
    if (liveTimer !== null) return;
    liveTimer = window.setTimeout(() => {
      liveTimer = null;
      if (!campaign || !liveRunning || !dynastySeriesPlanned || simPaused) return;
      commitCampaign(stepCampaignSeries(campaign));
    }, Math.max(120, SPEEDS[$game.simSpeed]));
  }

  /** Freezes (or releases) every automatic step of the offline campaign; state stays untouched. */
  function toggleSimPause() {
    simPaused = !simPaused;
    if (simPaused) {
      if (liveTimer !== null) window.clearTimeout(liveTimer);
      liveTimer = null;
      if (circuitTimer !== null) window.clearTimeout(circuitTimer);
      circuitTimer = null;
      if (automationTimer !== null) window.clearTimeout(automationTimer);
      automationTimer = null;
      if (advanceTimer !== null) { clearAdvanceTimer(); advanceHeldByPause = true; }
    } else if (advanceHeldByPause) {
      advanceHeldByPause = false;
      if (campaignView?.finished && !awaitingAdvance) seriesCompleted();
    }
  }

  function stopLiveTick() {
    if (liveTimer !== null) window.clearTimeout(liveTimer);
    liveTimer = null;
    liveRunning = false;
  }

  function decideVeto(mapId: MapId) {
    if (!campaign || campaignPending?.kind !== 'veto') return;
    commitCampaign(applyCampaignVeto(campaign, campaignPending.action, mapId));
  }

  function decideSide(side: 'ct' | 't') {
    if (!campaign || campaignPending?.kind !== 'side') return;
    commitCampaign(applyCampaignSide(campaign, side));
  }

  function decideEco(call: 'force' | 'eco') {
    if (!campaign || campaignPending?.kind !== 'eco-call') return;
    commitCampaign(applyCampaignEcoCall(campaign, call));
  }

  function requestCampaignTimeout() {
    if (!campaign) return;
    try { commitCampaign(callCampaignTimeout(campaign)); } catch { /* no timeout left in this half */ }
  }

  function skipCurrentMap() {
    if (!campaign) return;
    commitCampaign(skipCampaignMap(campaign));
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

  function clearAdvanceTimer() {
    if (advanceTimer !== null) window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  function seriesCompleted() {
    if ($game.simMode === 'auto') {
      clearAdvanceTimer();
      if (simPaused) { advanceHeldByPause = true; return; }
      advanceTimer = window.setTimeout(() => { advanceTimer = null; void advanceSeries(); }, 900);
    } else {
      awaitingAdvance = true;
    }
  }

  async function advanceSeries() {
    if (advancing) return;
    advancing = true;
    clearAdvanceTimer();
    awaitingAdvance = false;
    stopLiveTick();
    autoPausedHalf = '';
    if (campaign) {
      const nextCampaign = advanceCampaignMajor(campaign);
      commitCampaign(nextCampaign);
      const cursor = advanceCursor(nextCampaign.run.matches, nextCampaign.confirmedSeriesIds, nextCampaign.finished);
      update(cursor);
      if (cursor.phase === 'result') {
        advancing = false;
        settleDynastyIfNeeded();
        return;
      }
    } else if ($game.majorRun) {
      const nextIndex = $game.completedSeries + 1;
      const next = $game.majorRun.matches[nextIndex];
      if (!next) {
        update({ completedSeries: nextIndex, phase: 'result' });
        advancing = false;
        settleDynastyIfNeeded();
        return;
      }
      update({ completedSeries: nextIndex, phase: isMajorStage(next.phase) ? 'stage3' : 'playoffs' });
    } else {
      advancing = false;
      return;
    }
    await tick();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    advancing = false;
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
    resultStatsOpen = false;
    stopCircuitTick();
    const preserved = { language: $game.language, theme: $game.theme, simMode: $game.simMode, simSpeed: $game.simSpeed };
    game.set({ ...defaultState(newSeed ? '' : $game.seed), ...preserved, phase: 'mode-select' });
    closePlayer();
    closeEnemyTeam();
    clearAdvanceTimer();
    awaitingAdvance = false;
  }

  /** Credits the prize of the finished Major once (also after a reload straight into the result screen). */
  function settleDynastyIfNeeded(): void {
    const run = $game.majorRun;
    if (!isDynasty || !$game.dynasty || !run || $game.phase !== 'result') return;
    if ($game.dynasty.prizeCreditedFor >= $game.dynasty.majorNumber) return;
    // History keeps the evolved overall, without the temporary pre-Major training bonus.
    const overalls = Object.fromEntries(selectedLineup.flatMap((selected) => {
      const base = playerById.get(selected.playerId);
      const resolved = base ? resolveDynastyPlayer(base, $game.dynasty?.playerOverrides[base.id]) : null;
      return resolved && typeof resolved.overall === 'number' ? [[resolved.id, resolved.overall]] : [];
    }));
    update({ dynasty: settleDynastyMajor($game.dynasty, run, { seed: $game.seed, lineup: selectedLineup, stats: $game.stats, overalls }) });
  }

  /** Credits the Major and opens the transfer window: evolution, proposals, market and coach before the next Major. */
  let circuitPlaying: string | null = null;
  // The live circuit campaign is transient: a reload mid-event simply offers the event again (deterministic seed).
  let circuitCampaign: CampaignMajorState | null = null;
  let circuitLiveRunning = false;
  /** What the stats of the event being played are computed from once it ends. */
  let circuitStatsInput: Pick<CircuitCampaignInput, 'event' | 'players' | 'lineup' | 'seed'> | null = null;
  let circuitTimer: number | null = null;

  function stopCircuitTick() {
    if (circuitTimer !== null) window.clearTimeout(circuitTimer);
    circuitTimer = null;
    circuitLiveRunning = false;
    circuitCampaign = null;
    circuitPlaying = null;
  }

  /** Opens (or reopens) the transfer window of the current Major. */
  function openTransferWindow() {
    const dynasty = $game.dynasty;
    if (!dynasty) return;
    const transferWindow = dynasty.window?.majorNumber === dynasty.majorNumber
      ? dynasty.window
      : createWindow({ dynasty, lineup: selectedLineup, stats: $game.stats, seed: $game.seed, catalog: players, playerById, coaches, coachById });
    update({ dynasty: { ...dynasty, window: transferWindow }, phase: 'window' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Credits the Major, then runs the smaller-event circuit before the transfer window. Saves already in the window skip it. */
  function startNextDynastyMajor() {
    if (!isDynasty || !$game.dynasty || selectedLineup.length !== 5) return;
    settleDynastyIfNeeded();
    resetSupportNudge();
    closePlayer();
    closeEnemyTeam();
    clearAdvanceTimer();
    stopLiveTick();
    awaitingAdvance = false;
    autoPausedHalf = '';
    resultStatsOpen = false;
    const dynasty = $game.dynasty;
    if (dynasty.window?.majorNumber === dynasty.majorNumber) { openTransferWindow(); return; }
    if (dynasty.circuit?.majorNumber === dynasty.majorNumber && dynasty.circuit.finished) { openTransferWindow(); return; }
    const circuit = dynasty.circuit?.majorNumber === dynasty.majorNumber ? dynasty.circuit : createCircuit({ dynasty, teams: catalog.botTeams, seed: $game.seed });
    update({ dynasty: { ...dynasty, circuit }, phase: 'circuit' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function playCircuit(eventId: string) {
    const dynasty = $game.dynasty;
    const event = dynasty?.circuit?.events.find((item) => item.id === eventId);
    if (!dynasty?.circuit || !event || circuitPlaying || circuitCampaign) return;
    circuitPlaying = eventId;
    // Base plan, no study and no temporary training: the circuit never touches the Major's choices or evolution.
    const circuitPlayers = selectedLineup.flatMap((selected) => {
      const base = playerById.get(selected.playerId);
      return base ? [resolveDynastyPlayer(base, dynasty.playerOverrides[base.id])] : [];
    });
    const basePlan = dynasty.major?.basePlan ?? { style: $game.style, tactic: 'standard' as const, study: false };
    circuitStatsInput = { event, players: circuitPlayers, lineup: selectedLineup, seed: $game.seed };
    // `teams` only resolves the event's saved teamIds (drawn from botTeams when the circuit was created).
    circuitCampaign = createCircuitCampaign({ event, players: circuitPlayers, lineup: selectedLineup, teams: catalog.teams, allPlayers: catalog.players, seed: $game.seed, selectedMaps: $game.selectedMaps, coach: dynastyCoach, plan: { ...basePlan, study: false } });
    // The circuit screen has its own pause; a leftover Major pause must not freeze it invisibly.
    simPaused = false;
    circuitLiveRunning = true;
  }

  function toggleCircuitLive() {
    circuitLiveRunning = !circuitLiveRunning;
  }

  function scheduleCircuitTick() {
    if (circuitTimer !== null || !circuitCampaign || !circuitLiveRunning || circuitCampaign.finished) return;
    circuitTimer = window.setTimeout(() => {
      circuitTimer = null;
      if (!circuitCampaign || !circuitLiveRunning || simPaused) return;
      circuitCampaign = stepCircuitCampaign(circuitCampaign);
    }, Math.max(120, SPEEDS[$game.simSpeed]));
  }

  /** Settles the finished event into the dynasty: prize, cash and the bracket with every series. */
  function settleFinishedCircuit() {
    const state = circuitCampaign;
    const event = state ? $game.dynasty?.circuit?.events.find((item) => item.id === circuitPlaying) ?? null : null;
    if (circuitTimer !== null) window.clearTimeout(circuitTimer);
    circuitTimer = null;
    circuitLiveRunning = false;
    circuitCampaign = null;
    circuitPlaying = null;
    const statsInput = circuitStatsInput?.event.id === event?.id ? circuitStatsInput : null;
    circuitStatsInput = null;
    if (!state || !event || !$game.dynasty) return;
    const stats = statsInput ? circuitStatsFrom(state, statsInput) : undefined;
    update({ dynasty: settleCircuitEvent($game.dynasty, circuitResultFrom(state, event), circuitRounds(state), stats) });
  }

  function skipCircuit(eventId: string) {
    if (!$game.dynasty || circuitPlaying) return;
    update({ dynasty: skipCircuitEvent($game.dynasty, eventId) });
  }

  function continueFromCircuit() {
    if (!$game.dynasty?.circuit || circuitPlaying) return;
    update({ dynasty: finishCircuit($game.dynasty) });
    openTransferWindow();
  }

  function updateTransferWindow(next: WindowState) {
    if (!$game.dynasty) return;
    update({ dynasty: { ...$game.dynasty, window: next } });
  }

  /** Applies the window (lineup, cash, coach, drift) and opens the next Major at the map selection. */
  function confirmTransferWindow() {
    if (!isDynasty || !$game.dynasty?.window) return;
    const { dynasty, lineup } = confirmWindow($game.dynasty, $game.dynasty.window, playerById);
    campaign = null;
    update({ dynasty: beginNextDynastyMajor(dynasty), selectedPlayers: lineup, seed: makeSeed(), majorRun: null, playedSeries: {}, stats: [], completedSeries: 0, phase: 'map-selection' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function endDynasty() {
    void confirmDialog({ title: t('dynastyEnd'), body: t('dynastyEndConfirm'), confirmLabel: t('dynastyEnd'), cancelLabel: t('cancel'), tone: 'danger' }).then((confirmed) => { if (confirmed) resetRun(true); });
  }

  const stageEntries = (run: MajorRun) => MAJOR_STAGES.filter((stage) => run.stages?.[stage]).map((stage) => ({ stage, record: run.stages![stage]! }));

  /** Keeps the drafted lineup and the map pool, draws a new Major and goes straight to Stage 3. */
  function playAgainWithSameLineup() {
    if (selectedLineup.length !== 5) return;
    resetSupportNudge();
    closePlayer();
    closeEnemyTeam();
    clearAdvanceTimer();
    stopLiveTick();
    awaitingAdvance = false;
    autoPausedHalf = '';
    campaign = null;
    update({ seed: makeSeed(), majorRun: null, playedSeries: {}, stats: [], completedSeries: 0, phase: 'map-selection' });
    launchMajor();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', $game.seed);
    if (($game.phase === 'result' || $game.phase === 'stats') && $game.majorRun && selectedLineup.length === 5 && !isDynasty) {
      url.searchParams.set('result', '1');
      url.searchParams.set('mode', $game.mode ?? 'premier');
      url.searchParams.set('style', $game.style);
      url.searchParams.set('picks', selectedLineup.map((selected) => `${selected.playerId}:${selected.selectedSlotRole}`).join(','));
      url.searchParams.set('maps', $game.selectedMaps.join(','));
      // The visitor replays the run on the same catalog; links without it (before the expansion) replay on core.
      url.searchParams.set('cat', $game.catalogVersion ?? 'core');
    } else {
      url.searchParams.delete('result');
      url.searchParams.delete('mode');
      url.searchParams.delete('style');
      url.searchParams.delete('picks');
      url.searchParams.delete('maps');
      url.searchParams.delete('cat');
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast(t('copied'));
    } catch {
      showToast(url.toString());
    }
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
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastTimer = null; toast = ''; }, 1800);
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
    if (currentSeries && isMajorStage(currentSeries.phase)) return hasStageRecord ? `${t(currentSeries.phase)} · ${stageWins}-${stageLosses}` : t(currentSeries.phase);
    if (currentSeries?.phase === 'quarterfinal') return t('quarterfinal');
    if (currentSeries?.phase === 'semifinal') return t('semifinal');
    if (currentSeries?.phase === 'final') return t('final');
    if ($game.phase === 'stage3') return hasStageRecord ? `${t(liveStage ?? 'stage3')} · ${stageWins}-${stageLosses}` : t(liveStage ?? 'stage3');
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

<SeoHead metadata={SEO_BY_ROUTE['/']} />
<svelte:head>
  <script type="application/ld+json">{JSON.stringify(HOME_STRUCTURED_DATA)}</script>
</svelte:head>

<Navbar
  language={$game.language}
  theme={$game.theme}
  onLanguage={(language) => update({ language })}
  onTheme={() => update({ theme: $game.theme === 'dark' ? 'light' : 'dark' })}
  onHome={goHome}
/>

<main>
  {#if $game.phase !== 'home' && $game.phase !== 'stage3' && $game.phase !== 'playoffs'}
    <div class="offline-settings shell"><AutomationGear value={strategicPreferences} language={$game.language} onChange={setStrategicPreferences} soundEnabled={$offlineSoundEnabled} onSoundChange={setOfflineSound} /></div>
  {/if}
  {#if isDynasty && $game.dynasty && $game.phase !== 'home' && $game.phase !== 'mode-select'}
    <div class="shell"><DynastyHeader dynasty={$game.dynasty} language={$game.language} coachName={dynastyCoach ? (dynastyCoach.confidence === 'placeholder' ? t('coachStaff') : dynastyCoach.name) : null} eraName={$game.dynasty.titles >= 2 ? `${t('dynastyEra')} ${userOrgLabel}` : null} liveStage={liveStage ? `${t(liveStage)} · ${stageWins}-${stageLosses}` : null} /></div>
  {/if}
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
          {#if isOnlineEnabled() || dev}<a class="secondary online-home-button" href="/online">{t('playOnline')} <span>↗</span></a>{/if}
        </div>
      </div>
      <HeroLive language={$game.language} />
    </section>
    <section class="feature-strip shell">
      <article><span>01</span><div><strong>{t('featureDraftTitle')}</strong><small>{t('featureDraftDesc')}</small></div></article>
      <article><span>02</span><div><strong>{t('featureSeedTitle')}</strong><small>{t('featureSeedDesc')}</small></div></article>
      <article><span>03</span><div><strong>{t('featureRulesTitle')}</strong><small>{t('featureRulesDesc')}</small></div></article>
    </section>
    <section class="seo-intro shell" aria-labelledby="seo-intro-title">
      <span class="eyebrow">COUNTER-STRIKE ATRAVÉS DAS ERAS</span>
      <h2 id="seo-intro-title">Seu campeonato, sua line, sua história</h2>
      <p>{HOME_SEO_COPY}</p>
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
        <button class="mode-card dynasty" type="button" on:click={() => chooseMode('dynasty')}>
          <span class="mode-number">04</span><span class="mode-icon">D</span><h2>{t('dynasty')}</h2><p>{t('dynastyDesc')}</p><b>LEGACY RUN →</b>
        </button>
      </div>
    </section>
  {:else if $game.phase === 'draft'}
    <section class="screen shell">
      <header class="draft-header">
        <div><span class="eyebrow">DRAFT ROOM · {$game.mode ? t($game.mode) : ''}</span><h1>{draftComplete ? t('complete') : `${t('opportunity')} ${selectedPlayers.length + 1}/5`}</h1></div>
        <button class="seed-button" type="button" on:click={copyLink}>SEED / {$game.seed}</button>
      </header>

      {#if !$game.styleLocked && needsStyleBeforeDraft($game.mode)}
        <section class="style-block panel">
          <div class="section-heading"><div><span class="eyebrow">TACTICAL IDENTITY</span><h2>{t('chooseStyle')}</h2></div></div>
          <p class="style-required">{t('chooseStyleBeforeRoll')}</p>
          <div class="segmented">
            {#each ORG_STYLES as style}
              <button type="button" on:click={() => update({ style, styleLocked: true })}>
                <strong>{t(style)}</strong>
                <small>{t(`${style}Desc` as Parameters<typeof t>[0])}</small>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if isDynasty && $game.dynasty}
        <section class="org-name-block panel">
          <span class="eyebrow">ORGANIZATION</span>
          {#if selectedPlayers.length === 0}
            <label class="org-name-field">
              <span>{teamNameLabel}</span>
              <input type="text" maxlength={TEAM_NAME_MAX} autocomplete="off" spellcheck="false" placeholder={t('yourOrg')} value={$game.dynasty.teamName ?? ''} on:input={(event) => setDynastyTeamName(event.currentTarget.value)} on:change={(event) => setDynastyTeamName(event.currentTarget.value, true)} />
            </label>
          {:else}
            <p class="org-name-locked"><span>{teamNameLabel}</span><strong>{userOrgLabel}</strong></p>
          {/if}
        </section>
      {/if}

      {#if !draftComplete}
        <section class="roll-zone panel">
          {#if !$game.styleLocked && needsStyleBeforeDraft($game.mode)}
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
          {:else if rouletteSpinning && rolledTeam}
            <DraftRoulette candidates={rouletteCandidates} result={rolledTeam} anonymous={isProMode} language={$game.language} onComplete={() => { rouletteSpinning = false; freshOffer = true; }} />
          {:else}
            {#if isProMode}
              <div class="team-banner blind-banner" class:roulette-impact={freshOffer} role="status">
                <div class="team-avatar">?</div>
                <div><span class="eyebrow">PRO BLIND OFFER</span><h2>{t('proBlindOffer')}</h2><p>{t('proBlindOfferDesc')}</p></div>
                <span class="team-power">?</span>
              </div>
            {:else}
              <div class="team-banner" class:roulette-impact={freshOffer} role="status">
                <div class="team-avatar">{(rolledTeam.name ?? 'T').slice(0, 2).toUpperCase()}</div>
                <div><span class="eyebrow">ROLLED TEAM</span><h2>{rolledTeam.name ?? 'Time'} <b>{rolledTeam.year ?? ''}</b></h2><p>{rolledTeam.game ?? 'CS'} · RANK #{rolledTeam.sourceRank ?? rolledTeam.rank ?? '—'} · {rolledTeam.rarity ?? 'standard'}</p></div>
                <span class="team-power">PWR {rolledTeam.teamPowerPreview ?? rolledTeam.power ? formatRating(rolledTeam.teamPowerPreview ?? rolledTeam.power ?? 0) : '—'}</span>
              </div>
            {/if}
            <div class="reroll-bar">
              <div><span class="eyebrow">{t('teamReroll')}</span><strong>{rerollsLeft}/{rerollsMax}</strong></div>
              <button class="secondary" type="button" disabled={!rerollsLeft} on:click={rerollTeam}>{t('rerollTeam')} <span>↻</span></button>
            </div>
            <p class="pick-instruction">{isProMode ? t('proBlindOfferDesc') : t('pickOne')}</p>
            <div class:pro-offer-grid={isProMode} class:is-fresh={freshOffer} class="player-grid roulette-reveal">
              {#each rolledPlayers as player, index (player.id)}
                <div class="roulette-player" data-offline-player={player.id} style={`--reveal-delay: ${index * 80}ms`}>
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
                </div>
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
              <span data-draft-slot={index} class:offline-slot-arrival={Boolean(recentPickId && proPickedPlayers[index]?.id === recentPickId)} class:filled={index < proPickedPlayers.length}>{proPickedPlayers[index]?.nickname ?? '?'}</span>
            {/each}
          </div>
        </section>
      {:else}
        <DraftHud
          offlineEffects={true}
          {recentPickId}
          celebrate={celebrateLineup}
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
          <article class="power-panel panel"><span class="eyebrow">ORG POWER INDEX</span><strong>{formatRating(userTeam.power)}</strong><div class="power-bar"><span style={`width:${userTeam.power}%`}></span></div><small>{t('estimatedPower')} · {t($game.style)}</small></article>
          <article class="panel composition"><span class="eyebrow">{t('composition')}</span><div class="warning-list">{#each compositionWarnings() as warning}<span>{warning}</span>{/each}{#if !compositionWarnings().length}<span>{t('compositionReady')}</span>{/if}</div></article>
        </section>
        {#if $game.mode === 'faceit'}<div class="reveal-note">INTEL UNLOCKED · {t('revealed')}</div>{/if}
        <button class="primary wide major-button" type="button" on:click={beginMapSelection}>{t('chooseMaps')} →</button>
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
          {#each ORG_STYLES as style}
            <button type="button" on:click={() => chooseProStyle(style)}>
              <strong>{t(style)}</strong>
              <small>{t(`${style}Desc` as Parameters<typeof t>[0])}</small>
            </button>
          {/each}
        </div>
      </section>
      <section class="hud panel pro-hud" class:offline-hud-complete={celebrateLineup}>
        <div><span class="eyebrow">PRO LINEUP / 5/5</span><h2>{t('proBlindDraft')}</h2></div>
        <div class="pro-hidden-slots">
          {#each Array(5) as _, index}<span class="filled" data-draft-slot={index} style={`--lineup-delay:${index * 85}ms`}>?</span>{/each}
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
      <section class="panel pro-reveal-panel" class:offline-hud-complete={celebrateLineup}>
        <div class="pro-reveal-grid">
          {#each proEvaluations as evaluation, index (evaluation.player.id)}
            <article class="pro-reveal-card fit-{evaluation.fit}" style={`--lineup-delay:${index * 85}ms`}>
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
        <article class="power-panel panel"><span class="eyebrow">PRO POWER INDEX</span><strong>{formatRating(userTeam.power)}</strong><div class="power-bar"><span style={`width:${userTeam.power}%`}></span></div><small>{t('estimatedPower')} · {t($game.style)}</small></article>
        <article class="panel composition"><span class="eyebrow">{t('composition')}</span><div class="warning-list">{#each compositionWarnings() as warning}<span>{warning}</span>{/each}{#if !compositionWarnings().length}<span>{t('compositionReady')}</span>{/if}</div></article>
      </section>
      <button class="primary wide major-button" type="button" on:click={beginMapSelection}>{t('chooseMaps')} →</button>
    </section>
  {:else if $game.phase === 'circuit' && $game.dynasty?.circuit}
    <section class="screen shell">
      {#if tipFor('circuit', tipState)}{@const tip = tipFor('circuit', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}
      {#snippet circuitLiveView()}
        <div class="circuit-live-view">
          <div class="circuit-live-controls panel">
            <button class="secondary" type="button" on:click={toggleCircuitLive}>{circuitLiveRunning ? t('watchPause') : t('watchResume')}</button>
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
          {#if circuitSeries && circuitView}
            {#key circuitSeries.id}
              <SeriesViewer
                userTeamName={dynastyTeamName}
                offlineEffects={true}
                series={circuitSeries}
                phaseLabel={`${getPhaseLabel(circuitSeries.phase)} · MD${circuitSeries.bestOf}`}
                delay={SPEEDS[$game.simSpeed]}
                controlled={true}
                controlledActiveMap={circuitView.activeMap}
                controlledVisibleRounds={circuitView.visibleRounds}
                controlledStarted={circuitView.started || circuitView.phase === 'side-pick' || circuitView.phase === 'live'}
                controlledFinished={circuitView.finished}
                controlledDelay={SPEEDS[$game.simSpeed]}
                simpleFeed={strategicPreferences.simpleFeed}
                language={$game.language}
                interactiveTeamId={circuitEnemyTeamId}
                labels={{ start: t('startSeries'), skip: t('skipMap'), round: t('round'), live: t('live'), map: t('map'), final: t('final'), waiting: t('waiting'), pending: t('pending'), inProgress: t('inProgress'), mapInProgress: t('mapInProgress'), veto: t('veto'), ban: t('ban'), pick: t('pick'), decider: t('decider'), notPlayed: t('mapNotPlayed'), mapStart: t('mapStart') }}
              />
            {/key}
          {/if}
          <div class="circuit-live-bracket panel">
            {#if circuitCampaign?.run.tournament}
              <MajorOverview userTeamName={dynastyTeamName} tournament={circuitCampaign.run.tournament} cursor={{ liveSeriesId: circuitSeries?.id ?? null }} userTeamId="user" language={$game.language} onTeam={openOverviewTeam} />
            {:else}
              <PlayoffBracket columns={circuitBracket} userTeamId="user" userTeamName={dynastyTeamName} championId={null} labels={{ quarterfinal: t('quarterfinal'), semifinal: t('semifinal'), final: t('final'), tbd: t('tbd'), live: t('live'), pending: t('pending') }} />
            {/if}
          </div>
        </div>
      {/snippet}
      <DynastyCircuit circuit={$game.dynasty.circuit} language={$game.language} cash={$game.dynasty.cash} playing={circuitPlaying} {teamById} userTeamName={dynastyTeamName} live={circuitCampaign ? circuitLiveView : null} onPlay={playCircuit} onSkip={skipCircuit} onContinue={continueFromCircuit} onTeam={pinEnemyTeam} />
    </section>
  {:else if $game.phase === 'window' && $game.dynasty?.window}
    <section class="screen shell">
      <header class="screen-header"><span class="eyebrow">DINASTIA · {t('dynastyMajorNumber')} #{$game.dynasty.majorNumber}</span><h1>{t('dynastyWindow')}</h1><p>{t('windowIntro')}</p></header>
      {#if tipFor('window', tipState)}{@const tip = tipFor('window', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}
      {#if ($game.dynasty.window.swapOffers?.length ?? 0) > 0 && !tipFor('window', tipState) && tipFor('swap', tipState)}{@const tip = tipFor('swap', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}
      <DynastyWindow state={$game.dynasty.window} language={$game.language} {playerById} {coachById} currentCoach={dynastyCoach} catalog={players} history={$game.dynasty.history} teamLabel={coachTeamLabel} onChange={updateTransferWindow} onConfirm={confirmTransferWindow} />
    </section>
  {:else if $game.phase === 'coach-draft'}
    <section class="screen shell">
      <header class="screen-header"><span class="eyebrow">DINASTIA · IDENTIDADE</span><h1>{t('chooseStyle')} + {t('coachDraftTitle')}</h1><p>{t('coachDraftDesc')}</p></header>
      {#if tipFor('identity', tipState)}{@const tip = tipFor('identity', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}
      <section class="style-block panel"><div class="segmented">
        {#each ORG_STYLES as style}
          <button class:active={$game.styleLocked && $game.style === style} type="button" on:click={() => chooseDynastyStyle(style)}><strong>{style === 'balanced' ? ($game.language === 'en' ? 'Controller' : 'Controlador') : t(style)}</strong><small>{t(`${style}Desc` as Parameters<typeof t>[0])}</small></button>
        {/each}
      </div></section>
      {#if $game.styleLocked}<CoachDraft offer={coachOffer} language={$game.language} rerollsLeft={COACH_REROLLS - ($game.dynasty?.coachRerollsUsed ?? 0)} teamLabel={coachTeamLabel} onPick={pickCoach} onReroll={rerollCoaches} />{/if}
    </section>
  {:else if $game.phase === 'map-selection'}
    <section class="screen shell map-selection-screen">
      <header class="screen-header centered">
        <span class="eyebrow">ACTIVE DUTY 2016–2026 · 3/11</span>
        <h1>{t('chooseMapsTitle')}</h1>
        <p>{t('chooseMapsDesc')}</p>
      </header>
      <div class="map-selection-status panel">
        <span>{t('mapsSelected')}</span>
        <strong>{$game.selectedMaps.length}/3</strong>
      </div>
      {#if isDynasty && $game.dynasty?.majorRules === 2 && $game.dynasty.major}
        {#if tipFor('training', tipState)}{@const tip = tipFor('training', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}
        <DynastyTraining language={$game.language} value={$game.dynasty.major.training} suggested={dynastyTrainingSuggestion} onChange={chooseTraining} />
      {/if}
      <div class="map-selection-grid">
        {#each MAP_POOL as mapId}
          {@const contributors = mapContributors[mapId]}
          {@const affinity = getMapAffinity(contributors.length)}
          {@const selected = $game.selectedMaps.includes(mapId)}
          <button
            class="map-selection-card"
            class:selected
            type="button"
            aria-pressed={selected}
            disabled={contributors.length === 0 || (!selected && $game.selectedMaps.length >= 3)}
            on:click={() => toggleMap(mapId)}
          >
            <span class="map-selection-index">{String(MAP_POOL.indexOf(mapId) + 1).padStart(2, '0')}</span>
            <strong>{getMapName(mapId)}</strong>
            <b class:even={affinity === 'EVEN'}>{affinity}</b>
            <small>{getMapFamiliarity(contributors.length)}% · {contributors.length}/5 {t('playerAffinity')} · {mapYears[mapId].join(', ') || '—'}</small>
            <div class="map-contributors" aria-label={`${contributors.length}/5 ${t('playerAffinity')}`}>
              {#each selectedPlayers as player}
                <span class:contributes={contributors.some((contributor) => contributor.id === player.id)} title={player.nickname ?? player.id}>
                  {(player.nickname ?? '?').slice(0, 2).toUpperCase()}
                </span>
              {/each}
            </div>
          </button>
        {/each}
      </div>
      <div class="map-selection-actions">
        <button class="secondary" type="button" on:click={returnToLineup}>{t('backToLineup')}</button>
        <button class="secondary" type="button" on:click={autoSelectMaps}>{t('autoSelectMaps')}</button>
        <button class="primary" type="button" disabled={!isValidLineupMapSelection($game.selectedMaps, selectedPlayers, teams) || (isDynasty && $game.dynasty?.majorRules === 2 && !$game.dynasty.major?.training)} on:click={launchMajor}>{t('confirmMaps')} →</button>
      </div>
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
          <div class="control-row">
            <SegmentedControl
              value={$game.simSpeed}
              label={t('speed')}
              options={[{ value: 'normal', label: t('normal') }, { value: 'fast', label: t('fast') }, { value: 'ultra', label: t('ultra') }]}
              onChange={changeSimulationSpeed}
            />
            <div class="sim-tools">
              <button class="sim-pause-button" type="button" aria-pressed={simPaused} aria-label={simPaused ? t('simResume') : t('simPause')} title={simPaused ? t('simResume') : t('simPause')} on:click={toggleSimPause}>
                {#if simPaused}
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6.5" y="5" width="4" height="14" rx="1" /><rect x="13.5" y="5" width="4" height="14" rx="1" /></svg>
                {/if}
              </button>
              <AutomationGear value={strategicPreferences} language={$game.language} onChange={setStrategicPreferences} soundEnabled={$offlineSoundEnabled} onSoundChange={setOfflineSound} />
            </div>
          </div>
          {#if simPaused}<small class="sim-paused-indicator" role="status">{t('simPaused')}</small>{/if}
        </div>
      </div>
      {#if $game.majorRun?.tournament}
        <div class="major-tabs"><SegmentedControl value={majorTab} label={t('overviewMajor')} options={[{ value: 'current', label: t('overviewMyMatch') }, { value: 'all', label: t('overviewMajor') }, ...(isDynasty ? [{ value: 'team', label: $game.language === 'en' ? 'Team' : $game.language === 'es' ? 'Equipo' : 'Time' }] : [])]} onChange={(value) => majorTab = value === 'all' ? 'all' : value === 'team' ? 'team' : 'current'} /></div>
      {/if}
      {#if isDynasty && $game.dynasty?.major}
        <div hidden={majorTab !== 'team'}>{#if tipFor('team-tab', tipState)}{@const tip = tipFor('team-tab', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}<DynastyTeamPanel players={selectedPlayers} coach={dynastyCoach} plan={activeDynastyPlan} power={userTeam.power} studiesLeft={dynastyStudiesLeft} training={$game.dynasty.major.training} language={$game.language} lineup={selectedLineup} history={$game.dynasty.history} {playerById} overrides={$game.dynasty.playerOverrides} teamLabel={coachTeamLabel} /></div>
      {/if}
      <div hidden={majorTab !== 'current'}>
      {#if currentSeries}
        {#if isDynasty && $game.dynasty?.major && !dynastySeriesPlanned}
          {#if tipFor('series-plan', tipState)}{@const tip = tipFor('series-plan', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}
          <DynastySeriesPlan language={$game.language} opponent={translateTeamName($game.language, currentSeries.teamB.name, dynastyTeamName)} studiesLeft={dynastyStudiesLeft} initial={dynastyPlanInitial ?? $game.dynasty.major.basePlan} onConfirm={confirmDynastyPlan} />
        {/if}
        {#if campaignView && !campaignView.finished}
          {#if dynastySeriesPlanned && campaignView.phase === 'veto' && campaignView.veto}
            <VetoBoard
              available={campaignView.veto.available}
              steps={campaignView.veto.steps}
              turnTeamId={campaignView.veto.turnTeamId}
              action={campaignView.veto.action}
              teamNames={liveTeamNames}
              myTeamId="user"
              familiarity={userFamiliarity}
              language={$game.language}
              onAction={decideVeto}
            />
          {/if}
          {#if dynastySeriesPlanned && campaignPending?.kind === 'side'}
            <SidePickPrompt mapId={campaignPending.mapId} decider={currentSeries.maps[campaignPending.mapIndex]?.pickedBy === null} language={$game.language} onPick={decideSide} />
          {:else if campaignPending?.kind === 'eco-call'}
            <EcoCallPrompt roundNumber={campaignPending.roundNumber} money={campaignPending.money} language={$game.language} onCall={decideEco} />
          {/if}
          {#if dynastySeriesPlanned && campaignView.phase !== 'veto' && !campaignPending}
            <div class="live-actions">
              <div class="live-buttons">
                {#if !strategicPreferences.autoPause && campaignView.phase === 'live'}<TimeoutButton remaining={campaignView.timeoutsLeft} timing={campaignView.timeoutTiming} disabled={Boolean(campaignPending)} language={$game.language} onCall={requestCampaignTimeout} />{/if}
                {#if !liveRunning}
                  <button class="primary live-button" type="button" on:click={() => { liveRunning = true; }}>{t('startSeries')}</button>
                {:else}
                  <button class="secondary live-button" type="button" on:click={skipCurrentMap}>{t('skipMap')}</button>
                {/if}
              </div>
              {#if campaignView.phase === 'live'}<small>{t('sideLabel')}: {campaignView.userSide ? (campaignView.userSide === 'ct' ? 'CT' : $game.language === 'en' ? 'T' : 'TR') : '—'}</small>{/if}
            </div>
          {/if}
        {/if}
        {#key currentSeries.id}
          <SeriesViewer
                userTeamName={dynastyTeamName}
            offlineEffects={true}
            series={currentSeries}
            phaseLabel={`${getPhaseLabel(currentSeries.phase)} · MD${currentSeries.bestOf}`}
            delay={SPEEDS[$game.simSpeed]}
            auto={campaignChecked && !campaignView && $game.simMode === 'auto'}
            controlled={Boolean(campaignView)}
            controlledActiveMap={campaignView?.activeMap ?? 0}
            controlledVisibleRounds={campaignView?.visibleRounds ?? 0}
            controlledStarted={Boolean(campaignView && (campaignView.started || campaignView.phase === 'side-pick' || campaignView.phase === 'live'))}
            controlledFinished={Boolean(campaignView?.finished)}
            controlledDelay={SPEEDS[$game.simSpeed]}
            simpleFeed={strategicPreferences.simpleFeed}
            language={$game.language}
            interactiveTeamId={enemyTeamId}
            labels={{ start: t('startSeries'), skip: t('skipMap'), round: t('round'), live: t('live'), map: t('map'), final: t('final'), waiting: t('waiting'), pending: t('pending'), inProgress: t('inProgress'), mapInProgress: t('mapInProgress'), veto: t('veto'), ban: t('ban'), pick: t('pick'), decider: t('decider'), notPlayed: t('mapNotPlayed'), mapStart: t('mapStart') }}
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
                    <span class="timeline-team-left">{translateTeamName($game.language, userTeam.name, dynastyTeamName)}</span>
                    <b class="timeline-score">{match.scoreA} : {match.scoreB}</b>
                    <span class="timeline-team-right">{translateTeamName($game.language, enemyTeam.name, dynastyTeamName)}</span>
                  </button>
                  {#if expandedTimelineMatch === match.id}
                    <div class="timeline-maps">
                      {#each match.maps as map}
                        <span class="timeline-map">{getMapName(map.mapId, map.map, t('map'))} · {map.scoreA} x {map.scoreB} {map.overtime ? '· OT' : ''}</span>
                      {/each}
                    </div>
                  {/if}
                {/each}
                {#if showLiveInThisPhase}
                  {@const liveUserTeam = currentSeries.teamA.isUser ? currentSeries.teamA : currentSeries.teamB}
                  {@const liveEnemyTeam = currentSeries.teamA.isUser ? currentSeries.teamB : currentSeries.teamA}
                  <div class="timeline-match timeline-live">
                    <span class="timeline-team-left">{translateTeamName($game.language, liveUserTeam.name, dynastyTeamName)}</span>
                    <div class="timeline-live-center">
                      <span class="timeline-live-badge">AO VIVO</span>
                    </div>
                    <span class="timeline-team-right">{translateTeamName($game.language, liveEnemyTeam.name, dynastyTeamName)}</span>
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
                  <span class="timeline-team-left">{translateTeamName($game.language, liveUserTeam.name, dynastyTeamName)}</span>
                  <div class="timeline-live-center">
                    <span class="timeline-live-badge">AO VIVO</span>
                  </div>
                  <span class="timeline-team-right">{translateTeamName($game.language, liveEnemyTeam.name, dynastyTeamName)}</span>
                </div>
              </div>
            </div>
          {/if}
        </div>
        {#if !completedMatches.length && !currentSeries}
          <p class="timeline-empty">{t('waitingResult')}</p>
        {/if}
      </aside>
      </div>
      {#if $game.majorRun?.tournament}
        <div hidden={majorTab !== 'all'}>
          <MajorOverview userTeamName={dynastyTeamName} tournament={$game.majorRun.tournament} cursor={{ liveSeriesId: currentSeries?.id ?? null }} userTeamId="user" language={$game.language} onTeam={openOverviewTeam} />
        </div>
      {/if}
    </section>
  {:else if $game.phase === 'result'}
    {@const run = $game.majorRun}
    {#if run}
      {@const wonSeries = run.matches.filter((match) => match.winnerId === 'user').length}
      {@const summary = getRunSummary(run)}
      <section class="screen shell result-screen">
        <header class:success={run.champion} class="result-hero"><span class="eyebrow">FINAL REPORT / {$game.seed}</span><h1>{run.champion ? t('champion') : t('eliminated')}</h1><p>{translatePlacement($game.language, run.placement)}</p></header>
        <div class="campaign-grid">
          {#if run.stages}{#each stageEntries(run) as entry (entry.stage)}<article><small>{t(entry.stage).toUpperCase()}</small><strong>{entry.record.wins}-{entry.record.losses}</strong></article>{/each}{:else}<article><small>STAGE 3</small><strong>{run.stage3.wins}-{run.stage3.losses}</strong></article>{/if}{#if isDynasty}<article><small>{t('dynastyPrize')}</small><strong>{formatUsd(prizeForPlacement(run.placement) + awardsBonus(run.tournament?.awards, selectedLineup.map((selected) => selected.playerId)), $game.language)}</strong></article>{/if}<article><small>{t('placement')}</small><strong>{translatePlacement($game.language, run.placement)}</strong></article><article><small>{t('seriesWon')}</small><strong>{wonSeries}</strong></article><article><small>{t('seriesLost')}</small><strong>{run.matches.length - wonSeries}</strong></article><article><small>{t('mapsWon')}</small><strong>{summary.mapsWon}</strong></article><article><small>{t('mapsLost')}</small><strong>{summary.mapsLost}</strong></article><article><small>{t('roundsWon')}</small><strong>{summary.roundsWon}</strong></article><article><small>{t('roundsLost')}</small><strong>{summary.roundsLost}</strong></article>
        </div>
        <section class="result-awards">
          <div class="section-heading"><div><span class="eyebrow">MAJOR AWARDS</span><h2>{t('majorMvp')}</h2></div></div>
          <MajorAwardsPanel userTeamName={dynastyTeamName} awards={run.tournament?.awards ?? null} language={$game.language} userTeamId="user" onTeam={openOverviewTeam} />
        </section>
        <CollapsibleStats id="run-stats" eyebrow="POST-MAJOR ANALYTICS" title={t('stats')} language={$game.language} bind:open={resultStatsOpen}>
          {#if runAggregate}
            <div class="campaign-grid stats-overview">
              <article><small>{t('mapsPlayed')}</small><strong>{runAggregate.mapsPlayed}</strong></article><article><small>{t('mapsWon')}</small><strong>{runAggregate.mapsWon}</strong></article><article><small>{t('mapsLost')}</small><strong>{runAggregate.mapsLost}</strong></article><article><small>{t('roundsWon')}</small><strong>{runAggregate.roundsWon}</strong></article><article><small>{t('roundsLost')}</small><strong>{runAggregate.roundsLost}</strong></article><article><small>KILLS</small><strong>{runAggregate.kills}</strong></article><article><small>DEATHS</small><strong>{runAggregate.deaths}</strong></article><article><small>K/D</small><strong>{runAggregate.kdRatio.toFixed(2)}</strong></article><article><small>ADR</small><strong>{runAggregate.adr}</strong></article><article><small>IMPACT</small><strong>{runAggregate.impact.toFixed(2)}</strong></article><article><small>CLUTCHES</small><strong>{runAggregate.clutches}</strong></article><article><small>OPENINGS</small><strong>{runAggregate.openingKills}</strong></article><article><small>RATING</small><strong>{runAggregate.rating.toFixed(2)}</strong></article>
            </div>
          {/if}
          <RunStatsGrid stats={$game.stats} language={$game.language} players={proAdjustedPlayers} />
        </CollapsibleStats>
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
                      <span class="timeline-team-left">{translateTeamName($game.language, userTeam.name, dynastyTeamName)}</span>
                      <b class="timeline-score">{match.scoreA} : {match.scoreB}</b>
                      <span class="timeline-team-right">{translateTeamName($game.language, enemyTeam.name, dynastyTeamName)}</span>
                    </button>
                    {#if expandedTimelineMatch === match.id}
                      <div class="timeline-maps">
                        {#each match.maps as map}
                          <span class="timeline-map">{getMapName(map.mapId, map.map, t('map'))} · {map.scoreA} x {map.scoreB} {map.overtime ? '· OT' : ''}</span>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>
        {#if run.tournament}
          <section class="result-overview">
            <div class="section-heading"><div><span class="eyebrow">MAJOR</span><h2>{t('overviewMajor')}</h2></div></div>
            <MajorOverview userTeamName={dynastyTeamName} tournament={run.tournament} cursor={{ liveSeriesId: null, complete: true }} userTeamId="user" language={$game.language} onTeam={openOverviewTeam} />
          </section>
        {/if}
        {#if isDynasty && $game.dynasty && $game.dynasty.history.length}
          <section class="panel dynasty-history">
            <div class="section-heading"><div><span class="eyebrow">DINASTIA</span><h2>{t('dynastyHistory')}</h2></div></div>
            <ul>
              {#each $game.dynasty.history as item (item.majorNumber)}
                <li><b>{t('dynastyMajorNumber')} #{item.majorNumber}</b> · {t(item.entryStage)} → {translatePlacement($game.language, item.placement)} · {formatUsd(item.prize + item.awardsBonus, $game.language)}</li>
              {/each}
            </ul>
          </section>
        {/if}
        <ShareRunCard seed={$game.seed} {run} players={selectedPlayers} lineup={selectedLineup} stats={$game.stats} mode={$game.mode} language={$game.language} labels={{ champion: t('champion'), eliminated: t('eliminated'), placement: t('placement'), record: t('record'), maps: t('maps'), mvp: t('runMvp') }} lineage={isDynasty && $game.dynasty ? buildDynastyLineage($game.dynasty.history, playerById) : []} lineageLabel={t('lineageTitle')} eraLabel={isDynasty && $game.dynasty && $game.dynasty.titles >= 2 ? `${t('dynastyEra')} ${userOrgLabel}` : null} />
        <div class="result-actions">{#if isDynasty}<button class="primary" type="button" disabled={selectedLineup.length !== 5} on:click={startNextDynastyMajor}>{$game.dynasty?.window?.majorNumber === $game.dynasty?.majorNumber || $game.dynasty?.circuit?.finished ? t('dynastyWindow') : ($game.language === 'en' ? 'Circuit' : $game.language === 'es' ? 'Circuito' : 'Circuito')}</button>{:else}<button class="primary" type="button" on:click={() => resetRun(true)}>{t('tryAgain')}</button>{/if}<button class="secondary" type="button" aria-expanded={resultStatsOpen} aria-controls="run-stats" on:click={() => { resultStatsOpen = !resultStatsOpen; if (resultStatsOpen) tick().then(() => document.getElementById('run-stats')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>{resultStatsOpen ? t('hideStats') : t('seeStats')}</button>{#if !isDynasty}<button class="secondary" type="button" on:click={copyLink}>{t('copyRunLink')}</button>{/if}<button class="secondary" type="button" disabled={downloadingImage} on:click={downloadRunImage}>{t('downloadRunImage')}</button>{#if isDynasty}<button class="ghost" type="button" on:click={endDynasty}>{t('dynastyEnd')}</button>{:else}<button class="secondary" type="button" disabled={selectedLineup.length !== 5} on:click={playAgainWithSameLineup}>{t('sameLineupNewMajor')}</button><button class="ghost" type="button" on:click={() => resetRun(false)}>{t('playSameSeed')}</button>{/if}</div>
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
      <RunStatsGrid stats={$game.stats} language={$game.language} players={proAdjustedPlayers} />
      <RunHighlights matches={$game.majorRun?.matches ?? []} userTeamId="user" language={$game.language} />
      <button class="secondary wide" type="button" on:click={() => update({ phase: 'result' })}>{t('backResult')}</button>
    </section>
  {/if}
</main>

{#if flight}
  {#key flight.id}
    <FlyingPick name={flight.name} source={flight.source} slot={flight.slot} onComplete={() => { flight = null; }} />
  {/key}
{/if}

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
      credits: t('credits'),
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
<ConfirmDialog />

<style>
  .offline-settings { display: flex; justify-content: flex-end; padding-top: 12px; }
  .live-actions{position:sticky;top:8px;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;margin:0 0 12px;padding:6px 10px;border:1px solid var(--line);background:var(--surface)}
  .live-actions small{color:var(--muted);font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  @media (max-width:560px){.live-actions{flex-wrap:wrap}.live-actions small{order:3;flex-basis:100%}}
  .dynasty-history ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}.dynasty-history li{font-size:.85rem}.dynasty-history b{color:var(--accent)}
  .circuit-live-view{display:grid;gap:14px;min-width:0}
  .circuit-live-controls{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:12px;padding:12px}
  .circuit-live-controls .secondary{min-height:42px}
  .circuit-live-controls .control-group{min-width:200px}
  .circuit-live-bracket{padding:14px;overflow-x:auto}
  .org-name-block{display:grid;gap:10px;padding:16px 20px;margin-bottom:18px}
  .org-name-field{display:grid;gap:6px}
  .org-name-field span,.org-name-locked span{color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}
  .org-name-field input{width:100%;max-width:420px;padding:12px 14px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:800 1.1rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.04em;text-transform:uppercase;outline:none;transition:border-color .15s ease}
  .org-name-field input::placeholder{color:var(--muted);opacity:.7}
  .org-name-field input:focus-visible{border-color:var(--accent)}
  .org-name-locked{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin:0}
  .org-name-locked strong{font:800 1.1rem 'Arial Narrow',Impact,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--accent)}
  .sim-tools{display:flex;gap:8px;align-items:stretch}
  .sim-pause-button{display:inline-flex;align-items:center;justify-content:center;height:100%;min-height:var(--gear-size,48px);aspect-ratio:1/1;padding:0;border:1px solid var(--line);border-radius:2px;color:var(--muted);background:var(--surface-2);cursor:pointer;transition:color .18s ease,border-color .18s ease}
  .sim-pause-button:hover,.sim-pause-button:focus-visible,.sim-pause-button[aria-pressed="true"]{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
  .sim-pause-button svg{width:18px;height:18px}
  .sim-paused-indicator{color:var(--accent);font-size:.66rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
</style>
