<script lang="ts">
  // Modo Carreira de Jogador (RPG "Do Lan House ao Major"). A partida ao vivo é o SeriesViewer do jogo
  // (modo controlado: o motor anda round a round e o feed/strip/placar são os componentes de sempre); no round
  // decisivo do mapa a simulação PARA e a decisão é sua — situação da matriz da sua função (decisions.ts),
  // 3 alternativas, edge na probabilidade e o RNG do motor decide o round. Estado local, sem servidor.
  import { onDestroy, onMount } from 'svelte';
  import '../../app.css';
  import Navbar from '$lib/components/Navbar.svelte';
  import { game } from '$lib/game/store';
  import CareerCard from '$lib/components/CareerCard.svelte';
  import RunStatsGrid from '$lib/components/RunStatsGrid.svelte';
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import SeriesViewer from '$lib/components/SeriesViewer.svelte';
  import { LAST_ROUND_FEED_FACTOR } from '$lib/game/seriesPresentation';
  import { ATTR_LABEL, CATEGORY_LABEL, ROLE_SKILLS, TRAINABLE, TIRED_AT, actionChips, applyAgenda, applyCustomTraining, coachTalk, coachTalksLeft, coachTipsOf, customTrainingSplit, drawAgenda, type AgendaChip } from '$lib/game/playerCareer/agenda';
  import type { Player, PlayerRunStats } from '$lib/game/types';
  import type { CampaignMajorState } from '$lib/game/campaign-major';
  import type { LiveSeriesState } from '$lib/game/online/live-series';
  import { getCurrentSideA } from '$lib/game/rounds';
  import { MAP_NAMES } from '$lib/game/maps';
  import { toSeriesResult } from '$lib/game/online/live-series';
  import { createRunStats } from '$lib/game/runStats';
  import { clutchStory, type ClutchProfile } from '$lib/game/playerCareer/decisions';
  import {
    ARCHETYPES, ROLE_META, acceptMove, agePhase, acceptOffer, declineMove, goToLanHouse, midSeasonCheck, chooseStartingOrg, createPlayerCareer, ensureDraw, eventsFor, finishSeason,
    marketValueUsd, orgOf, recordEventResult, retire, seatToTake, startSeason, stayAtOrg,
    type PlayerArchetype, type PlayerCareerState, type PlayerRole, type TournamentResult, type TrainedAttribute
  } from '$lib/game/playerCareer/engine';
  import { NEXT_STAGE, PLACEMENT_ORDER, STAGE_NAME, advanceToFinal, advancedFromSwiss, eventDone, eventSetup, finishSceneEvent, finishSceneStage, majorEntryStage, notQualified, swissRecord, type EventSetup, type MajorStageKey, type StageCarry, lineupOf, playClutchRound, sceneEventField, sceneEventResult, simulateSceneEvent, userBracketPath, type SceneEventOutcome, sceneOrgEnginePlayers, serializeSceneEvent, startSceneEvent, stepSceneEvent, type SceneClutchContext, type SceneClutchMoment } from '$lib/game/playerCareer/live';
  import { celebrateResult, coachOf, ensureSquad, matesOf, myPlayerOf, synergyBump, talkTo, trainingWindowOf, type SquadMate } from '$lib/game/playerCareer/squad';
  import { sceneCountries, sceneOrgById } from '$lib/game/playerCareer/data';
  import { headlineTransfers, orgIn } from '$lib/game/playerCareer/world';
  import { MONTH_LABEL, TIER_LABEL } from '$lib/game/playerCareer/calendar';

  const STORAGE_KEY = 'cs13a0-player-career-v1';
  const PLACEMENT: Record<string, string> = { quarter: 'Quartas', semi: 'Semis', runnerUp: 'Vice', champion: 'Campeão' };
  const LEVEL_LABEL: Record<number, string> = { 1: 'Tier 1 · Major', 2: 'Tier 2 · Invites', 3: 'Challenger', 4: 'CCT/GC · circuito real', 5: 'Lan House' };
  /** O mesmo controle de velocidade do resto do jogo (sandbox): mesmos rótulos, mesmos delays. Padrão ULTRA. */
  const SPEED_DELAYS = { normal: 1500, fast: 650, ultra: 180, insta: 0 } as const;
  const SPEED_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Rápido' },
    { value: 'ultra', label: 'Ultra' },
    { value: 'insta', label: 'Insta' }
  ];
  /** A pirâmide da cena, de cima pra baixo: onde a carreira pode chegar e onde você está. */
  const PYRAMID = [
    { level: 1, label: 'Tier 1 · Major', short: 'Major' },
    { level: 2, label: 'Tier 2', short: 'Tier 2' },
    { level: 3, label: 'Challenger', short: 'Chall.' },
    { level: 4, label: 'CCT / GC', short: 'CCT' },
    { level: 5, label: 'Lan House', short: 'Lan' }
  ];
  /** O risco de cada call, do jeito que resolveClutchEdge (decisions.ts) de fato resolve o round. */
  const RISK: Record<ClutchProfile, { label: string; hint: string }> = {
    solid: { label: 'Seguro', hint: 'Empurrão pequeno e garantido a seu favor.' },
    read: { label: 'Leitura', hint: 'Rende mais quanto maior o seu overall contra o deles.' },
    gamble: { label: 'All-in', hint: 'Moeda: ou ganha o round no braço, ou custa caro.' },
    team: { label: 'Coletivo', hint: 'Depende do nível dos parceiros contra o deles.' }
  };
  const MONTH_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  type PlayMode = NonNullable<PlayerCareerState['playMode']>;
  const PLAY_MODE_OPTIONS = [
    { value: 'all', label: 'Jogar todos' },
    { value: 'every2', label: '1 a cada 2' },
    { value: 'finals', label: 'Só as finais' }
  ];
  const PACE_CTA = { live: 'Jogar campeonato', sim: 'Simular campeonato', final: 'Simular até a final' } as const;
  /** Colocação curta pro quadradinho do calendário. */
  const PLACE_SHORT: Record<string, string> = { Quartas: 'Quartas', Semis: 'Semi', Vice: 'Vice', 'Campeão': 'Título', 'Fase suíça': 'Suíça', 'Stage 1': 'Stage 1', 'Stage 2': 'Stage 2', 'Não classificado': 'Fora' };
  /** Colocação → chave de CSS sem espaço nem acento. */
  const PLACE_KEY: Record<string, string> = { Quartas: 'Quartas', Semis: 'Semis', Vice: 'Vice', 'Campeão': 'Campeão', 'Fase suíça': 'Suica', 'Stage 1': 'Stage', 'Stage 2': 'Stage', 'Não classificado': 'Fora' };
  const placeKey = (placement: string | undefined) => (placement ? PLACE_KEY[placement] ?? 'Quartas' : 'none');
  const FORMAT_TEXT = (entry: { format?: string; finalBestOf?: number } | null | undefined) =>
    entry?.format === 'major' ? 'Major: Stage 1 e 2 em suíça de 16 (3 vitórias avança); Stage 3 suíça + playoffs, final MD5'
      : entry?.format === 'swiss16' ? `16 times: suíça MD3 e mata-mata de 8, final MD${entry.finalBestOf ?? 5}`
      : `8 times: quartas e semis MD3, final MD${entry?.finalBestOf ?? 3}`;
  /** Função curta pra caber na carta. */
  const ROLE_SHORT: Record<PlayerRole, string> = { awper: 'AWPer', rifler: 'Rifler', entry: 'Entry', igl: 'IGL', lurker: 'Lurker', support: 'Suporte' };
  const COACH_ATTRS = [
    { key: 'tactics', label: 'Tática' },
    { key: 'discipline', label: 'Disciplina' },
    { key: 'aggression', label: 'Agressão' },
    { key: 'development', label: 'Desenv.' }
  ] as const;
  const VIEWER_LABELS = {
    start: 'Iniciar série', skip: 'Pular mapa', round: 'Round', live: 'AO VIVO', map: 'Mapa', final: 'FINAL',
    waiting: 'Aguardando', pending: 'A disputar', inProgress: 'Em andamento', mapInProgress: 'Mapa em progresso',
    veto: 'Veto', ban: 'Ban', pick: 'Pick', decider: 'Decider', notPlayed: 'Não disputado', mapStart: 'Início do mapa'
  };

  let career: PlayerCareerState | null = null;
  let nick = 'cascavel';
  let country = 'Brazil';
  let role: PlayerRole = 'awper';
  let archetype: PlayerArchetype = 'prodigio';

  let live: CampaignMajorState | null = null;
  let liveIndex = -1;
  /** Major: stage em andamento, séries dos stages anteriores e o formato do campeonato ao vivo. */
  let liveStage: MajorStageKey | null = null;
  let stageCarry: StageCarry = { wins: 0, losses: 0 };
  let liveSetup: EventSetup = { swiss: false, swissOnly: false, opponents: 7, levels: [3, 5], finalBestOf: 3, stage: null };
  let stageBanner: string | null = null;
  let clutch: SceneClutchMoment | null = null;
  let lastCall: { text: string; won: boolean; story: string } | null = null;
  let callOutcome: { text: string; won: boolean; story: string } | null = null;
  /** O round decisivo acabou de rodar: o kill feed ainda está contando a história. */
  let resolving = false;
  /** Enquanto o round decisivo roda (e o resultado está na tela), o viewer fica parado no mapa/round da sua
   *  call — senão, quando a call fecha o mapa ou a série, ele pula pro próximo antes do kill feed tocar. */
  let frozenView: { map: number; round: number } | null = null;
  let resolveFallback: number | null = null;
  let pendingOutcome: { text: string; won: boolean; story: string } | null = null;
  let matesOverall = 70;
  let running = false;
  let speed: keyof typeof SPEED_DELAYS = 'ultra';
  let runToken = 0;
  let usedIds: string[] = [];
  let detailsPlayer: Player | null = null;
  let sheetMate: SquadMate | null = null;
  let sheetIsMe = false;
  let opponentOrgId: string | null = null;
  /** Nas próximas calls o jogo decide no seu estilo (o perfil da última call que você fez). */
  let autoCall = false;
  let autoProfile: ClutchProfile = 'solid';
  let menuOpen = false;
  let statsOpen = false;
  /** Campeonato aberto no detalhe do calendário (índice) — null fechado. */
  let eventSheet: number | null = null;
  let eventError: string | null = null;
  /** Ação destrutiva esperando confirmação (apagar a carreira, pendurar o mouse). */
  let confirming: { title: string; body: string; confirmLabel: string; danger: boolean; run: () => void } | null = null;
  let lastTalk: { mateId: string; line: string; delta: number } | null = null;
  /** Treino livre: as habilidades marcadas (até 4). */
  let pickedSkills: TrainedAttribute[] = [];
  /** O que aconteceu na semana (escolha feita) e o último retorno do coach. */
  let weekLine: string | null = null;
  let weekChips: AgendaChip[] = [];
  let coachLine: string | null = null;
  let lastEventReport: { name: string; placement: string; rating: number; wins: number; losses: number; stats: PlayerRunStats[]; players: Player[] } | null = null;

  $: if (career) persist(career);

  function persist(state: PlayerCareerState) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* modo anônimo: só na memória */ }
  }

  function persistUsedIds() {
    if (!career) return;
    try { localStorage.setItem(`${STORAGE_KEY}:situations:${career.seed}`, JSON.stringify(usedIds)); } catch { /* noop */ }
  }

  function loadUsedIds(seed: string) {
    try { usedIds = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:situations:${seed}`) ?? '[]') as string[]; } catch { usedIds = []; }
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) career = ensureSquad(ensureDraw(JSON.parse(saved) as PlayerCareerState));
    } catch { /* save corrompido: começa do zero */ }
  });

  function openSheet(player: Player) {
    detailsPlayer = player;
    document.body.classList.add('modal-open');
  }

  function closeSheet() {
    detailsPlayer = null;
    sheetMate = null;
    sheetIsMe = false;
    document.body.classList.remove('modal-open');
  }

  function openMateSheet(mate: SquadMate) {
    sheetMate = mate;
    sheetIsMe = false;
    detailsPlayer = mate.player;
    document.body.classList.add('modal-open');
  }

  function openMySheet() {
    if (!myPlayer) return;
    sheetIsMe = true;
    sheetMate = null;
    detailsPlayer = myPlayer;
    document.body.classList.add('modal-open');
  }

  function openOpponent(orgId: string) {
    opponentOrgId = orgId;
    document.body.classList.add('modal-open');
  }

  function closeOpponent() {
    opponentOrgId = null;
    if (!detailsPlayer && eventSheet === null) document.body.classList.remove('modal-open');
  }

  function chat(mateId: string) {
    if (!career) return;
    const result = talkTo(career, mateId);
    career = result.state;
    lastTalk = { mateId: result.mateId, line: result.line, delta: result.delta };
  }


  function openEvent(index: number) {
    eventSheet = index;
    document.body.classList.add('modal-open');
  }

  function closeEventSheet() {
    eventSheet = null;
    if (!detailsPlayer && !opponentOrgId && !confirming && !statsOpen) document.body.classList.remove('modal-open');
  }

  function playFromSheet(index: number) {
    closeEventSheet();
    enterEvent(index);
  }

  /** "Circuito GC/CCT — Etapa 3" → circuito numa linha, etapa na outra. */
  function eventParts(name: string) {
    // Nomes novos usam " · "; saves antigos ainda têm o travessão.
    const [circuit, ...rest] = name.split(/ · | — /);
    return { circuit, stage: rest.join(' · ') || '' };
  }

  function openStats() {
    statsOpen = true;
    document.body.classList.add('modal-open');
  }

  function closeStats() {
    statsOpen = false;
    if (!detailsPlayer && !opponentOrgId && !confirming) document.body.classList.remove('modal-open');
  }

  function askConfirm(next: NonNullable<typeof confirming>) {
    menuOpen = false;
    confirming = next;
    document.body.classList.add('modal-open');
  }

  function closeConfirm() {
    confirming = null;
    if (!detailsPlayer && !opponentOrgId) document.body.classList.remove('modal-open');
  }

  function confirmNow() {
    const action = confirming?.run;
    closeConfirm();
    action?.();
  }

  function askReset() {
    if (!career) return;
    const seasons = career.history.length;
    askConfirm({
      title: career.status === 'RETIRED' ? 'Começar outra carreira?' : `Apagar a carreira de ${career.nick}?`,
      body: career.status === 'RETIRED'
        ? `A ficha de ${career.nick} sai deste navegador. Não dá para recuperar.`
        : `${seasons} temporada${seasons === 1 ? '' : 's'} e ${totalTitles} título${totalTitles === 1 ? '' : 's'} somem deste navegador. Não dá para recuperar.`,
      confirmLabel: career.status === 'RETIRED' ? 'Começar do zero' : 'Apagar carreira',
      danger: career.status !== 'RETIRED',
      run: reset
    });
  }

  function askRetire() {
    if (!career) return;
    askConfirm({
      title: `Pendurar o mouse aos ${career.age}?`,
      body: `A carreira de ${career.nick} termina aqui: ${career.history.length} temporada${career.history.length === 1 ? '' : 's'}, overall ${career.overall}. Não dá para voltar.`,
      confirmLabel: 'Pendurar o mouse',
      danger: true,
      run: hangTheMouse
    });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (confirming) closeConfirm();
    else if (statsOpen) closeStats();
    else if (opponentOrgId) closeOpponent();
    else if (eventSheet !== null) closeEventSheet();
    else if (detailsPlayer) closeSheet();
    else if (menuOpen) menuOpen = false;
  }

  /** O diálogo nasce com o foco dentro (no botão seguro), como todo modal acessível. */
  function focusInside(node: HTMLElement) {
    const target = node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>('button');
    target?.focus();
  }

  function toggleSkill(attribute: TrainedAttribute) {
    pickedSkills = pickedSkills.includes(attribute)
      ? pickedSkills.filter((picked) => picked !== attribute)
      : pickedSkills.length >= 4 ? pickedSkills : [...pickedSkills, attribute];
  }

  function trainFree() {
    if (!career) return;
    const result = applyCustomTraining(career, pickedSkills);
    career = result.state;
    weekLine = result.line;
    weekChips = result.chips;
    pickedSkills = [];
  }

  function chooseWeek(actionId: string) {
    if (!career) return;
    const result = applyAgenda(career, actionId);
    career = result.state;
    weekLine = result.line;
    weekChips = result.chips;
  }

  function talkCoach() {
    if (!career || !myPlayer) return;
    const result = coachTalk(career, myPlayer);
    career = result.state;
    coachLine = result.line;
  }

  const chipText = (chip: AgendaChip) => `${chip.value > 0 ? '+' : '−'}${Math.abs(chip.value).toLocaleString('pt-BR')} ${chip.label}`;

  function start() { career = createPlayerCareer({ nick, country, role, archetype }); }
  function sign(orgId: string) { if (career) career = chooseStartingOrg(career, orgId); }
  function choose(orgId: string) { if (career) career = acceptOffer(career, orgId); }
  function stay() { if (career) career = stayAtOrg(career); }
  function toLanHouse() { if (career) career = goToLanHouse(career); }
  function takeMove(orgId: string) { if (career) career = acceptMove(career, orgId); }
  function refuseMove() { if (career) career = declineMove(career); }
  function hangTheMouse() { if (career) career = retire(career); }
  function reset() {
    runToken += 1;
    running = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
      if (career) localStorage.removeItem(`${STORAGE_KEY}:situations:${career.seed}`);
    } catch { /* noop */ }
    career = null; live = null; clutch = null; lastCall = null; callOutcome = null; resolving = false; frozenView = null; pendingOutcome = null; usedIds = [];
  }

  function openSeason() { if (career) career = startSeason(career); }

  function enterEvent(index: number, toFinal = false) {
    const me = career;
    if (!me) return;
    eventError = null;
    stageBanner = null;
    const entry = me.calendar?.[index];
    const saved = me.liveEvent?.eventIndex === index ? me.liveEvent : null;
    let stage: MajorStageKey | null = null;
    let carry: StageCarry = saved?.carry ?? { wins: 0, losses: 0 };
    if (entry?.format === 'major') {
      stage = saved?.stage ?? majorEntryStage(me);
      if (!stage) {
        // O ranking da temporada não bateu: o Major fica como "Não classificado" e a temporada segue.
        finalizeEvent(index, notQualified(me, index));
        stageBanner = 'Seu time não entrou no Major: faltou ranking (VRS) nesta temporada.';
        return;
      }
    }
    let field: ReturnType<typeof startSceneEvent>;
    try {
      field = startSceneEvent(me, index, saved?.played, stage);
      // "Só as finais" num Major: os stages de suíça rodam sozinhos até o Stage 3.
      if (toFinal && stage) {
        for (;;) {
          const setup = eventSetup(me, index, stage);
          if (!setup.swissOnly) break;
          const done = finishSceneStage(field.campaign, setup);
          const next: MajorStageKey | null = NEXT_STAGE[stage as MajorStageKey];
          if (!advancedFromSwiss(done) || !next) {
            finalizeEvent(index, sceneEventResult(me, index, done, stage, carry));
            return;
          }
          const record = swissRecord(done);
          carry = { wins: carry.wins + record.wins, losses: carry.losses + record.losses };
          stage = next;
          field = startSceneEvent(me, index, undefined, stage);
        }
      }
    } catch (error) {
      console.error('[carreira] não montou a chave', error);
      eventError = 'Não foi possível montar a chave deste campeonato. Tente de novo; se persistir, o save desta temporada precisa de correção.';
      return;
    }
    liveIndex = index;
    liveStage = stage;
    stageCarry = carry;
    liveSetup = eventSetup(me, index, stage);
    live = toFinal ? advanceToFinal(field.campaign) : field.campaign;
    clutch = null;
    lastCall = null;
    callOutcome = null;
    resolving = false;
    frozenView = null;
    pendingOutcome = null;
    lastEventReport = null;
    const mates = field.userPlayers.filter((player) => player.id !== `${me.seed}:me`);
    matesOverall = mates.length ? Math.round(mates.reduce((sum, player) => sum + (player.overall ?? 70), 0) / mates.length) : 70;
    loadUsedIds(me.seed);
    if (live.finished) {
      // "Só as finais" e você caiu antes da final: o campeonato fecha direto.
      finalizeEvent(index, sceneEventResult(me, index, live, stage, carry));
      return;
    }
    if (toFinal) persistLive();
    void run();
  }

  /** O campeonato corre round a round (o SeriesViewer anima cada um); para no round decisivo ou no fim. */
  async function run() {
    if (!live || !career || running) return;
    const token = ++runToken;
    running = true;
    const ctx: SceneClutchContext = { role: career.role, seed: career.seed, usedSituationIds: usedIds };
    while (live && !eventDone(live, liveSetup) && token === runToken) {
      const userLive = liveUserSeriesOf(live);
      const step = stepSceneEvent(live, ctx);
      live = step.campaign;
      if (step.clutch) {
        clutch = step.clutch;
        persistLive();
        running = false;
        if (autoCall) {
          const index = clutch.situation.alternatives.findIndex((alternative) => alternative.profile === autoProfile);
          pick((index >= 0 ? index : 0) as 0 | 1 | 2, true);
        }
        return;
      }
      // O feed da série do usuário anda no ritmo escolhido; o resto do evento sempre corre.
      await sleep(userLive ? SPEED_DELAYS[speed] : 25);
    }
    if (token === runToken) { clutch = null; persistLive(); }
    running = false;
    if (token === runToken && live && liveSetup.swissOnly && eventDone(live, liveSetup)) advanceStage();
  }

  /** Stage 1/2 do Major acabou: 3 vitórias leva ao próximo stage; 3 derrotas encerra o Major. */
  function advanceStage() {
    if (!career || !live || !liveStage) return;
    const next = NEXT_STAGE[liveStage];
    if (!advancedFromSwiss(live) || !next) return; // eliminado: o "Fechar campeonato" aparece
    const record = swissRecord(live);
    stageCarry = { wins: stageCarry.wins + record.wins, losses: stageCarry.losses + record.losses };
    stageBanner = `Classificado ${record.wins}-${record.losses} no ${STAGE_NAME[liveStage]}. Agora é o ${STAGE_NAME[next]}.`;
    liveStage = next;
    liveSetup = eventSetup(career, liveIndex, next);
    live = startSceneEvent(career, liveIndex, undefined, next).campaign;
    clutch = null;
    lastCall = null;
    persistLive();
  }

  /** Sua call: arma o edge, o RNG joga o round — o kill feed do round decisivo rola em ritmo legível
   *  (mesmo em ULTRA) e SÓ ENTÃO a história do resultado chega. */
  function pick(choice: 0 | 1 | 2, auto = false) {
    if (!live || !career || !clutch) return;
    if (!auto) {
      autoProfile = clutch.situation.alternatives[choice].profile;
      frozenView = { map: clutch.mapIndex, round: clutch.roundNumber };
    }
    const opponent = clutch.series.config.teamA.id === live.userTeamId ? clutch.series.config.teamB : clutch.series.config.teamA;
    const outcome = playClutchRound(live, clutch, {
      choice,
      playerOverall: career.overall,
      matesOverall,
      opponentOverall: Math.round(opponent.power),
      playerId: `${career.seed}:me`
    });
    live = outcome.campaign;
    const alternative = clutch.situation.alternatives[choice].text;
    const story = clutchStory(outcome.profile, alternative, outcome.won, outcome.kills);
    usedIds = [...usedIds, clutch.situation.id];
    persistUsedIds();
    clutch = null;
    persistLive();
    if (auto) {
      // Call no seu estilo: o resultado vira o chip da última call e o campeonato segue sem parar.
      lastCall = { text: alternative, won: outcome.won, story };
      void run();
      return;
    }
    resolving = true;
    pendingOutcome = { text: alternative, won: outcome.won, story };
    // O viewer avisa quando o kill feed do round terminou (onRoundResolved); isto é só a rede de segurança.
    resolveFallback = window.setTimeout(showOutcome, Math.round(SPEED_DELAYS.normal * LAST_ROUND_FEED_FACTOR) + 2500);
  }

  /** O kill feed do round da sua call acabou de tocar: segura um instante no último kill e mostra o resultado. */
  function onViewerRoundResolved(map: number, round: number) {
    if (!resolving || !frozenView || map !== frozenView.map || round < frozenView.round) return;
    if (resolveFallback !== null) window.clearTimeout(resolveFallback);
    resolveFallback = window.setTimeout(showOutcome, 700);
  }

  function showOutcome() {
    if (resolveFallback !== null) window.clearTimeout(resolveFallback);
    resolveFallback = null;
    if (!resolving || !pendingOutcome) return;
    resolving = false;
    lastCall = pendingOutcome;
    callOutcome = pendingOutcome;
    pendingOutcome = null;
  }

  function continueAfterCall() {
    callOutcome = null;
    frozenView = null;
    void run();
  }

  function setSpeed(value: string) {
    speed = value as keyof typeof SPEED_DELAYS;
  }

  function pauseRun() {
    runToken += 1;
    running = false;
  }

  /** Em ULTRA a página voa — o painel de decisão precisa vir até você, não o contrário. */
  function scrollToPanel(node: HTMLElement) {
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function liveUserSeriesOf(campaign: NonNullable<typeof live>) {
    return campaign.engine.rounds.at(-1)?.series.find((series) => series.config.teamA.id === campaign.userTeamId || series.config.teamB.id === campaign.userTeamId) ?? null;
  }

  function persistLive() {
    if (!career || !live) return;
    career = { ...career, liveEvent: { eventIndex: liveIndex, played: serializeSceneEvent(live), stage: liveStage, carry: stageCarry } };
  }

  /** Fecha o campeonato (jogado ou simulado): relatório, resultado no calendário, elenco e fim de temporada. */
  function finalizeEvent(index: number, outcome: SceneEventOutcome) {
    if (!career) return;
    const { result } = outcome;
    lastEventReport = {
      name: result.name,
      placement: result.placement,
      rating: result.rating,
      wins: result.seriesWins,
      losses: result.seriesLosses,
      stats: outcome.stats,
      players: outcome.players
    };
    const recorded = celebrateResult(recordEventResult(career, index, result), result.placement, orgOf(career.orgId).level);
    live = null;
    clutch = null;
    callOutcome = null;
    resolving = false;
    frozenView = null;
    pendingOutcome = null;
    weekLine = null;
    weekChips = [];
    coachLine = null;
    pickedSkills = [];
    lastTalk = null;
    if (recorded.calendar?.every((entry) => entry.status === 'PLAYED')) {
      career = finishSeason(recorded);
    } else {
      // Entre campeonatos o time pode cortar (fase ruim + clima pesado) ou um time de cima pode chamar.
      const mates = matesOf(recorded);
      const relationshipAverage = mates.length ? mates.reduce((sum, mate) => sum + mate.relationship, 0) / mates.length : 55;
      career = midSeasonCheck(recorded, relationshipAverage);
    }
  }

  function closeEvent() {
    if (!career || !live || !liveOver) return;
    finalizeEvent(liveIndex, sceneEventResult(career, liveIndex, live, liveStage, stageCarry));
  }

  /** Simula o campeonato inteiro sem tela (ou o resto, se havia um save no meio dele). */
  function simulateEvent(index: number) {
    const me = career;
    if (!me) return;
    eventError = null;
    try {
      const saved = me.liveEvent?.eventIndex === index ? me.liveEvent : null;
      finalizeEvent(index, simulateSceneEvent(me, index, saved?.played, saved?.stage ?? null, saved?.carry));
    } catch (error) {
      console.error('[carreira] não simulou o campeonato', error);
      eventError = 'Não deu para simular este campeonato. Tente de novo.';
    }
  }

  /** Durante o jogo: o resto do campeonato roda sozinho, sem parar nas calls. */
  function simulateRest() {
    if (!career || !live) return;
    runToken += 1;
    running = false;
    if (resolveFallback !== null) window.clearTimeout(resolveFallback);
    if (liveStage) {
      // Major: termina o stage atual e, se passar, os próximos stages rodam sozinhos.
      const done = finishSceneStage(live, liveSetup);
      const next = NEXT_STAGE[liveStage];
      if (liveSetup.swissOnly && advancedFromSwiss(done) && next) {
        const record = swissRecord(done);
        finalizeEvent(liveIndex, simulateSceneEvent(career, liveIndex, undefined, next, { wins: stageCarry.wins + record.wins, losses: stageCarry.losses + record.losses }));
      } else {
        finalizeEvent(liveIndex, sceneEventResult(career, liveIndex, done, liveStage, stageCarry));
      }
      return;
    }
    finalizeEvent(liveIndex, sceneEventResult(career, liveIndex, finishSceneEvent(live)));
  }

  /** Pular a call: o round decisivo roda sem o seu edge e o campeonato segue. */
  function skipClutch() {
    if (!live || !clutch) return;
    usedIds = [...usedIds, clutch.situation.id];
    persistUsedIds();
    clutch = null;
    live = stepSceneEvent(live).campaign;
    persistLive();
    void run();
  }

  /** O ritmo escolhido para este campeonato: ao vivo, simulado ou simulado até a final. */
  function paceOf(index: number): 'live' | 'sim' | 'final' {
    if (playMode === 'every2') return index % 2 === 0 ? 'live' : 'sim';
    if (playMode === 'finals') return 'final';
    return 'live';
  }

  function startEntry(index: number) {
    const pace = paceOf(index);
    if (pace === 'sim') simulateEvent(index);
    else enterEvent(index, pace === 'final');
  }

  function setPlayMode(value: string) {
    if (career) career = { ...career, playMode: value as PlayMode };
  }

  onDestroy(() => { runToken += 1; if (resolveFallback !== null) window.clearTimeout(resolveFallback); });

  /** O placar do round decisivo: o que um caster diria antes da call. */
  function boardOf(series: LiveSeriesState, userTeamId: string) {
    const state = series.current?.state;
    if (!state) return null;
    const userIsA = series.config.teamA.id === userTeamId;
    const sideA = getCurrentSideA(state);
    const mySide = sideA ? (userIsA ? sideA : sideA === 'ct' ? 't' : 'ct') : null;
    const myScore = userIsA ? state.scoreA : state.scoreB;
    const theirScore = userIsA ? state.scoreB : state.scoreA;
    const overtime = state.rounds.length >= 24;
    const sideB = (sideA ? (sideA === 'ct' ? 't' : 'ct') : null) as 'ct' | 't' | null;
    // Na ordem do SeriesViewer (time A à esquerda), pra tudo ficar alinhado com o placar dele.
    return {
      left: { side: sideA, money: state.teams.a.money },
      right: { side: sideB, money: state.teams.b.money },
      mySide,
      mapName: state.mapId ? MAP_NAMES[state.mapId] : `Mapa ${state.mapNumber}`,
      stakes: overtime
        ? 'prorrogação, cada round pesa o dobro'
        : myScore === 12 && theirScore === 12
          ? 'quem ganhar leva o mapa'
          : myScore === 12
            ? 'ganhar fecha o mapa'
            : theirScore === 12
              ? 'perder entrega o mapa'
              : 'round que vira o mapa'
    };
  }

  const money = (value: number) => `US$ ${value.toLocaleString('pt-BR')}`;
  const sideLabel = (side: 'ct' | 't' | null) => (side === 'ct' ? 'CT' : side === 't' ? 'TR' : '');

  /** Clubes da carreira em ordem, temporadas consecutivas na mesma org viram uma parada só. */
  function trajectoryOf(state: PlayerCareerState) {
    const stops: Array<{ orgName: string; level: number; from: number; to: number; titles: number }> = [];
    for (const log of state.history) {
      const last = stops.at(-1);
      if (last && last.orgName === log.orgName) { last.to = log.year; last.titles += log.titles; }
      else stops.push({ orgName: log.orgName, level: log.orgLevel, from: log.year, to: log.year, titles: log.titles });
    }
    return stops;
  }

  /** Curva de overall: o início e o fim de cada temporada, em coordenadas de um SVG 340×80. */
  function curveOf(state: PlayerCareerState) {
    if (!state.history.length) return null;
    const values = [state.history[0].overallBefore, ...state.history.map((log) => log.overallAfter)];
    const min = Math.min(...values) - 2;
    const max = Math.max(...values) + 2;
    const points = values.map((value, index) => ({
      x: values.length === 1 ? 170 : (index / (values.length - 1)) * 340,
      y: 74 - ((value - min) / Math.max(1, max - min)) * 68,
      value
    }));
    const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
    return { line: points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '), peak, values };
  }

  $: currentEntry = career?.calendar?.find((entry) => entry.status === 'UPCOMING') ?? null;
  /** O adversário da série ao vivo (clicável no viewer). */
  $: liveOpponent = liveUserSeries && live
    ? (liveUserSeries.config.teamA.id === live.userTeamId ? liveUserSeries.config.teamB : liveUserSeries.config.teamA)
    : null;
  $: opponentOrg = opponentOrgId ? sceneOrgById.get(opponentOrgId) ?? null : null;
  $: opponentRoster = career && opponentOrg
    ? sceneOrgEnginePlayers(orgIn(career.seed, career.seasonNumber, opponentOrg.id) ?? opponentOrg, `${career.seed}:season:${career.seasonNumber}`)
    : [];
  $: myPlayer = career ? myPlayerOf(career) : null;
  $: squadMates = career ? matesOf(career) : [];
  $: coach = career ? coachOf(career) : null;
  $: nextMajorStage = career && currentEntry?.format === 'major' ? majorEntryStage(career) : null;
  $: sceneMarket = career && !career.calendar && career.seasonNumber > 1 ? headlineTransfers(career.seed, career.seasonNumber, 4) : [];
  $: weekCards = career && currentEntry ? drawAgenda(career) : [];
  $: coachTips = career ? coachTipsOf(career) : [];
  $: talksLeft = career ? coachTalksLeft(career) : 3;
  $: splitPreview = customTrainingSplit(pickedSkills);
  $: mainSkills = career && myPlayer
    ? [...ROLE_SKILLS[career.role]].filter((key) => key !== 'mental').map((key) => ({ key, label: ATTR_LABEL[key], value: Number(myPlayer?.[key] ?? 0) })).sort((a, b) => b.value - a.value).slice(0, 3)
    : [];
  $: evolving = career ? (Object.entries(career.trained ?? {}) as Array<[TrainedAttribute, number]>).filter(([, bonus]) => bonus).map(([key, bonus]) => ({ label: ATTR_LABEL[key], bonus })).sort((a, b) => b.bonus - a.bonus) : [];
  $: morale = career?.morale ?? 60;
  $: form = career?.form ?? 0;
  $: fame = career?.fame ?? 0;
  $: fatigue = career?.fatigue ?? 0;
  $: playMode = (career?.playMode ?? 'all') as PlayMode;
  $: nextPace = currentEntry ? (career?.liveEvent?.eventIndex === currentEntry.index ? 'live' : paceOf(currentEntry.index)) : 'live';
  $: bracketPath = live ? userBracketPath(live) : [];
  $: liveOver = live ? eventDone(live, liveSetup) && !(liveSetup.swissOnly && advancedFromSwiss(live) && liveStage && NEXT_STAGE[liveStage]) : false;
  $: sheetEntry = career && eventSheet !== null ? career.calendar?.[eventSheet] ?? null : null;
  $: sheetField = career && sheetEntry && eventSheet !== null ? sceneEventField(career, eventSheet, sheetEntry.format === 'major' ? majorEntryStage(career) ?? 'stage1' : null) : [];
  $: sheetMyRank = sheetField.findIndex((team) => team.isUser) + 1;
  $: sheetTop = sheetField[0]?.overall ?? 1;
  $: currentLevel = career ? orgOf(career.orgId).level : 5;
  $: visitedLevels = new Set([...(career?.history.map((log) => log.orgLevel) ?? []), currentLevel]);
  $: board = clutch && liveUserSeries && live && career ? boardOf(liveUserSeries, live.userTeamId) : null;
  $: seasonSpan = career?.history.length ? `${career.history[0].year}–${career.history.at(-1)!.year}` : career ? `${career.year}` : '';
  $: trajectory = career ? trajectoryOf(career) : [];
  $: overallCurve = career ? curveOf(career) : null;
  $: namedTitles = career?.history.flatMap((log) => log.tournaments.filter((entry) => entry.placement === 'Campeão').map((entry) => `${entry.name} · ${log.year}`)) ?? [];
  $: lastTalkMate = lastTalk ? squadMates.find((mate) => mate.player.id === lastTalk?.mateId) ?? null : null;
  $: trainingWindow = career ? trainingWindowOf(career) : null;
  $: canTrain = Boolean(career && myPlayer && trainingWindow && career.trainedWindow !== trainingWindow);
  $: liveUserSeries = live ? liveUserSeriesOf(live) : null;
  $: viewerSeries = liveUserSeries ? toSeriesResult(liveUserSeries) : null;
  $: viewerActiveMap = frozenView ? frozenView.map : liveUserSeries ? (liveUserSeries.current ? liveUserSeries.current.index : Math.max(0, liveUserSeries.maps.length - 1)) : 0;
  $: viewerRounds = frozenView ? frozenView.round : liveUserSeries?.current ? liveUserSeries.current.state.rounds.length : liveUserSeries?.maps.at(-1)?.rounds.length ?? 0;
  $: viewerFinished = frozenView ? false : liveUserSeries?.phase === 'finished';
  /** O resultado da call só cabe dentro do viewer enquanto o mapa está ao vivo; fora disso vai embaixo dele. */
  $: outcomeOutside = Boolean(callOutcome && (viewerFinished || !viewerSeries));
  $: totalTitles = career?.history.reduce((sum, logEntry) => sum + logEntry.titles, 0) ?? 0;
  $: lastLog = career?.history[career.history.length - 1] ?? null;
  $: currentSeat = career?.seatsTaken[career.seatsTaken.length - 1] ?? null;
</script>

<svelte:head>
  <title>Carreira de Jogador · 13a0</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Big+Shoulders+Display:wght@700;800;900&display=swap" />
</svelte:head>

<svelte:window on:keydown={onKey} />

<Navbar
  language={$game.language}
  theme={$game.theme}
  onLanguage={(language) => game.update((state) => ({ ...state, language }))}
  onTheme={() => game.update((state) => ({ ...state, theme: state.theme === 'dark' ? 'light' : 'dark' }))}
  onHome={() => { window.location.href = '/'; }}
/>

<main class="shell page pc-page">
  {#if !career}
    <section class="intro">
      <p class="eyebrow">CARREIRA · JOGADOR</p>
      <h1 class="display">Do Lan House<br />ao Major</h1>
      <p class="lede">Crie seu jogador e sorteie o começo: três times reais do CCT/GC ou a lan house. Os campeonatos rodam round a round, e o round decisivo é seu.</p>
      <div class="grid2">
        <label>Nick<input bind:value={nick} maxlength="16" placeholder="cascavel" /></label>
        <label>País
          <select bind:value={country}>
            {#each sceneCountries as option}<option value={option}>{option}</option>{/each}
          </select>
        </label>
      </div>
      <fieldset>
        <legend class="eyebrow small">Origem</legend>
        <div class="choices">
          {#each Object.entries(ARCHETYPES) as [key, meta]}
            <button type="button" class="choice" class:on={archetype === key} aria-pressed={archetype === key} on:click={() => (archetype = key as PlayerArchetype)}>
              <b>{meta.label}</b><span>entra aos {meta.entryAge[0]}–{meta.entryAge[1]}</span>
              <em>{meta.blurb}</em>
            </button>
          {/each}
        </div>
      </fieldset>
      <fieldset>
        <legend class="eyebrow small">Função</legend>
        <div class="choices">
          {#each Object.entries(ROLE_META) as [key, meta]}
            <button type="button" class="choice" class:on={role === key} aria-pressed={role === key} on:click={() => (role = key as PlayerRole)}>
              <b>{meta.label}</b><em>{meta.blurb}</em>
            </button>
          {/each}
        </div>
      </fieldset>
      <button class="cta" on:click={start}>Sortear começo de carreira</button>
    </section>
  {:else if career.pendingDraw?.length}
    <section class="intro">
      <p class="eyebrow">SORTEIO · {career.year}</p>
      <h1 class="display">O sorteio de {career.nick}</h1>
      <p class="lede">Você é <strong>{ROLE_META[career.role].label}</strong>. Ao assinar, você toma a vaga de quem joga nessa função.</p>
      <div class="cards">
        {#each career.pendingDraw as option, index}
          <button class="card deal" class:lan={option.kind === 'lan-house'} style={`--deal:${index * 90}ms`} on:click={() => sign(option.orgId)}>
            <span class="card-level">{LEVEL_LABEL[option.level] ?? `Nível ${option.level}`}{option.country ? ` · ${option.country}` : ''}</span>
            <b>{option.name}</b>
            {#if option.seat}
              <span class="seat">Vaga de <b>{option.seat.nick}</b>{option.seat.viaRole ? ' · sua função' : ''}</span>
            {:else}
              <span class="seat">Sem contrato: grind por fora</span>
            {/if}
            <span class="num">{option.density} campeonatos por temporada</span>
            {#if option.rosterPreview.length}<small>{option.rosterPreview.join(' · ')}</small>{/if}
            <span class="card-cta">Assinar</span>
          </button>
        {/each}
      </div>
    </section>
  {:else if career.status === 'RETIRED' && career.verdict}
    <section class="retired">
      <div class="retired-head">
        <p class="eyebrow">{career.verdict.becameCoach ? `Virou coach aos ${career.age}` : 'Pendurou o mouse'} · {seasonSpan}</p>
        <h1 class="display">{career.nick}</h1>
        <p class="verdict">“{career.verdict.line}”</p>
      </div>
      <div class="retired-grid">
        {#if overallCurve}
          <figure class="curve">
            <figcaption><span class="label">Overall por temporada</span><span>pico <b>{overallCurve.peak.value}</b></span></figcaption>
            <svg viewBox="0 0 340 80" preserveAspectRatio="none" role="img" aria-label={`Curva de overall: ${overallCurve.values.join(', ')}`}>
              <polyline points={overallCurve.line} fill="none" stroke="var(--accent)" stroke-width="3" vector-effect="non-scaling-stroke" />
              <circle cx={overallCurve.peak.x} cy={overallCurve.peak.y} r="4" fill="var(--accent)" />
            </svg>
          </figure>
        {/if}
        <div class="trajectory">
          <p class="label">Trajetória</p>
          <ol>
            {#each trajectory as stop}
              <li class:top={stop.level === career.verdict.topOrgLevel}>
                <i aria-hidden="true"></i>
                <span><b>{stop.orgName}</b> · {LEVEL_LABEL[stop.level] ?? `Nível ${stop.level}`}{stop.titles ? ` · ${stop.titles} título${stop.titles > 1 ? 's' : ''}` : ''}</span>
                <span class="num">{stop.from === stop.to ? stop.from : `${stop.from}–${stop.to}`}</span>
              </li>
            {/each}
          </ol>
        </div>
      </div>
      <div class="boxes">
        <div class="box"><span>Temporadas</span><b>{career.verdict.seasons}</b></div>
        <div class="box"><span>Títulos</span><b class:gold={career.verdict.titles > 0}>{career.verdict.titles}</b></div>
        <div class="box"><span>Melhor overall</span><b>{career.verdict.bestOverall}</b></div>
        <div class="box"><span>Melhor rating</span><b>{career.verdict.bestSeasonRating.toFixed(2)}</b></div>
      </div>
      {#if namedTitles.length}
        <p class="titles-list"><span class="label">Títulos</span>{namedTitles.join(' · ')}</p>
      {/if}
      <button class="cta" on:click={askReset}>Começar nova carreira</button>
    </section>
  {:else}
    <div class="career">
      <aside class="rail" aria-label="Seu jogador">
        <div class="rail-head">
          <div class="who">
            <p class="eyebrow">Carreira · T{career.seasonNumber} · {career.year}</p>
            <h1 class="display nick" class:long={career.nick.length > 7} class:xlong={career.nick.length > 10}>{career.nick}</h1>
            <p class="sub">{ARCHETYPES[career.archetype].label} · {ROLE_META[career.role].label} · {career.country} · {career.age} anos</p>
            <p class="age-phase" class:old={career.age >= 29}><b>{agePhase(career.age).label}</b> {agePhase(career.age).detail}</p>
            {#if myPlayer}
              <dl class="skills-now">
                <div class="mental"><dt>Mental</dt><dd>{myPlayer.mental}</dd></div>
                {#each mainSkills as skill (skill.key)}<div><dt>{skill.label}</dt><dd>{skill.value}</dd></div>{/each}
              </dl>
              <p class="evolving"><span>Evoluindo</span>{#if evolving.length}{#each evolving as item}<b class:neg={item.bonus < 0}>{item.label} {item.bonus > 0 ? '+' : '−'}{Math.abs(item.bonus)}</b>{/each}{:else}<em>nada ainda</em>{/if}</p>
            {/if}
          </div>
          <div class="menu">
            <button class="icon-btn" aria-label="Opções da carreira" aria-expanded={menuOpen} aria-haspopup="menu" on:click={() => (menuOpen = !menuOpen)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>
            </button>
            {#if menuOpen}
              <div class="menu-pop" role="menu">
                <button role="menuitem" on:click={() => { menuOpen = false; openMySheet(); }}>Ver minha carta</button>
                <button role="menuitem" class="danger" on:click={askReset}>Apagar e começar outra carreira</button>
              </div>
            {/if}
          </div>
        </div>

        <div class="ovr">
          <span class="ovr-num">{career.overall}</span>
          <span class="label ovr-label">Overall</span>
        </div>
        <dl class="facts">
          <div class="value" title="Quanto uma org pagaria pelo seu passe hoje. Sobe com o overall; não é salário nem prêmio.">
            <dt>Valor de mercado</dt><dd>US$ {(marketValueUsd(career.overall) / 1000).toFixed(0)}k</dd>
          </div>
          <div><dt>Títulos</dt><dd class:gold={totalTitles > 0}>{totalTitles}</dd></div>
          <div title="Moral alta sobe o Mental da sua carta; baixa derruba."><dt>Moral</dt><dd class:low={morale < 45} class:high={morale >= 75}>{morale}</dd></div>
          <div title="Vale só no próximo campeonato."><dt>Forma</dt><dd class:low={form < 0} class:high={form > 0}>{form > 0 ? '+' : form < 0 ? '−' : ''}{Math.abs(form)}</dd></div>
          <div title="Seguidores: títulos, MVPs, stream e entrevistas."><dt>Fãs</dt><dd>{fame.toLocaleString('pt-BR')}</dd></div>
          <div class="value" title="Treino, bootcamp e campeonatos cansam; descanso recupera. Com 70+ o treino rende metade; com 60+ você perde overall em quadra."><dt>Cansaço</dt><dd class:low={fatigue >= TIRED_AT} class:high={fatigue < 30}>{fatigue}</dd><span class="fat-bar" aria-hidden="true"><i style={`width:${fatigue}%`} class:hot={fatigue >= TIRED_AT}></i></span></div>
        </dl>

        <ol class="pyramid" aria-label="A pirâmide da cena">
          {#each PYRAMID as rung}
            <li class:here={rung.level === currentLevel} class:been={rung.level !== currentLevel && visitedLevels.has(rung.level)} aria-current={rung.level === currentLevel ? 'step' : undefined}>
              <span class="rung-label">{rung.label}</span><span class="rung-short" aria-hidden="true">{rung.short}</span>
              {#if rung.level === currentLevel}
                <b class="rung-org">{orgOf(career.orgId).name}</b>
              {:else if visitedLevels.has(rung.level)}
                <span class="rung-mark">já passou</span>
              {/if}
            </li>
          {/each}
        </ol>

        {#if currentSeat}
          <p class="seat-line">Você tomou a vaga de <b>{currentSeat.nick}</b>.</p>
        {/if}

        {#if career.history.length}
          <div class="rail-seasons">
            <p class="label">Temporadas</p>
            <ol>
              {#each career.history.slice(-4) as log (log.seasonNumber)}
                <li><span>T{log.seasonNumber} · {log.orgName}</span><b>{log.seasonRating.toFixed(2)}</b><span class="num">{log.overallBefore}→{log.overallAfter}</span></li>
              {/each}
            </ol>
          </div>
        {/if}
      </aside>

      <div class="stage">
        {#if eventError}
          <div class="alert" role="alert">
            <b>Campeonato não abriu</b>
            <span>{eventError}</span>
            {#if currentEntry}<button class="secondary-btn" on:click={() => currentEntry && enterEvent(currentEntry.index)}>Tentar de novo</button>{/if}
          </div>
        {/if}

        {#if career.pendingOffers}
          {#if lastLog}
            <section class="season-close" aria-label="Fechamento da temporada">
              <p class="eyebrow">Temporada {lastLog.seasonNumber} · {lastLog.year} · fechada</p>
              <div class="delta">
                <span class="delta-from">{lastLog.overallBefore}</span>
                <svg width="44" height="30" viewBox="0 0 56 40" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><path d="M2 20h46M34 6l14 14-14 14" /></svg>
                <span class="delta-to" class:down={lastLog.overallAfter < lastLog.overallBefore}>{lastLog.overallAfter}</span>
                <div class="delta-meta">
                  <b>{lastLog.overallAfter >= lastLog.overallBefore ? '+' : ''}{lastLog.overallAfter - lastLog.overallBefore} de overall</b>
                  <span>rating da temporada {lastLog.seasonRating.toFixed(2)}{lastLog.titles ? ` · ${lastLog.titles} título${lastLog.titles > 1 ? 's' : ''}` : ''}</span>
                </div>
              </div>
              <ol class="season-strip" aria-label="Campeonatos da temporada">
                {#each lastLog.tournaments as entry}
                  <li class="place-{placeKey(entry.placement)}" title={`${entry.name} · ${entry.placement} · ${entry.rating.toFixed(2)}`}>{entry.placement}</li>
                {/each}
              </ol>
              {#if lastLog.ageDecline}
                <div class="note"><b>A idade pesou: −{lastLog.ageDecline} de overall</b><span>Aos {lastLog.age ?? career.age} anos o corpo já não responde igual. Treino segura, mas não reverte.</span></div>
              {/if}
              {#if lastLog.retireHint}
                <div class="note warn"><b>O corpo pede para parar.</b><span>Você pode seguir até os 40 ou pendurar o mouse agora.</span><button class="danger-btn note-btn" on:click={askRetire}>Pendurar o mouse</button></div>
              {/if}
              {#if career.released}
                <div class="note warn"><b>O {orgOf(career.orgId).name} não renovou.</b><span>Rating {lastLog.seasonRating.toFixed(2)} na temporada, sem título. Escolha uma oferta ou volte para a Lan House.</span></div>
              {/if}
              {#if lastLog.moves?.length}
                <div class="note"><b>Trocas na temporada</b><span>{lastLog.moves.join(' · ')}</span></div>
              {/if}
              {#if lastLog.injury}
                <div class="note warn"><b>Lesão: {lastLog.injury}</b>{#if lastLog.agingNote}<span>{lastLog.agingNote}</span>{/if}</div>
              {:else if lastLog.agingNote}
                <div class="note"><span>{lastLog.agingNote}</span></div>
              {/if}
            </section>
          {/if}

          <section aria-label="Janela de mercado">
            <div class="section-head">
              <h2 class="display h2">Janela de mercado</h2>
              <span>Hoje: {orgOf(career.orgId).name} · {LEVEL_LABEL[currentLevel]}</span>
            </div>
            <div class="offers">
              {#each career.pendingOffers as offer}
                {@const target = orgIn(career.seed, career.seasonNumber, offer.orgId)}
                {@const seat = target ? seatToTake(target, career.role) : null}
                <button class="offer" on:click={() => choose(offer.orgId)}>
                  <span class="label" class:up={offer.orgLevel < currentLevel}>{offer.orgLevel < currentLevel ? `Sobe para ${LEVEL_LABEL[offer.orgLevel]}` : offer.orgLevel === currentLevel ? 'Mesmo nível' : `Desce para ${LEVEL_LABEL[offer.orgLevel]}`}</span>
                  <b class="display">{offer.orgName}</b>
                  <span class="ln">Vaga de <b>{seat?.nick ?? 'a definir'}</b></span>
                  <span class="ln">Campeonatos <b>{eventsFor(offer.orgId)} / temporada</b></span>
                  <span class="ln">Salário <b class="accent">US$ {offer.salaryUsd.toLocaleString('pt-BR')}/mês</b></span>
                </button>
              {/each}
              <button class="offer stay retire-offer" on:click={askRetire}>
                <span class="label">Encerrar</span>
                <b class="display">Pendurar o mouse</b>
                <span class="ln">Fim da carreira de jogador aos {career.age}</span>
              </button>
              {#if career.released}
                <button class="offer stay" on:click={toLanHouse}>
                  <span class="label">Recomeçar</span>
                  <b class="display">Voltar para a Lan House</b>
                  <span class="ln">Grind por fora até um time chamar de novo</span>
                </button>
              {:else}
                <button class="offer stay" on:click={stay}>
                  <span class="label">Renovar</span>
                  <b class="display">Ficar no {orgOf(career.orgId).name}</b>
                  <span class="ln">Mantém o elenco e a sinergia</span>
                </button>
              {/if}
            </div>
          </section>
        {:else if live}
          <div class="live-strip" class:done={liveOver}>
            <span class="live-badge"><i></i>{liveOver ? 'ENCERRADO' : 'AO VIVO'}</span>
            <strong>{career.calendar?.[liveIndex]?.name}{liveStage ? ` · ${STAGE_NAME[liveStage]}` : ''}</strong>
            <span class="live-tag-tier">{career.calendar?.[liveIndex]?.tier ? TIER_LABEL[career.calendar[liveIndex].tier ?? 'C'] : LEVEL_LABEL[currentLevel]}</span>
          </div>
          {#if stageBanner}<p class="stage-banner" role="status">{stageBanner}</p>{/if}

          {#if bracketPath.length}
            <ol class="path" aria-label="Sua caminhada no campeonato">
              {#each bracketPath as step}
                <li class="step step-{step.status}" aria-current={step.status === 'live' ? 'step' : undefined}>
                  <span class="step-stage">{step.label}</span>
                  <b class="step-opp">{step.opponent ? `vs ${step.opponent}` : step.status === 'out' ? 'Fora' : 'A definir'}</b>
                  <span class="step-state">{step.status === 'won' ? `Venceu ${step.score}` : step.status === 'lost' ? `Perdeu ${step.score}` : step.status === 'live' ? `Agora · ${step.score}` : step.status === 'out' ? 'Eliminado antes' : 'Próxima fase'}</span>
                </li>
              {/each}
            </ol>
          {/if}

          {#if viewerSeries && liveUserSeries}
            {#key liveUserSeries.config.id}
              <SeriesViewer
                series={viewerSeries}
                controlled={true}
                controlledStarted={true}
                controlledFinished={viewerFinished}
                controlledActiveMap={viewerActiveMap}
                controlledVisibleRounds={viewerRounds}
                controlledDelay={resolving ? SPEED_DELAYS.normal : SPEED_DELAYS[speed]}
                offlineEffects={true}
                userTeamName={orgOf(career.orgId).name}
                interactiveTeamIds={liveOpponent && liveOpponent.id !== career.orgId ? [liveOpponent.id] : []}
                onTeamClick={(teamId) => openOpponent(teamId)}
                phaseLabel={`${career.calendar?.[liveIndex]?.name ?? 'Campeonato'} · MD${viewerSeries.bestOf}`}
                labels={VIEWER_LABELS}
                onRoundResolved={onViewerRoundResolved}
                decisionOpen={Boolean((clutch && board) || (callOutcome && !outcomeOutside))}
              >
                <svelte:fragment slot="decision">
                  {#if clutch && board}
                    <section class="clutch" use:scrollToPanel aria-label="Round decisivo">
                      <div class="board" aria-label="Situação do round">
                        <span class="side-cell left"><b class="side side-{board.left.side}">{sideLabel(board.left.side)}</b><span class="money">{money(board.left.money)}</span></span>
                        <span class="label">R{clutch.roundNumber} · {board.mapName} · {board.stakes}</span>
                        <span class="side-cell right"><span class="money">{money(board.right.money)}</span><b class="side side-{board.right.side}">{sideLabel(board.right.side)}</b></span>
                      </div>
                      <div class="clutch-q">
                        <p class="eyebrow">Sua call</p>
                        <h2 class="display">{clutch.situation.text}</h2>
                      </div>
                      <div class="calls">
                        {#each clutch.situation.alternatives as alternative, index}
                          <button class="call" on:click={() => pick(index as 0 | 1 | 2)}>
                            <span class="risk risk-{alternative.profile}">{RISK[alternative.profile].label}</span>
                            <b>{alternative.text}</b>
                            <span class="risk-hint">{RISK[alternative.profile].hint}</span>
                          </button>
                        {/each}
                      </div>
                      <div class="clutch-foot">
                        <label class="auto">
                          <input type="checkbox" bind:checked={autoCall} />
                          <span>Nas próximas, decidir no meu estilo <b>({RISK[autoProfile].label})</b></span>
                        </label>
                        <button class="link-btn" on:click={skipClutch}>Pular e deixar o time decidir</button>
                      </div>
                    </section>
                  {:else if callOutcome && !outcomeOutside}
                    <section class="outcome" class:lost={!callOutcome.won} use:scrollToPanel aria-label="Resultado da sua call">
                      <span class="eyebrow">Sua call · {callOutcome.text}</span>
                      <p class="outcome-line">{callOutcome.won ? 'Round ganho' : 'Round perdido'}</p>
                      <p class="outcome-story">{callOutcome.story}</p>
                      <button class="outcome-btn" on:click={continueAfterCall}>Continuar</button>
                    </section>
                  {/if}
                </svelte:fragment>
              </SeriesViewer>
            {/key}
          {:else if !liveOver}
            <p class="chip-note">Chave correndo…</p>
          {/if}

          {#if callOutcome && outcomeOutside}
            <!-- A call fechou a série: o viewer já mostra o placar final e esconde o mapa ao vivo, então o
                 resultado (e o Continuar) vem aqui embaixo — senão ninguém consegue seguir o campeonato. -->
            <section class="outcome" class:lost={!callOutcome.won} use:scrollToPanel aria-label="Resultado da sua call">
              <span class="eyebrow">Sua call · {callOutcome.text}</span>
              <p class="outcome-line">{callOutcome.won ? 'Round ganho' : 'Round perdido'}</p>
              <p class="outcome-story">{callOutcome.story}</p>
              <button class="outcome-btn" on:click={continueAfterCall}>Continuar</button>
            </section>
          {:else if resolving}
            <p class="last-call resolving" role="status">Round decisivo rodando em velocidade normal…</p>
          {:else if lastCall && !callOutcome && !clutch}
            <p class="last-call chip-note" class:won={lastCall.won}>Sua call: {lastCall.text} · round {lastCall.won ? 'ganho' : 'perdido'}{autoCall ? ' · no seu estilo' : ''}</p>
          {/if}

          {#if liveOver}
            <div class="finish">
              <p class="series">{live.run.champion ? 'Campeão' : 'Eliminado'} · {PLACEMENT[live.run.placement === 'placementChampion' ? 'champion' : live.run.placement === 'placementRunnerUp' ? 'runnerUp' : live.run.placement === 'placement3to4' ? 'semi' : 'quarter'] ?? 'Quartas'}</p>
              <button class="cta" on:click={closeEvent}>Fechar campeonato</button>
            </div>
          {:else}
            <div class="run-controls">
              <div class="speed-group">
                <span>Velocidade</span>
                <SegmentedControl value={speed} options={SPEED_OPTIONS} label="Velocidade da simulação" onChange={setSpeed} />
              </div>
              {#if running}
                <button class="secondary-btn" on:click={pauseRun}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
                  Pausar
                </button>
              {:else if !clutch && !callOutcome && !resolving}
                <button class="cta inline" on:click={() => void run()}>{lastCall ? 'Continuar' : 'Jogar'}</button>
              {/if}
              <button class="secondary-btn" on:click={simulateRest}>Simular o resto</button>
            </div>
          {/if}
        {:else}
          {#if !career.calendar && lastLog}
            <section class="season-summary" aria-label="Como foi a temporada">
              <div class="ss-delta">
                <span class="label">Temporada {lastLog.seasonNumber} · {lastLog.year}</span>
                <b class:down={lastLog.overallAfter < lastLog.overallBefore} class:up={lastLog.overallAfter > lastLog.overallBefore}>{lastLog.overallBefore} → {lastLog.overallAfter}</b>
                <span>rating {lastLog.seasonRating.toFixed(2)}{lastLog.titles ? ` · ${lastLog.titles} título${lastLog.titles > 1 ? 's' : ''}` : ''}</span>
              </div>
              <div class="ss-notes">
                {#if lastLog.ageDecline}<p><b>Idade:</b> −{lastLog.ageDecline} de overall aos {lastLog.age ?? career.age} anos.</p>{/if}
                {#if lastLog.injury}<p class="warn"><b>Lesão:</b> {lastLog.injury}.</p>{/if}
                {#if lastLog.moves?.length}<p><b>Trocas:</b> {lastLog.moves.join(' · ')}</p>{/if}
                {#if lastLog.retireHint}<p class="warn"><b>O corpo pede para parar.</b> Dá para seguir até os 40.</p>{/if}
                {#if !lastLog.ageDecline && !lastLog.injury && !lastLog.moves?.length && !lastLog.retireHint}<p>{lastLog.agingNote ?? 'Temporada fechada.'}</p>{/if}
              </div>
              {#if sceneMarket.length}
                <div class="ss-market">
                  <p class="label">Mercado da cena · {career.year}</p>
                  <ul>
                    {#each sceneMarket as move}
                      <li><b>{move.nick}</b> {move.fromName} → {move.toName} <span>(troca com {move.swappedNick})</span></li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </section>
          {/if}
          <div class="hub" class:has-calendar={Boolean(career.calendar)}>
            <section class="next" aria-label={currentEntry ? 'Próximo campeonato' : 'Próxima temporada'}>
              <div class="next-copy">
                {#if currentEntry}
                  <p class="eyebrow">Próximo · {currentEntry.month ? MONTH_FULL[currentEntry.month - 1] : `etapa ${currentEntry.index + 1}`} · {currentEntry.tier ? TIER_LABEL[currentEntry.tier] : LEVEL_LABEL[currentLevel]}{currentEntry.format === 'major' ? ` · ${nextMajorStage ? `entra no ${STAGE_NAME[nextMajorStage]}` : 'sem vaga pelo ranking'}` : currentEntry.format === 'swiss16' ? ' · suíça de 16' : ''}{currentEntry.location ? ` · ${currentEntry.location}` : ''}</p>
                  <h2 class="display">{currentEntry.name}</h2>
                {:else if !career.calendar}
                  <p class="eyebrow">Entre temporadas · {career.year}</p>
                  <h2 class="display">Temporada {career.seasonNumber}</h2>
                {:else}
                  <p class="eyebrow">Temporada {career.seasonNumber}</p>
                  <h2 class="display">Temporada completa</h2>
                {/if}
              </div>
              {#if lastEventReport}
                <div class="report place-{placeKey(lastEventReport.placement)}" aria-label="Último campeonato">
                  <span class="place-badge">{lastEventReport.placement}</span>
                  <span class="report-copy">
                    <span class="label">Último · {lastEventReport.name}</span>
                    <span class="report-line">{#if lastEventReport.placement === 'Não classificado'}Sem vaga no Major pelo ranking{:else}{lastEventReport.wins}W–{lastEventReport.losses}L · rating <b>{lastEventReport.rating.toFixed(2)}</b>{/if}</span>
                  </span>
                  {#if lastEventReport.stats.length}<button class="link-btn" on:click={openStats}>Stats</button>{/if}
                </div>
              {/if}
              {#if currentEntry}
                <div class="next-actions">
                  <button class="cta" on:click={() => currentEntry && (nextPace === 'live' ? enterEvent(currentEntry.index) : startEntry(currentEntry.index))}>{PACE_CTA[nextPace]}</button>
                  {#if nextPace === 'live'}
                    <button class="link-btn" on:click={() => currentEntry && simulateEvent(currentEntry.index)}>Só simular</button>
                  {:else}
                    <button class="link-btn" on:click={() => currentEntry && enterEvent(currentEntry.index)}>Jogar ao vivo</button>
                  {/if}
                </div>
              {:else if !career.calendar}
                <button class="cta" on:click={openSeason}>Abrir temporada · {eventsFor(career.orgId)} camps</button>
              {/if}
            </section>

            {#if myPlayer}
              <section class="squad" aria-label="Elenco">
                <div class="section-head">
                  <p class="label">Elenco · {orgOf(career.orgId).name}</p>
                  <span class="talk-line" aria-live="polite">{#if lastTalk && lastTalkMate}<b>{lastTalkMate.player.nickname}:</b> {lastTalk.line}{lastTalk.delta ? ` (relação ${lastTalk.delta > 0 ? '+' : ''}${lastTalk.delta})` : ''}{:else}Relação acima de 70 dá +1 de overall em quadra; abaixo de 35 tira 1.{/if}</span>
                </div>
                <div class="squad-strip">
                  <CareerCard player={myPlayer} me={true} roleLabel={ROLE_SHORT[career.role]} caption={`Você · ${career.age} anos`} trained={career.trained ?? null} onOpen={openMySheet} />
                  {#each squadMates as mate (mate.player.id)}
                    {@const bump = synergyBump(mate.relationship)}
                    <CareerCard player={mate.player} roleLabel={ROLE_SHORT[mate.player.role as PlayerRole] ?? ''} caption={orgOf(career.orgId).name} onOpen={() => openMateSheet(mate)}>
                      <div class="mate-foot">
                        <div class="bond">
                          <div class="bond-bar" role="img" aria-label={`Relação ${mate.relationship} de 100`}><i class:high={mate.relationship >= 70} class:low={mate.relationship < 35} style={`width:${mate.relationship}%`}></i></div>
                          <span class="bond-num" class:high={mate.relationship >= 70} class:low={mate.relationship < 35}>{mate.relationship}{bump !== 0 ? ` · ${bump > 0 ? '+' : '−'}${Math.abs(bump)}` : ''}</span>
                        </div>
                        <button class="secondary-btn small" on:click={() => chat(mate.player.id)} aria-label={`Conversar com ${mate.player.nickname}`}>Conversar</button>
                      </div>
                    </CareerCard>
                  {/each}
                  {#if coach}
                    <article class="coach-card" aria-label="Coach">
                      <span class="label">Coach</span>
                      <span class="coach-ovr">{coach.overall}</span>
                      <b class="coach-name">{coach.name}</b>
                      <ul>
                        {#each COACH_ATTRS as attribute}
                          <li><span>{attribute.label}</span><i style={`--v:${coach[attribute.key]}%`}></i><b>{coach[attribute.key]}</b></li>
                        {/each}
                      </ul>
                    </article>
                  {/if}
                </div>
              </section>
            {/if}

            {#if career.calendar && currentEntry && myPlayer}
              <section class="week" aria-label="Semana até o próximo campeonato">
                <div class="section-head">
                  <p class="label">Semana até o próximo campeonato · uma escolha · 3 treinos = +1 overall</p>
                  <span class="train-line" class:done={Boolean(weekLine)} class:alert={!weekLine && Boolean(career.knock || fatigue >= TIRED_AT)} aria-live="polite">{weekLine ?? career.knock ?? (fatigue >= TIRED_AT ? `Cansaço ${fatigue}: treino rende metade. Descansar ajuda.` : canTrain ? 'Monte um treino ou escolha uma atividade.' : 'Semana decidida. A próxima abre depois do campeonato.')}{#if weekChips.length}<span class="week-chips">{#each weekChips as chip}<i class:neg={chip.kind === 'fatigue' ? chip.value > 0 : chip.value < 0}>{chipText(chip)}</i>{/each}</span>{/if}</span>
                </div>
                <div class="week-grid">
                  <div class="free-train">
                    <div class="ft-head"><b>Treino livre</b><span>escolha até 4</span></div>
                    <div class="skills-pick" role="group" aria-label="Habilidades para treinar">
                      {#each TRAINABLE as attribute}
                        <button type="button" aria-pressed={pickedSkills.includes(attribute)} class:on={pickedSkills.includes(attribute)} class:tip={coachTips.includes(attribute)} disabled={!canTrain} on:click={() => toggleSkill(attribute)} title={coachTips.includes(attribute) ? 'O coach indicou treinar' : undefined}>
                          <span>{attribute === 'consistency' ? 'Consist.' : ATTR_LABEL[attribute]}</span>
                          {#if splitPreview[attribute]}<b>+{splitPreview[attribute]}</b>{/if}
                        </button>
                      {/each}
                    </div>
                    <div class="ft-actions">
                      <button class="secondary-btn" disabled={!canTrain || !pickedSkills.length} on:click={trainFree}>{pickedSkills.length ? `Treinar (${pickedSkills.length})` : 'Treinar'}</button>
                      <button class="link-btn" disabled={!talksLeft} on:click={talkCoach}>Falar com o coach · {talksLeft}/3</button>
                    </div>
                  </div>
                  <div class="week-right">
                  <div class="week-cards">
                    {#each weekCards as card (card.id)}
                      <button class="wcard" disabled={!canTrain} on:click={() => chooseWeek(card.id)} title={card.text} aria-label={`${card.title}: ${card.text}`}>
                        <span class="wcat">{CATEGORY_LABEL[card.category]}{#if card.risk}<em>risco</em>{/if}</span>
                        <b>{card.title}</b>
                        <span class="wchips">{#each actionChips(card).slice(0, 4) as chip}<i class:neg={chip.kind === 'fatigue' ? chip.value > 0 : chip.value < 0}>{chipText(chip)}</i>{/each}</span>
                      </button>
                    {/each}
                  </div>
                  {#if coachLine}<p class="coach-line"><b>Coach:</b> {coachLine}</p>{:else if coachTips.length}<p class="coach-line"><b>Coach indicou:</b> {coachTips.map((tip) => ATTR_LABEL[tip]).join(' e ')}</p>{:else}<p class="coach-hint">O coach só indica o que treinar se você falar com ele.</p>{/if}
                  </div>
                </div>
              </section>
            {/if}

            {#if career.calendar}
              <section class="calendar" aria-label="Calendário da temporada">
                <div class="section-head">
                  <p class="label">Temporada {career.seasonNumber} · {career.calendar.length} campeonatos</p>
                  <div class="pace">
                    <span>Como jogar</span>
                    <div class="pace-pick" role="group" aria-label="Como jogar a temporada">
                      {#each PLAY_MODE_OPTIONS as option}
                        <button type="button" aria-pressed={playMode === option.value} class:on={playMode === option.value} on:click={() => setPlayMode(option.value)}>{option.label}</button>
                      {/each}
                    </div>
                  </div>
                </div>
                <ol class="events-row">
                  {#each career.calendar as entry, index}
                    {@const parts = eventParts(entry.name)}
                    <li>
                      <button class="ev place-{placeKey(entry.result?.placement)}" class:now={currentEntry?.index === index} class:played={Boolean(entry.result)} on:click={() => openEvent(index)} aria-label={`${entry.name}: ver detalhes`}>
                        <span class="ev-top">
                          <span class="ev-n">{entry.month ? MONTH_LABEL[entry.month - 1] : index + 1}<small class:major={entry.tier === 'Major'}>{entry.tier ? TIER_LABEL[entry.tier] : PYRAMID.find((rung) => rung.level === currentLevel)?.short ?? ""}</small></span>
                          {#if entry.result}
                            <span class="ev-place">{PLACE_SHORT[entry.result.placement] ?? entry.result.placement}</span>
                          {/if}
                        </span>
                        <b class="ev-name">{parts.circuit}</b>
                        <span class="ev-sub">{parts.stage}{#if entry.result} · <em class:hot={entry.result.rating >= 1.1}>{entry.result.rating.toFixed(2)}</em>{/if}</span>
                      </button>
                    </li>
                  {/each}
                </ol>
              </section>
            {/if}
          </div>

          {#if !career.calendar && career.history.length}
            <div class="retire-zone">
              <span>Quer parar por aqui? A carreira fecha com o que você construiu até agora.</span>
              <button class="danger-btn" on:click={askRetire}>Pendurar o mouse</button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if detailsPlayer}
    <div class="modal-backdrop" role="presentation" on:click|self={closeSheet}>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sheet-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="sheet-title">{sheetIsMe ? 'Você' : `Parceiro · ${detailsPlayer.nickname}`}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeSheet}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        {#if sheetMate}
          <CareerCard size="sheet" player={detailsPlayer} roleLabel={ROLE_META[detailsPlayer.role as PlayerRole]?.label ?? ''} caption={orgOf(career?.orgId ?? '').name}>
            <div class="sheet-bond">
              <div class="sheet-bond-copy">
                <span class="label">Relação</span>
                <b class:high={sheetMate.relationship >= 70} class:low={sheetMate.relationship < 35}>{sheetMate.relationship}<small>/100</small></b>
                <span>sinergia {synergyBump(sheetMate.relationship) >= 0 ? '+' : '−'}{Math.abs(synergyBump(sheetMate.relationship))} de overall em quadra</span>
              </div>
              <div class="bond-bar"><i class:high={sheetMate.relationship >= 70} class:low={sheetMate.relationship < 35} style={`width:${sheetMate.relationship}%`}></i></div>
              <button class="cta sheet-talk" on:click={() => { if (!career || !sheetMate) return; const mateId = sheetMate.player.id; chat(mateId); sheetMate = matesOf(career).find((mate) => mate.player.id === mateId) ?? sheetMate; }}>Conversar com {detailsPlayer.nickname}</button>
              {#if lastTalk && lastTalk.mateId === sheetMate.player.id}<p class="sheet-talk-line">{lastTalk.line}</p>{/if}
            </div>
          </CareerCard>
        {:else}
          <CareerCard size="sheet" player={detailsPlayer} me={sheetIsMe} roleLabel={sheetIsMe && career ? ROLE_META[career.role].label : ROLE_META[detailsPlayer.role as PlayerRole]?.label ?? ''} caption={sheetIsMe ? `Você · ${orgOf(career?.orgId ?? '').name}` : orgOf(career?.orgId ?? '').name} trained={sheetIsMe ? career?.trained ?? null : null} />
          {#if sheetIsMe && career}
            <p class="modal-note">Os números verdes ao lado dos atributos são o que o treino já somou.</p>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if sheetEntry && career && eventSheet !== null}
    <div class="modal-backdrop" role="presentation" on:click|self={closeEventSheet}>
      <div class="modal wide event-sheet" role="dialog" aria-modal="true" aria-labelledby="event-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow">Campeonato {eventSheet + 1} de {career.calendar?.length ?? 0} · {LEVEL_LABEL[currentLevel]}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeEventSheet}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <h2 class="display event-title" id="event-title">{sheetEntry.name}</h2>
        <dl class="event-facts">
          <div><dt>Formato</dt><dd>{FORMAT_TEXT(sheetEntry)}</dd></div>
          <div><dt>Quando e onde</dt><dd>{sheetEntry.month ? MONTH_FULL[sheetEntry.month - 1] : '—'}{sheetEntry.location ? ` · ${sheetEntry.location}` : ''}{sheetEntry.organizer ? ` · ${sheetEntry.organizer}` : ''}</dd></div>
          {#if sheetEntry.prizePool}<div><dt>Premiação</dt><dd>US$ {sheetEntry.prizePool.toLocaleString('pt-BR')}</dd></div>{/if}
          {#if sheetEntry.result}
            <div class="place-{placeKey(sheetEntry.result.placement)}"><dt>Sua colocação</dt><dd class="placed">{sheetEntry.result.placement}</dd></div>
            <div><dt>Séries</dt><dd>{sheetEntry.result.seriesWins}W–{sheetEntry.result.seriesLosses}L</dd></div>
            <div><dt>Seu rating</dt><dd class:hot={sheetEntry.result.rating >= 1.1}>{sheetEntry.result.rating.toFixed(2)}</dd></div>
          {:else}
            <div><dt>Status</dt><dd>{currentEntry?.index === eventSheet ? 'Próximo a jogar' : 'Ainda vai acontecer'}</dd></div>
            <div><dt>Sua força</dt><dd>{sheetMyRank}º de {sheetField.length} na chave</dd></div>
          {/if}
        </dl>
        <div class="field">
          <p class="label">A chave · do mais forte ao mais fraco (média de overall do quinteto)</p>
          <ol>
            {#each sheetField as team, rank (team.orgId)}
              <li class:mine={team.isUser}>
                <span class="field-rank">{rank + 1}</span>
                {#if team.isUser}
                  <b class="field-name">{team.name}</b>
                {:else}
                  <button class="field-name link" on:click={() => openOpponent(team.orgId)}>{team.name}</button>
                {/if}
                <span class="field-tags">
                  {#if rank === 0}<span class="tag fav">Favorito</span>{/if}
                  {#if team.isUser}<span class="tag me">Você</span>{/if}
                  <span class="tag">{LEVEL_LABEL[team.level] ?? `Nível ${team.level}`}</span>
                </span>
                <span class="field-bar" aria-hidden="true"><i style={`width:${Math.max(8, Math.round(((team.overall - 50) / Math.max(1, sheetTop - 50)) * 100))}%`}></i></span>
                <b class="field-ovr">{team.overall}</b>
              </li>
            {/each}
          </ol>
        </div>
        {#if currentEntry?.index === eventSheet}
          <button class="cta" on:click={() => eventSheet !== null && playFromSheet(eventSheet)}>Jogar este campeonato</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if opponentOrg && career}
    <div class="modal-backdrop" role="presentation" on:click|self={closeOpponent}>
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="opp-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="opp-title">Adversário · {opponentOrg.name} · {LEVEL_LABEL[opponentOrg.level]}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeOpponent}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div class="opp-strip">
          {#each opponentRoster as player (player.id)}
            <CareerCard {player} roleLabel={ROLE_SHORT[player.role as PlayerRole] ?? ''} caption={opponentOrg.name} />
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if statsOpen && lastEventReport}
    <div class="modal-backdrop" role="presentation" on:click|self={closeStats}>
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="stats-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="stats-title">{lastEventReport.name} · {lastEventReport.placement}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeStats}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <RunStatsGrid stats={lastEventReport.stats} players={lastEventReport.players} language="pt-BR" compact={true} />
      </div>
    </div>
  {/if}

  {#if career?.pendingMove && !live}
    {@const move = career.pendingMove}
    <div class="modal-backdrop" role="presentation">
      <div class="modal wide move-sheet" class:cut={move.kind === 'cut'} role="alertdialog" aria-modal="true" aria-labelledby="move-title" aria-describedby="move-reason" use:focusInside>
        <p class="eyebrow">{move.kind === 'cut' ? 'Mercado · corte' : 'Mercado · proposta no meio da temporada'}</p>
        <h2 class="display" id="move-title">{move.kind === 'cut' ? `O ${orgOf(career.orgId).name} te cortou` : `${move.offers[0]?.orgName ?? 'Um time de cima'} quer você agora`}</h2>
        <p class="move-reason" id="move-reason">{move.reason}{move.kind === 'cut' ? ' Escolha para onde ir. A temporada continua no time novo.' : ' Se aceitar, você joga o resto da temporada lá.'}</p>
        <div class="offers">
          {#each move.offers as offer}
            {@const target = orgIn(career.seed, career.seasonNumber, offer.orgId)}
            {@const seat = target ? seatToTake(target, career.role) : null}
            <button class="offer" data-autofocus on:click={() => takeMove(offer.orgId)}>
              <span class="label" class:up={offer.orgLevel < currentLevel}>{offer.orgLevel < currentLevel ? `Sobe para ${LEVEL_LABEL[offer.orgLevel]}` : offer.orgLevel === currentLevel ? 'Mesmo nível' : `Desce para ${LEVEL_LABEL[offer.orgLevel]}`}</span>
              <b class="display">{offer.orgName}</b>
              <span class="ln">Vaga de <b>{seat?.nick ?? 'a definir'}</b></span>
              <span class="ln">Salário <b class="accent">US$ {offer.salaryUsd.toLocaleString('pt-BR')}/mês</b></span>
            </button>
          {/each}
          {#if move.kind === 'cut'}
            <button class="offer stay" on:click={() => takeMove('lan-house')}>
              <span class="label">Recomeçar</span>
              <b class="display">Voltar para a Lan House</b>
              <span class="ln">Terminar a temporada no grind</span>
            </button>
          {:else}
            <button class="offer stay" on:click={refuseMove}>
              <span class="label">Recusar</span>
              <b class="display">Ficar no {orgOf(career.orgId).name}</b>
              <span class="ln">O elenco gosta: moral +4</span>
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if confirming}
    <div class="modal-backdrop" role="presentation" on:click|self={closeConfirm}>
      <div class="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" use:focusInside>
        <h2 class="display" id="confirm-title">{confirming.title}</h2>
        <p id="confirm-body">{confirming.body}</p>
        <div class="confirm-actions">
          <button class="secondary-btn" data-autofocus on:click={closeConfirm}>Cancelar</button>
          <button class={confirming.danger ? 'danger-btn solid' : 'cta inline'} on:click={confirmNow}>{confirming.confirmLabel}</button>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  /* Barra de rolagem própria — SÓ nesta página (o resto do jogo e o online ficam como estão): fina, reta, no
     tom das linhas, acende no accent com o mouse. scrollbar-color cobre Firefox/Chromium 121+; ::-webkit-* o resto. */
  :global(html:has(.pc-page)) { overflow-x: clip; scrollbar-color: color-mix(in srgb, var(--muted) 45%, var(--line)) var(--bg); }
  :global(html:has(.pc-page) *) { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--muted) 45%, var(--line)) transparent; }
  :global(html:has(.pc-page) *:hover) { scrollbar-color: color-mix(in srgb, var(--accent) 60%, var(--line)) transparent; }
  :global(html:has(.pc-page) ::-webkit-scrollbar) { width: 10px; height: 10px; }
  :global(html:has(.pc-page) ::-webkit-scrollbar-track) { background: transparent; }
  :global(html:has(.pc-page) ::-webkit-scrollbar-thumb) { background: color-mix(in srgb, var(--muted) 45%, var(--line)); border: 3px solid transparent; background-clip: padding-box; }
  :global(html:has(.pc-page) ::-webkit-scrollbar-thumb:hover) { background: var(--accent); background-clip: padding-box; }

  /* Tudo reto: 90° em tudo que esta página toca — o padrão do 13a0. Display condensado (Big Shoulders) e corpo
     Archivo só nesta página; as cartas do jogo trazem as próprias fontes. */
  .page {
    --display: 'Big Shoulders Display', 'Arial Narrow', Impact, sans-serif;
    --body: Archivo, Inter, Arial, sans-serif;
    --gold: #d9a441;
    --quarter: #9aa6b3;
    --semi: #e09a62;
    --vice: #c9d1d9;
    --ct: #5aa9ff;
    --t: #e0a63a;
    padding-block: 24px 80px;
    display: grid;
    gap: 16px;
    font-family: var(--body);
  }
  :global(:root[data-theme='light']) .page { --gold: #8a6210; --quarter: #59636e; --semi: #9a5420; --vice: #4b5560; --ct: #1f63b8; --t: #8a5a00; }
  .page :global(button) { border-radius: 0; }
  .display { margin: 0; font-family: var(--display); font-weight: 900; text-transform: uppercase; letter-spacing: .005em; line-height: .9; }
  .eyebrow { margin: 0 0 8px; color: var(--accent); font: 700 12px/1.2 var(--body); letter-spacing: .14em; text-transform: uppercase; }
  .eyebrow.small { margin-top: 20px; }
  .label { margin: 0 0 8px; color: var(--muted); font: 700 12px/1.2 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .lede { max-width: 64ch; margin: 0; color: var(--muted); line-height: 1.55; }
  .sub { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
  section { min-width: 0; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px 16px; flex-wrap: wrap; margin-bottom: 10px; }
  .section-head .label { margin: 0; }
  .section-head > span { color: var(--muted); font-size: 13px; }
  .h2 { font-size: clamp(28px, 4vw, 40px); }

  /* Botões */
  .cta { width: 100%; min-height: 56px; margin-top: 18px; padding: 0 20px; border: 0; background: var(--accent); color: #0c0f04; font: 900 22px/1 var(--display); letter-spacing: .04em; text-transform: uppercase; cursor: pointer; transition: transform .16s ease, box-shadow .16s ease; }
  .cta:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 28px color-mix(in srgb, var(--accent) 22%, transparent); }
  .cta:active:not(:disabled) { transform: translateY(0); }
  .cta.inline { width: auto; margin-top: 0; }
  .secondary-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px; border: 1px solid color-mix(in srgb, var(--muted) 45%, var(--line)); background: var(--surface-2); color: var(--text); font: 700 13px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; transition: border-color .16s ease, color .16s ease; }
  .secondary-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .secondary-btn:disabled { opacity: 1; border-style: dashed; color: var(--muted); background: transparent; }
  .secondary-btn.small { min-height: 34px; padding: 0 8px; font-size: 12px; letter-spacing: .04em; }
  .danger-btn { min-height: 44px; padding: 0 16px; border: 1px solid color-mix(in srgb, var(--danger) 55%, var(--line)); background: transparent; color: var(--danger); font: 700 13px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .danger-btn:hover, .danger-btn.solid { background: var(--danger); color: #140404; border-color: var(--danger); }
  .icon-btn { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); cursor: pointer; }
  .icon-btn:hover { border-color: var(--accent); color: var(--accent); }
  .page :global(button:focus-visible), .page :global(a:focus-visible), .page :global(input:focus-visible), .page :global(select:focus-visible), .page :global(summary:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* Criação e sorteio */
  .intro { display: grid; gap: 10px; padding: clamp(20px, 4vw, 40px); border: 1px solid var(--line); background: var(--surface); }
  .intro h1 { font-size: clamp(48px, 9vw, 96px); margin-bottom: 6px; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  label { display: grid; gap: 6px; min-width: 0; color: var(--muted); font-size: 13px; }
  input, select { min-width: 0; min-height: 44px; padding: 10px 12px; border-radius: 0; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 500 15px/1.2 var(--body); }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 10px 0 0; }
  .choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 8px; }
  .choice { position: relative; display: grid; gap: 4px; min-width: 0; text-align: left; padding: 12px 14px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); cursor: pointer; transition: border-color .16s ease; }
  .choice:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .choice.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--surface-2)); }
  .choice.on::after { content: 'Escolhido'; position: absolute; top: 10px; right: 10px; color: var(--accent); font: 800 10px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .choice b { font: 800 20px/1 var(--display); text-transform: uppercase; padding-right: 70px; }
  .choice span { color: var(--accent); font-size: 12px; font-weight: 600; }
  .choice em { color: var(--muted); font-size: 13px; line-height: 1.4; font-style: normal; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 10px; margin-top: 10px; }
  .card { display: grid; gap: 6px; align-content: start; min-width: 0; text-align: left; padding: 18px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); cursor: pointer; transition: border-color .16s ease, transform .16s ease; }
  .card:hover { border-color: var(--accent); transform: translateY(-3px); }
  .card > b { font: 900 30px/.95 var(--display); text-transform: uppercase; overflow-wrap: break-word; }
  .card-level { color: var(--muted); font: 700 12px/1.2 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .card .num { color: var(--accent); font-size: 13px; font-weight: 600; }
  .card small { color: var(--muted); font-size: 12px; line-height: 1.45; }
  .card .seat { color: var(--muted); font-size: 14px; }
  .card .seat b { color: var(--text); }
  .card-cta { margin-top: 6px; color: var(--accent); font: 800 13px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .card.lan { border-style: dashed; }
  .deal { animation: deal-in 420ms cubic-bezier(.16, 1, .3, 1) backwards; animation-delay: var(--deal, 0ms); }
  @keyframes deal-in { from { opacity: 0; transform: translateY(18px) rotate(-1.5deg); } }

  /* Carreira: trilho do jogador + palco */
  .career { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 0; border: 1px solid var(--line); background: var(--surface); }
  .rail { display: flex; flex-direction: column; gap: 24px; padding: 28px 24px; border-right: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 55%, var(--surface)); min-width: 0; }
  .rail-head { display: flex; justify-content: space-between; align-items: start; gap: 10px; }
  .who { min-width: 0; }
  .nick { font-size: clamp(44px, 5vw, 60px); overflow-wrap: break-word; }
  .menu { position: relative; flex: none; }
  .menu-pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; display: grid; min-width: 260px; border: 1px solid var(--line); background: var(--surface); box-shadow: var(--shadow); }
  .menu-pop button { min-height: 44px; padding: 0 14px; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--text); font: 600 14px/1.2 var(--body); text-align: left; cursor: pointer; }
  .menu-pop button:last-child { border-bottom: 0; }
  .menu-pop button:hover { background: var(--surface-2); }
  .menu-pop button.danger { color: var(--danger); }
  .ovr { display: flex; align-items: flex-end; gap: 16px; }
  .ovr-num { font: 900 104px/.78 var(--display); color: var(--accent); font-variant-numeric: tabular-nums; }
  .ovr-label { margin: 0 0 6px; }
  .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin: 0; }
  .facts div { display: grid; gap: 4px; min-width: 0; padding: 6px 8px; border: 1px solid var(--line); background: var(--surface-2); }
  .facts dt { color: var(--muted); font: 700 11px/1.2 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .facts dd { margin: 0; font: 800 22px/1 var(--display); font-variant-numeric: tabular-nums; }
  .facts dd.gold { color: var(--gold); }
  .pyramid { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .pyramid li { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 34px; padding: 6px 12px; border: 1px solid var(--line); color: var(--muted); font: 700 12px/1.2 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .pyramid li.been { color: var(--text); border-color: color-mix(in srgb, var(--muted) 45%, var(--line)); }
  .pyramid li.here { flex-wrap: wrap; min-height: 50px; border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--surface)); color: var(--accent); }
  .rung-org { width: 100%; color: var(--text); font: 800 22px/1 var(--display); letter-spacing: .01em; overflow-wrap: break-word; }
  .rung-mark { font-size: 11px; color: var(--muted); }
  .rung-short { display: none; }
  .seat-line { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
  .seat-line b { color: var(--text); }
  .stage { display: flex; flex-direction: column; gap: 26px; min-width: 0; padding: 28px clamp(16px, 3vw, 36px); }

  .alert { display: grid; gap: 6px; padding: 14px 16px; border: 1px solid var(--danger); background: color-mix(in srgb, var(--danger) 8%, var(--surface)); }
  .alert b { color: var(--danger); }
  .alert .secondary-btn { justify-self: start; margin-top: 4px; }

  /* Último campeonato e próximo */
  .place-badge { padding: 6px 12px; border: 1px solid var(--place, var(--line)); color: var(--place, var(--muted)); font: 800 22px/1 var(--display); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
  .place-badge.sm { padding: 3px 8px; font: 800 12px/1 var(--body); letter-spacing: .08em; }
  .place-Quartas { --place: var(--quarter); }
  .place-Semis { --place: var(--semi); }
  .place-Vice { --place: var(--vice); }
  .place-Campeão { --place: var(--gold); }
  .place-Suica { --place: color-mix(in srgb, var(--quarter) 70%, var(--muted)); }
  .place-Stage, .place-Fora { --place: var(--muted); }
  .stage-banner { margin: 0; padding: 10px 14px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); color: var(--accent); font-weight: 600; }
  .ev-n small.major { color: var(--gold); }

  /* Elenco */
  /* As 5 cartas nunca encolhem abaixo do que a carta do jogo precisa: sem espaço, a faixa rola com snap. */
  .bond { display: grid; gap: 6px; padding: 8px; border: 1px solid var(--line); background: var(--surface-2); }
  .bond-bar { height: 6px; background: color-mix(in srgb, var(--line) 70%, var(--surface)); }
  .bond-bar i { display: block; height: 100%; background: var(--muted); }
  .bond-bar i.high { background: var(--accent); }
  .bond-bar i.low { background: var(--accent-2); }
  .bond-num { color: var(--muted); font: 700 12px/1.2 var(--body); text-align: center; font-variant-numeric: tabular-nums; }
  .bond-num.high { color: var(--accent); }
  .bond-num.low { color: var(--accent-2); }

  /* Treino */

  /* Calendário e histórico */
  .retire-zone { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 20px; border-top: 1px dashed var(--line); color: var(--muted); font-size: 14px; }


  /* Hub entre campeonatos: cabe numa tela no desktop — próximo, elenco (+ coach), treino e calendário. */
  .hub { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: 'next' 'calendar' 'squad' 'week'; gap: 10px; align-content: start; }
  .hub:not(.has-calendar) { grid-template-areas: 'next' 'squad'; }
  .next { grid-area: next; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(220px, 260px); gap: 10px 20px; align-items: center; padding: 12px 18px; border: 1px solid color-mix(in srgb, var(--muted) 40%, var(--line)); background: var(--surface-2); }
  .next-copy { min-width: 0; }
  .next-copy .eyebrow { margin-bottom: 6px; }
  .next h2 { font-size: clamp(26px, 2.3vw, 36px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .next .cta { margin-top: 0; min-height: 48px; font-size: 20px; }
  .next-actions .link-btn { min-height: 28px; }
  .report { display: flex; align-items: center; gap: 12px; padding-left: 18px; border-left: 1px solid var(--line); }
  .report .place-badge { font-size: 18px; }
  .report-copy { display: grid; gap: 4px; }
  .report-copy .label { margin: 0; max-width: 24ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .report-line { font-size: 14px; font-variant-numeric: tabular-nums; }
  .report-line b { color: var(--accent); }
  .link-btn { min-height: 44px; padding: 0 6px; border: 0; background: none; color: var(--accent); font: 800 12px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }

  .squad { grid-area: squad; display: grid; gap: 10px; min-width: 0; }
  .squad .section-head { margin-bottom: 0; }
  /* Você maior à esquerda, os 4 parceiros e o coach; sem espaço, a faixa rola (barra própria) com snap. */
  .squad-strip { display: grid; grid-template-columns: minmax(176px, 1.2fr) repeat(4, minmax(150px, 1fr)) minmax(140px, .85fr); gap: 8px; overflow-x: auto; scroll-snap-type: x proximity; padding-bottom: 6px; }
  .squad-strip > :global(*) { scroll-snap-align: start; }
  .opp-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .bond { display: grid; gap: 5px; }
  .talk-line { color: var(--muted); font-size: 13px; line-height: 1.4; }
  .talk-line b { color: var(--text); }
  .coach-card { display: grid; align-content: start; gap: 8px; min-width: 0; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); background: radial-gradient(130% 70% at 0% 0%, color-mix(in srgb, var(--accent-2) 14%, transparent), transparent 60%), var(--surface-2); }
  .coach-card .label { margin: 0; color: var(--accent-2); }
  .coach-ovr { font: 900 40px/.82 var(--display); font-variant-numeric: tabular-nums; }
  .coach-name { font: 800 20px/1 var(--display); text-transform: uppercase; }
  .coach-card ul { display: grid; gap: 7px; margin: 4px 0 0; padding: 0; list-style: none; }
  .coach-card li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 6px; align-items: center; font-size: 12px; color: var(--muted); }
  .coach-card li i { grid-column: 1 / -1; grid-row: 2; height: 4px; background: linear-gradient(90deg, var(--accent-2) var(--v), color-mix(in srgb, var(--line) 80%, transparent) var(--v)); }
  .coach-card li b { color: var(--text); font-variant-numeric: tabular-nums; }

  .train-line { min-width: 0; color: var(--muted); font-size: 13px; }
  .train-line.done { color: var(--accent); font-weight: 600; }

  .calendar { grid-area: calendar; display: grid; gap: 10px; align-content: start; min-width: 0; }
  .calendar .section-head { margin-bottom: 0; }

  .events-row { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(118px, 1fr); gap: 6px; margin: 0; padding: 0 0 4px; list-style: none; overflow-x: auto; }
  .ev { display: grid; gap: 3px; overflow: hidden; width: 100%; height: 100%; min-height: 58px; padding: 6px 10px; border: 1px solid var(--place, var(--line)); background: var(--surface-2); color: var(--text); text-align: left; cursor: pointer; transition: border-color .14s ease, transform .14s ease; }
  .ev:hover { border-color: var(--accent); transform: translateY(-2px); }
  .ev.place-none:not(.now) { --place: var(--line); }
  .ev.place-Campeão { background: color-mix(in srgb, var(--gold) 14%, var(--surface-2)); }
  /* O campeonato da vez: sem selo, só destaque — borda dupla no accent, fundo aceso e brilho. */
  .ev.now { --place: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface-2)); box-shadow: inset 0 0 0 1px var(--accent), 0 0 18px color-mix(in srgb, var(--accent) 22%, transparent); }
  .ev.now .ev-name { color: var(--accent); }
  .ev-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .ev-n { display: flex; align-items: baseline; gap: 6px; color: var(--muted); font: 800 16px/1 var(--display); }
  .ev-n small { font: 700 10px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .ev.now .ev-n { color: var(--accent); }
  .ev-place { color: var(--place, var(--text)); font: 800 11px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; }
  .ev-name { font: 800 16px/1.05 var(--display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev-sub { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev-sub em { font-style: normal; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .ev-sub em.hot { color: var(--accent); }
  .ev.played:not(.place-Campeão) .ev-name { color: color-mix(in srgb, var(--text) 80%, var(--muted)); }

  .next-actions { display: grid; gap: 4px; justify-items: center; }
  .next-actions .cta { width: 100%; }
  .pace { display: flex; align-items: center; gap: 10px; }
  .pace > span { color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .path { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
  .step { position: relative; display: grid; gap: 3px; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .step-stage { color: var(--muted); font: 800 11px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .step-opp { font: 800 18px/1.05 var(--display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .step-state { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
  .step-won { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .step-won .step-state { color: var(--accent); }
  .step-lost { border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); }
  .step-lost .step-state { color: var(--danger); }
  .step-live { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface-2)); box-shadow: inset 0 0 0 1px var(--accent); }
  .step-live .step-stage, .step-live .step-state { color: var(--accent); }
  .step-out, .step-next { opacity: .6; }
  .clutch-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px 16px; flex-wrap: wrap; }
  .skills-now { display: flex; flex-wrap: wrap; gap: 4px; margin: 10px 0 0; }
  .skills-now div { display: flex; align-items: baseline; gap: 5px; padding: 4px 7px; border: 1px solid var(--line); background: var(--surface-2); }
  .skills-now dt { color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .04em; }
  .skills-now dd { margin: 0; font: 800 15px/1 var(--display); font-variant-numeric: tabular-nums; }
  .skills-now .mental { border-color: color-mix(in srgb, var(--accent-2) 50%, var(--line)); }
  .skills-now .mental dd { color: var(--accent-2); }
  .evolving { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin: 8px 0 0; font-size: 12px; }
  .evolving span { color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .evolving b { color: var(--accent); font-weight: 700; }
  .evolving b.neg { color: var(--accent-2); }
  .evolving em { color: var(--muted); font-style: normal; }
  .facts dd.low { color: var(--accent-2); }
  .fat-bar { display: block; height: 4px; background: color-mix(in srgb, var(--line) 80%, transparent); }
  .fat-bar i { display: block; height: 100%; background: var(--muted); }
  .fat-bar i.hot { background: var(--accent-2); }
  .train-line.alert { color: var(--accent-2); font-weight: 600; }
  .facts dd.high { color: var(--accent); }
  .facts .value { grid-column: span 2; }
  .week { grid-area: week; display: grid; gap: 10px; min-width: 0; }
  .week .section-head { margin-bottom: 0; }
  .week-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 10px; align-items: start; }
  .free-train { display: grid; gap: 6px; align-content: start; padding: 10px; border: 1px solid var(--line); background: var(--surface-2); }
  .ft-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .ft-head b { font: 800 18px/1 var(--display); text-transform: uppercase; }
  .ft-head span { color: var(--muted); font-size: 12px; }
  .skills-pick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .skills-pick button { display: flex; justify-content: space-between; align-items: center; gap: 4px; min-width: 0; min-height: 32px; padding: 0 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: 600 13px/1 var(--body); cursor: pointer; }
  .skills-pick button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .skills-pick button b { color: var(--accent); font: 800 15px/1 var(--display); }
  .skills-pick button.tip::after { content: ''; flex: none; width: 6px; height: 6px; background: var(--accent-2); }
  .skills-pick button.tip b { margin-left: auto; }
  .skills-pick button.tip { border-color: color-mix(in srgb, var(--accent-2) 55%, var(--line)); }
  .skills-pick button.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
  .skills-pick button:disabled { opacity: .5; cursor: not-allowed; }
  .ft-actions .secondary-btn { min-height: 36px; }
  .ft-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .ft-actions .link-btn { white-space: nowrap; }
  .week-right { display: grid; gap: 6px; min-width: 0; }
  .coach-hint, .coach-line { min-height: 26px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; }
  .coach-hint { margin: 0; padding: 4px 8px; border-left: 2px solid var(--line); color: var(--muted); font-size: 12px; }
  .coach-line { margin: 0; padding: 4px 8px; border-left: 2px solid var(--accent-2); background: color-mix(in srgb, var(--accent-2) 7%, transparent); font-size: 13px; line-height: 1.4; }
  .coach-line b { color: var(--accent-2); }
  .week-chips, .wchips { display: inline-flex; flex-wrap: wrap; gap: 4px; margin: 0 0 0 8px; vertical-align: middle; }
  .wchips { margin: 0; }
  .week-chips i, .wchips i { padding: 3px 5px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); color: var(--accent); font: 700 11px/1 var(--body); font-style: normal; white-space: nowrap; }
  .week-chips i.neg, .wchips i.neg { border-color: color-mix(in srgb, var(--accent-2) 40%, var(--line)); color: var(--accent-2); }
  .week-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .wcard { display: grid; align-content: start; gap: 5px; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); text-align: left; cursor: pointer; transition: border-color .14s ease, transform .14s ease; }
  .wcard:hover:not(:disabled) { border-color: var(--accent); transform: translateY(-2px); }
  .wcard:disabled { opacity: .5; cursor: not-allowed; }
  .wcat { display: flex; gap: 6px; color: var(--muted); font: 700 10px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .wcat em { color: var(--accent-2); font-style: normal; }
  .wcard b { font: 800 17px/1.05 var(--display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wtext { color: var(--muted); font-size: 12px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pace-pick { display: flex; border: 1px solid var(--line); }
  .pace-pick button { min-height: 32px; padding: 0 10px; border: 0; border-right: 1px solid var(--line); background: var(--surface-2); color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  .pace-pick button:last-child { border-right: 0; }
  .pace-pick button.on { background: color-mix(in srgb, var(--accent) 14%, var(--surface-2)); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .mate-foot { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
  .mate-foot .bond { gap: 3px; }
  .mate-foot .bond-num { text-align: left; white-space: nowrap; font-size: 11px; }
  .mate-foot .secondary-btn.small { min-height: 32px; padding: 0 8px; font-size: 11px; }
  .nick.long { font-size: 44px; }
  .nick.xlong { font-size: 34px; }
  .age-phase { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; }
  .age-phase b { color: var(--text); font-weight: 700; margin-right: 4px; }
  .age-phase.old b { color: var(--accent-2); }
  .note-btn { justify-self: start; margin-top: 6px; min-height: 36px; }
  .retire-offer { border-color: color-mix(in srgb, var(--danger) 40%, var(--line)); }
  .retire-offer > b { color: var(--danger); }
  .season-summary { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px 24px; align-items: center; padding: 12px 18px; border: 1px solid var(--line); background: var(--surface-2); }
  .ss-delta { display: grid; gap: 4px; }
  .ss-delta .label { margin: 0; }
  .ss-delta b { font: 900 34px/1 var(--display); font-variant-numeric: tabular-nums; }
  .ss-delta b.up { color: var(--accent); }
  .ss-delta b.down { color: var(--accent-2); }
  .ss-delta span:last-child { color: var(--muted); font-size: 13px; }
  .ss-notes { display: grid; gap: 4px; }
  .ss-market { grid-column: 1 / -1; display: grid; gap: 4px; padding-top: 8px; border-top: 1px solid var(--line); }
  .ss-market .label { margin: 0; }
  .ss-market ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 2px 16px; margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--muted); }
  .ss-market b { color: var(--text); }
  .ss-market li span { font-size: 12px; }
  .ss-notes p { margin: 0; font-size: 14px; color: var(--muted); }
  .ss-notes b { color: var(--text); }
  .ss-notes p.warn b { color: var(--accent-2); }
  .rail-seasons ol { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
  .rail-seasons li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rail-seasons li > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rail-seasons b { color: var(--accent); font: 800 15px/1 var(--display); }

  /* Uma tela só no desktop: página larga, alturas contidas. */
  @media (min-width: 961px) {
    .page { width: min(1480px, calc(100% - 28px)); padding-block: 16px 20px; }
    /* A navbar acompanha a largura da carreira (só nesta página). */
    :global(body:has(.pc-page) .nav.shell) { width: min(1480px, calc(100% - 28px)); }
    .career { min-height: calc(100dvh - 68px - 36px); }
    .rail { gap: 14px; padding: 18px 20px; }
    .ovr-num { font-size: 76px; }
    .stage { padding: 16px 22px; gap: 12px; }
  }
  @media (max-width: 1180px) {
    .next { grid-template-columns: minmax(0, 1fr) auto; }
    .next .cta { grid-column: 1 / -1; }
  }

  /* Fechamento da temporada e mercado */
  .season-close { display: grid; gap: 16px; }
  .delta { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 8px 18px; color: var(--accent); }
  .delta-from { font: 900 clamp(64px, 9vw, 110px)/.8 var(--display); color: var(--muted); }
  .delta-to { font: 900 clamp(84px, 12vw, 150px)/.8 var(--display); color: var(--accent); animation: delta-pop 600ms cubic-bezier(.16, 1, .3, 1) 200ms backwards; }
  .delta-to.down { color: var(--accent-2); }
  @keyframes delta-pop { from { opacity: 0; transform: translateY(14px) scale(.92); } }
  .delta-meta { display: grid; gap: 6px; padding-bottom: 8px; color: var(--muted); font-size: 14px; }
  .delta-meta b { color: var(--text); font: 800 26px/1 var(--display); text-transform: uppercase; }
  .season-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 4px; margin: 0; padding: 0; list-style: none; }
  .season-strip li { display: grid; place-items: center; min-height: 40px; padding: 0 6px; border: 1px solid var(--place, var(--line)); color: var(--place, var(--muted)); font: 800 12px/1 var(--body); letter-spacing: .04em; text-transform: uppercase; }
  .season-strip li.place-Campeão, .event.place-Campeão .place-badge { background: color-mix(in srgb, var(--gold) 16%, transparent); }
  .note { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid var(--line); color: var(--muted); font-size: 14px; }
  .note.warn { border-color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 8%, var(--surface)); }
  .note.warn b { color: var(--accent-2); }
  .offers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 10px; }
  .offer { display: grid; gap: 8px; align-content: start; min-width: 0; padding: 16px; border: 1px solid color-mix(in srgb, var(--muted) 40%, var(--line)); background: var(--surface-2); color: var(--text); text-align: left; cursor: pointer; transition: border-color .16s ease, transform .16s ease; }
  .offer:hover { border-color: var(--accent); transform: translateY(-3px); }
  .offer .label { margin: 0; }
  .offer .label.up { color: var(--accent); }
  .offer > b { font-size: 28px; overflow-wrap: break-word; }
  .offer .ln { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 14px; }
  .offer .ln b { color: var(--text); text-align: right; }
  .offer .ln b.accent { color: var(--accent); }
  .offer.stay { border-style: dashed; }

  /* Ao vivo */
  .live-strip { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
  .live-strip strong { min-width: 0; font: 800 20px/1 var(--display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .live-tag-tier { margin-left: auto; padding: 4px 8px; border: 1px solid var(--line); color: var(--muted); font: 800 11px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .live-badge { display: inline-flex; align-items: center; gap: 7px; color: var(--danger); font: 900 12px/1 var(--body); letter-spacing: .14em; white-space: nowrap; }
  .live-badge i { width: 8px; height: 8px; background: var(--danger); animation: pulse 1.2s infinite; }
  .live-strip.done { border-color: var(--line); background: var(--surface-2); }
  .live-strip.done .live-badge { color: var(--muted); }
  .live-strip.done .live-badge i { background: var(--muted); animation: none; }
  .chip-note { display: inline-block; margin: 0; padding: 8px 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); font: 700 12px/1.3 var(--body); letter-spacing: .06em; text-transform: uppercase; }
  .run-controls { display: flex; align-items: end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .speed-group { display: grid; gap: 6px; }
  .speed-group > span { color: var(--muted); font: 800 12px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .finish { display: grid; gap: 0; }
  .series { margin: 0; font: 900 32px/1 var(--display); text-transform: uppercase; letter-spacing: .02em; }

  /* Round decisivo: a decisão dentro do placar */
  .clutch { display: grid; gap: 14px; margin-top: 12px; padding: 16px; border: 1px solid var(--accent); background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--accent) 9%, var(--surface)) 0%, var(--surface) 70%); animation: clutch-in 380ms cubic-bezier(.16, 1, .3, 1); }
  /* Mesma ordem do placar do viewer logo acima: time A à esquerda, B à direita. */
  .board { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 12px; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .board .label { margin: 0; text-align: center; }
  .side-cell { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .side-cell.right { justify-content: flex-end; }
  .side { font: 800 13px/1 var(--body); letter-spacing: .12em; }
  .side-ct { color: var(--ct); }
  .side-t { color: var(--t); }
  .money { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .outcome { margin-top: 12px; }
  @keyframes clutch-in { from { opacity: 0; transform: translateY(12px); } }
  .clutch-q h2 { font-size: clamp(32px, 4.6vw, 54px); }
  .calls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .call { display: grid; gap: 10px; align-content: start; min-height: 132px; padding: 16px; border: 1px solid color-mix(in srgb, var(--muted) 40%, var(--line)); background: var(--surface-2); color: var(--text); text-align: left; cursor: pointer; transition: border-color .14s ease, transform .14s ease; }
  .call:hover { border-color: var(--accent); transform: translateY(-3px); }
  .call:active { transform: translateY(0); }
  .call b { font: 800 26px/.98 var(--display); text-transform: uppercase; }
  .risk { justify-self: start; padding: 5px 9px; font: 800 12px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .risk-solid { background: color-mix(in srgb, var(--ct) 18%, var(--surface)); color: var(--ct); }
  .risk-read { background: color-mix(in srgb, var(--t) 18%, var(--surface)); color: var(--t); }
  .risk-gamble { background: color-mix(in srgb, var(--accent-2) 18%, var(--surface)); color: var(--accent-2); }
  .risk-team { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent); }
  .risk-hint { color: var(--muted); font-size: 14px; line-height: 1.4; }
  .auto { display: flex; align-items: center; gap: 10px; min-height: 44px; color: var(--muted); font-size: 14px; cursor: pointer; }
  .auto input { width: 20px; min-height: 0; height: 20px; padding: 0; accent-color: var(--accent); }
  .auto b { color: var(--text); }
  .last-call { margin: 0; color: var(--muted); font: 700 13px/1.3 var(--body); letter-spacing: .04em; text-transform: uppercase; }
  .last-call.chip-note.won { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); color: var(--accent); }
  .last-call.resolving { color: var(--accent-2); animation: pulse 1.1s infinite; }
  .outcome { display: grid; gap: 10px; padding: 20px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface)); }
  .outcome.lost { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 7%, var(--surface)); }
  .outcome-line { margin: 0; font: 900 clamp(40px, 6vw, 64px)/.9 var(--display); text-transform: uppercase; color: var(--accent); }
  .outcome.lost .outcome-line { color: var(--danger); }
  .outcome-story { max-width: 70ch; margin: 0; font-size: 15px; line-height: 1.55; }
  .outcome-btn { justify-self: start; min-height: 48px; padding: 0 22px; border: 1px solid currentColor; background: transparent; color: var(--accent); font: 800 14px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
  .outcome.lost .outcome-btn { color: var(--text); }
  .outcome-btn:hover { background: color-mix(in srgb, currentColor 12%, transparent); }

  /* Aposentadoria */
  .retired { display: grid; gap: 22px; padding: clamp(20px, 4vw, 44px); border: 1px solid var(--line); background: var(--surface); }
  .retired-head h1 { font-size: clamp(64px, 12vw, 140px); line-height: .8; overflow-wrap: break-word; }
  .verdict { margin: 12px 0 0; color: var(--accent); font: 600 clamp(17px, 2.4vw, 22px)/1.4 var(--body); }
  .retired-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
  .curve { display: grid; grid-template-rows: auto minmax(120px, 1fr); gap: 10px; margin: 0; padding: 14px; border: 1px solid var(--line); background: var(--surface-2); }
  .curve figcaption { display: flex; justify-content: space-between; color: var(--muted); font-size: 13px; }
  .curve figcaption b { color: var(--accent); }
  .curve .label { margin: 0; }
  .curve svg { width: 100%; height: 100%; min-height: 120px; }
  .trajectory ol { display: grid; margin: 0; padding: 0; list-style: none; }
  .trajectory li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 40px; border-bottom: 1px solid var(--line); font-size: 14px; }
  .trajectory li i { width: 10px; height: 10px; background: var(--muted); }
  .trajectory li.top i { background: var(--gold); }
  .trajectory li .num { color: var(--muted); font-variant-numeric: tabular-nums; }
  .boxes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .box { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .box span { color: var(--muted); font: 700 12px/1.2 var(--body); text-transform: uppercase; letter-spacing: .1em; }
  .box b { font: 900 38px/1 var(--display); color: var(--text); font-variant-numeric: tabular-nums; }
  .box b.gold { color: var(--gold); }
  .titles-list { margin: 0; color: var(--text); font-size: 15px; line-height: 1.6; }
  .titles-list .label { display: block; }

  /* Modais */
  .modal-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / 70%); animation: fade-in 160ms ease; }
  .modal { display: grid; gap: 14px; width: min(560px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 18px; border: 1px solid var(--line); background: var(--surface); box-shadow: var(--shadow); animation: modal-in 260ms cubic-bezier(.16, 1, .3, 1); }
  .modal.wide { width: min(900px, 100%); }
  .modal.confirm { width: min(460px, 100%); gap: 12px; padding: 24px; }
  .modal.confirm h2 { font-size: 36px; }
  .modal.confirm p { margin: 0; color: var(--muted); line-height: 1.5; }
  .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .event-sheet { gap: 16px; }
  .event-title { font-size: clamp(34px, 4vw, 52px); }
  .event-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; margin: 0; }
  .event-facts div { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .event-facts dt { color: var(--muted); font: 700 11px/1.2 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .event-facts dd { margin: 0; font: 600 15px/1.3 var(--body); }
  .event-facts dd.placed { color: var(--place); font: 900 24px/1 var(--display); text-transform: uppercase; }
  .event-facts dd.hot { color: var(--accent); }
  .field ol { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .field li { display: grid; grid-template-columns: 28px minmax(0, 1.3fr) auto minmax(80px, 1fr) 36px; gap: 12px; align-items: center; min-height: 44px; padding: 4px 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .field li.mine { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface-2)); }
  .field-rank { color: var(--muted); font: 800 18px/1 var(--display); }
  .field-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 800 18px/1.1 var(--display); text-transform: uppercase; text-align: left; }
  .field-name.link { min-height: 36px; padding: 0; border: 0; background: none; color: var(--text); cursor: pointer; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent); text-underline-offset: 4px; }
  .field-name.link:hover { color: var(--accent); }
  .field-tags { display: flex; gap: 4px; }
  .tag { padding: 3px 6px; border: 1px solid var(--line); color: var(--muted); font: 800 10px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .tag.fav { border-color: var(--gold); color: var(--gold); }
  .tag.me { border-color: var(--accent); color: var(--accent); }
  .field-bar { height: 6px; background: color-mix(in srgb, var(--line) 80%, transparent); }
  .field-bar i { display: block; height: 100%; background: var(--muted); }
  .field li.mine .field-bar i { background: var(--accent); }
  .field li:first-child .field-bar i { background: var(--gold); }
  .field-ovr { font: 900 20px/1 var(--display); text-align: right; font-variant-numeric: tabular-nums; }
  .move-sheet { gap: 14px; }
  .move-sheet h2 { font-size: clamp(32px, 4vw, 48px); }
  .move-sheet.cut { border-color: var(--accent-2); }
  .move-reason { margin: 0; color: var(--muted); line-height: 1.5; }
  .modal-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .modal-head .eyebrow { margin: 0; }
  .modal-note { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
  .sheet-bond { display: grid; gap: 10px; padding: 6px 6px 4px; }
  .sheet-bond-copy { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 14px; }
  .sheet-bond-copy .label { margin: 0; }
  .sheet-bond-copy b { font: 900 30px/1 var(--display); color: var(--text); font-variant-numeric: tabular-nums; }
  .sheet-bond-copy b small { font: 700 13px/1 var(--body); color: var(--muted); }
  .sheet-bond-copy b.high { color: var(--accent); }
  .sheet-bond-copy b.low { color: var(--accent-2); }
  .sheet-bond .bond-bar { height: 8px; }
  .sheet-talk { margin-top: 2px; min-height: 52px; font-size: 20px; }
  .sheet-talk-line { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.45; }
  @keyframes fade-in { from { opacity: 0; } }
  @keyframes modal-in { from { opacity: 0; transform: translateY(10px) scale(.98); } }

  /* Tablet: o trilho vira cabeçalho */
  @media (max-width: 960px) {
    .career { grid-template-columns: minmax(0, 1fr); }
    .rail { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px 20px; padding: 18px 16px; border-right: 0; border-bottom: 1px solid var(--line); }
    .rail-head { grid-column: 1 / -1; }
    .ovr-num { font-size: 76px; }
    .pyramid { grid-column: 1 / -1; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
    .pyramid li { justify-content: center; text-align: center; min-height: 40px; padding: 4px; font-size: 11px; letter-spacing: .04em; }
    .pyramid li.here { min-height: 40px; flex-wrap: nowrap; }
    .rung-org, .rung-mark { display: none; }
    .seat-line { grid-column: 1 / -1; }
  }

  /* Celular: o elenco vira faixa com snap; nada estoura a largura */
  @media (max-width: 680px) {
    .grid2 { grid-template-columns: minmax(0, 1fr); }
    .season-summary { grid-template-columns: minmax(0, 1fr); }
    .week-grid { grid-template-columns: minmax(0, 1fr); }
    .skills-pick button { padding: 0 6px; font-size: 12px; min-height: 40px; }
    .ft-actions { flex-wrap: wrap; }
    .week-cards { grid-template-columns: minmax(0, 1fr); }
    .path { grid-template-columns: minmax(0, 1fr); }
    .pace { flex-wrap: wrap; }
    .field li { grid-template-columns: 22px minmax(0, 1fr) 32px; gap: 4px 10px; padding: 8px 10px; }
    .field-tags { grid-column: 2 / -1; grid-row: 2; flex-wrap: wrap; }
    .field-bar { display: none; }
    .next { grid-template-columns: minmax(0, 1fr); }
    .next h2 { white-space: normal; }
    .report { padding-left: 0; border-left: 0; }
    .squad-strip { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 164px; scroll-snap-type: x mandatory; scroll-padding-inline: 14px; margin-inline: -14px; padding: 0 14px 8px; }
    .rail { grid-template-columns: minmax(0, 1fr); }
    .ovr { gap: 12px; }
    .pyramid li { font-size: 11px; letter-spacing: .02em; }
    .rung-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .rung-short { display: inline; }
    .stage { padding: 20px 14px; gap: 22px; }
    .calls { grid-template-columns: minmax(0, 1fr); }
    .board { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .board .label { grid-column: 1 / -1; grid-row: 1; }
    .clutch { padding: 12px; }
    .call { min-height: 0; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 6px 12px; }
    .call .risk-hint { grid-column: 1 / -1; font-size: 13px; }
    .call b { font-size: 22px; }
    .retired-grid { grid-template-columns: minmax(0, 1fr); }
    .boxes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .live-tag-tier { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .deal, .delta-to, .clutch, .modal, .modal-backdrop { animation: none; }
    .cta, .card, .offer, .call { transition: none; }
    .cta:hover:not(:disabled), .card:hover, .offer:hover, .call:hover { transform: none; }
  }
</style>
