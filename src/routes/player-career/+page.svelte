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
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import SeriesViewer from '$lib/components/SeriesViewer.svelte';
  import MajorOverview from '$lib/components/MajorOverview.svelte';
  import MajorAwardsPanel from '$lib/components/MajorAwardsPanel.svelte';
  import TeamBadge from '$lib/components/TeamBadge.svelte';
  import CareerEventReport from '$lib/components/CareerEventReport.svelte';
  import CareerWrapped from '$lib/components/CareerWrapped.svelte';
  import { buildRetrospective } from '$lib/game/playerCareer/retrospective';
  import CareerHltvTop from '$lib/components/CareerHltvTop.svelte';
  import CareerWorld from '$lib/components/CareerWorld.svelte';
  import CareerHonors from '$lib/components/CareerHonors.svelte';
  import { honorsIndex, type PlayerHonors } from '$lib/game/playerCareer/honors';
  import { LAST_ROUND_FEED_FACTOR } from '$lib/game/seriesPresentation';
  import { ATTR_LABEL, CATEGORY_LABEL, FREE_TRAINING_COST, ROLE_SKILLS, TRAINABLE, TIRED_AT, actionChips, applyAgenda, applyCustomTraining, blocksLeft, coachTalk, coachTalksLeft, coachTipsOf, contactOf, costOf, customTrainingSplit, diminishOf, drawAgenda, pickedThisWeek, weekBlocks, type AgendaChip } from '$lib/game/playerCareer/agenda';
  import type { Player, PlayerRunStats } from '$lib/game/types';
  import type { CampaignMajorState } from '$lib/game/campaign-major';
  import type { LiveSeriesState } from '$lib/game/online/live-series';
  import { getCurrentSideA } from '$lib/game/rounds';
  import { MAP_NAMES } from '$lib/game/maps';
  import { toSeriesResult } from '$lib/game/online/live-series';
  import { createRunStats } from '$lib/game/runStats';
  import { clutchStory, logDecision, mapTarget, situationBomb, type ClutchProfile, type ReadQuality } from '$lib/game/playerCareer/decisions';
  import { answerTalk, decisiveLine, dismissTalk, markLineUsed, momentTalk, openDialogue, opensDialogue, quickTalk, seasonTalk, speakerOf, startTalk, MOMENT_LABEL, SITUATION_LABEL, type TalkChip, type TalkMoment } from '$lib/game/playerCareer/talks';
  import { tickLife } from '$lib/game/playerCareer/tick';
  import { careerLog } from '$lib/game/playerCareer/careerLog';
  import { DILEMMA_BY_ID, resolveDilemma, rollDilemma } from '$lib/game/playerCareer/dilemmas';
  import { lifeOf, livesAbroad, mindBump } from '$lib/game/playerCareer/life';
  import { CEILING_BONUS_CAP, seasonSwing, trainingOutlook } from '$lib/game/playerCareer/growth';
  import {
    ARCHETYPES, ROLE_META, acceptMove, agePhase, acceptOffer, declineMove, canRequestTransfer, requestTransfer, goToLanHouse, midSeasonCheck, chooseStartingOrg, createPlayerCareer, ensureCircuitFrom, ensureDraw, eventsFor, finishSeason,
    marketValueUsd, orgOf, recordEventResult, retire, seatToTake, startSeason, stayAtOrg, trophyCase,
    type BracketLine, type PlayHighlight, type PlayerArchetype, type PlayerCareerState, type PlayerRole, type TournamentResult, type TrainedAttribute
  } from '$lib/game/playerCareer/engine';
  import { NEXT_STAGE, PLACEMENT_ORDER, STAGE_NAME, advanceToFinal, awardsSoFar, eventTeams, userEnginePlayers, placementLabel, userStage, careerMapPool, majorInvites, advancedFromSwiss, eventDone, eventSetup, finishSceneEvent, finishSceneStage, majorEntryStage, notQualified, swissRecord, type EventSetup, type MajorStageKey, type StageCarry, lineupOf, playClutchRound, roundContextOf, sceneEventField, sceneEventResult, simulateSceneEvent, userBracketPath, type SceneEventOutcome, sceneOrgEnginePlayers, serializeSceneEvent, startSceneEvent, stepSceneEvent, type SceneClutchContext, type SceneClutchMoment } from '$lib/game/playerCareer/live';
  import { coachOfOrg } from '$lib/game/playerCareer/coaches';
  import { TRAIN_CAP, registerCareerWorld, careerCoachOf, canSwapRoles, naturalRoleOf, planOf, promoteReserve, swapMateRoles, celebrateResult, coachOf, ensureSquad, matesOf, myLanguageFit, trainMap, canChangeRole, changeRole, canKickMate, kickMate, myPlayerOf, synergyBump, talkTo, trainingWindowOf, type SquadMate } from '$lib/game/playerCareer/squad';
  import { orgLanguage, sceneCountries, sceneOrgById, sceneOrgs } from '$lib/game/playerCareer/data';
  import { randomNick } from '$lib/game/playerCareer/extraTeams';
  import { LANGUAGE_LABEL, fluencyLabel, myFluency, teamLanguage, languagePenalty } from '$lib/game/playerCareer/language';
  import { mapProfile } from '$lib/game/playerCareer/careerMaps';
  import type { MapId } from '$lib/game/types';
  import { RIVAL_CHOICES, answerRival, rollRival, settleRival } from '$lib/game/playerCareer/rivals';
  import { HAPPENING_BY_ID, SEVERITY_LABEL, TRIGGER_LABEL, happeningSuccessChance, resolveHappening, rollHappening, type HappeningChip } from '$lib/game/playerCareer/happenings';
  import { headlineRetirements, headlineTransfers, orgIn, risingProspects, seatMovesOf } from '$lib/game/playerCareer/world';
  import { circuitReady } from '$lib/game/playerCareer/circuit';
  import { applyQualifierResult, entryKind, qualifierTargetName, resolveInvitedQualifier } from '$lib/game/playerCareer/qualifiers';
  import { freezeRanking, teamRankOf, teamRanking } from '$lib/game/playerCareer/ranking';
  import { circuitProgress, scheduleCircuit, stopCircuit } from '$lib/game/playerCareer/circuitRunner';
  import { cardInfoFor, scoutPlayers, type ScoutHit } from '$lib/game/playerCareer/scout';
  import { MONTH_LABEL, TIER_LABEL, type EventTier } from '$lib/game/playerCareer/calendar';
  import { eventArcOf, type EventArc, type FormPhase } from '$lib/game/playerCareer/form';
  import { currentLevelOf, eventTierLabel, seasonLevelOf, TEAM_TIER_ABOUT, TEAM_TIER_LABEL, teamTierAbout, teamTierLabel, teamTierTitle, type TeamTier } from '$lib/game/playerCareer/tiers';

  const STORAGE_KEY = 'cs13a0-player-career-v1';
  const PLACEMENT: Record<string, string> = { quarter: 'Quartas', semi: 'Semis', runnerUp: 'Vice', champion: 'Campeão' };
  /** O mesmo controle de velocidade do resto do jogo (sandbox): mesmos rótulos, mesmos delays. Padrão ULTRA. */
  const SPEED_DELAYS = { normal: 1500, fast: 650, ultra: 180, insta: 0 } as const;
  const SPEED_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Rápido' },
    { value: 'ultra', label: 'Ultra' },
    { value: 'insta', label: 'Insta' }
  ];
  /** A pirâmide da cena, de cima pra baixo: onde a carreira pode chegar e onde você está (rótulos de tiers.ts). O
   *  nível 0 é o top 8, a Elite dentro do Tier S. */
  const PYRAMID_SHORT: Record<number, string> = { 0: 'Elite', 1: 'S', 2: 'A', 3: 'B', 4: 'C', 5: 'Lan' };
  const PYRAMID = [0, 1, 2, 3, 4, 5].map((level) => ({ level, label: teamTierTitle(level), short: PYRAMID_SHORT[level], about: teamTierAbout(level) }));
  /** Os tiers de time, um por linha, com a descrição (o "O que é cada tier" embaixo da pirâmide). */
  const TIER_GUIDE = (Object.keys(TEAM_TIER_LABEL) as TeamTier[]).map((tier) => ({ tier, label: TEAM_TIER_LABEL[tier], about: TEAM_TIER_ABOUT[tier] }));
  /** Quando cada estilo é a leitura certa (decisions.ts, readOf): a certa vale muito, a errada custa o round. */
  const RISK: Record<ClutchProfile, { label: string; hint: string }> = {
    solid: { label: 'Seguro', hint: 'Certo com vantagem no placar, no round ou contra eco.' },
    read: { label: 'Leitura', hint: 'Certo quando você é melhor no duelo ou eles repetem jogada.' },
    gamble: { label: 'All-in', hint: 'Certo atrás no placar, sem dinheiro ou sem tempo. É moeda.' },
    team: { label: 'Coletivo', hint: 'Certo com o time entrosado e em vantagem numérica.' }
  };
  const QUALITY_LABEL: Record<ReadQuality, string> = { good: 'Leitura certa', ok: 'Leitura razoável', bad: 'Leitura errada' };
  const MONTH_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  type PlayMode = NonNullable<PlayerCareerState['playMode']>;
  const PLAY_MODE_OPTIONS = [
    { value: 'all', label: 'Jogar todos' },
    { value: 'every2', label: '1 a cada 2' },
    { value: 'finals', label: 'Só as finais' }
  ];
  const PACE_CTA = { live: 'Jogar campeonato', sim: 'Simular campeonato', final: 'Simular até a final' } as const;
  /** Colocação curta pro quadradinho do calendário. */
  const PLACE_SHORT: Record<string, string> = { Quartas: 'Quartas', Semis: 'Semi', Vice: 'Vice', 'Campeão': 'Título', 'Fase suíça': 'Suíça', 'Stage 1': 'Stage 1', 'Stage 2': 'Stage 2', 'Não classificado': 'Fora', Folga: 'Folga', Classificado: 'Classif.', Eliminado: 'Fora', Convidado: 'Convite' };
  /** Colocação → chave de CSS sem espaço nem acento. */
  const PLACE_KEY: Record<string, string> = { Quartas: 'Quartas', Semis: 'Semis', Vice: 'Vice', 'Campeão': 'Campeão', 'Fase suíça': 'Suica', 'Stage 1': 'Stage', 'Stage 2': 'Stage', 'Não classificado': 'Fora', Folga: 'Fora', Classificado: 'Semis', Eliminado: 'Fora', Convidado: 'Semis' };
  const REGION_LABEL: Record<string, string> = { sa: 'América do Sul', na: 'América do Norte', eu: 'Europa', asia: 'Ásia', oce: 'Oceania' };
  const moneyLabel = (value: number) => (value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `${value}`);
  const placeKey = (placement: string | undefined) => (placement ? PLACE_KEY[placement] ?? 'Quartas' : 'none');
  /** "DreamHack Open South America Revival 2028" → "DreamHack Open South America 2028" (o selo "Retorno" diz o resto). */
  const eventName = (name: string) => name.replace(/\s+Revival(?=\s+\d{4}$|$)/i, '');
  const FORMAT_SHORT = (entry: { format?: string } | null | undefined) => (entry?.format === 'major' ? 'Major' : entry?.format === 'swiss16' ? 'Suíça de 16' : 'Mata-mata de 8');
  const SERIES_SHORT = (entry: { format?: string; finalBestOf?: number } | null | undefined) =>
    entry?.format === 'major' ? '3 stages · final MD5' : entry?.format === 'swiss16' ? `Suíça MD3 · final MD${entry.finalBestOf ?? 5}` : `MD3 · final MD${entry?.finalBestOf ?? 3}`;
  const prizeLabel = (value: number) => (value >= 1000000 ? `US$ ${(value / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : value >= 1000 ? `US$ ${Math.round(value / 1000).toLocaleString('pt-BR')} mil` : `US$ ${value}`);
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
  // Vazio no servidor; no navegador já vem um nick sorteado (dá para sortear de novo ou apagar e digitar).
  let nick = '';
  let country = 'Brazil';
  let role: PlayerRole = 'awper';
  let archetype: PlayerArchetype = 'prodigio';

  let live: CampaignMajorState | null = null;
  let liveIndex = -1;
  /** Major: stage em andamento, séries dos stages anteriores e o formato do campeonato ao vivo. */
  let liveStage: MajorStageKey | null = null;
  let stageCarry: StageCarry = { wins: 0, losses: 0 };
  /** Fase do time e estudo dos rivais do campeonato ao vivo, congelados quando ele começou (form.ts). */
  let liveArc: EventArc | null = null;
  /** A explicação do indicador de fase e estudo aberta (no celular não há dica ao passar o mouse). */
  let arcHelp = false;
  let liveSetup: EventSetup = { swiss: false, swissOnly: false, opponents: 7, levels: [3, 5], finalBestOf: 3, stage: null };
  let stageBanner: string | null = null;
  let clutch: SceneClutchMoment | null = null;
  /** O que a call deu: o round, a história e se a leitura foi a certa (e qual era). */
  type CallResult = { text: string; won: boolean; story: string; quality?: ReadQuality; reason?: string; bestText?: string; quote?: { who: string; text: string } };
  let lastCall: CallResult | null = null;
  let callOutcome: CallResult | null = null;
  /** O round decisivo acabou de rodar: o kill feed ainda está contando a história. */
  let resolving = false;
  /** Enquanto o round decisivo roda (e o resultado está na tela), o viewer fica parado no mapa/round da sua
   *  call — senão, quando a call fecha o mapa ou a série, ele pula pro próximo antes do kill feed tocar. */
  let frozenView: { map: number; round: number } | null = null;
  let resolveFallback: number | null = null;
  let pendingOutcome: CallResult | null = null;
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
  /** Celular: quando cada call é certa fica atrás de um toque (no computador aparece sempre embaixo de cada call). */
  let callHints = false;
  let menuOpen = false;
  let statsOpen = false;
  let trophiesOpen = false;
  /** Tela Mundo: ranking de times, top jogadores, trocas e campeonatos do mundo (abre a qualquer momento). */
  let worldOpen = false;
  /** Visão do campeonato ao vivo (suíça, tabela com Buchholz e chave), a mesma do Major offline e do online. */
  let overviewOpen = false;
  /** Busca de jogador (onde foi parar o ZywOo). */
  let scoutOpen = false;
  let scoutQuery = '';
  /** Resultado do acontecimento escolhido (fica na tela até "Continuar") e o campeonato que esperava por ele. */
  let happeningResult: { situation: string; trigger: string; line: string; chips: HappeningChip[]; success: boolean } | null = null;
  let queuedStart: { index: number; mode: 'pace' | 'live' | 'sim' } | null = null;
  /** Campeonato aberto no detalhe do calendário (índice) — null fechado. */
  let eventSheet: number | null = null;
  let eventError: string | null = null;
  /** Ação destrutiva esperando confirmação (apagar a carreira, pendurar o mouse). */
  let confirming: { title: string; body: string; confirmLabel: string; danger: boolean; run: () => void } | null = null;
  let lastTalk: { mateId: string; line: string; delta: number } | null = null;
  /** Treino livre: as habilidades marcadas (até 4). */
  let pickedSkills: TrainedAttribute[] = [];
  let mapPick: MapId | '' = '';
  let sheetStageTab: string | null = null;
  /** Id da org pelo nome (para o escudo certo nas listas que guardam só o nome). */
  const orgIdByName = (name: string) => sceneOrgs.find((org) => org.name === name)?.id ?? name;
  /** Escolha de função nova (aberta pelo elenco) e o recado do vestiário (troca de função, saída de parceiro). */
  let roleSheetOpen = false;
  /** Aviso rápido em cima de uma carta (conversa, troca de função, saída de parceiro): some em 5 s. */
  let cardNotice: { id: string; who: string; text: string; tone: 'good' | 'bad' | 'neutral' } | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  function notify(id: string, who: string, text: string, tone: 'good' | 'bad' | 'neutral') {
    if (noticeTimer) clearTimeout(noticeTimer);
    cardNotice = { id, who, text, tone };
    noticeTimer = setTimeout(() => (cardNotice = null), 5000);
  }
  function dismissNotice() {
    if (noticeTimer) clearTimeout(noticeTimer);
    cardNotice = null;
  }
  const ROLE_CHOICES: PlayerRole[] = ['igl', 'awper', 'entry', 'lurker', 'support'];
  function roleChance(state: PlayerCareerState, role: PlayerRole): number {
    const me = myPlayerOf(state);
    const skill = role === 'awper' ? me.awp : role === 'igl' ? me.igl : role === 'entry' ? me.entry : role === 'support' ? me.support : role === 'lurker' ? me.clutch : me.firepower;
    return Math.round(Math.max(0.2, Math.min(0.85, 0.45 + ((Number(skill ?? 60) - Number(me.overall ?? 70)) / 40) + ((state.morale ?? 60) - 60) / 200)) * 100);
  }
  function pickRole(role: PlayerRole) {
    if (!career) return;
    const result = changeRole(career, role);
    career = result.state;
    notify(`${result.state.seed}:me`, result.good ? 'Encaixou.' : 'Não encaixou.', result.line.replace(/^(Encaixou|Ainda não encaixou): /, ''), result.good ? 'good' : 'bad');
    roleSheetOpen = false;
  }
  /** Banco: escolher quem sai para o reserva entrar; IGL troca a função de dois parceiros. */
  let promoteOpen = false;
  /** Janela da evolução: fase da carreira, treino e se o overall ainda sobe. */
  let evoOpen = false;
  function benchMate(mateId: string) {
    if (!career) return;
    const result = promoteReserve(career, mateId);
    career = result.state;
    promoteOpen = false;
    closeSheet();
    notify(`${career.seed}:me`, 'Banco:', result.line, 'neutral');
  }
  function swapRoles(mateA: string, mateB: string) {
    if (!career) return;
    const result = swapMateRoles(career, mateA, mateB);
    career = result.state;
    closeSheet();
    notify(mateA, 'IGL:', result.line, result.done ? 'good' : 'bad');
  }
  function askKick(mateId: string, nick: string) {
    if (!career || !canKickMate(career)) return;
    askConfirm({
      title: `Pedir a saída de ${nick}?`,
      body: 'A diretoria decide pela sua força contra a dele, sua reputação, seus fãs e a relação de vocês. Se aceitar, entra um substituto (pode ser melhor ou pior) e o elenco sente. Se recusar, ele fica sabendo. Uma vez por temporada.',
      confirmLabel: 'Pedir a saída',
      danger: true,
      run: () => {
        if (!career) return;
        const result = kickMate(career, mateId);
        career = result.state;
        notify(`${result.state.seed}:me`, 'Vestiário:', result.line, result.accepted ? 'good' : 'bad');
        closeSheet();
      }
    });
  }
  const PHASE_LABEL: Record<string, string> = { stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3', quarterfinal: 'Quartas', semifinal: 'Semis', final: 'Final' };
  /** O que aconteceu na semana (escolha feita) e o último retorno do coach. */
  let weekLine: string | null = null;
  let weekChips: AgendaChip[] = [];
  let coachLine: string | null = null;
  let lastEventReport: { index: number; name: string; placement: string; rating: number; wins: number; losses: number; stats: PlayerRunStats[]; players: Player[]; result: TournamentResult; rivalLine?: string | null } | null = null;

  // Quem cedeu a vaga para você vai para outro time no mundo e os jogadores criados na sua carreira ficam nos times
  // deles (antes de qualquer leitura de elenco).
  $: if (career) registerCareerWorld(career);
  $: if (career) persist(career);
  // O circuito do mundo joga em segundo plano o que já aconteceu até o mês do seu próximo campeonato.
  $: if (career) scheduleCircuit(career);

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

  const rollNick = () => { nick = randomNick(`${Date.now()}:${Math.random()}`); };

  onMount(() => {
    if (!nick) rollNick();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) career = ensureCircuitFrom(ensureSquad(ensureDraw(JSON.parse(saved) as PlayerCareerState)));
      // Recarregou enquanto a temporada fechava: ela fecha quando o mundo terminar o ano.
      if (career?.status === 'ACTIVE' && career.calendar?.length && career.calendar.every((entry) => entry.status === 'PLAYED') && !career.pendingDilemma && !career.pendingHappening && !career.pendingMove) seasonClosing = true;
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

  /** Conversar: com situação no ar (atrito, mental, sequência), abre a conversa com 3 respostas; sem, é o papo rápido. */
  function chat(mateId: string) {
    if (!career) return;
    const speaker = speakerOf(career, 'mate', mateId);
    const talk = speaker ? startTalk(career, speaker) : null;
    if (talk && opensDialogue(career, talk)) { career = openDialogue(career, talk); return; }
    if (talk) {
      // A fala do momento sem escolha: vai para o aviso rápido.
      const quick = quickTalk(career, talk);
      career = quick.state;
      notify(mateId, `${talk.speaker.name}:`, `“${quick.line}”${quick.delta ? ` Relação ${quick.delta > 0 ? '+' : '−'}${Math.abs(quick.delta)}.` : ''}`, quick.delta > 0 ? 'good' : quick.delta < 0 ? 'bad' : 'neutral');
      return;
    }
    const result = talkTo(career, mateId);
    career = result.state;
    lastTalk = { mateId: result.mateId, line: result.line, delta: result.delta };
    const nick = matesOf(result.state).find((mate) => mate.player.id === result.mateId)?.player.nickname ?? 'Parceiro';
    notify(result.mateId, `${nick}:`, `${result.line}${result.delta ? ` Relação ${result.delta > 0 ? '+' : '−'}${Math.abs(result.delta)}.` : ''}`, result.delta > 0 ? 'good' : result.delta < 0 ? 'bad' : 'neutral');
  }


  function chatReserve() {
    if (!career) return;
    const speaker = speakerOf(career, 'reserve');
    if (!speaker) return;
    promoteOpen = false;
    const talk = startTalk(career, speaker);
    if (talk && opensDialogue(career, talk)) { career = openDialogue(career, talk); return; }
    if (talk) {
      const quick = quickTalk(career, talk);
      career = quick.state;
      notify(`${career.seed}:me`, `${speaker.name} (banco):`, `“${quick.line}”${quick.delta ? ` Relação ${quick.delta > 0 ? '+' : '−'}${Math.abs(quick.delta)}.` : ''}`, quick.delta > 0 ? 'good' : quick.delta < 0 ? 'bad' : 'neutral');
      return;
    }
    const result = talkTo(career, speaker.id);
    career = result.state;
    notify(`${career.seed}:me`, `${speaker.name} (banco):`, `${result.line}${result.delta ? ` Relação ${result.delta > 0 ? '+' : '−'}${Math.abs(result.delta)}.` : ''}`, result.delta > 0 ? 'good' : result.delta < 0 ? 'bad' : 'neutral');
  }

  let talkResult: { who: string; situation: string; moment: TalkMoment; line: string; chips: TalkChip[]; good: boolean; tip?: string } | null = null;

  function answerPendingTalk(key: 'ouvir' | 'propor' | 'firme') {
    if (!career?.pendingTalk) return;
    const talk = career.pendingTalk;
    const answer = answerTalk(career, key);
    career = answer.state;
    let tip: string | undefined;
    // Conversa puxada por você com o coach: depois da resposta ele ainda dá a dica da temporada (conta 1 das 3).
    if (talk.speaker.kind === 'coach' && talk.moment === 'click') {
      const coached = coachTalk(career, myPlayerOf(career));
      career = coached.state;
      coachLine = coached.line;
      tip = coached.line;
    }
    talkResult = { who: talk.speaker.name, situation: SITUATION_LABEL[talk.situation], moment: talk.moment, line: answer.line, chips: answer.chips, good: answer.good, tip };
  }

  let dilemmaResult: { title: string; line: string; chips: AgendaChip[] } | null = null;

  function chooseDilemma(key: 'A' | 'B' | 'C') {
    if (!career?.pendingDilemma) return;
    const dilemma = DILEMMA_BY_ID.get(career.pendingDilemma.id);
    const outcome = resolveDilemma(career, key);
    career = outcome.state;
    dilemmaResult = { title: dilemma?.title ?? '', line: outcome.line, chips: outcome.chips };
  }

  function closeDilemma() {
    dilemmaResult = null;
    if (career?.calendar?.length && career.calendar.every((entry) => entry.status === 'PLAYED')) closeSeason(career);
  }

  function closeTalk() {
    if (career?.pendingTalk) career = dismissTalk(career);
    talkResult = null;
    const queued = queuedStart;
    queuedStart = null;
    if (!career || !queued || career.pendingMove || career.calendar?.[queued.index]?.status !== 'UPCOMING') return;
    if ((career.benchedEvents ?? 0) > 0) simulateEvent(queued.index);
    else launchEntry(queued.index, queued.mode);
  }

  function openEvent(index: number) {
    eventSheet = index;
    sheetStageTab = null;
    document.body.classList.add('modal-open');
  }

  function closeEventSheet() {
    eventSheet = null;
    if (!detailsPlayer && !opponentOrgId && !confirming && !statsOpen) document.body.classList.remove('modal-open');
  }

  function playFromSheet(index: number) {
    closeEventSheet();
    begin(index, 'live');
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

  /** O que espera o circuito do mundo fechar os campeonatos de antes do mês (a chave sai do ranking do mês anterior). */
  let waitingCircuit: (() => void) | null = null;
  function circuitGate(retry: () => void): boolean {
    if (!career || circuitReady(career)) return true;
    waitingCircuit = retry;
    return false;
  }
  $: if (waitingCircuit && career && $circuitProgress.tick >= 0 && circuitReady(career)) {
    const retry = waitingCircuit;
    waitingCircuit = null;
    retry();
  }

  /** A próxima é uma qualificatória e o ranking do mês anterior já te convidou: ela se resolve sozinha. */
  function autoInvite(state: PlayerCareerState) {
    const resolved = resolveInvitedQualifier(state);
    if (resolved === state) return;
    const next = state.calendar?.find((entry) => entry.status === 'UPCOMING');
    if (next) stageBanner = `Convidado pelo ranking: vaga direta no ${qualifierTargetName(state, next)}.`;
    career = resolved;
  }
  $: if (career && !live && $circuitProgress.tick >= 0 && circuitReady(career)) autoInvite(career);
  $: qualifierCount = career?.calendar?.filter((entry) => entryKind(entry) === 'qualifier').length ?? 0;

  /** Fecha a temporada quando o circuito do mundo terminou o ano: o ranking final entra no acesso do seu time. */
  let seasonClosing = false;
  function closeSeason(state: PlayerCareerState) {
    career = state;
    seasonClosing = !circuitReady(state);
    if (!seasonClosing) career = finishSeason(state, teamRankOf(state, state.orgId));
  }
  $: if (seasonClosing && career && $circuitProgress.tick >= 0 && circuitReady(career)) closeSeason(career);

  /** Antes de cada campeonato pode rolar um acontecimento; ele espera a sua escolha e o campeonato segue depois. */
  function begin(index: number, mode: 'pace' | 'live' | 'sim') {
    if (!career) return;
    if (!circuitGate(() => begin(index, mode))) return;
    // No banco: o time joga sem você; o campeonato roda direto (sem call, sem provocação).
    if ((career.benchedEvents ?? 0) > 0) { simulateEvent(index); return; }
    const key = `${career.seasonNumber}:${index}`;
    // A qualificatória é na semana do campeonato: o acontecimento de antes do jogo fica para ele.
    if (career.preRolled !== key && entryKind(career.calendar?.[index] ?? {}) !== 'qualifier') {
      career = rollHappening({ ...career, preRolled: key }, 'pre', { eventIndex: index });
      if (career.pendingHappening) { queuedStart = { index, mode }; return; }
      // Sem acontecimento, pode vir a provocação de um rival da chave.
      career = rollRival(career, index);
      if (career.pendingRival) { queuedStart = { index, mode }; return; }
      // Nem acontecimento nem rival: alguém do time pode puxar conversa antes de viajar.
      const preTalk = momentTalk(career, 'pre', index);
      if (preTalk) { career = { ...career, pendingTalk: preTalk }; queuedStart = { index, mode }; return; }
    }
    launchEntry(index, mode);
  }

  function launchEntry(index: number, mode: 'pace' | 'live' | 'sim') {
    if (mode === 'sim') simulateEvent(index);
    else if (mode === 'live') enterEvent(index);
    else startEntry(index);
  }

  function chooseHappening(choiceIndex: number) {
    if (!career?.pendingHappening) return;
    const event = HAPPENING_BY_ID.get(career.pendingHappening.id);
    const trigger = TRIGGER_LABEL[career.pendingHappening.trigger];
    const outcome = resolveHappening(career, choiceIndex);
    career = outcome.state;
    happeningResult = { situation: event?.situation ?? '', trigger, line: outcome.line, chips: outcome.chips, success: outcome.success };
  }

  let rivalResult: { title: string; line: string } | null = null;

  function chooseRival(response: (typeof RIVAL_CHOICES)[number]['key']) {
    if (!career?.pendingRival) return;
    const rival = career.pendingRival;
    const answer = answerRival(career, response);
    career = answer.state;
    rivalResult = { title: `${rival.nick} (${rival.role} da ${rival.orgName})`, line: answer.line };
  }

  function closeRival() {
    rivalResult = null;
    const queued = queuedStart;
    queuedStart = null;
    if (queued) launchEntry(queued.index, queued.mode);
  }

  function closeHappening() {
    happeningResult = null;
    const queued = queuedStart;
    queuedStart = null;
    if (!career) return;
    // A escolha pode ter tirado o campeonato (folga), te posto no banco ou aberto uma proposta.
    if (career.calendar?.length && career.calendar.every((entry) => entry.status === 'PLAYED')) { closeSeason(career); return; }
    if (!queued || career.pendingMove || career.calendar?.[queued.index]?.status !== 'UPCOMING') return;
    if ((career.benchedEvents ?? 0) > 0) simulateEvent(queued.index);
    else launchEntry(queued.index, queued.mode);
  }

  /** Abre a sala de troféus numa aba escolhida: o Títulos do trilho abre em Títulos, o "Ver Top 20" em Prêmios. */
  function openTrophies(tab: RoomTab = 'titulos') {
    roomTab = tab;
    trophiesOpen = true;
    document.body.classList.add('modal-open');
  }

  function closeTrophies() {
    trophiesOpen = false;
    if (!detailsPlayer && !opponentOrgId && !confirming && !statsOpen && eventSheet === null) document.body.classList.remove('modal-open');
  }

  function openWorld() {
    menuOpen = false;
    worldOpen = true;
    document.body.classList.add('modal-open');
  }

  function closeWorld() {
    worldOpen = false;
    if (!detailsPlayer && !opponentOrgId && !confirming && !statsOpen && eventSheet === null) document.body.classList.remove('modal-open');
  }

  /** Do ranking do Mundo para a ficha do time (a mesma do adversário). */
  function worldTeam(orgId: string) {
    if (!sceneOrgById.has(orgId)) return;
    worldOpen = false;
    openOpponent(orgId);
  }

  /** Títulos e MVPs de um jogador para os símbolos das cartas (o índice é montado uma vez por estado). */
  const honorsFor = (index: Map<string, PlayerHonors> | null, nick: string | null | undefined): PlayerHonors | null =>
    index && nick ? index.get(nick.toLowerCase()) ?? null : null;

  /** O mata-mata de um evento, fase a fase (quartas, semis, final). */
  const BRACKET_PHASES: Array<{ phase: BracketLine['phase']; label: string }> = [
    { phase: 'quarterfinal', label: 'Quartas' }, { phase: 'semifinal', label: 'Semis' }, { phase: 'final', label: 'Final' }
  ];
  const TROPHY_TIERS: EventTier[] = ['Major', 'S', 'A', 'B', 'C'];
  const ROOM_TABS = [{ key: 'titulos', label: 'Títulos' }, { key: 'premios', label: 'Prêmios e HLTV' }, { key: 'jogadas', label: 'Jogadas' }, { key: 'historia', label: 'Histórico' }] as const;
  type RoomTab = (typeof ROOM_TABS)[number]['key'];
  let roomTab: RoomTab = 'titulos';
  const PLAY_LABEL = (play: PlayHighlight) =>
    play.kind === 'ace' ? 'Ace' : play.kind === 'quad' ? '4K' : play.kind === 'clutch' ? `Clutch 1v${play.against ?? 1}` : `${play.kills}K`;

  /** Todas as jogadas guardadas da carreira, das mais raras para as comuns e das mais novas para as velhas. */
  function careerPlays(state: PlayerCareerState) {
    const all: Array<PlayHighlight & { event: string; order: number }> = [];
    let order = 0;
    const take = (result: TournamentResult) => { order += 1; for (const play of result.highlights ?? []) all.push({ ...play, event: result.name, order }); };
    state.history.forEach((log) => log.tournaments.forEach(take));
    (state.calendar ?? []).forEach((entry) => entry.result && take(entry.result));
    const weight = (play: PlayHighlight) => (play.kind === 'ace' ? 100 : play.kind === 'clutch' ? 40 + (play.against ?? 1) * 12 : 50);
    return all.sort((a, b) => weight(b) - weight(a) || b.order - a.order).slice(0, 60);
  }

  /** Momentos da carreira: títulos, MVPs e aces, do mais novo para o mais antigo. */
  function careerMoments(state: PlayerCareerState) {
    const rows: Array<{ key: string; year: number; name: string; tier: EventTier | null; placement: string; mvp: boolean; aces: number; clutches: number }> = [];
    const push = (result: TournamentResult, key: string, year: number) => {
      if (result.placement !== 'Campeão' && !result.mvp?.you && !(result.plays?.aces)) return;
      rows.push({ key, year, name: result.name, tier: result.tier ?? null, placement: result.placement, mvp: Boolean(result.mvp?.you), aces: result.plays?.aces ?? 0, clutches: result.plays?.clutches ?? 0 });
    };
    state.history.forEach((log) => log.tournaments.forEach((result, index) => push(result, `${log.seasonNumber}:${index}`, log.year)));
    (state.calendar ?? []).forEach((entry) => entry.result && push(entry.result, `now:${entry.index}`, state.year));
    return rows.reverse();
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

  /** Pedir para sair (ambição): o agente procura time; o elenco não gosta. Uma vez por temporada. */
  function askTransfer() {
    if (!career || !canRequestTransfer(career)) return;
    askConfirm({
      title: `Pedir para sair do ${orgOf(career.orgId).name}?`,
      body: 'O agente procura times do mesmo nível (e um acima, se você está bem). O elenco não gosta: moral −4, relação −6 com os parceiros, reputação −2. Sem proposta, você fica com o clima pesado. Uma vez por temporada.',
      confirmLabel: 'Pedir para sair',
      danger: true,
      run: () => {
        if (!career) return;
        career = requestTransfer(career, Object.fromEntries(matesOf(career).map((mate) => [mate.player.id, mate.relationship])));
      }
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

  const SCOUT_STATUS: Record<ScoutHit['status'], string> = { titular: 'Titular', reserva: 'Reserva', aposentado: 'Aposentado', voce: 'Você', coach: 'Coach' };
  function openScout(query = '') {
    menuOpen = false;
    scoutQuery = query;
    scoutOpen = true;
    document.body.classList.add('modal-open');
  }
  function closeScout() {
    scoutOpen = false;
    document.body.classList.remove('modal-open');
  }
  /** Bandeira fora do pacote do jogo: some sem deixar ícone quebrado. */
  function hideBroken(event: Event) {
    (event.currentTarget as HTMLImageElement).hidden = true;
  }
  function scoutTeam(orgId: string | null) {
    if (!orgId || !sceneOrgById.has(orgId)) return;
    scoutOpen = false;
    openOpponent(orgId);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (confirming) closeConfirm();
    else if (statsOpen) closeStats();
    else if (trophiesOpen) closeTrophies();
    else if (worldOpen) closeWorld();
    else if (overviewOpen) overviewOpen = false;
    else if (scoutOpen) closeScout();
    else if (promoteOpen) promoteOpen = false;
    else if (evoOpen) evoOpen = false;
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

  function doTrainMap() {
    if (!career || !mapPick) return;
    const result = trainMap(career, mapPick);
    career = result.state;
    weekLine = result.line;
    weekChips = [];
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

  /** Conversa pelo card do coach: a mesma do "Falar com o coach", com a resposta num aviso rápido. */
  function talkCoachCard() {
    if (!career) return;
    const speaker = talksLeft > 0 ? speakerOf(career, 'coach') : null;
    const talk = speaker ? startTalk(career, speaker) : null;
    if (talk && opensDialogue(career, talk)) { career = openDialogue(career, talk); return; }
    if (talk) career = quickTalk(career, talk).state;
    talkCoach();
    if (talk && coachLine) coachLine = `“${talk.line}” ${coachLine}`;
    if (career && coachLine) notify(`${career.seed}:me`, `${coach?.name ?? 'Coach'}:`, coachLine, 'neutral');
  }

  /** O que a fase do bloco faz, em uma frase (indicador do próximo campeonato). */
  const PHASE_TIP: Record<FormPhase, string> = {
    alta: 'Fase alta do time neste bloco de 3 ou 4 campeonatos',
    normal: 'Fase normal do time neste bloco de 3 ou 4 campeonatos',
    baixa: 'Fase baixa do time neste bloco de 3 ou 4 campeonatos'
  };
  const signed = (value: number) => `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('pt-BR')}`;
  const phaseTip = (arc: EventArc) => `${PHASE_TIP[arc.phase]}${arc.phasePower ? `: ${signed(arc.phasePower)} de força em cada jogo` : ': sem bônus nem desconto'}. A fase pode continuar no bloco seguinte ou mudar; bloco bom ajuda a subir.`;
  const studyTip = (study: number) => `Depois de uma fase dominante, os rivais estudaram as demos de vocês: ${signed(study)} de força para eles em cada série contra vocês. Some quando vocês param de ganhar. Na semana, Mudar o playbook ou Estudar as demos deles cortam o estudo deste bloco.`;
  const chipText = (chip: AgendaChip) => `${chip.value > 0 ? '+' : '−'}${Math.abs(chip.value).toLocaleString('pt-BR')} ${chip.label}`;

  function start() { career = createPlayerCareer({ nick, country, role, archetype }); }
  function sign(orgId: string) { if (career) career = chooseStartingOrg(career, orgId); }
  function choose(orgId: string) { if (career) career = acceptOffer(career, orgId); }
  function stay() { if (career) career = stayAtOrg(career); }
  function toLanHouse() { if (career) career = goToLanHouse(career); }
  function takeMove(orgId: string) {
    if (!career) return;
    const moved = acceptMove(career, orgId);
    // Troca no fim do ano (nenhum campeonato pela frente): a temporada fecha na hora.
    if (moved.calendar?.length && moved.calendar.every((entry) => entry.status === 'PLAYED')) closeSeason(moved);
    else career = moved;
  }
  function refuseMove() { if (career) career = declineMove(career); }
  function hangTheMouse() { if (career) career = retire(career); }
  function reset() {
    runToken += 1;
    running = false;
    stopCircuit();
    waitingCircuit = null;
    seasonClosing = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
      if (career) localStorage.removeItem(`${STORAGE_KEY}:situations:${career.seed}`);
    } catch { /* noop */ }
    career = null; live = null; clutch = null; lastCall = null; callOutcome = null; resolving = false; frozenView = null; pendingOutcome = null; usedIds = []; liveArc = null;
  }

  function openSeason() { if (career) career = startSeason(career); }

  function enterEvent(index: number, toFinal = false) {
    if (!career) return;
    if (!circuitGate(() => enterEvent(index, toFinal))) return;
    // O ranking congela até o resultado ser gravado: a chave do save é sempre a mesma.
    career = freezeRanking(career, index);
    const me = career;
    eventError = null;
    stageBanner = null;
    const entry = me.calendar?.[index];
    const saved = me.liveEvent?.eventIndex === index ? me.liveEvent : null;
    let stage: MajorStageKey | null = null;
    let carry: StageCarry = saved?.carry ?? { wins: 0, losses: 0 };
    if (entry?.format === 'major') {
      stage = saved?.stage ?? majorEntryStage(me, index);
      if (!stage) {
        // O ranking da temporada não bateu: o Major fica como "Não classificado" e a temporada segue.
        finalizeEvent(index, notQualified(me, index));
        stageBanner = 'Seu time não entrou no Major: faltou ranking (VRS) nesta temporada.';
        return;
      }
    }
    let field: ReturnType<typeof startSceneEvent>;
    // O arco do campeonato vale do começo ao fim: quem retoma um save usa o que foi congelado na largada.
    const arc = saved?.arc ?? eventArcOf(me, index);
    try {
      field = startSceneEvent(me, index, saved?.played, stage, arc);
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
          field = startSceneEvent(me, index, undefined, stage, arc);
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
    liveArc = arc;
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
    live = startSceneEvent(career, liveIndex, undefined, next, liveArc ?? undefined).campaign;
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
    const relations = squadMates.map((mate) => mate.relationship);
    const roundNow = roundContextOf(live, clutch.series);
    const target = roundNow ? mapTarget(roundNow.us, roundNow.them) : 13;
    const matchPoint = roundNow ? target - roundNow.us === 1 || target - roundNow.them === 1 : false;
    const overtime = roundNow ? Math.min(roundNow.us, roundNow.them) >= 12 : false;
    const outcome = playClutchRound(live, clutch, {
      choice,
      playerOverall: career.overall,
      matesOverall,
      opponentOverall: Math.round(opponent.power),
      chemistry: relations.length ? relations.reduce((sum, value) => sum + value, 0) / relations.length : null,
      playerId: `${career.seed}:me`
    });
    live = outcome.campaign;
    career = { ...career, decisions: logDecision(career.decisions, outcome.profile, outcome.quality, outcome.won, { key: `${career.seasonNumber}:${liveIndex}`, matchPoint }) };
    // Alguém do time comenta o round (falas de round decisivo, com cooldown).
    const said = decisiveLine(career, outcome.won, overtime, `${liveIndex}:${clutch.mapIndex}:${clutch.roundNumber}`);
    if (said) career = markLineUsed(career, said.key);
    const alternative = clutch.situation.alternatives[choice].text;
    const read = { quality: outcome.quality, reason: outcome.reason, bestText: clutch.situation.alternatives[outcome.best].text, quote: said ? { who: said.who, text: said.text } : undefined };
    const story = clutchStory(outcome.profile, alternative, outcome.won, outcome.kills);
    usedIds = [...usedIds, clutch.situation.id];
    persistUsedIds();
    clutch = null;
    persistLive();
    if (auto) {
      // Call no seu estilo: o resultado vira o chip da última call e o campeonato segue sem parar.
      lastCall = { text: alternative, won: outcome.won, story, ...read };
      void run();
      return;
    }
    resolving = true;
    pendingOutcome = { text: alternative, won: outcome.won, story, ...read };
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
    // Celular: o painel encosta embaixo da tela, e o placar do mapa e a faixa de rounds ficam à vista em cima dele.
    const phone = window.matchMedia('(max-width: 680px)').matches && node.offsetHeight < window.innerHeight - 80;
    node.scrollIntoView({ behavior: 'smooth', block: phone ? 'end' : 'center' });
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function liveUserSeriesOf(campaign: NonNullable<typeof live>) {
    return campaign.engine.rounds.at(-1)?.series.find((series) => series.config.teamA.id === campaign.userTeamId || series.config.teamB.id === campaign.userTeamId) ?? null;
  }

  function persistLive() {
    if (!career || !live) return;
    const ranking = career.liveEvent?.eventIndex === liveIndex ? career.liveEvent.ranking : undefined;
    career = { ...career, liveEvent: { eventIndex: liveIndex, played: serializeSceneEvent(live), stage: liveStage, carry: stageCarry, ...(ranking ? { ranking } : {}), ...(liveArc ? { arc: liveArc } : {}) } };
  }

  /** Fecha o campeonato (jogado ou simulado): relatório, resultado no calendário, elenco e fim de temporada. */
  function finalizeEvent(index: number, outcome: SceneEventOutcome) {
    if (!career) return;
    const { result } = outcome;
    lastEventReport = {
      index,
      result,
      name: result.name,
      placement: result.placement,
      rating: result.rating,
      wins: result.seriesWins,
      losses: result.seriesLosses,
      stats: outcome.stats,
      players: outcome.players
    };
    // Passou na qualificatória: o campeonato grande entra logo depois dela no calendário.
    const recordedOnly = applyQualifierResult(recordEventResult(career, index, result), index);
    const entry = career.calendar?.[index];
    const qualifier = Boolean(entry && entryKind(entry) === 'qualifier');
    if (entry && qualifier) stageBanner = result.placement === 'Classificado' ? `Classificado: o ${qualifierTargetName(career, entry)} entrou no seu calendário.` : `Ficou na qualificatória do ${qualifierTargetName(career, entry)}.`;
    // No banco: nada de moral de título, fãs ou cansaço do jogo para você; só a frustração e o descanso.
    const celebrated = result.benched
      ? { ...recordedOnly, morale: Math.max(0, (recordedOnly.morale ?? 60) - 3), fatigue: Math.max(0, (recordedOnly.fatigue ?? 0) - 10) }
      : celebrateResult(recordedOnly, qualifier ? (result.placement === 'Classificado' ? 'Semis' : 'Quartas') : result.placement, orgOf(career.orgId, career).level, {
          mvp: Boolean(result.mvp?.you), aces: result.plays?.aces, quads: result.plays?.quads, clutches: result.plays?.clutches
        });
    // O rival do campeonato: enfrentou? ganhou ou perdeu dele?
    const settled = settleRival(celebrated, index, result);
    // A vida fora do servidor anda com o campeonato: Mental, pressão, saudade e adaptação (morando fora).
    const lifeTick = tickLife(settled.state, result.benched ? null : result);
    const recorded = lifeTick.state;
    if (lifeTick.notes.length) notify(`${recorded.seed}:me`, 'Fora do servidor:', lifeTick.notes.join(' '), 'neutral');
    if (lastEventReport) lastEventReport = { ...lastEventReport, rivalLine: settled.line };
    live = null;
    liveArc = null;
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
      closeSeason(recorded);
    } else {
      // Entre campeonatos o time pode cortar (fase ruim + clima pesado) ou um time de cima pode chamar.
      const mates = matesOf(recorded);
      const relationshipAverage = mates.length ? mates.reduce((sum, mate) => sum + mate.relationship, 0) / mates.length : 55;
      career = midSeasonCheck(recorded, relationshipAverage);
      // Depois do campeonato (ou na semana) pode rolar um acontecimento: chance pelo momento da carreira.
      career = rollHappening(career, 'post', { eventIndex: index, result });
      if (!career.pendingHappening) career = rollHappening(career, 'between', { eventIndex: index + 1 });
      // Sem acontecimento: alguém do time pode puxar conversa (com match point perdido e Mental baixo, o coach).
      if (!career.pendingHappening && !result.benched) {
        const key = `${career.seasonNumber}:${index}`;
        const lostMatchPoint = result.placement !== 'Campeão' && (career.decisions?.recent ?? []).some((call) => call.key === key && !call.won && call.matchPoint);
        const postTalk = momentTalk(career, 'post', index, lostMatchPoint);
        if (postTalk) career = { ...career, pendingTalk: postTalk };
      }
      // Nada esperando resposta: pode vir um dilema da semana (conflito real, no máximo 3 por temporada).
      if (!result.benched) career = rollDilemma(career, index + 1);
    }
  }

  function closeEvent() {
    if (!career || !live || !liveOver) return;
    // Você saiu (ou o campeonato acabou): o resto roda sem tela para fechar campeão, MVP e chave.
    const done = live.finished ? live : finishSceneEvent(live);
    finalizeEvent(liveIndex, sceneEventResult(career, liveIndex, done, liveStage, stageCarry));
  }

  /** Simula o campeonato inteiro sem tela (ou o resto, se havia um save no meio dele). */
  function simulateEvent(index: number) {
    if (!career) return;
    if (!circuitGate(() => simulateEvent(index))) return;
    career = freezeRanking(career, index);
    const me = career;
    eventError = null;
    try {
      const saved = me.liveEvent?.eventIndex === index ? me.liveEvent : null;
      finalizeEvent(index, simulateSceneEvent(me, index, saved?.played, saved?.stage ?? null, saved?.carry, undefined, saved?.arc ?? eventArcOf(me, index)));
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
    // O resto do campeonato (no Major, os stages que faltam e os playoffs) roda sozinho.
    finalizeEvent(liveIndex, sceneEventResult(career, liveIndex, finishSceneEvent(live), liveStage, stageCarry));
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

  onDestroy(() => { runToken += 1; stopCircuit(); if (resolveFallback !== null) window.clearTimeout(resolveFallback); });

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
    // O 1º ponto é o overall de antes do treino da 1ª temporada (o overallBefore já traz o treino).
    const values = [seasonSwing(state.history[0]).start, ...state.history.map((log) => log.overallAfter)];
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
  /** Fase do time e estudo dos rivais para o próximo campeonato (o do save, se ele já começou). */
  $: arcNow = career && currentEntry
    ? (career.liveEvent?.eventIndex === currentEntry.index && career.liveEvent.arc ? career.liveEvent.arc : eventArcOf(career, currentEntry.index))
    : null;
  /** O adversário da série ao vivo (clicável no viewer). */
  $: liveOpponent = liveUserSeries && live
    ? (liveUserSeries.config.teamA.id === live.userTeamId ? liveUserSeries.config.teamB : liveUserSeries.config.teamA)
    : null;
  $: opponentOrg = opponentOrgId ? sceneOrgById.get(opponentOrgId) ?? null : null;
  $: oppMaps = career && opponentOrg ? (viewingOwn ? myMaps : mapProfile(opponentOrg.id, career.year, careerMapPool(career.year))) : [];
  $: viewingOwn = Boolean(career && opponentOrgId === career.orgId);
  // O seu time: você e os 4 parceiros (com sinergia); adversário: o elenco da temporada no mundo da carreira.
  $: opponentRoster = career && opponentOrg
    ? viewingOwn ? userEnginePlayers(career) : sceneOrgEnginePlayers(orgIn(career.seed, career.seasonNumber, opponentOrg.id) ?? opponentOrg, `${career.seed}:season:${career.seasonNumber}`)
    : [];
  $: oppRank = career && opponentOrg ? teamRankOf(career, opponentOrg.id) : null;
  $: oppDelta = career && opponentOrg ? teamRanking(career).find((team) => team.orgId === opponentOrg?.id)?.delta ?? 0 : 0;
  $: oppLevel = career && opponentOrg ? currentLevelOf(career, opponentOrg.id) : 5;
  $: oppAverage = opponentRoster.length ? Math.round(opponentRoster.reduce((sum, player) => sum + (player.overall ?? 60), 0) / opponentRoster.length) : null;
  $: oppLanguage = career && opponentOrg ? orgLanguage(orgIn(career.seed, career.seasonNumber, opponentOrg.id) ?? opponentOrg) : 'en';
  $: myPlayer = career ? myPlayerOf(career) : null;
  $: squadMates = career ? matesOf(career) : [];
  $: coach = career ? coachOf(career) : null;
  $: myCoach = career ? careerCoachOf(career) : null;
  $: benchReserve = career && career.orgId !== 'lan-house' ? planOf(career).reserve : null;
  $: oppCoach = career && opponentOrg ? coachOfOrg(career.seed, career.seasonNumber, opponentOrg.id) : null;
  $: nextMajorStage = career && currentEntry?.format === 'major' ? majorEntryStage(career, currentEntry.index) : null;
  /** As trocas da virada, as de times de tier mais alto hoje (currentLevelOf) primeiro. */
  const sceneMarketOf = (state: PlayerCareerState) => headlineTransfers(state.seed, state.seasonNumber, 4, (orgId) => currentLevelOf(state, orgId));
  $: sceneMarket = career && !career.calendar && career.seasonNumber > 1 ? sceneMarketOf(career) : [];
  $: sceneRetired = career && !career.calendar && career.seasonNumber > 1 ? headlineRetirements(career.seed, career.seasonNumber, 3) : [];
  $: sceneProspects = career && !career.calendar && career.seasonNumber > 1 ? risingProspects(career.seed, career.seasonNumber, 4) : [];
  $: weekCards = career && currentEntry ? drawAgenda(career) : [];
  $: coachTips = career ? coachTipsOf(career) : [];
  $: talksLeft = career ? coachTalksLeft(career) : 3;
  $: splitPreview = customTrainingSplit(pickedSkills);
  $: mainSkills = career && myPlayer
    ? [...ROLE_SKILLS[career.role]].filter((key) => key !== 'mental').map((key) => ({ key, label: ATTR_LABEL[key], value: Number(myPlayer?.[key] ?? 0) })).sort((a, b) => b.value - a.value).slice(0, 3)
    : [];
  $: evolving = career ? (Object.entries(career.trained ?? {}) as Array<[TrainedAttribute, number]>).filter(([, bonus]) => bonus).map(([key, bonus]) => ({ label: ATTR_LABEL[key], bonus })).sort((a, b) => b.bonus - a.bonus) : [];
  /** O que o treino faz pelo overall agora (semana e Evolução). */
  $: outlook = career ? trainingOutlook(career) : null;
  $: morale = career?.morale ?? 60;
  $: life = career ? lifeOf(career) : null;
  /** Quanto a fase do momento soma ao Mental da carta (−3 a +3). */
  $: mentalPhase = mindBump(life?.mind);
  $: teamBond = squadMates.length ? Math.round(squadMates.reduce((sum, mate) => sum + mate.relationship, 0) / squadMates.length) : null;
  $: abroad = career && career.orgId !== 'lan-house' ? livesAbroad(career, (orgOf(career.orgId, career) as { region?: string }).region) : false;
  // O coach abre a temporada: a meta do ano, antes do primeiro campeonato.
  $: if (career && !live && career.status === 'ACTIVE' && !career.pendingTalk && !career.pendingHappening && !career.pendingDilemma && !career.pendingRival && !career.pendingMove) {
    const opening = seasonTalk(career);
    if (opening) career = { ...career, pendingTalk: opening };
  }
  $: form = career?.form ?? 0;
  $: fame = career?.fame ?? 0;
  $: fatigue = career?.fatigue ?? 0;
  $: playMode = (career?.playMode ?? 'all') as PlayMode;
  $: nextPace = currentEntry ? (career?.liveEvent?.eventIndex === currentEntry.index ? 'live' : paceOf(currentEntry.index)) : 'live';
  $: bracketPath = live ? userBracketPath(live) : [];
  $: liveStageNow = live && liveStage ? userStage(live) ?? liveStage : null;
  /** O momento do round na call: a decisão é no meio do round (relógio e C4 batem com a situação). */
  $: clutchMoment = clutch ? (() => {
    let hash = 0;
    for (const char of clutch.drawSeed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const bomb = situationBomb(clutch.situation);
    if (bomb === 'planted') return { planted: true, text: `C4 plantada · ${8 + (hash % 25)}s para explodir` };
    const clock = 20 + (hash % 55);
    return { planted: false, text: `${bomb === 'unplanted' ? 'C4 ainda não plantada · ' : 'Meio do round · '}${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')} no relógio` };
  })() : null;
  // Fogo em volta do jogo: prorrogação ou mapa decidido por um round esquentam; campeão pega fogo de verdade.
  $: liveChampion = Boolean(live?.finished && live.run.champion);
  $: hardGame = (() => {
    const map = liveUserSeries?.current?.state;
    if (!map || liveUserSeries?.phase !== 'live') return false;
    const total = map.scoreA + map.scoreB;
    return total >= 24 || (total >= 20 && Math.abs(map.scoreA - map.scoreB) <= 1 && Math.max(map.scoreA, map.scoreB) >= 11);
  })();
  $: liveAwards = overviewOpen && live ? awardsSoFar(live) : null;
  $: liveOver = live ? eventDone(live, liveSetup) && !(liveSetup.swissOnly && advancedFromSwiss(live) && liveStage && NEXT_STAGE[liveStage]) : false;
  $: sheetEntry = career && eventSheet !== null ? career.calendar?.[eventSheet] ?? null : null;
  $: sheetStage = career && sheetEntry?.format === 'major' && eventSheet !== null ? majorEntryStage(career, eventSheet) : null;
  $: sheetField = career && sheetEntry && eventSheet !== null ? sceneEventField(career, eventSheet, sheetEntry.format === 'major' ? sheetStage ?? 'stage1' : null) : [];
  $: sheetInvites = career && sheetEntry?.format === 'major' && sheetStage !== 'stage3' && eventSheet !== null ? majorInvites(career, eventSheet) : [];
  $: sheetTeams = career && sheetEntry && eventSheet !== null ? eventTeams(career, eventSheet) : [];
  /** Idioma da call e o melhor mapa de um time da cena (para o detalhe do campeonato). */
  function teamInfo(orgId: string): { language: ReturnType<typeof teamLanguage>; map: string | null } | null {
    if (!career || orgId === career.orgId) return null;
    const org = orgIn(career.seed, career.seasonNumber, orgId);
    if (!org) return null;
    return { language: orgLanguage(org), map: mapProfile(orgId, career.year, careerMapPool(career.year))[0]?.name ?? null };
  }
  $: sheetMyRank = sheetField.findIndex((team) => team.isUser) + 1;
  $: sheetTop = sheetField[0]?.overall ?? 1;
  $: currentLevel = career ? currentLevelOf(career, career.orgId) : 5;
  $: visitedLevels = new Set([...(career?.history.map((log) => seasonLevelOf(log)) ?? []), currentLevel]);
  $: board = clutch && liveUserSeries && live && career ? boardOf(liveUserSeries, live.userTeamId) : null;
  $: retro = career?.status === 'RETIRED' ? buildRetrospective(career) : null;
  // Na primeira vez que a tela de aposentadoria abre, a retrospectiva começa sozinha.
  let retroOpen = false;
  let retroChecked: string | null = null;
  $: if (career?.status === 'RETIRED' && retroChecked !== career.seed) {
    retroChecked = career.seed;
    try { retroOpen = !localStorage.getItem(`${STORAGE_KEY}:retro:${career.seed}`); } catch { retroOpen = false; }
  }
  function openRetro() { retroOpen = true; }
  function closeRetro() {
    retroOpen = false;
    document.body.classList.remove('modal-open');
    try { if (career) localStorage.setItem(`${STORAGE_KEY}:retro:${career.seed}`, '1'); } catch { /* sem armazenamento: abre de novo na próxima */ }
  }
  $: seasonSpan = career?.history.length ? `${career.history[0].year}–${career.history.at(-1)!.year}` : career ? `${career.year}` : '';
  $: trajectory = career ? trajectoryOf(career) : [];
  $: overallCurve = career ? curveOf(career) : null;
  $: namedTitles = career?.history.flatMap((log) => log.tournaments.filter((entry) => entry.placement === 'Campeão').map((entry) => `${entry.name}${entry.tier ? ` (${TIER_LABEL[entry.tier]})` : ''}${entry.mvp?.you ? ' · MVP' : ''}`)) ?? [];
  $: trainingWindow = career ? trainingWindowOf(career) : null;
  $: weekLeft = career && trainingWindow ? blocksLeft(career) : 0;
  /** Blocos que a ação sob o mouse (ou com foco) vai usar: o medidor da semana mostra antes do clique. */
  let hoverCost = 0;
  $: weekTotal = career ? weekBlocks(career) : 3;
  $: freeDone = career ? pickedThisWeek(career, 'treino-livre') : false;
  $: canTrain = Boolean(career && myPlayer && trainingWindow && weekLeft > 0);
  $: liveUserSeries = live ? liveUserSeriesOf(live) : null;
  $: viewerSeries = liveUserSeries ? toSeriesResult(liveUserSeries) : null;
  $: viewerActiveMap = frozenView ? frozenView.map : liveUserSeries ? (liveUserSeries.current ? liveUserSeries.current.index : Math.max(0, liveUserSeries.maps.length - 1)) : 0;
  $: viewerRounds = frozenView ? frozenView.round : liveUserSeries?.current ? liveUserSeries.current.state.rounds.length : liveUserSeries?.maps.at(-1)?.rounds.length ?? 0;
  $: viewerFinished = frozenView ? false : liveUserSeries?.phase === 'finished';
  /** O resultado da call só cabe dentro do viewer enquanto o mapa está ao vivo; fora disso vai embaixo dele. */
  $: outcomeOutside = Boolean(callOutcome && (viewerFinished || !viewerSeries));
  $: totalTitles = career?.history.reduce((sum, logEntry) => sum + logEntry.titles, 0) ?? 0;
  $: langFit = career ? myLanguageFit(career) : null;
  $: clutchCtx = live && clutch ? roundContextOf(live, clutch.series) : null;
  $: myCardInfo = career ? cardInfoFor(career, career.orgId) : null;
  $: oppCardInfo = career && opponentOrg ? cardInfoFor(career, viewingOwn ? career.orgId : opponentOrg.id) : null;
  $: scoutHits = career && scoutOpen ? scoutPlayers(career, scoutQuery) : [];
  /** Times da busca pelo nome, do tier mais alto (hoje) para o mais baixo. */
  const teamsMatching = (state: PlayerCareerState, query: string) => sceneOrgs
    .filter((org) => org.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => currentLevelOf(state, a.id) - currentLevelOf(state, b.id) || a.name.length - b.name.length)
    .slice(0, 6);
  $: scoutTeams = career && scoutOpen && scoutQuery.trim().length >= 2 ? teamsMatching(career, scoutQuery) : [];
  $: seatMove = career && currentSeat ? seatMovesOf(career.seed).find((move) => move.fromId === currentSeat?.orgId && move.nick.toLowerCase() === currentSeat?.nick.toLowerCase()) ?? null : null;
  $: myMaps = career ? mapProfile(career.orgId, career.year, careerMapPool(career.year), career.mapTraining ?? {}) : [];
  $: if (!mapPick && myMaps.length) mapPick = myMaps[myMaps.length - 1].mapId;
  $: canTrainMap = Boolean(career && trainingWindow && career.mapTrainedWindow !== trainingWindow);
  $: trophies = career ? trophyCase(career) : { byTier: { Major: 0, S: 0, A: 0, B: 0, C: 0 }, mvps: 0, majorMvps: 0, aces: 0, total: 0, clutches: 0, hltvBest: null, hltvTop1: 0, hltvTop20: 0, rookie: false };
  // Índice das honras (títulos, MVPs e Majors) de todo mundo: remonta só quando o mundo visível muda.
  $: honorIndex = career?.status === 'ACTIVE' ? honorsIndex(career) : null;
  $: moments = career && trophiesOpen ? careerMoments(career) : [];
  $: lifeLog = career && trophiesOpen && roomTab === 'historia' ? careerLog(career) : null;
  $: playReel = career && trophiesOpen ? careerPlays(career) : [];
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
        <label>Nick
          <span class="nick-row">
            <input bind:value={nick} maxlength="16" placeholder="Seu nick" />
            <button type="button" class="link-btn" on:click={rollNick}>Sortear</button>
          </span>
        </label>
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
            <span class="card-level">{teamTierLabel(option.level)}{option.country ? ` · ${option.country}` : ''}</span>
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
    {#if retroOpen && retro}<CareerWrapped {retro} onClose={closeRetro} onNewCareer={() => { closeRetro(); askReset(); }} />{/if}
    <section class="retired">
      <div class="retired-hero">
        <div class="retired-head">
          <p class="eyebrow">{career.verdict.becameCoach ? `Virou coach aos ${career.age}` : 'Pendurou o mouse'} · {seasonSpan}</p>
          <h1 class="display">{career.nick}</h1>
          <p class="verdict">“{career.verdict.line}”</p>
        </div>
        <button class="cta inline retro-btn" on:click={openRetro}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
          Ver a retrospectiva
        </button>
      </div>
      {#if retro}
        <dl class="retired-stats">
          <div><dt>Temporadas</dt><dd>{retro.seasons}</dd></div>
          <div class="gold"><dt>Títulos</dt><dd>{retro.totals.titles}</dd><small>{retro.totals.events ? Math.round((retro.totals.titles / retro.totals.events) * 100) : 0}% dos campeonatos</small></div>
          <div class:gold={retro.totals.majors > 0}><dt>Majors</dt><dd>{retro.totals.majors}</dd></div>
          <div><dt>MVPs</dt><dd>{retro.totals.mvps}</dd>{#if retro.totals.majorMvps}<small>{retro.totals.majorMvps} de Major</small>{/if}</div>
          <div><dt>Finais</dt><dd>{retro.totals.finalsWon}<span>/{retro.totals.finals}</span></dd></div>
          <div class:gold={retro.totals.hltvTop1 > 0}><dt>Top 1 HLTV</dt><dd>{retro.totals.hltvTop1}</dd>{#if retro.totals.bestHltv && !retro.totals.hltvTop1}<small>melhor #{retro.totals.bestHltv}</small>{/if}</div>
          <div><dt>Melhor overall</dt><dd>{retro.totals.bestOverall}</dd><small>em {retro.totals.peakYear}</small></div>
          <div><dt>Melhor rating</dt><dd>{retro.totals.bestRating.toFixed(2)}</dd><small>em {retro.totals.bestRatingYear}</small></div>
        </dl>
      {/if}
      <div class="retired-grid">
        {#if overallCurve}
          <figure class="curve">
            <figcaption><span class="label">Overall por temporada</span><span>pico <b>{overallCurve.peak.value}</b></span></figcaption>
            <svg viewBox="0 0 340 80" preserveAspectRatio="none" role="img" aria-label={`Curva de overall: ${overallCurve.values.join(', ')}`}>
              <polyline points={overallCurve.line} fill="none" stroke="var(--accent)" stroke-width="3" vector-effect="non-scaling-stroke" />
              <circle cx={overallCurve.peak.x} cy={overallCurve.peak.y} r="4" fill="var(--accent)" />
            </svg>
            {#if retro}<div class="curve-years"><span>{retro.from}</span><span>{retro.to}</span></div>{/if}
          </figure>
        {/if}
        <div class="trajectory">
          <p class="label">Trajetória</p>
          <ol>
            {#each retro?.eras ?? [] as era (era.orgId + era.from)}
              <li class:top={era.level <= 1}>
                <span class="tr-badge"><TeamBadge id={era.orgId} name={era.orgName} size="sm" /></span>
                <span class="tr-name"><b>{era.orgName}</b><small>{teamTierLabel(era.level)}{era.majors.length ? ` · ${era.majors.length} Major${era.majors.length > 1 ? 's' : ''}` : ''}</small></span>
                <span class="tr-titles" class:has={era.titles > 0}>{era.titles ? `${era.titles} título${era.titles > 1 ? 's' : ''}` : 'sem título'}</span>
                <span class="num">{era.from === era.to ? era.from : `${era.from}–${era.to}`}</span>
              </li>
            {/each}
          </ol>
        </div>
      </div>
      {#if retro?.majorTitles.length}
        <section class="major-shelf" aria-label="Majors">
          <p class="label">Majors</p>
          <ul>
            {#each retro.majorTitles as major (major.name + major.year)}
              <li><b>{major.name.replace(/\s\d{4}$/, '')}</b><span>{major.year}{major.mvp ? ' · MVP' : ''}</span></li>
            {/each}
          </ul>
        </section>
      {/if}
      {#if retro?.titlesByYear.length}
        <section class="titles-years" aria-label="Títulos ano a ano">
          <p class="label">Títulos ano a ano</p>
          <div class="ty-list">
            {#each [...retro.titlesByYear].reverse() as year (year.year)}
              <details class="ty-year" class:major={year.titles.some((title) => title.tier === 'Major')}>
                <summary>
                  <span class="ty-y">{year.year}</span>
                  <span class="ty-team">{year.orgName}</span>
                  <span class="ty-count">{year.titles.length} título{year.titles.length > 1 ? 's' : ''}</span>
                  <span class="ty-chips">
                    {#each Object.entries(year.titles.reduce((acc, title) => ({ ...acc, [title.tier ?? 'C']: (acc[title.tier ?? 'C'] ?? 0) + 1 }), {} as Record<string, number>)) as [tier, count] (tier)}
                      <i class="tier-{tier}">{count}× {TIER_LABEL[tier as EventTier] ?? tier}</i>
                    {/each}
                  </span>
                </summary>
                <ul>
                  {#each year.titles as title (title.name)}
                    <li class:major={title.tier === 'Major'}><span>{title.name}</span>{#if title.mvp}<b>MVP</b>{/if}</li>
                  {/each}
                </ul>
              </details>
            {/each}
          </div>
        </section>
      {/if}
      {#if career.history.length}
        <section class="retired-seasons" aria-label="Temporada a temporada">
          <p class="label">Temporada a temporada</p>
          <div class="season-table" role="table" aria-label="Temporada a temporada">
            <div class="st-row st-head" role="row">
              <span role="columnheader">Ano</span><span role="columnheader">Time</span><span role="columnheader">Rating</span><span role="columnheader">HLTV</span><span role="columnheader">Títulos</span><span role="columnheader">MVPs</span><span role="columnheader">Destaque</span>
            </div>
            {#each career.history as log (log.seasonNumber)}
              {@const majorTitles = log.tournaments.filter((result) => result.placement === 'Campeão' && result.tier === 'Major').length}
              {@const mvpAll = log.tournaments.filter((result) => result.mvp?.you).length}
              {@const mvpMajor = log.tournaments.filter((result) => result.mvp?.you && result.tier === 'Major').length}
              <div class="st-row" role="row" class:st-gold={log.hltvRank === 1 || majorTitles > 0}>
                <span class="st-year" role="cell">{log.year}</span>
                <span class="st-team" role="cell"><TeamBadge id={log.orgId} name={log.orgName} size="sm" /><b>{log.orgName}</b></span>
                <span class="st-rating" role="cell" class:hot={log.seasonRating >= 1.2} class:good={log.seasonRating >= 1.08 && log.seasonRating < 1.2} class:low={log.seasonRating < 0.98}>{log.seasonRating.toFixed(2)}</span>
                <span class="st-hltv" role="cell">{#if log.hltvRank}<span class="st-rank" class:top1={log.hltvRank === 1} class:top20={log.hltvRank > 1 && log.hltvRank <= 20}>#{log.hltvRank}</span>{:else}<span class="st-dim">fora</span>{/if}</span>
                <span class="st-num" role="cell"><span class="st-cap">Títulos</span>{#if log.titles}<b>{log.titles}</b>{#if majorTitles}<span class="award award-major small">{majorTitles} Major</span>{/if}{:else}<span class="st-dim">0</span>{/if}</span>
                <span class="st-num" role="cell"><span class="st-cap">MVPs</span>{#if mvpAll}<b>{mvpAll}</b>{#if mvpMajor}<span class="award award-major small">{mvpMajor} de Major</span>{/if}{:else}<span class="st-dim">0</span>{/if}</span>
                <span class="st-badges" role="cell">
                  {#if log.hltvRank === 1}<span class="award award-major small">Melhor do mundo</span>{/if}
                  {#if log.rookie?.you}<span class="award small">Rookie of the Year</span>{/if}
                  {#if log.hltvRank !== 1 && !log.rookie?.you}<span class="st-dim">·</span>{/if}
                </span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
      {#if retro?.topPlays.length}
        <section class="retired-plays" aria-label="Melhores jogadas">
          <p class="label">Melhores jogadas</p>
          <ol class="play-reel">
            {#each retro.topPlays as play, playIndex (playIndex)}
              <li>
                <span class="tag" class:gold={play.kind === 'ace'} class:major={play.kind === 'clutch' && (play.against ?? 1) >= 3}>{PLAY_LABEL(play)}</span>
                <span class="pr-where"><b>{play.map}</b> · round {play.round} · vs {play.opponent}</span>
                <span class="pr-event">{play.event} · {play.year}</span>
              </li>
            {/each}
          </ol>
        </section>
      {/if}
      <button class="cta" on:click={askReset}>Começar nova carreira</button>
    </section>
  {:else}
    <div class="career">
      <aside class="rail" aria-label="Seu jogador">
        <div class="rail-head">
          <div class="who">
            <p class="eyebrow">Carreira · Temporada {career.seasonNumber} · {career.year}</p>
            <h1 class="display nick" class:long={career.nick.length > 7} class:xlong={career.nick.length > 10}>{career.nick}</h1>
            <p class="sub" title={`${agePhase(career.age).label}: ${agePhase(career.age).detail}`}>{ARCHETYPES[career.archetype].label} · {ROLE_META[career.role].label} · {career.country} · {career.age} anos</p>
            <p class="age-phase" class:old={career.age >= 31}><b>{agePhase(career.age).label}</b> {agePhase(career.age).detail}</p>
            {#if myPlayer}
              <dl class="skills-now">
                <div class="mental"><dt>Mental</dt><dd>{myPlayer.mental}</dd></div>
                {#each mainSkills as skill (skill.key)}<div><dt>{skill.label}</dt><dd>{skill.value}</dd></div>{/each}
              </dl>
              <button class="evolving" on:click={() => (evoOpen = true)} title="Ver a sua evolução: fase da carreira, treino e se ainda cresce">
                <span>Evolução</span>{agePhase(career.age).label}{#if evolving.length} · {evolving.slice(0, 2).map((item) => `${item.label} ${item.bonus > 0 ? '+' : '−'}${Math.abs(item.bonus)}`).join(' · ')}{#if evolving.length > 2}<em> · +{evolving.length - 2}</em>{/if}{/if}<i aria-hidden="true">›</i>
              </button>
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

        <div class="rail-tools">
          <button class="rail-search" on:click={() => openScout()} aria-label="Buscar jogador ou time">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <span>Buscar jogador ou time</span>
          </button>
          <button class="rail-world" on:click={openWorld} title="Ranking de times, top jogadores, trocas e campeonatos do mundo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
            <span>Mundo</span>
          </button>
        </div>

        <div class="ovr">
          <span class="ovr-num">{career.overall}</span>
          <span class="label ovr-label">Overall</span>
        </div>
        <div class="fact-rows">
          <div class="frow">
            <span class="frow-label">Carreira</span>
            <dl class="facts">
              <div class="money" title="Quanto uma org pagaria pelo seu passe hoje. Sobe com o overall; não é salário nem prêmio.">
                <dt>Valor</dt><dd>US$ {(marketValueUsd(career.overall) / 1000).toFixed(0)}k</dd>
              </div>
              <div class="money" title="Sua parte das premiações e o que os acontecimentos deram ou custaram.">
                <dt>Caixa</dt><dd>US$ {moneyLabel(career.money ?? 0)}</dd>
              </div>
              <div class="trophy-fact" class:gold={trophies.total > 0}>
                <dt>Títulos</dt>
                <dd><button class="trophy-btn" on:click={() => openTrophies()} aria-label={`Títulos: ${trophies.total}${trophies.mvps ? `, ${trophies.mvps} MVP` : ''}, abrir sala de troféus`} title="Sala de troféus: títulos por tier, MVPs e aces"><svg class="trophy-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4v3h-4z" /></svg>{trophies.total}{#if trophies.mvps}<small> · {trophies.mvps} MVP</small>{/if}</button></dd>
              </div>
            </dl>
          </div>
          <div class="frow">
            <span class="frow-label">Time</span>
            <dl class="facts">
              <div title="Vale só no próximo campeonato."><dt>Forma</dt><dd class:low={form < 0} class:high={form > 0}>{form > 0 ? '+' : form < 0 ? '−' : ''}{Math.abs(form)}</dd></div>
              <div title="Moral é a vontade de jogar. Alta sobe o Mental da sua carta; baixa derruba."><dt>Moral</dt><dd class:low={morale < 45} class:high={morale >= 75}>{morale}</dd></div>
              <div title="Relação média com os parceiros. Com 70 ou mais o parceiro rende +1 em quadra; abaixo de 35, −1."><dt>Elenco</dt><dd class:low={teamBond !== null && teamBond < 40} class:high={teamBond !== null && teamBond >= 70}>{teamBond ?? '—'}</dd></div>
            </dl>
          </div>
          <div class="frow">
            <span class="frow-label">Jogador</span>
            <dl class="facts">
              <div title={`Mental: o atributo da sua carta (treina como os outros) mais a fase do momento, até 3 para cada lado. A fase sobe com descanso, vitória e semana tranquila; cai com cansaço alto, pressão e saudade. Mental de carta forte segura a fase alta. Fase agora: ${life?.mind ?? 60} de 100.`}><dt>Mental</dt><dd class:low={mentalPhase < 0} class:high={mentalPhase > 0}>{myPlayer?.mental ?? '—'}{#if mentalPhase}<small class="phase">{mentalPhase > 0 ? '+' : '−'}{Math.abs(mentalPhase)}</small>{/if}</dd><span class="fat-bar" aria-hidden="true"><i class="phase-bar" class:low={(life?.mind ?? 60) < 40} style={`width:${life?.mind ?? 60}%`}></i></span></div>
              <div class="value" title="Campeonato e treino cansam; cada semana recupera 12 sozinha e descanso recupera mais. Com 70+ o treino rende metade; com 60+ você perde overall em quadra. Férias na virada da temporada."><dt>Cansaço</dt><dd class:low={fatigue >= TIRED_AT} class:high={fatigue < 30}>{fatigue}</dd><span class="fat-bar" aria-hidden="true"><i style={`width:${fatigue}%`} class:hot={fatigue >= TIRED_AT}></i></span></div>
              <div title="Condição física: cai com cansaço alto, volta com descanso. Baixa deixa o corpo reclamar (dor, lesão)."><dt>Corpo</dt><dd class:low={(life?.condition ?? 80) < 50} class:high={(life?.condition ?? 80) >= 80}>{life?.condition ?? 80}</dd></div>
            </dl>
          </div>
          <div class="frow">
            <span class="frow-label">Imagem</span>
            <dl class="facts">
              <div title="Seguidores: títulos, MVPs, jogadas e acontecimentos. Com 20 mil fãs, +1 de Mental em quadra; com 100 mil, +2."><dt>Fãs</dt><dd>{fame.toLocaleString('pt-BR')}</dd></div>
              <div title="Imagem com times, imprensa e torcida. Sobe e desce com as suas escolhas nos acontecimentos."><dt>Reputação</dt><dd class:low={(career.reputation ?? 50) < 35} class:high={(career.reputation ?? 50) >= 70}>{career.reputation ?? 50}</dd></div>
              <div title="Pressão de fora: sobe com o tier, os fãs e cair cedo; volta sozinha para o normal do seu tier a cada campeonato. Alivia com título, final, psicólogo, sair das redes, folga, família e atividades de Mental na semana. Com 80 ou mais derruba a fase do Mental."><dt>Pressão</dt><dd class:low={(life?.pressure ?? 30) >= 80} class:high={(life?.pressure ?? 30) < 35}>{life?.pressure ?? 30}</dd></div>
            </dl>
          </div>
          <div class="frow" class:home={!abroad}>
            <span class="frow-label">Casa</span>
            <dl class="facts">
              <div title="Saudade de casa: só sobe morando fora, com o tempo longe e o isolamento. Cai com visita, amigos no time e idioma. Com 70 ou mais tira moral."><dt>Saudade</dt><dd class:low={(life?.homesick ?? 0) >= 70} class:high={abroad && (life?.homesick ?? 0) < 30}>{life?.homesick ?? 0}</dd></div>
              <div title="Adaptação ao país e ao time: em casa é 100; fora, cresce com as semanas, o idioma e os amigos."><dt>Adaptação</dt><dd class:low={(life?.adaptation ?? 100) < 50} class:high={abroad && (life?.adaptation ?? 100) >= 80}>{life?.adaptation ?? 100}</dd></div>
              <div title={abroad ? 'Semanas sem visitar a família. Visita (semana ou dilema) zera.' : 'Você joga no seu país.'}><dt>{abroad ? 'Sem visita' : 'Onde'}</dt><dd class="small-dd">{abroad ? `${life?.weeksSinceVisit ?? 0} sem.` : 'Em casa'}</dd></div>
            </dl>
          </div>
        </div>

        {#if coach && career.orgId !== 'lan-house'}
          <section class="rail-coach" aria-label="Coach">
            <div class="rc-top">
              <span class="rc-ovr">{coach.overall}</span>
              <div class="rc-who">
                <span class="label">Coach</span>
                <b>{coach.name}</b>
                <span class="rc-meta">{#if myCoach}{career.year - myCoach.born} anos{myCoach.formerPlayer ? ' · ex-jogador' : ''}{/if}</span>
              </div>
              <button class="secondary-btn small rc-talk" disabled={!talksLeft} on:click={talkCoachCard} title="3 conversas por temporada">Conversar {talksLeft}/3</button>
            </div>
            <ul class="rc-attrs">
              {#each COACH_ATTRS as attribute}
                <li title={`${attribute.label} ${coach[attribute.key]}`}><span>{attribute.label}</span><i style={`--v:${coach[attribute.key]}%`}></i><b>{coach[attribute.key]}</b></li>
              {/each}
            </ul>
            {#if life}
              <div class="rc-trust" title="Confiança do coach em você: sobe com as conversas e as respostas que ele gosta.">
                <span>Confia em você</span><i class:low={life.coachTrust < 35} class:high={life.coachTrust >= 70} style={`--v:${life.coachTrust}%`}></i><b class:low={life.coachTrust < 35} class:high={life.coachTrust >= 70}>{life.coachTrust}</b>
              </div>
            {/if}
          </section>
        {/if}

        <ol class="pyramid" aria-label="A pirâmide da cena">
          {#each PYRAMID as rung}
            <li class:here={rung.level === currentLevel} class:been={rung.level !== currentLevel && visitedLevels.has(rung.level)} aria-current={rung.level === currentLevel ? 'step' : undefined} title={rung.about}>
              <span class="rung-label">{rung.label}</span><span class="rung-short" aria-hidden="true">{rung.short}</span>
              {#if rung.level === currentLevel}
                <b class="rung-org">{orgOf(career.orgId).name}</b>
              {:else if visitedLevels.has(rung.level)}
                <span class="rung-mark">já passou</span>
              {/if}
            </li>
          {/each}
        </ol>
        <p class="rung-here"><span>{PYRAMID.find((rung) => rung.level === currentLevel)?.label ?? ''}</span> {orgOf(career.orgId).name}</p>
        <details class="tier-guide">
          <summary>O que é cada tier</summary>
          <dl>
            {#each TIER_GUIDE as guide (guide.tier)}
              <div class:here={teamTierLabel(currentLevel) === guide.label}><dt>{guide.label}</dt><dd>{guide.about}</dd></div>
            {/each}
          </dl>
        </details>

        {#if currentSeat}
          <p class="seat-line">Você tomou a vaga de <button class="seat-link" on:click={() => currentSeat && openScout(currentSeat.nick)} title="Ver onde ele está">{currentSeat.nick}</button>{#if seatMove}, que foi para a <b>{seatMove.toName}</b>{/if}.</p>
        {/if}

        {#if career.history.length}
          <div class="rail-seasons">
            <p class="label">Temporadas</p>
            <ol>
              {#each career.history.slice(-4) as log (log.seasonNumber)}
                <li><span>T{log.seasonNumber} · {log.orgName}</span><b>{log.seasonRating.toFixed(2)}</b><span class="num">{seasonSwing(log).start}→{log.overallAfter}</span></li>
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
            {@const swing = seasonSwing(lastLog)}
            <section class="season-close" aria-label="Fechamento da temporada">
              <p class="eyebrow">Temporada {lastLog.seasonNumber} · {lastLog.year} · fechada</p>
              <div class="delta">
                <span class="delta-from">{swing.start}</span>
                <svg width="44" height="30" viewBox="0 0 56 40" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><path d="M2 20h46M34 6l14 14-14 14" /></svg>
                <span class="delta-to" class:down={swing.end < swing.start}>{swing.end}</span>
                <div class="delta-meta">
                  <b>{swing.end >= swing.start ? '+' : ''}{swing.end - swing.start} de overall</b>
                  {#if swing.training}<span>treino +{swing.training} · fim da temporada {swing.close >= 0 ? '+' : '−'}{Math.abs(swing.close)}</span>{/if}
                  <span>rating da temporada {lastLog.seasonRating.toFixed(2)}{lastLog.titles ? ` · ${lastLog.titles} título${lastLog.titles > 1 ? 's' : ''}` : ''}</span>
                </div>
              </div>
              <ol class="season-strip" aria-label="Campeonatos da temporada">
                {#each lastLog.tournaments as entry}
                  <li class="place-{placeKey(entry.placement)}" title={`${entry.name} · ${entry.placement} · ${entry.rating.toFixed(2)}`}>{entry.placement}</li>
                {/each}
              </ol>
              {#if lastLog.ceilingGain}
                <div class="note"><b>Teto conquistado: +{lastLog.ceilingGain}</b><span>Muito treino e nenhuma lesão: o que passou do teto ficou. Total +{career.ceilingBonus ?? 0} de {CEILING_BONUS_CAP}.</span></div>
              {:else if lastLog.ceilingBlocked}
                <div class="note warn"><b>A lesão segurou o teto.</b><span>O overall do treino ficou, mas o teto só sobe numa temporada sem lesão.</span></div>
              {/if}
              {#if lastLog.ageDecline}
                <div class="note"><b>A idade pesou: −{lastLog.ageDecline} de overall</b><span>Aos {lastLog.age ?? career.age} anos o corpo já não responde igual. Temporada boa segura; o treino devolve até o teto.</span></div>
              {/if}
              {#if lastLog.retireHint}
                <div class="note warn"><b>O corpo pede para parar.</b><span>Você pode seguir até os 40 ou pendurar o mouse agora.</span><button class="danger-btn note-btn" on:click={askRetire}>Pendurar o mouse</button></div>
              {/if}
              {#if career.released}
                <div class="note warn"><b>O {orgOf(career.orgId).name} não renovou.</b><span>Rating {lastLog.seasonRating.toFixed(2)} na temporada, sem título. Escolha uma oferta ou volte para a Lan House.</span></div>
              {/if}
              {#if lastLog.hltvRank || lastLog.rookieEligible}
                <div class="note" class:award={lastLog.hltvRank !== null && lastLog.hltvRank !== undefined && lastLog.hltvRank <= 20 || lastLog.rookie?.you}>
                  {#if lastLog.hltvRank}<b>HLTV {lastLog.year}: {lastLog.hltvRank === 1 ? 'melhor jogador do mundo' : `#${lastLog.hltvRank} do mundo`}{lastLog.hltvRank > 1 && lastLog.hltvRank <= 20 ? ' · Top 20' : ''}</b>{/if}
                  {#if lastLog.rookie?.you}<span>Rookie of the Year: você, o melhor estreante de Major.</span>{:else if lastLog.rookieEligible && lastLog.rookie}<span>Rookie of the Year ficou com {lastLog.rookie.nick} ({lastLog.rookie.team}).</span>{/if}
                  <button class="link-btn" on:click={() => openTrophies('premios')}>Ver Top 20</button>
                </div>
              {/if}
              {#if career.blockedOffers?.length}
                <div class="note warn"><b>Recusaram por causa do inglês</b><span>{career.blockedOffers.map((entry) => `${entry.orgName} (pede ${entry.need})`).join(' · ')}. O seu inglês: {myFluency(career, 'en')}. Aulas de inglês na semana e jogar em time de call em inglês sobem o nível.</span></div>
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
            {#if lastLog.hltvTop?.length}
              <CareerHltvTop year={lastLog.year} top={lastLog.hltvTop} rookie={lastLog.rookie ?? null} myRank={lastLog.hltvRank ?? null} myRating={lastLog.seasonRating} />
            {/if}
          {/if}

          <section aria-label="Janela de mercado">
            <div class="section-head">
              <h2 class="display h2">Janela de mercado</h2>
              <span>Hoje: {orgOf(career.orgId).name} · {teamTierTitle(currentLevel)}</span>
            </div>
            <div class="offers">
              {#each career.pendingOffers as offer}
                {@const target = orgIn(career.seed, career.seasonNumber, offer.orgId)}
                {@const seat = target ? seatToTake(target, career.role) : null}
                <button class="offer" on:click={() => choose(offer.orgId)}>
                  <span class="label" class:up={offer.orgLevel < currentLevel}>{offer.orgLevel < currentLevel ? `Sobe para ${teamTierTitle(offer.orgLevel)}` : offer.orgLevel === currentLevel ? 'Mesmo nível' : `Desce para ${teamTierTitle(offer.orgLevel)}`}</span>
                  <b class="display">{offer.orgName}</b>
                  <span class="ln">Vaga de <b>{seat?.nick ?? 'a definir'}</b></span>
                  {#if target}{@const offerLanguage = orgLanguage(target)}{@const offerFluency = myFluency(career, offerLanguage)}<span class="ln">Call em <b class:warn-text={languagePenalty(offerFluency) > 0}>{LANGUAGE_LABEL[offerLanguage]}</b> · você {fluencyLabel(offerFluency)}</span>{/if}
                  <span class="ln">Campeonatos <b>{eventsFor(offer.orgId, career)} / temporada</b></span>
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
            <strong>{career.calendar?.[liveIndex]?.name}{liveStageNow ? ` · ${STAGE_NAME[liveStageNow]}` : ''}</strong>
            {#if career.rival && career.rival.eventIndex === liveIndex}<span class="rival-chip" title={career.rival.line}>Rival: {career.rival.nick} ({career.rival.orgName})</span>{/if}
            {#if live.run.tournament}<button class="link-btn live-overview-btn" on:click={() => (overviewOpen = true)}>{liveStage ? 'Visão do Major' : 'Tabela e chave'}</button>{/if}
            <span class="live-tag-tier">{eventTierLabel(career.calendar?.[liveIndex]?.tier, currentLevel)}</span>
          </div>
          {#if liveOver}
            <div class="finish">
              <p class="series">{live.run.champion ? 'Campeão' : live.finished ? placementLabel(live.run.placement) : 'Você saiu'}{live.finished ? '' : ' · o resto roda ao fechar'}</p>
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
              {#if autoCall}
                <button class="secondary-btn auto-off" on:click={() => (autoCall = false)} title="As próximas calls voltam a parar para você escolher">
                  Calls no seu estilo ({RISK[autoProfile].label}) · voltar a escolher
                </button>
              {/if}
            </div>
          {/if}
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
            <div class="fire-frame" class:hot={hardGame} class:champion={liveChampion}>
            {#if liveChampion}<span class="fire-banner">Campeão · {career.calendar?.[liveIndex]?.name}</span>{/if}
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
                interactiveTeamIds={[...(liveOpponent && liveOpponent.id !== career.orgId ? [liveOpponent.id] : []), live.userTeamId, career.orgId]}
                onTeamClick={(teamId) => openOpponent(teamId === live?.userTeamId || teamId === 'user' ? career?.orgId ?? teamId : teamId)}
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
                        <p class="eyebrow">Sua call{#if clutchMoment} · <span class="moment" class:planted={clutchMoment.planted}>{clutchMoment.text}</span>{/if}</p>
                        <h2 class="display">{clutch.situation.text}</h2>
                        <p class="clutch-ctx" class:hints-only={!clutchCtx}>
                          {#if clutchCtx}
                            <span>Placar <b>{clutchCtx.us}-{clutchCtx.them}</b></span>
                            {#if clutchCtx.winStreak >= 2}<span class="up">{clutchCtx.winStreak} rounds seguidos a favor</span>{:else if clutchCtx.lossStreak >= 2}<span class="down">{clutchCtx.lossStreak} rounds seguidos perdidos</span>{/if}
                            {#if clutchCtx.money !== null && clutchCtx.money < 2400}<span class="down">vocês no eco</span>{/if}
                            {#if clutchCtx.theirMoney !== null && clutchCtx.theirMoney < 2400}<span class="up">eles no eco</span>{/if}
                          {/if}
                          <button type="button" class="hints-btn" aria-expanded={callHints} aria-controls="clutch-calls" on:click={() => (callHints = !callHints)}>{callHints ? 'Esconder dicas' : 'Quando cada uma é certa'}</button>
                        </p>
                      </div>
                      <div class="calls" class:hints-open={callHints} id="clutch-calls">
                        {#each clutch.situation.alternatives as alternative, index}
                          <button class="call" on:click={() => pick(index as 0 | 1 | 2)} title={RISK[alternative.profile].hint}>
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
                      {#if callOutcome.quality}<p class="read-line read-{callOutcome.quality}"><b>{QUALITY_LABEL[callOutcome.quality]}.</b> {callOutcome.quality !== 'good' && callOutcome.bestText ? `A certa era ${callOutcome.bestText.charAt(0).toLowerCase()}${callOutcome.bestText.slice(1)}. ` : ''}{callOutcome.reason}</p>{/if}
                      <p class="outcome-story">{callOutcome.story}</p>
                      {#if callOutcome.quote}<p class="outcome-quote"><b>{callOutcome.quote.who}:</b> “{callOutcome.quote.text}”</p>{/if}
                      <button class="outcome-btn" on:click={continueAfterCall}>Continuar</button>
                    </section>
                  {/if}
                </svelte:fragment>
              </SeriesViewer>
            {/key}
            </div>
          {:else if !liveOver}
            <p class="chip-note">Chave correndo…</p>
          {/if}

          {#if callOutcome && outcomeOutside}
            <!-- A call fechou a série: o viewer já mostra o placar final e esconde o mapa ao vivo, então o
                 resultado (e o Continuar) vem aqui embaixo — senão ninguém consegue seguir o campeonato. -->
            <section class="outcome" class:lost={!callOutcome.won} use:scrollToPanel aria-label="Resultado da sua call">
              <span class="eyebrow">Sua call · {callOutcome.text}</span>
              <p class="outcome-line">{callOutcome.won ? 'Round ganho' : 'Round perdido'}</p>
              {#if callOutcome.quality}<p class="read-line read-{callOutcome.quality}"><b>{QUALITY_LABEL[callOutcome.quality]}.</b> {callOutcome.quality !== 'good' && callOutcome.bestText ? `A certa era ${callOutcome.bestText.charAt(0).toLowerCase()}${callOutcome.bestText.slice(1)}. ` : ''}{callOutcome.reason}</p>{/if}
              <p class="outcome-story">{callOutcome.story}</p>
              {#if callOutcome.quote}<p class="outcome-quote"><b>{callOutcome.quote.who}:</b> “{callOutcome.quote.text}”</p>{/if}
              <button class="outcome-btn" on:click={continueAfterCall}>Continuar</button>
            </section>
          {:else if resolving}
            <p class="last-call resolving" role="status">Round decisivo rodando em velocidade normal…</p>
          {:else if lastCall && !callOutcome && !clutch}
            <p class="last-call chip-note" class:won={lastCall.won}>Sua call: {lastCall.text} · round {lastCall.won ? 'ganho' : 'perdido'}{lastCall.quality ? ` · ${QUALITY_LABEL[lastCall.quality].toLowerCase()}` : ''}{autoCall ? ' · no seu estilo' : ''}{#if autoCall} <button class="link-btn inline-off" on:click={() => (autoCall = false)}>Voltar a escolher</button>{/if}</p>
          {/if}

        {:else}
          {#if !career.calendar && lastLog}
            {@const summarySwing = seasonSwing(lastLog)}
            <section class="season-summary" aria-label="Como foi a temporada">
              <div class="ss-delta">
                <span class="label">Temporada {lastLog.seasonNumber} · {lastLog.year}</span>
                <b class:down={summarySwing.end < summarySwing.start} class:up={summarySwing.end > summarySwing.start}>{summarySwing.start} → {summarySwing.end}</b>
                <span>rating {lastLog.seasonRating.toFixed(2)}{lastLog.titles ? ` · ${lastLog.titles} título${lastLog.titles > 1 ? 's' : ''}` : ''}</span>
              </div>
              <div class="ss-notes">
                {#if lastLog.hltvRank}
                  <p class:up-note={lastLog.hltvRank <= 20}><b>HLTV {lastLog.year}: {lastLog.hltvRank === 1 ? 'você é o melhor do mundo!' : `#${lastLog.hltvRank} do mundo`}</b>{lastLog.hltvRank <= 20 ? ' Top 20 da temporada.' : ''} <button class="link-btn" on:click={() => openTrophies('premios')}>Ver Top 20</button></p>
                {/if}
                {#if lastLog.rookie?.you}
                  <p class="up-note"><b>Rookie of the Year {lastLog.year}.</b> O melhor estreante de Major da temporada.</p>
                {:else if lastLog.rookieEligible && lastLog.rookie}
                  <p><b>Rookie of the Year:</b> {lastLog.rookie.nick} ({lastLog.rookie.team}) levou. Era o seu ano de estreia em Major.</p>
                {/if}
                {#if lastLog.orgChange}
                  <p class:up-note={lastLog.orgChange.to < lastLog.orgChange.from} class:warn={lastLog.orgChange.to > lastLog.orgChange.from}><b>{lastLog.orgName} {lastLog.orgChange.to < lastLog.orgChange.from ? 'subiu' : 'caiu'} para o {teamTierLabel(lastLog.orgChange.to)}.</b> {lastLog.orgChange.to < lastLog.orgChange.from ? 'Você carregou o time: o circuito agora é outro.' : 'Nenhuma semifinal na temporada.'}</p>
                {/if}
                {#if lastLog.trainingGain}<p class="up-note"><b>Treino:</b> +{lastLog.trainingGain} de overall em {lastLog.trainingSessions ?? lastLog.trainingGain} semanas.{lastLog.ceilingGain ? ` Teto conquistado +${lastLog.ceilingGain}.` : ''}</p>{/if}
                {#if lastLog.ceilingBlocked}<p class="warn"><b>Teto:</b> a lesão segurou. Ele só sobe numa temporada sem lesão.</p>{/if}
                {#if lastLog.ageDecline}<p><b>Idade:</b> −{lastLog.ageDecline} de overall aos {lastLog.age ?? career.age} anos.</p>{/if}
                {#if lastLog.injury}<p class="warn"><b>Lesão:</b> {lastLog.injury}.</p>{/if}
                {#if lastLog.moves?.length}<p><b>Trocas:</b> {lastLog.moves.join(' · ')}</p>{/if}
                {#if lastLog.retireHint}<p class="warn"><b>O corpo pede para parar.</b> Dá para seguir até os 40.</p>{/if}
                {#if !lastLog.ageDecline && !lastLog.injury && !lastLog.moves?.length && !lastLog.retireHint && !lastLog.orgChange && !lastLog.hltvRank && !lastLog.rookieEligible && !lastLog.trainingGain && !lastLog.ceilingBlocked}<p>{lastLog.agingNote ?? 'Temporada fechada.'}</p>{/if}
              </div>
              {#if sceneProspects.length}
                <div class="ss-market ss-prospects">
                  <p class="label">Promessas da cena · até 21 anos</p>
                  <ul>
                    {#each sceneProspects as kid (kid.nick)}
                      <li><b>{kid.nick}</b> {kid.age} anos · {kid.orgName} ({teamTierLabel(currentLevelOf(career, kid.orgId))}) <span>· overall {kid.overall}{kid.delta > 0 ? ` (+${kid.delta})` : kid.delta < 0 ? ` (−${Math.abs(kid.delta)})` : ''}{kid.curated ? ' · base real' : ''}</span></li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if sceneMarket.length || sceneRetired.length}
                <div class="ss-market">
                  <p class="label">Mercado da cena · {career.year}</p>
                  <ul>
                    {#each sceneRetired as retired}
                      <li><b>{retired.nick}</b> pendurou o mouse aos {retired.age} ({retired.orgName}) <span>· entra {retired.replacement}</span></li>
                    {/each}
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
                  <p class="eyebrow">Próximo · {currentEntry.month ? MONTH_FULL[currentEntry.month - 1] : `etapa ${currentEntry.index + 1}`} · {entryKind(currentEntry) === 'qualifier' ? 'Qualificatória' : eventTierLabel(currentEntry.tier, currentLevel)}{currentEntry.format === 'major' ? ` · ${nextMajorStage ? `entra no ${STAGE_NAME[nextMajorStage]}` : 'sem vaga pelo ranking'}` : currentEntry.format === 'swiss16' ? ' · suíça de 16' : ''}{currentEntry.location ? ` · ${currentEntry.location}` : ''}</p>
                  <h2 class="display">{eventName(currentEntry.name)}</h2>
                  {#if arcNow}
                    <button type="button" class="arc-line" aria-expanded={arcHelp} on:click={() => (arcHelp = !arcHelp)} title={`${phaseTip(arcNow)}${arcNow.study > 0 ? ` ${studyTip(arcNow.study)}` : ''}`}>
                      <span class="arc-chip phase-{arcNow.phase}">Fase: {arcNow.phase}</span>
                      {#if arcNow.study > 0}<span class="arc-chip study">Rivais estudando vocês: +{arcNow.study.toLocaleString('pt-BR')}</span>{/if}
                    </button>
                    {#if arcHelp}
                      <p class="arc-help">{phaseTip(arcNow)}{#if arcNow.study > 0}{' '}{studyTip(arcNow.study)}{/if}</p>
                    {/if}
                  {/if}
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
                    <span class="report-line">{#if lastEventReport.result.benched}No banco: o time ficou em {lastEventReport.placement}, sem você{:else if lastEventReport.placement === 'Não classificado'}Sem vaga no Major pelo ranking{:else}{lastEventReport.wins}W–{lastEventReport.losses}L · rating <b>{lastEventReport.rating.toFixed(2)}</b>{/if}</span>
                    {#if lastEventReport.rivalLine}<span class="report-mvp rival-line">{lastEventReport.rivalLine}</span>{/if}
                    {#if lastEventReport.result.mvp}
                      <span class="report-mvp" class:you={lastEventReport.result.mvp.you}>{lastEventReport.result.mvp.you ? 'Você foi o MVP' : `MVP ${lastEventReport.result.mvp.nick} · ${lastEventReport.result.mvp.team}`} · {lastEventReport.result.mvp.rating.toFixed(2)}{#if lastEventReport.result.plays?.aces} · {lastEventReport.result.plays.aces} ace{lastEventReport.result.plays.aces > 1 ? 's' : ''}{/if}</span>
                    {/if}
                  </span>
                  <span class="report-links">
                    {#if lastEventReport.result.bracket?.length}<button class="link-btn" on:click={() => lastEventReport && openEvent(lastEventReport.index)}>Chave</button>{/if}
                    {#if lastEventReport.stats.length}<button class="link-btn" on:click={openStats}>Stats</button>{/if}
                  </span>
                </div>
              {/if}
              {#if currentEntry}
                {#if (career.benchedEvents ?? 0) > 0}<p class="bench-note">No banco: você fica de fora deste campeonato e o substituto joga no seu lugar.</p>{/if}
                <div class="next-actions">
                  <button class="cta" on:click={() => currentEntry && begin(currentEntry.index, nextPace === 'live' ? 'live' : 'pace')}>{(career.benchedEvents ?? 0) > 0 ? 'Ver o time jogar' : PACE_CTA[nextPace]}</button>
                  {#if nextPace === 'live'}
                    <button class="link-btn" on:click={() => currentEntry && begin(currentEntry.index, 'sim')}>Só simular</button>
                  {:else}
                    <button class="link-btn" on:click={() => currentEntry && begin(currentEntry.index, 'live')}>Jogar ao vivo</button>
                  {/if}
                </div>
                {#if waitingCircuit}<p class="circuit-wait" role="status">O mundo ainda joga os campeonatos de antes deste ({$circuitProgress.pending}). O seu começa sozinho em seguida.</p>{/if}
              {:else if seasonClosing}
                <p class="circuit-wait" role="status">Fechando a temporada: o mundo termina os últimos campeonatos do ano ({$circuitProgress.pending}).</p>
              {:else if !career.calendar}
                <button class="cta" on:click={openSeason}>Abrir temporada · {eventsFor(career.orgId, career)} camps</button>
              {/if}
            </section>

            {#if myPlayer}
              <section class="squad" aria-label="Elenco">
                <div class="section-head">
                  <p class="label" title="Relação acima de 70 dá +1 de overall em quadra; abaixo de 35 tira 1.">Elenco · {orgOf(career.orgId).name}{#if langFit}{' · '}<span class="lang-chip" class:warn={langFit.penalty > 0} title={langFit.penalty ? `Call em ${LANGUAGE_LABEL[langFit.language]}: os parceiros perdem ${langFit.penalty} de overall em quadra e as conversas rendem menos até você aprender. Cada campeonato ensina um pouco; a semana tem aulas.` : 'Você fala o idioma da call.'}>call em {LANGUAGE_LABEL[langFit.language]} · você {fluencyLabel(langFit.fluency)}{langFit.penalty ? ` · −${langFit.penalty} sinergia` : ''}</span>{/if}</p>
                  <span class="squad-actions">
                    {#if benchReserve}<button class="secondary-btn small squad-btn bench-btn" on:click={() => (promoteOpen = true)} title="Quem está no banco. Clique para pôr no time.">Banco: {benchReserve.nick} · {ROLE_SHORT[benchReserve.role]} {benchReserve.overall}</button>{/if}
                    {#if canChangeRole(career)}<button class="secondary-btn small squad-btn" on:click={() => (roleSheetOpen = true)} title="Uma vez por temporada. Pode subir ou derrubar o seu overall.">Trocar de função</button>{/if}
                    {#if canRequestTransfer(career)}<button class="secondary-btn small squad-btn transfer-btn" on:click={askTransfer} title="Uma vez por temporada. O elenco não gosta de saber.">Procurar outro time</button>{/if}
                  </span>
                </div>
                <div class="squad-strip">
                  <CareerCard player={myPlayer} me={true} roleLabel={ROLE_SHORT[career.role]} profile={myCardInfo?.(myPlayer) ?? null} caption={myCardInfo ? '' : `Você · ${career.age} anos`} trained={career.trained ?? null} honors={honorsFor(honorIndex, career.nick)} onOpen={openMySheet} notice={cardNotice?.id === myPlayer.id ? cardNotice : null} onNoticeClose={dismissNotice} />
                  {#each squadMates as mate (mate.player.id)}
                    {@const bump = synergyBump(mate.relationship)}
                    <CareerCard player={mate.player} roleLabel={ROLE_SHORT[mate.player.role as PlayerRole] ?? ''} profile={myCardInfo?.(mate.player) ?? null} caption={myCardInfo ? '' : orgOf(career.orgId).name} honors={honorsFor(honorIndex, mate.player.nickname)} onOpen={() => openMateSheet(mate)} notice={cardNotice?.id === mate.player.id ? cardNotice : null} onNoticeClose={dismissNotice}>
                      <div class="mate-foot">
                        <div class="bond">
                          <div class="bond-bar" role="img" aria-label={`Relação ${mate.relationship} de 100`}><i class:high={mate.relationship >= 70} class:low={mate.relationship < 35} style={`width:${mate.relationship}%`}></i></div>
                          <span class="bond-num" class:high={mate.relationship >= 70} class:low={mate.relationship < 35} title={`Relação ${mate.relationship} de 100${bump !== 0 ? `. Em quadra: ${bump > 0 ? '+' : '−'}${Math.abs(bump)} de overall` : ''}`}>rel {mate.relationship}{bump !== 0 ? ` · ${bump > 0 ? '+' : '−'}${Math.abs(bump)}` : ''}</span>
                        </div>
                        <button class="secondary-btn small" on:click={() => chat(mate.player.id)} aria-label={`Conversar com ${mate.player.nickname}`}>Conversar</button>
                      </div>
                    </CareerCard>
                  {/each}

                </div>
              </section>
            {/if}

            {#if career.calendar && currentEntry && myPlayer}
              <section class="week" aria-label="Semana até o próximo campeonato">
                <div class="section-head">
                  <p class="label">Semana até o próximo campeonato · {outlook?.need ?? 3} treinos = +1 overall</p>
                  <div class="week-meter" title="Cada ação ocupa blocos da semana. Repetir o mesmo tipo nas últimas 4 semanas rende menos: treino 100%, 85%, 70%; o resto 100%, 65%, 35%. Semana cheia cansa mais." aria-live="polite">
                    <span class="wm-pips" aria-hidden="true">{#each Array(weekTotal) as _, blockIndex}{@const usedBlock = blockIndex >= weekLeft}{@const previewBlock = !usedBlock && hoverCost > 0 && blockIndex >= weekLeft - hoverCost && hoverCost <= weekLeft}<i class:used={usedBlock} class:preview={previewBlock} class:over={hoverCost > weekLeft && !usedBlock}></i>{/each}</span>
                    <span class="wm-text">{#if hoverCost > 0}{hoverCost > weekLeft ? `Não cabe: precisa de ${hoverCost}` : `Usa ${hoverCost} · sobra ${weekLeft - hoverCost}`}{:else}<b>{weekLeft}</b> de {weekTotal} blocos livres{/if}</span>
                  </div>
                  <span class="train-line" class:done={Boolean(weekLine)} class:alert={!weekLine && Boolean(career.knock || fatigue >= TIRED_AT)} aria-live="polite">{weekLine ?? career.knock ?? (fatigue >= TIRED_AT ? `Cansaço ${fatigue}: treino rende metade. Descansar ajuda.` : canTrain ? (weekLeft < weekTotal ? `Ainda cabe${weekLeft > 1 ? 'm' : ''} ${weekLeft} bloco${weekLeft > 1 ? 's' : ''} nesta semana.` : 'Monte um treino ou escolha até 3 atividades.') : 'Semana decidida. A próxima abre depois do campeonato.')}{#if weekChips.length}<span class="week-chips">{#each weekChips as chip}<i class:neg={chip.kind === 'fatigue' ? chip.value > 0 : chip.value < 0}>{chipText(chip)}</i>{/each}</span>{/if}</span>
                </div>
                <div class="week-grid">
                  <div class="free-train">
                    <div class="ft-head"><b>Treino livre</b><span>{FREE_TRAINING_COST} blocos · até 4</span></div>
                    <div class="skills-pick" role="group" aria-label="Habilidades para treinar">
                      {#each TRAINABLE as attribute}
                        <button type="button" aria-pressed={pickedSkills.includes(attribute)} class:on={pickedSkills.includes(attribute)} class:tip={coachTips.includes(attribute)} disabled={!canTrain} on:click={() => toggleSkill(attribute)} title={coachTips.includes(attribute) ? 'O coach indicou treinar' : undefined}>
                          <span>{attribute === 'consistency' ? 'Consist.' : ATTR_LABEL[attribute]}</span>
                          {#if splitPreview[attribute]}<b>+{splitPreview[attribute]}</b>{/if}
                        </button>
                      {/each}
                    </div>
                    <div class="ft-actions">
                      <button class="secondary-btn" disabled={!canTrain || freeDone || weekLeft < FREE_TRAINING_COST || !pickedSkills.length} on:click={trainFree} on:mouseenter={() => (hoverCost = freeDone ? 0 : FREE_TRAINING_COST)} on:mouseleave={() => (hoverCost = 0)} on:focus={() => (hoverCost = freeDone ? 0 : FREE_TRAINING_COST)} on:blur={() => (hoverCost = 0)} title={`Ocupa ${FREE_TRAINING_COST} blocos${career && diminishOf(career, 'treino') < 1 ? `. Muito treino seguido: rende ${Math.round(diminishOf(career, 'treino') * 100)}%` : ''}`}>{freeDone ? 'Treino feito' : pickedSkills.length ? `Treinar (${pickedSkills.length})` : 'Treinar'}</button>
                    </div>
                  </div>
                  <div class="week-right">
                  <div class="week-cards">
                    {#each weekCards as card (card.id)}
                      {@const cost = costOf(card)}
                      {@const done = career ? pickedThisWeek(career, card.id) : false}
                      {@const contact = career ? contactOf(career, card) : null}
                      {@const factor = career ? diminishOf(career, card.category) : 1}
                      <button class="wcard" class:done class:nofit={!done && cost > weekLeft} disabled={!canTrain || done || cost > weekLeft} on:click={() => { chooseWeek(card.id); hoverCost = 0; }} on:mouseenter={() => (hoverCost = done ? 0 : cost)} on:mouseleave={() => (hoverCost = 0)} on:focus={() => (hoverCost = done ? 0 : cost)} on:blur={() => (hoverCost = 0)} title={`${card.text.replace(/\.?$/, '.')}${contact ? ` Com ${contact.nick} (${contact.org}).` : ''}${factor < 1 ? ` Você repetiu esse tipo: rende ${Math.round(factor * 100)}%.` : ''}`} aria-label={`${card.title}: ${card.text.replace(/\.?$/, '.')} Ocupa ${cost} bloco${cost > 1 ? 's' : ''}.`}>
                        <span class="wcat">{CATEGORY_LABEL[card.category]}{#if card.risk}<em>risco</em>{/if}<span class="wcost" title={`Ocupa ${cost} bloco${cost > 1 ? 's' : ''}`}>{#each Array(cost) as _}<i></i>{/each}<em>{cost}</em></span></span>
                        <b>{card.title}</b>
                        {#if contact}<span class="wcontact">com {contact.nick} · {contact.org}</span>{/if}
                        {#if done}<span class="wdone">Feito</span>{:else if cost > weekLeft && canTrain}<span class="wdim">não cabe</span>{:else if factor < 1}<span class="wdim">rende {Math.round(factor * 100)}%</span>{/if}
                        <span class="wchips">{#each actionChips(card).slice(0, contact ? 2 : 3) as chip}<i class:neg={chip.kind === 'fatigue' ? chip.value > 0 : chip.value < 0}>{chipText(chip)}</i>{/each}</span>
                      </button>
                    {/each}
                  </div>
                  <div class="map-train">
                    <div class="map-chips" role="radiogroup" aria-label="Mapa para treinar (mapa bem treinado vira seu pick no veto e dá força quando é jogado)">
                      {#each myMaps as map, mapIndex (map.mapId)}
                        <button type="button" role="radio" aria-checked={mapPick === map.mapId} class="map-chip" class:on={mapPick === map.mapId} class:top={mapIndex < 3} style={`--map: url(/maps/${map.mapId}.webp)`} disabled={!canTrainMap} on:click={() => (mapPick = map.mapId)} title={`${map.name}: ${map.score}${map.affinity !== 'EVEN' ? ` (${map.affinity})` : ''}${mapIndex < 3 ? ' · um dos seus 3 picks' : ''}`}>
                          <b>{map.name}</b>
                          <span class="mc-score">{map.score}{#if map.affinity !== 'EVEN'}<i>{map.affinity}</i>{/if}</span>
                          <span class="mc-bar" aria-hidden="true"><i style={`width:${map.score}%`}></i></span>
                        </button>
                      {/each}
                    </div>
                    <button class="secondary-btn map-go" disabled={!canTrainMap || !mapPick} on:click={doTrainMap}>{canTrainMap ? `Treinar ${myMaps.find((map) => map.mapId === mapPick)?.name ?? 'mapa'} +8` : 'Mapa treinado'}</button>
                  </div>
                  {#if coachLine}<p class="coach-line"><b>Coach:</b> {coachLine}</p>{:else if coachTips.length}<p class="coach-line"><b>Coach indicou:</b> {coachTips.map((tip) => ATTR_LABEL[tip]).join(' e ')}</p>{/if}
                  </div>
                </div>
              </section>
            {/if}

            {#if career.calendar}
              <section class="calendar" aria-label="Calendário da temporada">
                <div class="section-head">
                  <p class="label">Temporada {career.seasonNumber} · {career.calendar.length - qualifierCount} campeonatos{qualifierCount ? ` · ${qualifierCount} ${qualifierCount === 1 ? 'qualificatória' : 'qualificatórias'}` : ''}</p>
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
                    {@const parts = eventParts(eventName(entry.name))}
                    <li>
                      <button class="ev place-{placeKey(entry.result?.placement)}" class:now={currentEntry?.index === index} class:played={Boolean(entry.result)} on:click={() => openEvent(index)} aria-label={`${entry.name}: ver detalhes`}>
                        <span class="ev-top">
                          <span class="ev-n">{entry.month ? MONTH_LABEL[entry.month - 1] : index + 1}{#if !entry.result || entry.tier === 'Major'}<small class:major={entry.tier === 'Major'}>{eventTierLabel(entry.tier, currentLevel)}</small>{/if}</span>
                          {#if entry.result}
                            <span class="ev-place">{entry.result.benched ? 'Banco' : PLACE_SHORT[entry.result.placement] ?? entry.result.placement}</span>
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
          <CareerCard size="sheet" player={detailsPlayer} roleLabel={ROLE_META[detailsPlayer.role as PlayerRole]?.label ?? ''} caption={orgOf(career?.orgId ?? '').name} profile={myCardInfo?.(detailsPlayer) ?? null} honors={honorsFor(honorIndex, detailsPlayer.nickname)}>
            <div class="sheet-bond">
              <div class="sheet-bond-copy">
                <span class="label">Relação</span>
                <b class:high={sheetMate.relationship >= 70} class:low={sheetMate.relationship < 35}>{sheetMate.relationship}<small>/100</small></b>
                <span>sinergia {synergyBump(sheetMate.relationship) >= 0 ? '+' : '−'}{Math.abs(synergyBump(sheetMate.relationship))} de overall em quadra</span>
              </div>
              <div class="bond-bar"><i class:high={sheetMate.relationship >= 70} class:low={sheetMate.relationship < 35} style={`width:${sheetMate.relationship}%`}></i></div>
              <button class="cta sheet-talk" on:click={() => { if (!career || !sheetMate) return; const mateId = sheetMate.player.id; chat(mateId); sheetMate = matesOf(career).find((mate) => mate.player.id === mateId) ?? sheetMate; }}>Conversar com {detailsPlayer.nickname}</button>
              {#if lastTalk && lastTalk.mateId === sheetMate.player.id}<p class="sheet-talk-line">{lastTalk.line}</p>{/if}
              {#if career && career.orgId !== 'lan-house' && career.status === 'ACTIVE'}
                {#if canKickMate(career)}
                  <button class="secondary-btn small kick-btn" on:click={() => sheetMate && askKick(sheetMate.player.id, sheetMate.player.nickname ?? 'parceiro')} title="A diretoria decide. Se aceitar, entra alguém no nível do time.">Pedir a saída de {detailsPlayer.nickname}</button>
                {:else}
                  <button class="secondary-btn small kick-btn" disabled title="Uma vez por temporada.">Pedir a saída · você já pediu nesta temporada</button>
                {/if}
              {/if}
              {#if career && benchReserve && sheetMate}<button class="secondary-btn small" on:click={() => sheetMate && benchMate(sheetMate.player.id)}>Mandar para o banco · entra {benchReserve.nick}</button>{/if}
              {#if career && sheetMate && canSwapRoles(career)}
                <div class="swap-roles">
                  <span class="label">Como IGL · trocar a função de {detailsPlayer.nickname} com</span>
                  <div class="swap-list">
                    {#each squadMates.filter((mate) => mate.player.id !== sheetMate?.player.id) as other (other.player.id)}
                      <button class="secondary-btn small" on:click={() => sheetMate && swapRoles(sheetMate.player.id, other.player.id)}>{other.player.nickname} · {ROLE_SHORT[other.player.role as PlayerRole] ?? other.player.role}</button>
                    {/each}
                  </div>
                </div>
              {:else if career && sheetMate && career.role === 'igl'}
                <p class="sheet-talk-line">Você já mexeu nas funções nesta semana.</p>
              {/if}
              {#if career && sheetMate && naturalRoleOf(career, sheetMate) !== sheetMate.player.role}<p class="sheet-talk-line">Jogando fora da função dele ({ROLE_META[naturalRoleOf(career, sheetMate)]?.label}): −2 de overall.</p>{/if}
            </div>
          </CareerCard>
        {:else}
          <CareerCard size="sheet" player={detailsPlayer} me={sheetIsMe} roleLabel={sheetIsMe && career ? ROLE_META[career.role].label : ROLE_META[detailsPlayer.role as PlayerRole]?.label ?? ''} caption={sheetIsMe ? `Você · ${orgOf(career?.orgId ?? '').name}` : orgOf(career?.orgId ?? '').name} trained={sheetIsMe ? career?.trained ?? null : null} profile={myCardInfo?.(detailsPlayer) ?? null} honors={honorsFor(honorIndex, detailsPlayer.nickname)} />
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
          <span class="eyebrow">Campeonato {eventSheet + 1} de {career.calendar?.length ?? 0} · {eventTierLabel(sheetEntry.tier, currentLevel)}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeEventSheet}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <h2 class="display event-title" id="event-title">{eventName(sheetEntry.name)}</h2>
        <p class="event-where">
          {[sheetEntry.month ? MONTH_FULL[sheetEntry.month - 1] : null, sheetEntry.location, sheetEntry.organizer].filter(Boolean).join(' · ')}
          {#if sheetEntry.note}<span class="event-tag">Retorno</span>{/if}
          {#if !sheetEntry.result}<span class="event-tag soft">{currentEntry?.index === eventSheet ? 'Próximo a jogar' : 'Ainda vai acontecer'}</span>{/if}
        </p>
        {#if sheetEntry.note}<p class="event-note-line">{sheetEntry.note}</p>{/if}
        <dl class="event-facts">
          {#if sheetEntry.result}
            <div class="place-{placeKey(sheetEntry.result.placement)}"><dt>Sua colocação</dt><dd class="placed">{sheetEntry.result.placement}</dd></div>
            <div><dt>Séries</dt><dd>{sheetEntry.result.seriesWins}V · {sheetEntry.result.seriesLosses}D</dd></div>
            <div><dt>Seu rating</dt><dd class:hot={sheetEntry.result.rating >= 1.1}>{sheetEntry.result.rating.toFixed(2)}</dd></div>
            {#if sheetEntry.prizePool}<div><dt>Premiação</dt><dd>{prizeLabel(sheetEntry.prizePool)}</dd></div>{/if}
            {#if sheetEntry.result.champion}<div><dt>Campeão</dt><dd>{sheetEntry.result.champion}</dd></div>{/if}
            {#if sheetEntry.result.mvp}<div><dt>MVP</dt><dd class:mvp-you={sheetEntry.result.mvp.you}>{sheetEntry.result.mvp.you ? 'Você' : sheetEntry.result.mvp.nick} <small>{sheetEntry.result.mvp.rating.toFixed(2)}</small></dd></div>{/if}
            {#if sheetEntry.result.plays && (sheetEntry.result.plays.aces || sheetEntry.result.plays.quads || sheetEntry.result.plays.clutches)}<div><dt>Suas jogadas</dt><dd>{[sheetEntry.result.plays.aces ? `${sheetEntry.result.plays.aces} ace` : '', sheetEntry.result.plays.quads ? `${sheetEntry.result.plays.quads} quad` : '', sheetEntry.result.plays.clutches ? `${sheetEntry.result.plays.clutches} clutch` : ''].filter(Boolean).join(' · ')}</dd></div>{/if}
            <div><dt>Formato</dt><dd>{FORMAT_SHORT(sheetEntry)}</dd></div>
          {:else}
            <div><dt>Formato</dt><dd>{FORMAT_SHORT(sheetEntry)}</dd></div>
            <div><dt>Séries</dt><dd>{SERIES_SHORT(sheetEntry)}</dd></div>
            <div><dt>Premiação</dt><dd>{sheetEntry.prizePool ? prizeLabel(sheetEntry.prizePool) : '—'}</dd></div>
            <div title="O seu time pela força, contra os times da chave."><dt>Sua força</dt><dd>{sheetMyRank}º de {sheetField.length}</dd></div>
          {/if}
        </dl>
        {#if sheetEntry.result?.opponents?.length}
          <p class="label">Seus jogos</p>
          <ol class="my-games">
            {#each sheetEntry.result.opponents as game, gameIndex (gameIndex)}
              <li class:won={game.won} class:lost={!game.won}>
                <span class="mg-phase">{sheetEntry.format !== 'major' && game.phase === 'stage3' ? 'Suíça' : PHASE_LABEL[game.phase ?? ''] ?? 'Série'}</span>
                <TeamBadge id={orgIdByName(game.team)} orgId={orgIdByName(game.team)} name={game.team} size="sm" />
                <b class="mg-team">{game.team}</b>
                <span class="mg-score">{game.score ?? ''}</span>
                <span class="mg-result">{game.won ? 'Venceu' : 'Perdeu'}</span>
              </li>
            {/each}
          </ol>
        {/if}
        {#if sheetEntry.result?.stages?.length}
          {@const stages = sheetEntry.result.stages}
          {@const shown = stages.find((entry) => entry.stage === sheetStageTab) ?? stages.find((entry) => entry.standings.some((standing) => standing.you)) ?? stages[stages.length - 1]}
          <div class="stage-tabs" role="tablist" aria-label="Tabela de cada stage">
            {#each stages as entry (entry.stage)}
              <button role="tab" aria-selected={shown.stage === entry.stage} class:on={shown.stage === entry.stage} on:click={() => (sheetStageTab = entry.stage)}>{sheetEntry.format !== 'major' && entry.stage === 'stage3' ? 'Suíça' : PHASE_LABEL[entry.stage]}</button>
            {/each}
          </div>
          <ol class="stage-table">
            {#each shown.standings as standing, standingIndex (standing.name + standingIndex)}
              <li class:you={standing.you} class:out={standing.status === 'eliminated'}>
                <span class="st-rank">{standingIndex + 1}</span>
                <TeamBadge id={orgIdByName(standing.name)} orgId={orgIdByName(standing.name)} name={standing.name} size="sm" highlight={standing.you} />
                <b>{standing.name}{standing.you ? ' · você' : ''}</b>
                <span class="st-record">{standing.wins}-{standing.losses}</span>
                <span class="st-status">{standing.status === 'eliminated' ? 'Eliminado' : standing.status === 'champion' ? 'Campeão' : 'Classificado'}</span>
              </li>
            {/each}
          </ol>
        {/if}
        {#if sheetEntry.result?.bracket?.length}
          {@const bracket = sheetEntry.result.bracket}
          <div class="bracket" aria-label="Mata-mata do campeonato">
            {#each BRACKET_PHASES as column (column.phase)}
              <div class="bracket-col">
                <p class="label">{column.label}</p>
                <div class="bracket-games">
                {#each bracket.filter((line) => line.phase === column.phase) as line, lineIndex (`${column.phase}-${lineIndex}`)}
                  <div class="bracket-match" class:mine={Boolean(line.you)}>
                    <span class:won={line.aWon} class:me={line.you === 'a'}><i class="bm-team"><TeamBadge id={orgIdByName(line.a)} orgId={orgIdByName(line.a)} name={line.a} size="sm" /><em>{line.a}</em></i><b>{line.scoreA}</b></span>
                    <span class:won={!line.aWon} class:me={line.you === 'b'}><i class="bm-team"><TeamBadge id={orgIdByName(line.b)} orgId={orgIdByName(line.b)} name={line.b} size="sm" /><em>{line.b}</em></i><b>{line.scoreB}</b></span>
                  </div>
                {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
        <div class="field">
          {#if sheetEntry.format === 'major' && !sheetStage}<p class="invites">Seu time ainda não tem ranking para o Major: com a temporada atual, ficaria de fora.</p>{/if}
          {#each sheetTeams as group, groupIndex (group.label)}
            <p class="label">{group.label} · {group.teams.length} times</p>
            <ul class="team-grid">
              {#each group.teams as team, rank (team.orgId)}
                {@const info = teamInfo(team.orgId)}
                <li>
                  <button class="team-tile" class:mine={team.isUser} class:rival={career.rival?.orgId === team.orgId} on:click={() => openOpponent(team.orgId)} title={team.isUser ? 'Ver o seu time' : `Ver o elenco da ${team.name}`}>
                    <TeamBadge id={team.orgId} name={team.name} size="md" highlight={team.isUser} />
                    <span class="tt-main">
                      <b class="tt-name">{team.name}</b>
                      <span class="tt-meta">{teamTierLabel(team.level)}{#if info} · {LANGUAGE_LABEL[info.language]}{info.map ? ` · ${info.map}` : ''}{/if}</span>
                      <span class="tt-tags">
                        {#if team.isUser}<span class="tag me">Você</span>{/if}
                        {#if rank === 0 && !team.isUser}<span class="tag" class:fav={groupIndex === 0} class:dog={groupIndex > 0}>{groupIndex === 0 ? 'Favorito' : 'Underdog'}</span>{/if}
                        {#if career.rival?.orgId === team.orgId}<span class="tag rival-tag">Rival</span>{/if}
                      </span>
                    </span>
                    <b class="tt-ovr">{team.overall}</b>
                    <span class="tt-bar" aria-hidden="true"><i style={`width:${Math.max(8, Math.min(100, Math.round(((team.overall - 50) / 45) * 100)))}%`}></i></span>
                  </button>
                </li>
              {/each}
            </ul>
          {/each}
        </div>
        {/if}
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
          <span class="eyebrow" id="opp-title">{viewingOwn ? 'Seu time' : 'Adversário'} · {opponentOrg.name}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeOpponent}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div class="opp-head">
          <TeamBadge id={opponentOrg.id} name={opponentOrg.name} size="lg" highlight={viewingOwn} />
          <dl class="opp-facts">
            {#if oppRank}<div><dt>Ranking</dt><dd>#{oppRank}{#if oppDelta > 0} <span class="rank-move up" title="Subiu {oppDelta} no último mês com resultado">▲{oppDelta}</span>{:else if oppDelta < 0} <span class="rank-move down" title="Caiu {-oppDelta} no último mês com resultado">▼{-oppDelta}</span>{/if}</dd></div>{/if}
            <div title={teamTierAbout(oppLevel)}><dt>Tier</dt><dd>{teamTierTitle(oppLevel)}</dd></div>
            {#if oppAverage}<div><dt>Média</dt><dd>{oppAverage}</dd></div>{/if}
            <div><dt>Região</dt><dd>{REGION_LABEL[opponentOrg.region ?? 'eu'] ?? '—'}</dd></div>
            <div><dt>Call</dt><dd>{LANGUAGE_LABEL[oppLanguage]}</dd></div>
            {#if oppCoach}<div title={oppCoach.real ? 'Coach real; idade estimada pelo primeiro ano como coach.' : oppCoach.formerPlayer ? 'Ex-jogador que virou coach.' : 'Coach do mundo da carreira.'}><dt>Coach</dt><dd>{oppCoach.name} · {career.year - oppCoach.born}</dd></div>{/if}
          </dl>
        </div>
        <p class="opp-tier-about"><b>{teamTierTitle(oppLevel)}</b> {teamTierAbout(oppLevel)}</p>
        <div class="opp-maps" aria-label="Os 3 mapas mais fortes do time">
          {#each oppMaps.slice(0, 3) as map, mapIndex (map.mapId)}
            <span class="opp-map" class:best={mapIndex === 0} style={`--map: url(/maps/${map.mapId}.webp); --glow: ${Math.max(0, 1 - mapIndex * 0.4)}; opacity: ${1 - mapIndex * 0.12}`}>
              <b>{map.name}</b>
              <span>{map.score}{#if map.affinity !== 'EVEN'} · {map.affinity}{/if}</span>
            </span>
          {/each}
        </div>
        <p class="opp-maps-note">{#if oppMaps.length}Costuma banir <b>{oppMaps.at(-1)?.name}</b>.{/if}{#if !viewingOwn && myMaps.length} O seu melhor: <b>{myMaps[0].name} ({myMaps[0].score})</b>.{/if}</p>
        <div class="opp-strip">
          {#each opponentRoster as player (player.id)}
            <CareerCard {player} me={player.id === `${career.seed}:me`} roleLabel={ROLE_SHORT[player.role as PlayerRole] ?? ''} profile={oppCardInfo?.(player) ?? null} honors={honorsFor(honorIndex, player.nickname)} caption={oppCardInfo ? '' : player.id === `${career.seed}:me` ? `Você · ${opponentOrg.name}` : opponentOrg.name} />
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if evoOpen && career}
    {@const phase = agePhase(career.age)}
    {@const stages = [{ label: 'Em formação', ages: 'até 21' }, { label: 'Auge', ages: '22 a 26' }, { label: 'Experiente', ages: '27 a 30' }, { label: 'Veterano', ages: '31 a 33' }, { label: 'Fim de carreira', ages: '34+' }]}
    {@const look = trainingOutlook(career)}
    <div class="modal-backdrop" role="presentation" on:click|self={() => (evoOpen = false)}>
      <div class="modal evo-modal" role="dialog" aria-modal="true" aria-labelledby="evo-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="evo-title">Evolução · {career.age} anos · overall {career.overall}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={() => (evoOpen = false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <ol class="evo-stages" aria-label="Fases da carreira">
          {#each stages as stage (stage.label)}
            <li class:here={stage.label === phase.label}><b>{stage.label}</b><span>{stage.ages}</span></li>
          {/each}
        </ol>
        <p class="evo-phase"><b>{phase.label}.</b> {phase.detail}</p>
        <div class="evo-growth" class:stopped={look.stage === 'maximo' || look.stage === 'segura'}>
          {#if look.stage === 'sobe'}
            <b>Ainda cresce com treino.</b> A cada {look.need} semanas de treino, +1 de overall: falta{look.left > 1 ? 'm' : ''} {look.left} {look.left === 1 ? 'treino' : 'treinos'}.
          {:else if look.stage === 'fura'}
            <b>Você chegou no teto. O treino fura.</b> A cada {look.need} semanas, +1 acima dele: falta{look.left > 1 ? 'm' : ''} {look.left}. Sem lesão até o fim da temporada, vira teto novo.
          {:else if look.stage === 'espera'}
            <b>O treino já furou o teto nesta temporada.</b> Sem lesão, isso vira teto novo no fim dela. Depois dá para furar de novo.
          {:else if look.stage === 'maximo'}
            <b>Teto conquistado no máximo (+{CEILING_BONUS_CAP}).</b> O treino agora mexe nas habilidades (até +{TRAIN_CAP} em cada) e devolve o que a temporada tirar.
          {:else}
            <b>Depois dos 34 o treino não passa do teto.</b> Ele devolve o que a idade tira, a cada {look.need} semanas.
          {/if}
          {#if look.bonus && look.stage !== 'maximo'} Teto conquistado: +{look.bonus} de {CEILING_BONUS_CAP}.{/if}
        </div>
        <p class="label">Treino nas habilidades (teto +{TRAIN_CAP})</p>
        {#if evolving.length}
          <ul class="evo-skills">
            {#each evolving as item (item.label)}
              <li class:neg={item.bonus < 0} class:full={item.bonus >= TRAIN_CAP}><span>{item.label}</span><i style={`--v:${Math.max(0, Math.min(100, (item.bonus / TRAIN_CAP) * 100))}%`}></i><b>{item.bonus > 0 ? '+' : '−'}{Math.abs(item.bonus)}{item.bonus >= TRAIN_CAP ? ' · no teto' : ''}</b></li>
            {/each}
          </ul>
        {:else}
          <p class="modal-note">Nada em treino ainda. O treino livre da semana escolhe até 4 habilidades.</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if promoteOpen && career && benchReserve}
    <div class="modal-backdrop" role="presentation" on:click|self={() => (promoteOpen = false)}>
      <div class="modal promote-modal" role="dialog" aria-modal="true" aria-labelledby="promote-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="promote-title">Banco · {benchReserve.nick} ({ROLE_SHORT[benchReserve.role]} · {benchReserve.overall} · {career.year - benchReserve.born} anos{benchReserve.potential > benchReserve.overall && career.year - benchReserve.born < 24 ? ' · ainda cresce' : ''}) entra no lugar de</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={() => (promoteOpen = false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <ul class="promote-list">
          {#each squadMates as mate (mate.player.id)}
            <li>
              <button class="promote-pick" on:click={() => benchMate(mate.player.id)}>
                <b>{mate.player.nickname}</b>
                <span>{ROLE_SHORT[mate.player.role as PlayerRole] ?? mate.player.role} · {mate.player.overall} · relação {mate.relationship}</span>
              </button>
            </li>
          {/each}
        </ul>
        <button class="secondary-btn small promote-talk" on:click={chatReserve}>Conversar com {benchReserve.nick}</button>
        <p class="modal-note">Quem sai vai para o banco e não gosta (relação −12). Se o reserva for claramente melhor, o resto do elenco entende. O reserva joga na função da vaga; fora da função dele, rende 2 a menos.</p>
      </div>
    </div>
  {/if}

  {#if scoutOpen && career}
    <div class="modal-backdrop" role="presentation" on:click|self={closeScout}>
      <div class="modal scout-modal" role="dialog" aria-modal="true" aria-labelledby="scout-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="scout-title">Buscar jogador ou time · {career.year}</span>
          <button class="icon-btn" aria-label="Fechar" on:click={closeScout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <label class="scout-field">
          <span class="label">Nick ou nome do time</span>
          <input type="search" bind:value={scoutQuery} placeholder="ZywOo, FalleN, Vitality, FURIA" autocomplete="off" spellcheck="false" data-autofocus />
        </label>
        {#if scoutTeams.length}
          <ul class="scout-teams" aria-label="Times">
            {#each scoutTeams as org (org.id)}
              <li><button on:click={() => scoutTeam(org.id)}><TeamBadge id={org.id} name={org.name} size="sm" highlight={org.id === career.orgId} /><b>{org.name}</b><span>{teamTierLabel(currentLevelOf(career, org.id))}</span></button></li>
            {/each}
          </ul>
        {/if}
        {#if scoutQuery.trim().length < 2}
          <p class="modal-note">Digite 2 letras ou mais. A busca cobre o mundo inteiro da carreira: times, titulares, reservas e aposentados.</p>
        {:else if !scoutHits.length && !scoutTeams.length}
          <p class="modal-note">Nenhum jogador ou time com "{scoutQuery.trim()}" no mundo de {career.year}.</p>
        {:else}
          <ul class="scout-list">
            {#each scoutHits as hit (hit.nick + (hit.orgId ?? hit.orgName ?? ''))}
              <li class="scout-hit status-{hit.status}">
                <div class="scout-top">
                  {#if hit.orgId && sceneOrgById.has(hit.orgId)}<TeamBadge id={hit.orgId} name={hit.orgName ?? ''} size="md" highlight={hit.status === 'voce'} />{/if}
                  <div class="scout-who">
                    <b>{hit.nick}</b>
                    <span>
                      {#if hit.flag}<img class="scout-flag" src={`/flags/${hit.flag}.svg`} alt="" width="16" height="12" on:error={hideBroken} />{/if}
                      {[hit.spoken, hit.age !== null ? `${hit.age} anos` : null, hit.role ? ROLE_META[hit.role as PlayerRole]?.label ?? hit.role : null].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <CareerHonors honors={honorsFor(honorIndex, hit.nick)} />
                  {#if hit.overall}<span class="scout-ovr" title="Overall nesta temporada">{hit.overall}</span>{/if}
                </div>
                <p class="scout-note"><span class="scout-status">{SCOUT_STATUS[hit.status]}</span>{hit.note}</p>
                {#if hit.history.length}
                  <ol class="scout-history" aria-label={`Caminho de ${hit.nick}`}>
                    {#each hit.history as line}<li><span>{line.year}</span>{line.text}</li>{/each}
                  </ol>
                {/if}
                {#if hit.orgId && hit.status !== 'voce' && sceneOrgById.has(hit.orgId)}
                  <button class="link-btn scout-team" on:click={() => scoutTeam(hit.orgId)}>Ver o elenco da {hit.orgName}</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}

  {#if overviewOpen && live?.run.tournament && career}
    <div class="modal-backdrop" role="presentation" on:click|self={() => (overviewOpen = false)}>
      <div class="modal wide overview-modal" role="dialog" aria-modal="true" aria-labelledby="overview-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="overview-title">{career.calendar?.[liveIndex]?.name}{liveStageNow ? ` · agora no ${STAGE_NAME[liveStageNow]}` : ''} · visão geral</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={() => (overviewOpen = false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <MajorOverview tournament={live.run.tournament} cursor={{ liveSeriesId: liveUserSeries?.config.id ?? null }} userTeamId={live.userTeamId} userTeamName={orgOf(career.orgId).name} language="pt-BR" />
        {#if liveAwards}
          <div class="overview-awards">
            <p class="label">Os melhores até agora · pelo kill feed de tudo o que já foi jogado</p>
            <MajorAwardsPanel awards={liveAwards} language="pt-BR" userTeamId={live.userTeamId} userTeamName={orgOf(career.orgId).name} />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if roleSheetOpen && career}
    <div class="modal-backdrop" role="presentation" on:click|self={() => (roleSheetOpen = false)}>
      <div class="modal role-sheet" role="dialog" aria-modal="true" aria-labelledby="role-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="role-title">Trocar de função · hoje você é {ROLE_META[career.role].label}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={() => (roleSheetOpen = false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <p class="happening-odds">O parceiro da função nova assume a sua antiga. Deu certo: +1 de overall. Deu errado: −2 até o fim da temporada. Uma vez por temporada.</p>
        <div class="happening-choices">
          {#each ROLE_CHOICES.filter((role) => role !== career?.role) as role (role)}
            <button class="happening-choice" on:click={() => pickRole(role)}><span>{ROLE_META[role].label}</span><small>Chance de encaixar: {roleChance(career, role)}%</small></button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if worldOpen && career}
    <div class="modal-backdrop" role="presentation" on:click|self={closeWorld}>
      <div class="modal wide world-modal" role="dialog" aria-modal="true" aria-labelledby="world-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="world-title">Mundo · {career.year}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeWorld}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <CareerWorld state={career} onTeam={worldTeam} />
      </div>
    </div>
  {/if}

  {#if trophiesOpen && career}
    <div class="modal-backdrop" role="presentation" on:click|self={closeTrophies}>
      <div class="modal wide trophy-room" role="dialog" aria-modal="true" aria-labelledby="trophy-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="trophy-title">Sala de troféus · {career.nick}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeTrophies}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div class="room-tabs" role="tablist" aria-label="Seções da sala de troféus">
          {#each ROOM_TABS as tab (tab.key)}
            <button role="tab" aria-selected={roomTab === tab.key} class:on={roomTab === tab.key} on:click={() => (roomTab = tab.key)}>{tab.label}</button>
          {/each}
        </div>

        {#if roomTab === 'titulos'}
          <dl class="trophy-tiers">
            {#each TROPHY_TIERS as tier (tier)}
              <div class:has={trophies.byTier[tier] > 0} class:major={tier === 'Major'}><dt>{tier === 'Major' ? 'Majors' : `Títulos ${TIER_LABEL[tier]}`}</dt><dd>{trophies.byTier[tier]}</dd></div>
            {/each}
            <div class:has={trophies.majorMvps > 0} class:major={trophies.majorMvps > 0}><dt>MVP de Major</dt><dd>{trophies.majorMvps}</dd></div>
            <div class:has={trophies.mvps - trophies.majorMvps > 0}><dt>MVP de evento</dt><dd>{trophies.mvps - trophies.majorMvps}</dd></div>
          </dl>
          {#if moments.length}
            <ol class="moments">
              {#each moments as moment (moment.key)}
                {@const isMajor = moment.tier === 'Major'}
                <li class:title={moment.placement === 'Campeão'} class:major-row={isMajor && (moment.placement === 'Campeão' || moment.mvp)}>
                  <span class="moment-year">{moment.year}</span>
                  <span class="moment-name">{moment.name}{#if moment.tier && !isMajor}<small>{TIER_LABEL[moment.tier]}</small>{/if}</span>
                  <span class="moment-tags">
                    {#if moment.placement === 'Campeão'}<span class="award" class:award-major={isMajor}>{isMajor ? 'Campeão do Major' : 'Campeão'}</span>{/if}
                    {#if moment.mvp}<span class="award mvp" class:award-major={isMajor}>{isMajor ? 'MVP do Major' : 'MVP'}</span>{/if}
                    {#if moment.aces}<span class="tag">{moment.aces} ace{moment.aces > 1 ? 's' : ''}</span>{/if}
                  </span>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="muted-line">Nenhum título ainda. Título, MVP de evento e ace entram aqui.</p>
          {/if}

        {:else if roomTab === 'premios'}
          <dl class="trophy-tiers">
            <div class:has={trophies.hltvBest !== null} class:major={trophies.hltvBest === 1}><dt>Melhor HLTV</dt><dd>{trophies.hltvBest ? `#${trophies.hltvBest}` : '—'}</dd></div>
            <div class:has={trophies.hltvTop1 > 0} class:major={trophies.hltvTop1 > 0}><dt>Top 1 do mundo</dt><dd>{trophies.hltvTop1}</dd></div>
            <div class:has={trophies.hltvTop20 > 0}><dt>Anos no Top 20</dt><dd>{trophies.hltvTop20}</dd></div>
            <div class:has={trophies.rookie} class:major={trophies.rookie}><dt>Rookie of the Year</dt><dd>{trophies.rookie ? 'Sim' : 'Não'}</dd></div>
            <div class:has={trophies.majorMvps > 0} class:major={trophies.majorMvps > 0}><dt>MVP de Major</dt><dd>{trophies.majorMvps}</dd></div>
          </dl>
          {#if career.history.length}
            <div class="season-table" role="table" aria-label="Temporada a temporada">
              <div class="st-row st-head" role="row">
                <span role="columnheader">Ano</span><span role="columnheader">Time</span><span role="columnheader">Rating</span><span role="columnheader">HLTV</span><span role="columnheader">Títulos</span><span role="columnheader">MVPs</span><span role="columnheader">Destaque</span>
              </div>
              {#each [...career.history].reverse() as log (log.seasonNumber)}
                {@const majorTitles = log.tournaments.filter((result) => result.placement === 'Campeão' && result.tier === 'Major').length}
                {@const mvpAll = log.tournaments.filter((result) => result.mvp?.you).length}
                {@const mvpMajor = log.tournaments.filter((result) => result.mvp?.you && result.tier === 'Major').length}
                <div class="st-row" role="row" class:st-gold={log.hltvRank === 1 || majorTitles > 0}>
                  <span class="st-year" role="cell">{log.year}</span>
                  <span class="st-team" role="cell"><TeamBadge id={log.orgId} name={log.orgName} size="sm" /><b>{log.orgName}</b></span>
                  <span class="st-rating" role="cell" class:hot={log.seasonRating >= 1.2} class:good={log.seasonRating >= 1.08 && log.seasonRating < 1.2} class:low={log.seasonRating < 0.98}>{log.seasonRating.toFixed(2)}</span>
                  <span class="st-hltv" role="cell">{#if log.hltvRank}<span class="st-rank" class:top1={log.hltvRank === 1} class:top20={log.hltvRank > 1 && log.hltvRank <= 20}>#{log.hltvRank}</span>{:else}<span class="st-dim">fora</span>{/if}</span>
                  <span class="st-num" role="cell"><span class="st-cap">Títulos</span>{#if log.titles}<b>{log.titles}</b>{#if majorTitles}<span class="award award-major small">{majorTitles} Major</span>{/if}{:else}<span class="st-dim">0</span>{/if}</span>
                  <span class="st-num" role="cell"><span class="st-cap">MVPs</span>{#if mvpAll}<b>{mvpAll}</b>{#if mvpMajor}<span class="award award-major small">{mvpMajor} de Major</span>{/if}{:else}<span class="st-dim">0</span>{/if}</span>
                  <span class="st-badges" role="cell">
                    {#if log.hltvRank === 1}<span class="award award-major small">Melhor do mundo</span>{/if}
                    {#if log.rookie?.you}<span class="award small">Rookie of the Year</span>{/if}
                    {#if log.hltvRank !== 1 && !log.rookie?.you}<span class="st-dim">·</span>{/if}
                  </span>
                </div>
              {/each}
            </div>
            {@const lastLog2 = career.history.at(-1)}
            {#if lastLog2?.hltvTop?.length}
              <CareerHltvTop year={lastLog2.year} top={lastLog2.hltvTop} rookie={lastLog2.rookie ?? null} myRank={lastLog2.hltvRank ?? null} myRating={lastLog2.seasonRating} compact={true} />
            {/if}
          {:else}
            <p class="muted-line">O Top 20 HLTV e o Rookie of the Year saem no fim de cada temporada. Rookie só vale no ano da sua estreia em Major.</p>
          {/if}

        {:else if roomTab === 'historia'}
          {#if lifeLog}
            <dl class="trophy-tiers">
              <div class:has={lifeLog.decisions.length > 0}><dt>Decisões</dt><dd>{lifeLog.decisions.length}</dd></div>
              <div class:has={lifeLog.talks.length > 0}><dt>Conversas</dt><dd>{lifeLog.talks.length}</dd></div>
              <div class:has={lifeLog.grudges.length > 0} class:major={lifeLog.grudges.length > 0}><dt>Atravessados</dt><dd>{lifeLog.grudges.length}</dd></div>
            </dl>
            {#if lifeLog.marks.length || lifeLog.grudges.length}
              <p class="log-marks">{#if lifeLog.marks.length}<b>Marcas que voltam:</b> {lifeLog.marks.join(' · ')}.{/if}{#if lifeLog.grudges.length} <b>Atravessado com você:</b> {lifeLog.grudges.join(', ')}.{/if}</p>
            {/if}
            <div class="log-cols">
              <section aria-label="Decisões fora do servidor">
                <p class="label">Acontecimentos e dilemas</p>
                {#if lifeLog.decisions.length}
                  <ol class="log-list">
                    {#each lifeLog.decisions as row (row.key)}
                      <li>
                        <span class="log-when">{row.when}</span>
                        <span class="log-body"><span class="log-head"><b>{row.title}</b>{#if row.severity}<i class="sev sev-{row.severity}">{row.severity === 'critico' ? 'Crítico' : 'Grave'}</i>{/if}</span>{#if row.choice}<small>{row.kind === 'Dilema' ? 'Dilema' : 'Você'}: {row.choice}{row.success === true ? ' · saiu como queria' : row.success === false ? ' · não saiu como queria' : ''}</small>{/if}</span>
                      </li>
                    {/each}
                  </ol>
                {:else}
                  <p class="muted-line">Acontecimentos e dilemas aparecem aqui com a sua escolha.</p>
                {/if}
              </section>
              <section aria-label="Conversas">
                <p class="label">Conversas (últimas 30)</p>
                {#if lifeLog.talks.length}
                  <ol class="log-list">
                    {#each lifeLog.talks as row (row.key)}
                      <li>
                        <span class="log-when">{row.when}</span>
                        <span class="log-body"><span class="log-head"><b>{row.who}</b> · {row.situation}</span><small>Você: {row.answer}{row.delta ? ` · relação ${row.delta > 0 ? '+' : '−'}${Math.abs(row.delta)}` : ''}</small></span>
                      </li>
                    {/each}
                  </ol>
                {:else}
                  <p class="muted-line">Converse com titulares, reserva e coach: o que você responde fica guardado.</p>
                {/if}
              </section>
            </div>
          {/if}

        {:else}
          <dl class="trophy-tiers">
            <div class:has={trophies.aces > 0} class:major={trophies.aces > 0}><dt>Aces</dt><dd>{trophies.aces}</dd></div>
            <div class:has={trophies.clutches > 0}><dt>Clutches</dt><dd>{trophies.clutches}</dd></div>
            <div class:has={playReel.length > 0}><dt>Guardadas</dt><dd>{playReel.length}</dd></div>
          </dl>
          {#if playReel.length}
            <ol class="play-reel">
              {#each playReel as play, playIndex (playIndex)}
                <li>
                  <span class="tag" class:gold={play.kind === 'ace'} class:major={play.kind === 'clutch' && (play.against ?? 1) >= 3}>{PLAY_LABEL(play)}</span>
                  <span class="pr-where"><b>{play.map}</b> · round {play.round} · vs {play.opponent}</span>
                  <span class="pr-event">{play.event}</span>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="muted-line">Ace, quad e clutch seus aparecem aqui com mapa, round, adversário e campeonato.</p>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if statsOpen && lastEventReport}
    <div class="modal-backdrop" role="presentation" on:click|self={closeStats}>
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="stats-title" use:focusInside>
        <header class="modal-head">
          <span class="eyebrow" id="stats-title">{eventName(lastEventReport.name)} · {lastEventReport.placement}</span>
          <button class="icon-btn" aria-label="Fechar" data-autofocus on:click={closeStats}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div class="event-report">
          <CareerEventReport stats={lastEventReport.stats} players={lastEventReport.players} meId={`${career?.seed ?? ''}:me`} roleLabel={(role) => ROLE_META[role as PlayerRole]?.label ?? role} />
        </div>
      </div>
    </div>
  {/if}

  {#if career && !live && !career.pendingHappening && !happeningResult && (career.pendingRival || rivalResult)}
    <div class="modal-backdrop" role="presentation">
      <div class="modal wide happening rival" role="alertdialog" aria-modal="true" aria-labelledby="rival-title" use:focusInside>
        {#if rivalResult}
          <span class="eyebrow">Provocação · sua resposta</span>
          <h2 class="display" id="rival-title">{rivalResult.title}</h2>
          <p class="happening-line">{rivalResult.line}</p>
          <button class="cta" data-autofocus on:click={closeRival}>{queuedStart ? 'Ir para o campeonato' : 'Continuar'}</button>
        {:else if career.pendingRival}
          <span class="eyebrow">Provocação · antes do {career.calendar?.[career.pendingRival.eventIndex]?.name ?? 'campeonato'}</span>
          <h2 class="display" id="rival-title">{career.pendingRival.nick} ({career.pendingRival.role} da {career.pendingRival.orgName}) falou de você</h2>
          <blockquote class="rival-quote">{career.pendingRival.line}</blockquote>
          <div class="happening-choices">
            {#each RIVAL_CHOICES as choice, choiceIndex (choice.key)}
              <button class="happening-choice" data-autofocus={choiceIndex === 0 ? '' : undefined} on:click={() => chooseRival(choice.key)}><span>{choice.text}</span><small>{choice.hint}</small></button>
            {/each}
          </div>
          <p class="happening-odds">Se a {career.pendingRival.orgName} cruzar o seu caminho neste campeonato, o confronto vale moral e fãs.</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if career && !live && (career.pendingTalk || talkResult) && !career.pendingHappening && !happeningResult && !career.pendingRival && !rivalResult && !career.pendingMove}
    {@const talk = career.pendingTalk}
    <div class="modal-backdrop" role="presentation">
      <div class="modal wide happening talk" role="alertdialog" aria-modal="true" aria-labelledby="talk-title" use:focusInside>
        {#if talkResult}
          <span class="eyebrow">{MOMENT_LABEL[talkResult.moment]}{talkResult.moment === 'season' ? '' : ` · ${talkResult.situation}`}</span>
          <h2 class="display" id="talk-title">{talkResult.who}</h2>
          <p class="happening-line" class:bad={!talkResult.good}>{talkResult.line}</p>
          {#if talkResult.tip}<p class="talk-tip"><b>Dica:</b> {talkResult.tip}</p>{/if}
          {#if talkResult.chips.length}
            <ul class="happening-chips">
              {#each talkResult.chips as chip (chip.label)}
                <li class:up={chip.label === 'Cansaço' || chip.label === 'Pressão' ? chip.value < 0 : chip.value > 0} class:down={chip.label === 'Cansaço' || chip.label === 'Pressão' ? chip.value > 0 : chip.value < 0}>{chip.label} {chip.value > 0 ? '+' : '−'}{Math.abs(chip.value)}</li>
              {/each}
            </ul>
          {/if}
          <button class="cta" data-autofocus on:click={closeTalk}>{queuedStart && career.calendar?.[queuedStart.index]?.status === 'UPCOMING' ? 'Ir para o campeonato' : 'Continuar'}</button>
        {:else if talk}
          <span class="eyebrow">{MOMENT_LABEL[talk.moment]}{talk.moment === 'season' ? '' : ` · ${SITUATION_LABEL[talk.situation]}`}</span>
          <h2 class="display" id="talk-title">{talk.speaker.name}<small class="talk-who">{talk.speaker.kind === 'coach' ? 'coach' : `${talk.speaker.kind === 'reserve' ? 'reserva · ' : ''}${ROLE_SHORT[talk.speaker.role as PlayerRole] ?? ''}`}</small></h2>
          <p class="talk-quote">“{talk.line}”</p>
          <div class="happening-choices">
            {#each talk.options as option, optionIndex (option.key)}
              <button class="happening-choice" data-autofocus={optionIndex === 0 ? '' : undefined} on:click={() => answerPendingTalk(option.key)}>{option.text}</button>
            {/each}
          </div>
          <button class="link-btn talk-skip" on:click={closeTalk}>Deixar para depois</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if career && !live && (career.pendingDilemma || dilemmaResult) && !career.pendingHappening && !happeningResult && !career.pendingTalk && !talkResult && !career.pendingMove}
    {@const dilemma = career.pendingDilemma ? DILEMMA_BY_ID.get(career.pendingDilemma.id) : null}
    <div class="modal-backdrop" role="presentation">
      <div class="modal wide happening" role="alertdialog" aria-modal="true" aria-labelledby="dilemma-title" use:focusInside>
        {#if dilemmaResult}
          <span class="eyebrow">Dilema da semana</span>
          <h2 class="display" id="dilemma-title">{dilemmaResult.title}</h2>
          <p class="happening-line">{dilemmaResult.line}</p>
          {#if dilemmaResult.chips.length}
            <ul class="happening-chips">
              {#each dilemmaResult.chips as chip (chip.label)}
                <li class:up={chip.kind === 'fatigue' || chip.label === 'Saudade' ? chip.value < 0 : chip.value > 0} class:down={chip.kind === 'fatigue' || chip.label === 'Saudade' ? chip.value > 0 : chip.value < 0}>{chipText(chip)}</li>
              {/each}
            </ul>
          {/if}
          <button class="cta" data-autofocus on:click={closeDilemma}>Continuar</button>
        {:else if dilemma}
          <span class="eyebrow">Dilema da semana · uma escolha, sem volta</span>
          <h2 class="display" id="dilemma-title">{dilemma.title}</h2>
          <div class="happening-choices">
            {#each dilemma.options as option, optionIndex (option.key)}
              <button class="happening-choice" data-autofocus={optionIndex === 0 ? '' : undefined} on:click={() => chooseDilemma(option.key)}>{option.text}</button>
            {/each}
          </div>
          <p class="happening-odds">Cada caminho tem um custo. O efeito depende do seu momento (saudade, corpo, cansaço).</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if career && !live && (career.pendingHappening || happeningResult)}
    {@const pendingEvent = career.pendingHappening ? HAPPENING_BY_ID.get(career.pendingHappening.id) : null}
    <div class="modal-backdrop" role="presentation">
      <div class="modal wide happening" role="alertdialog" aria-modal="true" aria-labelledby="happening-title" use:focusInside>
        {#if happeningResult}
          <span class="eyebrow">{happeningResult.trigger} · {happeningResult.success ? 'deu certo' : 'deu errado'}</span>
          <h2 class="display" id="happening-title">{happeningResult.situation}</h2>
          <p class="happening-line" class:bad={!happeningResult.success}>{happeningResult.line}</p>
          {#if happeningResult.chips.length}
            <ul class="happening-chips">
              {#each happeningResult.chips as chip (chip.label)}
                <li class:up={chip.value > 0} class:down={chip.value < 0}>{chip.display ?? `${chip.label} ${chip.value > 0 ? '+' : '−'}${Math.abs(chip.value)}`}</li>
              {/each}
            </ul>
          {/if}
          <button class="cta" data-autofocus on:click={closeHappening}>{queuedStart && career?.calendar?.[queuedStart.index]?.status === 'UPCOMING' && !career?.pendingMove ? ((career?.benchedEvents ?? 0) > 0 ? 'Ver o time jogar sem você' : 'Ir para o campeonato') : 'Continuar'}</button>
        {:else if pendingEvent && career.pendingHappening}
          <span class="eyebrow">Acontecimento · {TRIGGER_LABEL[career.pendingHappening.trigger]} · {pendingEvent.phase}{#if pendingEvent.severity === 'grave' || pendingEvent.severity === 'critico'}<b class="sev sev-{pendingEvent.severity}">{SEVERITY_LABEL[pendingEvent.severity]}</b>{/if}</span>
          <h2 class="display" id="happening-title">{pendingEvent.situation}</h2>
          <div class="happening-choices">
            {#each pendingEvent.choices as choice, choiceIndex (choiceIndex)}
              <button class="happening-choice" data-autofocus={choiceIndex === 0 ? '' : undefined} on:click={() => chooseHappening(choiceIndex)}>{choice.text}</button>
            {/each}
          </div>
          <p class="happening-odds">Chance de sair como você quer: <b>{Math.round(happeningSuccessChance(career) * 100)}%</b> (seu Mental e sua moral).</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if career?.pendingMove && !live}
    {@const move = career.pendingMove}
    <div class="modal-backdrop" role="presentation">
      <div class="modal wide move-sheet" class:cut={move.kind === 'cut'} role="alertdialog" aria-modal="true" aria-labelledby="move-title" aria-describedby="move-reason" use:focusInside>
        <p class="eyebrow">{move.kind === 'cut' ? 'Mercado · corte' : move.kind === 'request' ? 'Mercado · você pediu para sair' : 'Mercado · proposta no meio da temporada'}</p>
        <h2 class="display" id="move-title">{move.kind === 'cut' ? `O ${orgOf(career.orgId).name} te cortou` : move.kind === 'request' ? (move.offers.length ? 'Quem quer você' : 'Ninguém fez proposta') : `${move.offers[0]?.orgName ?? 'Um time de cima'} quer você agora`}</h2>
        <p class="move-reason" id="move-reason">{move.reason}{move.kind === 'cut' ? ' Escolha para onde ir. A temporada continua no time novo.' : move.offers.length ? ' Se aceitar, você joga o resto da temporada lá.' : ''}</p>
        <div class="offers">
          {#each move.offers as offer}
            {@const target = orgIn(career.seed, career.seasonNumber, offer.orgId)}
            {@const seat = target ? seatToTake(target, career.role) : null}
            <button class="offer" data-autofocus on:click={() => takeMove(offer.orgId)}>
              <span class="label" class:up={offer.orgLevel < currentLevel}>{offer.orgLevel < currentLevel ? `Sobe para ${teamTierTitle(offer.orgLevel)}` : offer.orgLevel === currentLevel ? 'Mesmo nível' : `Desce para ${teamTierTitle(offer.orgLevel)}`}</span>
              <b class="display">{offer.orgName}</b>
              <span class="ln">Vaga de <b>{seat?.nick ?? 'a definir'}</b></span>
                  {#if target}{@const offerLanguage = orgLanguage(target)}{@const offerFluency = myFluency(career, offerLanguage)}<span class="ln">Call em <b class:warn-text={languagePenalty(offerFluency) > 0}>{LANGUAGE_LABEL[offerLanguage]}</b> · você {fluencyLabel(offerFluency)}</span>{/if}
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
              <span class="label">{move.kind === 'request' ? 'Desistir' : 'Recusar'}</span>
              <b class="display">Ficar no {orgOf(career.orgId).name}</b>
              <span class="ln">{move.kind === 'request' ? 'O clima segue pesado por um tempo' : 'O elenco gosta: moral +4'}</span>
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
  .intro h1 { font-size: clamp(48px, 9vw, 96px); margin-bottom: 6px; overflow-wrap: anywhere; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  label { display: grid; gap: 6px; min-width: 0; color: var(--muted); font-size: 13px; }
  input, select { min-width: 0; min-height: 44px; padding: 10px 12px; border-radius: 0; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 500 15px/1.2 var(--body); }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 10px 0 0; }
  .nick-row { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .nick-row input { flex: 1; min-width: 0; }
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
  .facts div { display: grid; gap: 4px; min-width: 0; padding: 6px 7px; border: 1px solid var(--line); background: var(--surface-2); }
  .facts dt { overflow: hidden; color: var(--muted); font: 700 10px/1.2 var(--body); letter-spacing: .02em; text-transform: uppercase; text-overflow: ellipsis; white-space: nowrap; }
  .facts dd { margin: 0; font: 800 22px/1 var(--display); font-variant-numeric: tabular-nums; }
  .facts dd.gold { color: var(--gold); }
  .pyramid { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .pyramid li { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 28px; padding: 6px 12px; border: 1px solid var(--line); color: var(--muted); font: 700 12px/1.2 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .pyramid li.been { color: var(--text); border-color: color-mix(in srgb, var(--muted) 45%, var(--line)); }
  .pyramid li.here { flex-wrap: wrap; min-height: 44px; border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--surface)); color: var(--accent); }
  .rung-org { width: 100%; color: var(--text); font: 800 22px/1 var(--display); letter-spacing: .01em; overflow-wrap: break-word; }
  .rung-mark { font-size: 11px; color: var(--muted); }
  .rung-short { display: none; }
  .tier-guide { margin: 0; color: var(--muted); font: 500 12px/1.4 var(--body); }
  .tier-guide summary { display: flex; align-items: center; min-height: 32px; cursor: pointer; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-size: 11px; }
  .tier-guide dl { display: grid; gap: 6px; margin: 4px 0 0; }
  .tier-guide dl div { display: grid; gap: 2px; padding: 6px 10px; border: 1px solid var(--line); }
  .tier-guide dl div.here { border-color: var(--accent); }
  .tier-guide dt { color: var(--text); font: 700 11px/1.2 var(--body); letter-spacing: .06em; text-transform: uppercase; }
  .tier-guide dl div.here dt { color: var(--accent); }
  .tier-guide dd { margin: 0; overflow-wrap: break-word; }
  .seat-line { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
  .seat-line b { color: var(--text); }
  .auto-off { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); color: var(--accent); }
  .inline-off { min-height: 0; margin-left: 6px; padding: 0; font-size: 11px; }
  .clutch-ctx { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 8px 0 0; color: var(--muted); font-size: 13px; }
  .clutch-ctx b { color: var(--text); font-variant-numeric: tabular-nums; }
  .clutch-ctx .up { color: var(--accent); }
  .clutch-ctx .down { color: var(--accent-2); }
  /* O botão das dicas das calls só existe no celular (no computador a dica fica sempre embaixo de cada call). */
  .hints-btn, .clutch-ctx.hints-only { display: none; }
  .read-line { margin: 0; padding: 8px 10px; border-left: 3px solid var(--muted); background: color-mix(in srgb, var(--surface) 70%, transparent); font-size: 14px; line-height: 1.45; }
  .read-line.read-good { border-left-color: var(--accent); }
  .read-line.read-good b { color: var(--accent); }
  .read-line.read-bad { border-left-color: var(--accent-2); }
  .read-line.read-bad b { color: var(--accent-2); }
  .seat-link { padding: 0; border: 0; background: none; color: var(--text); font: inherit; font-weight: 700; text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 3px; cursor: pointer; }
  .seat-link:hover { color: var(--accent); }
  .scout-modal { width: min(680px, calc(100vw - 32px)); }
  .scout-field { display: grid; gap: 6px; }
  .scout-field input { min-height: 48px; padding: 0 14px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 700 18px/1 var(--body); }
  .scout-field input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .scout-list { display: grid; gap: 8px; max-height: min(62vh, 600px); margin: 0; padding: 0 2px 0 0; overflow-y: auto; list-style: none; }
  .scout-hit { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-left-width: 3px; background: var(--surface-2); }
  .scout-hit.status-titular { border-left-color: var(--accent); }
  .scout-hit.status-reserva { border-left-color: var(--accent-2); }
  .scout-hit.status-coach { border-left-color: var(--gold); }
  .status-coach .scout-status { border-color: color-mix(in srgb, var(--gold) 55%, transparent); color: var(--gold); }
  .scout-hit.status-voce { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); }
  .scout-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .scout-who { display: grid; flex: 1; gap: 4px; min-width: 0; }
  .scout-who b { overflow: hidden; font: 900 26px/1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .scout-who span { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
  .scout-flag { flex: none; width: 16px; height: 12px; object-fit: cover; border: 1px solid color-mix(in srgb, var(--line) 70%, transparent); }
  .scout-ovr { color: var(--accent); font: 900 34px/1 var(--display); font-variant-numeric: tabular-nums; }
  .scout-note { margin: 0; font-size: 14px; line-height: 1.45; }
  .scout-status { display: inline-block; margin-right: 8px; padding: 3px 6px; border: 1px solid var(--line); color: var(--muted); font: 800 10px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; vertical-align: 1px; }
  .status-titular .scout-status, .status-voce .scout-status { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); }
  .status-reserva .scout-status { border-color: color-mix(in srgb, var(--accent-2) 50%, transparent); color: var(--accent-2); }
  .scout-history { display: grid; gap: 4px; margin: 0; padding: 8px 0 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; line-height: 1.4; list-style: none; }
  .scout-history li { display: grid; grid-template-columns: 42px 1fr; gap: 8px; }
  .scout-history span { color: var(--text); font-weight: 800; font-variant-numeric: tabular-nums; }
  .scout-team { justify-self: start; min-height: 32px; padding: 0; }
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
  .arc-line { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; padding: 0; border: 0; background: none; cursor: help; text-align: left; }
  .arc-chip { padding: 3px 7px; border: 1px solid var(--line); color: var(--muted); font: 700 10px/1.2 var(--body); letter-spacing: .06em; text-transform: uppercase; }
  .arc-chip.phase-alta { border-color: var(--accent); color: var(--accent); }
  .arc-chip.phase-baixa, .arc-chip.study { border-color: var(--accent-2); color: var(--accent-2); }
  .arc-help { margin: 6px 0 0; max-width: 46ch; color: var(--muted); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
  .next h2 { font-size: clamp(26px, 2.3vw, 36px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .next .cta { margin-top: 0; min-height: 48px; font-size: 20px; }
  .next-actions .link-btn { min-height: 28px; }
  .report { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; min-width: 0; padding-left: 18px; border-left: 1px solid var(--line); }
  .report .place-badge { font-size: 18px; }
  .report-copy { display: grid; gap: 4px; min-width: 0; }
  .report-copy .label { margin: 0; max-width: 24ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .report-line { font-size: 14px; font-variant-numeric: tabular-nums; }
  .report-line b { color: var(--accent); }
  .report-mvp { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
  .report-mvp.you { color: var(--gold); font-weight: 800; }
  .report-links { display: flex; gap: 10px; margin-left: auto; }
  /* Títulos no trilho: a célula inteira é o botão (área de toque de 44px), com troféu e acento dourado. */
  .facts .trophy-fact { position: relative; min-height: 44px; border-color: color-mix(in srgb, var(--gold) 55%, var(--line)); background: color-mix(in srgb, var(--gold) 7%, var(--surface-2)); transition: border-color .14s ease, background-color .14s ease; }
  .facts .trophy-fact:hover, .facts .trophy-fact:focus-within { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 14%, var(--surface-2)); }
  .fact-rows .facts .trophy-fact dt { color: var(--gold); font-size: 10px; }
  .trophy-btn { all: unset; box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; column-gap: 4px; min-width: 0; cursor: pointer; font: inherit; color: inherit; }
  .trophy-btn::after { content: ''; position: absolute; inset: 0; }
  .facts .trophy-btn:focus-visible { outline: none; }
  .facts .trophy-btn:focus-visible::after { outline: 2px solid var(--gold); outline-offset: -2px; }
  .trophy-ico { flex: none; color: var(--gold); }
  .trophy-fact.gold dd { color: var(--gold); }
  .trophy-btn small { color: var(--muted); font: 700 12px/1 var(--body); }

  /* Mata-mata do evento jogado: três colunas, a sua série marcada. */
  .bracket { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .bracket-col { display: grid; grid-template-rows: auto 1fr; gap: 6px; min-width: 0; }
  .bracket-games { display: flex; flex-direction: column; justify-content: space-around; gap: 8px; }
  .bracket-col .label { margin: 0 0 2px; }
  .bracket-match { display: grid; border: 1px solid var(--line); background: var(--surface-2); }
  .bracket-match.mine { border-color: var(--accent); }
  .bracket-match > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; color: var(--muted); font-size: 13px; }
  .bracket-match > span + span { border-top: 1px solid var(--line); }
  .bracket-match > span.won { color: var(--text); font-weight: 700; }
  .bracket-match > span.me em { color: var(--accent); }
  .bm-team { display: flex; align-items: center; gap: 8px; min-width: 0; font-style: normal; }
  .bracket-match em { overflow: hidden; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
  .bracket-match b { font: 800 15px/1 var(--display); font-variant-numeric: tabular-nums; }

  /* Sala de troféus: contagem por tier e os momentos da carreira. */
  .trophy-tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 6px; margin: 0; }
  .trophy-tiers div { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .trophy-tiers dt { color: var(--muted); font: 700 11px/1.2 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .trophy-tiers dd { margin: 0; color: var(--muted); font: 900 30px/1 var(--display); font-variant-numeric: tabular-nums; }
  .trophy-tiers div.has dd { color: var(--text); }
  .trophy-tiers div.has.major { border-color: var(--gold); }
  .trophy-tiers div.has.major dd { color: var(--gold); }
  .moments { display: grid; gap: 4px; max-height: min(46vh, 420px); margin: 0; padding: 0; overflow-y: auto; list-style: none; }
  .moments li { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--line); border-left: 3px solid transparent; font-size: 14px; }
  .moments li.major-row { border-left-color: var(--gold); background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 12%, transparent), transparent 70%); }
  .moment-year { color: var(--muted); font: 800 16px/1 var(--display); font-variant-numeric: tabular-nums; }
  .moments li.major-row .moment-year { color: var(--gold); }
  .moment-name small { margin-left: 8px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .award { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--line)); color: var(--accent); font: 800 11px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
  .award::before { content: ''; width: 6px; height: 6px; background: currentColor; transform: rotate(45deg); }
  .award.mvp { border-color: var(--line); color: var(--text); }
  .award.award-major { border-color: var(--gold); background: var(--gold); color: #17130a; }
  .award.award-major::before { background: #17130a; }
  .award.small { padding: 3px 6px; font-size: 10px; }
  .season-table { display: grid; margin: 0; border: 1px solid var(--line); background: var(--surface-2); }
  .st-row { display: grid; grid-template-columns: 60px minmax(0, 1.5fr) 64px 64px minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1.3fr); align-items: center; gap: 10px; min-height: 52px; padding: 6px 14px; border-top: 1px solid var(--line); border-left: 3px solid transparent; }
  .st-row.st-head { min-height: 0; padding-top: 10px; padding-bottom: 8px; border-top: 0; color: var(--muted); font: 800 10px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; }
  .st-row.st-gold { border-left-color: var(--gold); background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 9%, transparent), transparent 60%); }
  .st-year { font: 900 24px/1 var(--display); font-variant-numeric: tabular-nums; }
  .st-gold .st-year { color: var(--gold); }
  .st-team { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .st-team b { overflow: hidden; font: 800 15px/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .st-rating { font: 900 20px/1 var(--display); font-variant-numeric: tabular-nums; }
  .st-rating.hot { color: var(--gold); }
  .st-rating.good { color: var(--accent); }
  .st-rating.low { color: var(--muted); }
  .st-rank { display: inline-block; min-width: 40px; padding: 4px 6px; border: 1px solid var(--line); font: 900 16px/1 var(--display); font-variant-numeric: tabular-nums; text-align: center; }
  .st-rank.top20 { border-color: var(--accent); color: var(--accent); }
  .st-rank.top1 { border-color: var(--gold); background: var(--gold); color: #17130a; }
  .st-num { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .st-num b { font: 900 20px/1 var(--display); font-variant-numeric: tabular-nums; }
  .st-badges { display: flex; flex-wrap: wrap; gap: 4px; }
  .st-dim { color: var(--muted); }
  .st-cap { display: none; }
  @media (max-width: 760px) {
    .st-head { display: none !important; }
    .st-row { grid-template-columns: 52px minmax(0, 1fr) auto auto; row-gap: 6px; }
    .st-num, .st-badges { grid-column: 2 / -1; }
    .st-cap { display: inline; color: var(--muted); font: 800 10px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  }
  .moments li.title .moment-name { font-weight: 700; }
  .moment-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .moment-tags { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
  .tag.gold { border-color: var(--gold); color: var(--gold); }
  .tag.major { border-color: var(--gold); color: var(--text); }
  .muted-line { margin: 0; color: var(--muted); font-size: 14px; }
  .trophy-room { display: grid; gap: 12px; }
  .room-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--line); }
  .room-tabs button { all: unset; cursor: pointer; padding: 8px 12px; color: var(--muted); font: 800 12px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; border-bottom: 2px solid transparent; }
  .room-tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
  .room-tabs button:focus-visible { outline: 2px solid var(--accent); }
  .trophy-tiers div.has.major dt { color: var(--gold); }
  .season-awards, .play-reel, .hltv-top { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
  .season-awards li, .play-reel li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--line); font-size: 14px; }
  .sa-year { font: 800 18px/1 var(--display); }
  .sa-team, .pr-where { min-width: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
  .pr-where b { color: var(--text); }
  .pr-event { color: var(--muted); font-size: 12px; text-align: right; }
  .play-reel { max-height: min(46vh, 420px); overflow-y: auto; }
  .hltv-top { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; }
  .hltv-top li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 5px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .hltv-top li.you { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .hltv-top li.you b { color: var(--accent); }
  .ht-rank { color: var(--muted); font: 800 14px/1 var(--display); font-variant-numeric: tabular-nums; }
  .ht-team { overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 560px) {
    .hltv-top { grid-template-columns: minmax(0, 1fr); }
    .play-reel li { grid-template-columns: auto minmax(0, 1fr); }
    .pr-event { grid-column: 2; text-align: left; }
  }
  @media (max-width: 560px) { .bracket { grid-template-columns: minmax(0, 1fr); } }
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
  .bench-btn { border-color: color-mix(in srgb, var(--gold) 50%, var(--line)); color: var(--gold); }
  .swap-roles { display: grid; gap: 6px; }
  .swap-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .promote-modal { width: min(520px, calc(100vw - 32px)); }
  .promote-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .promote-pick { display: grid; gap: 2px; width: 100%; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); text-align: left; cursor: pointer; }
  .promote-pick:hover { border-color: var(--accent); }
  .promote-pick b { font: 800 17px/1.1 var(--display); text-transform: uppercase; }
  .promote-pick span { color: var(--muted); font-size: 12px; }

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
  .ev-n small { font: 700 10px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .ev.now .ev-n { color: var(--accent); }
  .ev-place { color: var(--place, var(--text)); font: 800 11px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
  .ev-name { font: 800 16px/1.05 var(--display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev-sub { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev-sub em { font-style: normal; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .ev-sub em.hot { color: var(--accent); }
  .ev.played:not(.place-Campeão) .ev-name { color: color-mix(in srgb, var(--text) 80%, var(--muted)); }

  .next-actions { display: grid; gap: 4px; justify-items: center; }
  .next-actions .cta { width: 100%; }
  .pace { display: flex; align-items: center; gap: 10px; }
  .pace > span { color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .path { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; margin: 0; padding: 0; list-style: none; }
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
  .evolving em { color: var(--muted); font-style: normal; }
  .facts dd.low { color: var(--accent-2); }
  .fat-bar { display: block; height: 4px; background: color-mix(in srgb, var(--line) 80%, transparent); }
  .fat-bar i { display: block; height: 100%; background: var(--muted); }
  .fat-bar i.hot { background: var(--accent-2); }
  .train-line.alert { color: var(--accent-2); font-weight: 600; }
  .facts dd.high { color: var(--accent); }
  .facts .value { grid-column: span 1; }
  .week { grid-area: week; display: grid; gap: 10px; min-width: 0; }
  .week .section-head { margin-bottom: 0; }
  .week-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 10px; align-items: start; }
  .free-train { display: grid; gap: 6px; align-content: start; min-width: 0; padding: 10px; border: 1px solid var(--line); background: var(--surface-2); }
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
  .ft-actions { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; }
  .week-right { display: grid; gap: 3px; min-width: 0; }
  .coach-hint, .coach-line { min-height: 26px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; }
  .coach-hint { margin: 0; padding: 4px 8px; border-left: 2px solid var(--line); color: var(--muted); font-size: 12px; }
  .coach-line { margin: 0; padding: 4px 8px; border-left: 2px solid var(--accent-2); background: color-mix(in srgb, var(--accent-2) 7%, transparent); font-size: 13px; line-height: 1.4; }
  .coach-line b { color: var(--accent-2); }
  .week-chips, .wchips { display: inline-flex; flex-wrap: wrap; gap: 4px; margin: 0 0 0 8px; vertical-align: middle; }
  .wchips { margin: 0; gap: 3px; }
  .wchips i { padding: 2px 4px; font-size: 10px; }
  .week-cards .wcard { padding: 6px 9px; gap: 3px; }
  .week-chips i, .wchips i { padding: 3px 5px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); color: var(--accent); font: 700 11px/1 var(--body); font-style: normal; white-space: nowrap; }
  .week-chips i.neg, .wchips i.neg { border-color: color-mix(in srgb, var(--accent-2) 40%, var(--line)); color: var(--accent-2); }
  .week-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .wcard { display: grid; align-content: start; gap: 5px; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); text-align: left; cursor: pointer; transition: border-color .14s ease, transform .14s ease; }
  .wcard:hover:not(:disabled) { border-color: var(--accent); transform: translateY(-2px); }
  .wcard:disabled { opacity: .5; cursor: not-allowed; }
  .wcard.done { opacity: .75; border-color: var(--accent); }
  .wcost { display: inline-flex; gap: 3px; margin-left: auto; padding-left: 8px; }
  .wcost i { width: 7px; height: 7px; background: var(--accent); }
  .wcontact { overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .wdone { color: var(--accent); font: 700 11px/1 var(--body); letter-spacing: 0.08em; text-transform: uppercase; }
  .wdim { color: var(--accent-2); font: 700 11px/1 var(--body); letter-spacing: 0.06em; text-transform: uppercase; }
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
  .ss-market ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 2px 16px; margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--muted); }
  .ss-market b { color: var(--text); }
  .ss-market li span { font-size: 12px; }
  .ss-notes p { margin: 0; font-size: 14px; color: var(--muted); }
  .ss-notes b { color: var(--text); }
  .ss-notes p.warn b { color: var(--accent-2); }
  .ss-notes p.up-note b { color: var(--accent); }
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
    .rail { gap: 11px; padding: 16px 20px; min-height: 0; max-height: calc(100dvh - 68px - 36px); overflow: hidden; }
    /* A lista de temporadas cresce com a carreira: rola dentro do painel em vez de empurrar a página. */
    .rail-seasons { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
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
  .note.award { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 8%, var(--surface)); }
  .note.award b { color: var(--gold); }
  .note .link-btn { justify-self: start; }
  .clutch-q .moment { color: var(--muted); letter-spacing: .06em; }
  .clutch-q .moment.planted { color: var(--accent-2); }
  .squad-actions { display: flex; flex-wrap: wrap; gap: 0 12px; margin-left: auto; }
  .squad .section-head .talk-line:empty { display: none; }
  @media (min-width: 960px) {
    .squad .section-head { flex-wrap: nowrap; }
    .squad .section-head > .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .squad .section-head .talk-line { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  @media (min-width: 960px) and (hover: hover) and (pointer: fine) { .squad .squad-actions .squad-btn { min-height: 26px; } }
  .squad-actions .squad-btn { white-space: nowrap; }
  .squad-actions { gap: 6px 8px; align-items: center; }
  /* Os dois botões do elenco sempre lado a lado (nunca um em cima do outro). */
  .squad-actions { flex-wrap: nowrap; flex: none; }
  /* Tela média: o título do elenco fica em cima e os botões numa linha embaixo, à direita; o treino livre vira 4 por linha. */
  @media (max-width: 1180px) {
    .squad .section-head { flex-wrap: wrap; row-gap: 6px; }
    .squad .section-head > .label { flex: 1 1 100%; }
    .squad .squad-actions { margin-left: auto; }
    .week .free-train .skills-pick { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  .transfer-btn { border-color: color-mix(in srgb, var(--accent-2) 55%, var(--line)); color: var(--accent-2); }
  .transfer-btn:hover:not(:disabled) { border-color: var(--accent-2); color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 10%, var(--surface-2)); }
  .kick-btn { justify-self: start; border-color: color-mix(in srgb, var(--accent-2) 55%, var(--line)); color: var(--accent-2); }
  .kick-btn:hover:not(:disabled) { border-color: var(--accent-2); color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 10%, var(--surface-2)); }
  .role-sheet { width: min(520px, calc(100vw - 32px)); display: grid; gap: 12px; }
  .bench-note { margin: 0; padding: 6px 10px; border-left: 3px solid var(--accent-2); color: var(--accent-2); font-size: 13px; font-weight: 700; }
  .lang-chip { color: var(--muted); letter-spacing: .04em; }
  .live-overview-btn { margin-left: auto; white-space: nowrap; }
  .rival-chip { padding: 3px 8px; border: 1px solid var(--accent-2); color: var(--accent-2); font: 800 11px/1 var(--body); letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
  .rival-quote { margin: 0; padding: 10px 14px; border-left: 3px solid var(--accent-2); color: var(--text); font-size: 18px; font-style: italic; line-height: 1.4; }
  .happening-choice small { display: block; margin-top: 4px; color: var(--muted); font: 500 13px/1.3 var(--body); }
  .rival-line { color: var(--accent-2); }
  .overview-modal { width: min(1180px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); overflow-y: auto; }
  .overview-awards { display: grid; gap: 8px; margin-top: 14px; }
  /* Treino de mapa: cartões com a imagem do mapa, nota e afinidade; os 3 primeiros são os seus picks. */
  .map-train { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: 8px; min-width: 0; }
  .map-chips { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(78px, 1fr); gap: 4px; min-width: 0; overflow-x: auto; }
  .map-chip { all: unset; box-sizing: border-box; position: relative; display: grid; gap: 2px; min-width: 0; padding: 5px 7px; overflow: hidden; border: 1px solid var(--line); cursor: pointer;
    background: linear-gradient(90deg, color-mix(in srgb, var(--surface) 92%, transparent), color-mix(in srgb, var(--surface) 70%, transparent)), var(--map) center / cover; }
  .map-chip b { overflow: hidden; color: var(--text); font: 800 12px/1 var(--display); letter-spacing: .04em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .map-chip .mc-score { display: flex; align-items: baseline; gap: 4px; color: var(--muted); font: 700 11px/1 var(--body); font-variant-numeric: tabular-nums; }
  .map-chip .mc-score i { color: var(--accent); font-style: normal; letter-spacing: .02em; }
  .map-chip .mc-bar { display: block; height: 3px; background: color-mix(in srgb, var(--line) 80%, transparent); }
  .map-chip .mc-bar i { display: block; height: 100%; background: var(--muted); }
  .map-chip.top .mc-bar i { background: var(--accent); }
  .map-chip:first-child { border-color: color-mix(in srgb, var(--accent) 70%, var(--line)); animation: mapGlow 2.4s ease-in-out infinite; }
  .map-chip.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .map-chip:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
  .map-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .map-chip:disabled { cursor: not-allowed; opacity: .55; }
  .map-go { align-self: stretch; min-height: 0; padding: 0 14px; white-space: nowrap; }
  /* Mapas do adversário em ordem: o mais forte brilha, os outros vão apagando; o último é o que ele bane. */
  .opp-maps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0 0 6px; }
  .opp-map { position: relative; display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--line); overflow: hidden;
    background: linear-gradient(90deg, color-mix(in srgb, var(--surface) 88%, transparent), color-mix(in srgb, var(--surface) 62%, transparent)), var(--map) center / cover;
    box-shadow: 0 0 calc(18px * var(--glow)) color-mix(in srgb, var(--accent) calc(60% * var(--glow)), transparent); }
  .opp-map b { font: 800 13px/1 var(--display); letter-spacing: .04em; text-transform: uppercase; }
  .opp-map span { color: var(--muted); font: 700 11px/1 var(--body); font-variant-numeric: tabular-nums; }
  .opp-map.best { border-color: var(--accent); animation: mapGlow 2.4s ease-in-out infinite; }
  .opp-map.best span { color: var(--accent); }
  .opp-map.ban { border-style: dashed; }
  .opp-map.ban span { color: var(--accent-2); }
  @keyframes mapGlow { 0%, 100% { box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent); } 50% { box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 75%, transparent); } }
  .opp-maps-note { margin: 0 0 10px; color: var(--muted); font-size: 13px; }
  .opp-head { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
  .opp-facts { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
  .opp-facts div { display: grid; gap: 3px; min-width: 76px; padding: 6px 10px; border: 1px solid var(--line); background: var(--surface-2); }
  .opp-facts dt { color: var(--muted); font: 700 10px/1.2 var(--body); letter-spacing: .06em; text-transform: uppercase; }
  .opp-facts dd { margin: 0; font: 800 17px/1 var(--display); }
  .opp-tier-about { margin: 0; color: var(--muted); font: 500 13px/1.4 var(--body); overflow-wrap: break-word; }
  .opp-tier-about b { color: var(--text); font-weight: 700; }
  .opp-maps-note b { color: var(--text); }

  /* Fogo em volta do jogo: jogo duro esquenta, título pega fogo. */
  .fire-frame { position: relative; display: grid; gap: 8px; border-radius: 2px; }
  .fire-frame.hot::before, .fire-frame.champion::before {
    content: ''; position: absolute; inset: -6px; z-index: 0; pointer-events: none; border-radius: 4px;
    background:
      radial-gradient(60% 30% at 15% 100%, rgba(255, 120, 20, .55), transparent 70%),
      radial-gradient(50% 28% at 55% 100%, rgba(255, 70, 10, .5), transparent 70%),
      radial-gradient(55% 30% at 90% 100%, rgba(255, 160, 40, .5), transparent 70%),
      radial-gradient(40% 22% at 0% 50%, rgba(255, 90, 10, .35), transparent 70%),
      radial-gradient(40% 22% at 100% 50%, rgba(255, 90, 10, .35), transparent 70%);
    filter: blur(6px);
    animation: flicker 1.1s ease-in-out infinite alternate;
  }
  .fire-frame.champion::before {
    inset: -12px;
    background:
      radial-gradient(60% 40% at 10% 100%, rgba(255, 140, 20, .8), transparent 70%),
      radial-gradient(55% 45% at 40% 100%, rgba(255, 60, 0, .75), transparent 70%),
      radial-gradient(55% 45% at 70% 100%, rgba(255, 190, 40, .75), transparent 70%),
      radial-gradient(60% 40% at 100% 100%, rgba(255, 90, 10, .8), transparent 70%),
      radial-gradient(35% 50% at 0% 40%, rgba(255, 120, 20, .55), transparent 70%),
      radial-gradient(35% 50% at 100% 40%, rgba(255, 120, 20, .55), transparent 70%),
      radial-gradient(70% 25% at 50% 0%, rgba(255, 200, 60, .45), transparent 70%);
    animation-duration: .7s;
  }
  .fire-frame > :global(*) { position: relative; z-index: 1; }
  .fire-frame.hot { box-shadow: 0 0 0 1px rgba(255, 120, 20, .6); }
  .fire-frame.champion { box-shadow: 0 0 0 2px var(--gold), 0 0 40px rgba(255, 140, 20, .45); }
  .fire-banner { justify-self: center; padding: 6px 14px; border: 1px solid var(--gold); background: color-mix(in srgb, var(--gold) 18%, var(--surface)); color: var(--gold); font: 900 16px/1 var(--display); letter-spacing: .08em; text-transform: uppercase; animation: bannerIn .5s ease-out both; }
  @keyframes flicker {
    0% { opacity: .75; transform: translateY(0) scaleY(1); }
    50% { opacity: 1; transform: translateY(-2px) scaleY(1.03); }
    100% { opacity: .85; transform: translateY(-1px) scaleY(1.06); }
  }
  @keyframes bannerIn { from { opacity: 0; transform: translateY(-6px) scale(.96); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .fire-frame.hot::before, .fire-frame.champion::before, .opp-map.best, .fire-banner { animation: none; }
  }
  .lang-chip.warn { color: var(--accent-2); }
  .warn-text { color: var(--accent-2); }
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
  .retired-head { min-width: 0; }
  .retired-head h1 { font-size: clamp(64px, 12vw, 140px); line-height: .8; overflow-wrap: anywhere; }
  .retired-hero { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px; }
  .retro-btn { width: auto; flex: none; display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 24px; font-size: 18px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent), 0 10px 40px color-mix(in srgb, var(--accent) 25%, transparent); }
  .retired-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 0; }
  .retired-stats div { display: grid; align-content: start; gap: 6px; padding: 12px 14px; border: 1px solid var(--line); border-top: 2px solid color-mix(in srgb, var(--muted) 50%, var(--line)); background: var(--surface-2); }
  .retired-stats div.gold { border-top-color: var(--gold); }
  .retired-stats dt { color: var(--muted); font: 800 11px/1.2 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .retired-stats dd { margin: 0; font: 900 clamp(30px, 3.4vw, 44px)/1 var(--display); font-variant-numeric: tabular-nums; }
  .retired-stats dd span { color: var(--muted); font-size: .55em; }
  .retired-stats div.gold dd { color: var(--gold); }
  .retired-stats small { color: var(--muted); font-size: 12px; }
  .curve-years { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .tr-badge { display: inline-flex; }
  .tr-name { display: grid; gap: 2px; min-width: 0; }
  .tr-name b { overflow: hidden; font: 800 15px/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .tr-name small { color: var(--muted); font-size: 12px; }
  .tr-titles { color: var(--muted); font-size: 13px; white-space: nowrap; }
  .tr-titles.has { color: var(--text); font-weight: 700; }
  .major-shelf ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 8px; margin: 8px 0 0; padding: 0; list-style: none; }
  .major-shelf li { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid var(--gold); background: linear-gradient(135deg, color-mix(in srgb, var(--gold) 22%, transparent), color-mix(in srgb, var(--gold) 4%, transparent)); }
  .major-shelf b { font: 800 16px/1.15 var(--display); text-transform: uppercase; }
  .major-shelf span { color: var(--gold); font-size: 12px; font-weight: 800; }
  .ty-list { display: grid; gap: 4px; margin-top: 8px; }
  .ty-year { border: 1px solid var(--line); border-left: 3px solid color-mix(in srgb, var(--muted) 50%, var(--line)); background: var(--surface-2); }
  .ty-year.major { border-left-color: var(--gold); }
  .ty-year summary { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; grid-template-areas: 'y team count' 'y chips chips'; align-items: center; gap: 4px 12px; padding: 10px 14px; cursor: pointer; list-style: none; }
  .ty-year summary::-webkit-details-marker { display: none; }
  .ty-year summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .ty-y { grid-area: y; font: 900 22px/1 var(--display); font-variant-numeric: tabular-nums; }
  .ty-year.major .ty-y { color: var(--gold); }
  .ty-team { grid-area: team; overflow: hidden; color: var(--muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .ty-count { grid-area: count; font: 800 15px/1 var(--display); text-transform: uppercase; }
  .ty-chips { grid-area: chips; display: flex; flex-wrap: wrap; gap: 4px; }
  .ty-chips i { padding: 2px 6px; border: 1px solid var(--line); color: var(--muted); font-size: 11px; font-style: normal; font-weight: 700; }
  .ty-chips i.tier-Major { border-color: var(--gold); background: var(--gold); color: #17130a; }
  .ty-chips i.tier-S { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); color: var(--accent); }
  .ty-year ul { display: grid; gap: 2px; margin: 0; padding: 0 14px 12px 82px; list-style: none; }
  .ty-year li { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
  .ty-year li.major span { color: var(--gold); font-weight: 700; }
  .ty-year li b { color: var(--accent); font-size: 11px; letter-spacing: .08em; }
  @media (max-width: 640px) { .ty-year ul { padding-left: 14px; } }
  .verdict { margin: 12px 0 0; color: var(--accent); font: 600 clamp(17px, 2.4vw, 22px)/1.4 var(--body); }
  .retired-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
  .curve { display: grid; grid-template-rows: auto minmax(120px, 1fr); gap: 10px; margin: 0; padding: 14px; border: 1px solid var(--line); background: var(--surface-2); }
  .curve figcaption { display: flex; justify-content: space-between; color: var(--muted); font-size: 13px; }
  .curve figcaption b { color: var(--accent); }
  .curve .label { margin: 0; }
  .curve svg { width: 100%; height: 100%; min-height: 120px; }
  .trajectory ol { display: grid; margin: 0; padding: 0; list-style: none; }
  .trajectory li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 12px; align-items: center; min-height: 48px; padding: 4px 8px; border-bottom: 1px solid var(--line); border-left: 3px solid transparent; font-size: 14px; }
  .trajectory li.top { border-left-color: var(--gold); }
  .trajectory li .num { color: var(--muted); font-variant-numeric: tabular-nums; }

  /* Modais */
  .modal-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / 70%); animation: fade-in 160ms ease; }
  .modal { display: grid; gap: 14px; width: min(560px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 18px; border: 1px solid var(--line); background: var(--surface); box-shadow: var(--shadow); animation: modal-in 260ms cubic-bezier(.16, 1, .3, 1); }
  .modal.wide { width: min(900px, 100%); }
  .modal.confirm { width: min(460px, 100%); gap: 12px; padding: 24px; }
  .modal.confirm h2 { font-size: 36px; overflow-wrap: anywhere; }
  .modal.confirm p { margin: 0; color: var(--muted); line-height: 1.5; }
  .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .event-sheet { gap: 16px; }
  .event-title { margin-bottom: -6px; font-size: clamp(28px, 3vw, 40px); line-height: 1; }
  .event-where { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0; color: var(--muted); font-size: 14px; }
  .event-report { display: grid; gap: 10px; }
  .event-tag { padding: 3px 7px; border: 1px solid var(--accent); color: var(--accent); font: 700 10px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }
  .event-tag.soft { border-color: var(--line); color: var(--muted); }
  .event-note-line { margin: -4px 0 0; padding-left: 10px; border-left: 2px solid var(--line); color: var(--muted); font-size: 13px; line-height: 1.45; }
  .event-facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 0; }
  .event-facts div { display: grid; align-content: start; gap: 6px; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .event-facts dt { color: var(--muted); font: 700 10px/1.2 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .event-facts dd { margin: 0; overflow-wrap: anywhere; font: 800 19px/1.1 var(--display); text-transform: uppercase; }
  .event-facts dd small { color: var(--muted); font: 700 12px/1 var(--body); }
  @media (max-width: 680px) { .event-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .event-facts dd.placed { color: var(--place); font: 900 24px/1 var(--display); text-transform: uppercase; }
  .event-facts dd.hot { color: var(--accent); }
  .event-facts dd.mvp-you { color: var(--gold); font-weight: 800; }
  .field ol { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  /* Os times do campeonato: escudo, tier, idioma, melhor mapa e força; clica para ver o elenco. */
  .field .label { margin: 10px 0 6px; }
  .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
  .field .team-grid > li { display: block; min-width: 0; padding: 0; border: 0; background: none; }
  .team-tile { all: unset; box-sizing: border-box; position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 10px 12px 12px; overflow: hidden; border: 1px solid var(--line); background: var(--surface-2); cursor: pointer; }
  .team-tile:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); transform: translateY(-1px); }
  .team-tile:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .team-tile:disabled { cursor: default; }
  .team-tile.mine { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); }
  .team-tile.rival { border-color: var(--accent-2); }
  .tt-main { display: grid; gap: 3px; min-width: 0; }
  .tt-name { overflow: hidden; font: 800 15px/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .tt-meta { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  /* Altura fixa da linha de etiquetas: cartão com ou sem "Favorito" tem o mesmo tamanho. */
  .tt-tags { display: flex; gap: 4px; min-height: 18px; }
  .tag.dog { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); color: var(--accent); }
  .tt-ovr { font: 900 24px/1 var(--display); font-variant-numeric: tabular-nums; }
  .tt-bar { position: absolute; right: 0; bottom: 0; left: 0; height: 3px; background: color-mix(in srgb, var(--line) 70%, transparent); }
  .tt-bar i { display: block; height: 100%; background: var(--muted); }
  .team-tile.mine .tt-bar i { background: var(--accent); }
  .rival-tag { border-color: var(--accent-2); color: var(--accent-2); }
  /* Campeonato jogado: os seus jogos, a tabela de cada stage (Major) e a chave. */
  .my-games, .stage-table { display: grid; gap: 3px; margin: 0 0 10px; padding: 0; list-style: none; }
  .my-games li { display: grid; grid-template-columns: 78px auto minmax(0, 1fr) 48px 64px; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid var(--line); border-left-width: 3px; background: var(--surface-2); font-size: 14px; }
  .my-games li.won { border-left-color: var(--accent); }
  .my-games li.lost { border-left-color: var(--accent-2); }
  .mg-phase { color: var(--muted); font: 800 11px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .mg-team { overflow: hidden; font: 800 15px/1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .mg-score { font: 800 16px/1 var(--display); font-variant-numeric: tabular-nums; text-align: right; }
  .my-games li.won .mg-result { color: var(--accent); }
  .my-games li.lost .mg-result { color: var(--accent-2); }
  .mg-result { font: 800 11px/1 var(--body); letter-spacing: .08em; text-align: right; text-transform: uppercase; }
  .stage-tabs { display: flex; gap: 4px; margin: 4px 0 6px; }
  .stage-tabs button { all: unset; cursor: pointer; padding: 6px 12px; border: 1px solid var(--line); color: var(--muted); font: 800 12px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; }
  .stage-tabs button.on { border-color: var(--accent); color: var(--text); }
  .stage-table { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 14px; }
  .stage-table li { display: grid; grid-template-columns: 22px auto minmax(0, 1fr) 40px 86px; align-items: center; gap: 8px; padding: 5px 6px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .stage-table li.you { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .stage-table li.out { opacity: .6; }
  .stage-table b { overflow: hidden; font: 800 13px/1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .st-rank { color: var(--muted); font-variant-numeric: tabular-nums; text-align: right; }
  .st-record { font: 800 14px/1 var(--display); font-variant-numeric: tabular-nums; }
  .st-status { color: var(--muted); font: 700 10px/1 var(--body); letter-spacing: .06em; text-align: right; text-transform: uppercase; }
  @media (max-width: 640px) { .stage-table { grid-template-columns: minmax(0, 1fr); } .my-games li { grid-template-columns: 64px auto minmax(0, 1fr) 40px; } .mg-result { display: none; } }
  /* Acontecimento: a situação, 3 caminhos e o resultado. */
  .happening { display: grid; gap: 14px; }
  .happening h2 { margin: 0; font-size: clamp(24px, 3vw, 34px); line-height: 1.05; }
  .happening-choices { display: grid; gap: 8px; }
  .happening-choice { all: unset; box-sizing: border-box; cursor: pointer; padding: 14px 16px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 600 16px/1.3 var(--body); }
  .happening-choice:hover, .happening-choice:focus-visible { border-color: var(--accent); }
  .happening-odds { margin: 0; color: var(--muted); font-size: 13px; }
  .happening-odds b { color: var(--text); }
  .happening-line { margin: 0; font-size: 16px; line-height: 1.45; }
  .happening-line.bad { color: var(--accent-2); }
  .sev { margin-left: 10px; padding: 2px 6px; border: 1px solid currentColor; font: 700 11px/1 var(--body); letter-spacing: 0.08em; text-transform: uppercase; }
  .sev-grave { color: var(--accent-2); opacity: 0.8; }
  .sev-critico { color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 14%, transparent); }
  .log-marks { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .log-marks b { color: var(--text); }
  .log-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .log-list { display: grid; gap: 6px; max-height: 46vh; margin: 6px 0 0; padding: 0; overflow-y: auto; list-style: none; }
  .log-list li { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 10px; padding: 8px 10px; border: 1px solid var(--line); background: var(--surface-2); }
  .log-when { color: var(--muted); font: 700 12px/1.3 var(--body); font-variant-numeric: tabular-nums; }
  .log-body { display: grid; gap: 3px; min-width: 0; font-size: 14px; line-height: 1.35; }
  .log-body small { color: var(--muted); font-size: 12px; }
  .log-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
  .log-body .sev { margin: 0; font-style: normal; }
  @media (max-width: 720px) { .log-cols { grid-template-columns: minmax(0, 1fr); } }
  .talk-who { margin-left: 10px; color: var(--muted); font: 600 13px/1 var(--body); text-transform: uppercase; letter-spacing: 0.08em; vertical-align: middle; }
  .talk-quote { margin: 0; padding: 12px 16px; border-left: 3px solid var(--accent); background: var(--surface-2); font-size: 17px; line-height: 1.45; }
  .talk-tip { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.45; }
  .talk-tip b { color: var(--text); }
  .talk-skip { justify-self: start; }
  .promote-talk { margin: 4px 0 0; }
  .outcome-quote { margin: 8px 0 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
  .outcome-quote b { color: var(--text); }
  .happening-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .happening-chips li { padding: 4px 8px; border: 1px solid var(--line); font: 700 12px/1 var(--body); color: var(--muted); }
  .happening-chips li.up { border-color: var(--accent); color: var(--accent); }
  .happening-chips li.down { border-color: var(--accent-2); color: var(--accent-2); }
  .facts .money dd { font-size: 15px; }
  .invites { margin: 0 0 8px; color: var(--muted); font-size: 14px; line-height: 1.45; }
  .circuit-wait { margin: 8px 0 0; color: var(--muted); font-size: 14px; line-height: 1.45; overflow-wrap: anywhere; }
  .rank-move { font-size: 12px; font-weight: 700; }
  .rank-move.up { color: var(--accent); }
  .rank-move.down { color: var(--danger); }
  .invites b { color: var(--text); }
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
    .pyramid { grid-column: 1 / -1; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
    .pyramid li { justify-content: center; text-align: center; min-height: 40px; padding: 4px; font-size: 11px; letter-spacing: .04em; }
    .pyramid li.here { min-height: 40px; flex-wrap: nowrap; }
    .rung-org, .rung-mark { display: none; }
    .seat-line, .tier-guide { grid-column: 1 / -1; }
  }

  /* Celular: o elenco vira faixa com snap; nada estoura a largura */
  @media (max-width: 680px) {
    .grid2 { grid-template-columns: minmax(0, 1fr); }
    .season-summary { grid-template-columns: minmax(0, 1fr); }
    .week-grid { grid-template-columns: minmax(0, 1fr); }
    .skills-pick button { padding: 0 6px; font-size: 12px; min-height: 40px; }
    .ft-actions { flex-wrap: wrap; }
    .week-cards { grid-template-columns: minmax(0, 1fr); }
    .path { grid-auto-flow: row; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
    .path .step { padding: 6px 8px; }
    .path .step-opp { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    .path .step-state { font-size: 11px; }
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

  /* Busca sempre à mão, coach no trilho, pirâmide em faixa e medidor da semana. */
  .rail-search { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 0 10px; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); font: 600 13px/1 var(--body); text-align: left; cursor: pointer; transition: border-color .14s ease, color .14s ease; }
  .rail-search:hover, .rail-search:focus-visible { border-color: var(--accent); color: var(--text); }
  /* Mundo ao lado da busca: as duas portas para o resto da cena. A linha estica os dois botões na mesma altura. */
  .rail-tools { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
  .rail-world { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 0 12px; border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); color: var(--text); font: 800 12px/1 var(--body); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; transition: border-color .14s ease, color .14s ease; }
  .rail-world svg { flex: none; color: var(--accent); }
  .rail-world:hover, .rail-world:focus-visible { border-color: var(--accent); color: var(--accent); }
  /* Altura fixa: trocar de aba não faz o modal pular no meio da tela. */
  .world-modal { align-content: start; min-height: min(640px, calc(100dvh - 32px)); }
  @media (max-width: 680px) {
    .rail-world { min-height: 40px; }
    .world-modal { padding: 14px 12px; }
  }
  .rail-coach { display: grid; gap: 7px; padding: 9px 10px; border: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); background: radial-gradient(130% 80% at 0% 0%, color-mix(in srgb, var(--accent-2) 12%, transparent), transparent 60%), var(--surface-2); }
  .rc-top { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; }
  .rc-ovr { font: 900 32px/.85 var(--display); font-variant-numeric: tabular-nums; }
  .rc-who { display: grid; gap: 2px; min-width: 0; }
  .rc-who .label { margin: 0; color: var(--accent-2); font-size: 10px; }
  .rc-who b { font: 800 15px/1 var(--display); text-transform: uppercase; overflow-wrap: anywhere; }
  .rc-meta { color: var(--muted); font-size: 11px; }
  .rc-talk { min-height: 28px; padding: 0 9px; font-size: 11px; border-color: color-mix(in srgb, var(--accent-2) 50%, var(--line)); white-space: nowrap; }
  .rc-attrs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 12px; margin: 0; padding: 0; list-style: none; }
  .rc-attrs li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 6px; align-items: center; color: var(--muted); font-size: 11px; }
  .rc-attrs li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rc-attrs li i { grid-column: 1 / -1; grid-row: 2; height: 3px; background: linear-gradient(90deg, var(--accent-2) var(--v), color-mix(in srgb, var(--line) 80%, transparent) var(--v)); }
  .rc-attrs li b { color: var(--text); font-variant-numeric: tabular-nums; }
  .rc-trust { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; color: var(--muted); font: 600 11px/1 var(--body); }
  .rc-trust i { height: 5px; background: linear-gradient(90deg, var(--muted) var(--v), color-mix(in srgb, var(--line) 80%, transparent) var(--v)); }
  .rc-trust i.high { background: linear-gradient(90deg, var(--accent) var(--v), color-mix(in srgb, var(--line) 80%, transparent) var(--v)); }
  .rc-trust i.low { background: linear-gradient(90deg, var(--accent-2) var(--v), color-mix(in srgb, var(--line) 80%, transparent) var(--v)); }
  .rc-trust b { color: var(--text); font-variant-numeric: tabular-nums; }
  .rc-trust b.high { color: var(--accent); }
  .rc-trust b.low { color: var(--accent-2); }
  .pyramid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 3px; }
  .pyramid li { justify-content: center; min-height: 28px; padding: 3px 2px; font-size: 10px; letter-spacing: .03em; text-align: center; }
  .pyramid li.here { min-height: 28px; flex-wrap: nowrap; }
  .rung-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .rung-short { display: inline; }
  .rung-org, .rung-mark { display: none; }
  .rung-here { margin: -4px 0 0; overflow: hidden; color: var(--text); font: 800 15px/1.1 var(--display); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .rung-here span { color: var(--accent); font: 700 10px/1 var(--body); letter-spacing: .08em; }
  .squad-strip { grid-template-columns: minmax(170px, 1.15fr) repeat(4, minmax(140px, 1fr)); }
  .bond-num { white-space: nowrap; }
  .week .section-head { align-items: center; }
  .week-meter { display: inline-flex; align-items: center; gap: 8px; padding: 3px 8px 3px 6px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); background: color-mix(in srgb, var(--accent) 6%, var(--surface-2)); }
  .wm-pips { display: inline-flex; gap: 3px; }
  .wm-pips i { width: 20px; height: 10px; background: var(--accent); transition: background .12s ease, box-shadow .12s ease; }
  .wm-pips i.used { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
  .wm-pips i.preview { background: repeating-linear-gradient(135deg, var(--accent) 0 3px, transparent 3px 6px); box-shadow: inset 0 0 0 1px var(--accent); animation: pip-pulse .9s ease-in-out infinite alternate; }
  .wm-pips i.over { background: transparent; box-shadow: inset 0 0 0 1px var(--accent-2); }
  @keyframes pip-pulse { from { opacity: 1; } to { opacity: .45; } }
  .wm-text { color: var(--muted); font: 700 11px/1 var(--body); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
  .wm-text b { color: var(--accent); font: 800 15px/1 var(--display); }
  .wcost { align-items: center; gap: 2px; padding: 2px 4px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .wcost i { width: 6px; height: 6px; }
  .wcost em { margin-left: 2px; color: var(--accent); font: 800 10px/1 var(--body); font-style: normal; }
  .wcard.nofit { opacity: .45; }
  /* Números do trilho em linhas com sentido: carreira, time, jogador, imagem e casa. */
  .fact-rows { display: grid; gap: 4px; }
  .frow { display: grid; grid-template-columns: 49px minmax(0, 1fr); gap: 4px; align-items: stretch; }
  .frow-label { display: flex; align-items: center; padding-left: 4px; border-left: 2px solid var(--line); color: var(--muted); font: 700 8px/1.1 var(--body); letter-spacing: .02em; text-transform: uppercase; }
  .frow:first-child .frow-label { border-left-color: var(--gold); }
  .frow:nth-child(2) .frow-label { border-left-color: var(--accent); }
  .frow:nth-child(3) .frow-label { border-left-color: color-mix(in srgb, var(--accent) 55%, var(--muted)); }
  .frow:nth-child(4) .frow-label { border-left-color: var(--muted); }
  .frow:nth-child(5) .frow-label { border-left-color: var(--accent-2); }
  .frow.home .facts dd { color: var(--muted); }
  .fact-rows .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
  .fact-rows .facts div { gap: 2px; padding: 4px 5px; }
  .fact-rows .facts dt { font-size: 8.5px; letter-spacing: 0; }
  .fact-rows .facts dd { font-size: 18px; }
  .fact-rows .facts .money dd, .fact-rows .facts dd.small-dd { font-size: 14px; }
  .fact-rows .fat-bar { height: 3px; }
  .fact-rows dd .phase { margin-left: 3px; font: 700 11px/1 var(--body); }
  .fact-rows dd.high .phase { color: var(--accent); }
  .fact-rows dd.low .phase { color: var(--accent-2); }
  .fact-rows dd.low, .fact-rows dd.high { color: var(--text); }
  .fat-bar i.phase-bar { background: var(--accent); }
  .fat-bar i.phase-bar.low { background: var(--accent-2); }
  .scout-teams { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .scout-teams button { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 10px 4px 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 700 13px/1 var(--body); cursor: pointer; }
  .scout-teams button:hover, .scout-teams button:focus-visible { border-color: var(--accent); }
  .scout-teams button span { color: var(--muted); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
  @media (prefers-reduced-motion: reduce) { .wm-pips i.preview { animation: none; } }
  @media (min-width: 961px) {
    .rail { gap: 9px; padding-inline: 16px; }
    .ovr-num { font-size: 64px; }
    .nick { font-size: clamp(38px, 3.6vw, 50px); }
    .nick.long { font-size: 38px; }
    .nick.xlong { font-size: 30px; }
  }

  /* Trilho virando cabeçalho (tablet e celular): overall ao lado do nome, o resto em largura cheia. */
  @media (max-width: 960px) {
    .rail > :global(*) { grid-column: 1 / -1; }
    .rail > .rail-head { grid-column: 1; grid-row: 1; }
    .rail > .ovr { grid-column: 2; grid-row: 1; flex-direction: column; align-items: flex-end; gap: 2px; padding-top: 18px; }
  }

  /* Tela média: a semana desce para baixo do treino livre para as 5 cartas caberem. */
  @media (min-width: 681px) and (max-width: 1180px) {
    .week-grid { grid-template-columns: minmax(0, 1fr); }
  }
  @media (min-width: 681px) and (max-width: 860px) {
    .week-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  /* Celular: tudo compacto, como jogo de celular na vertical. */
  @media (max-width: 680px) {
    .page { padding-inline: 0; }
    .career { border-inline: 0; }
    .rail { grid-template-columns: minmax(0, 1fr) auto; gap: 7px 10px; padding: 12px; }
    .age-phase { display: none; }
    .rail-head .eyebrow { font-size: 10px; }
    .nick, .nick.long, .nick.xlong { font-size: 30px; }
    .sub { margin-top: 2px; font-size: 12px; }
    .age-phase { margin: 2px 0 0; font-size: 11px; }
    .skills-now { gap: 3px; margin-top: 6px; }
    .skills-now div { padding: 2px 5px; }
    .skills-now dt { font-size: 9px; }
    .skills-now dd { font-size: 12px; }
    .evolving { margin-top: 4px; font-size: 10px; }
    .evolving span { font-size: 9px; }
    .rail-head .icon-btn { width: 32px; height: 32px; min-height: 32px; }
    .ovr { gap: 8px; }
    .ovr-num { font-size: 46px; }
    .ovr-label { margin-bottom: 2px; font-size: 10px; }
    .fact-rows { gap: 3px; }
    .frow { grid-template-columns: 52px minmax(0, 1fr); }
    .frow-label { font-size: 8px; }
    .facts { gap: 3px; }
    .facts div { gap: 1px; padding: 3px 6px; }
    .facts dt { font-size: 8.5px; letter-spacing: 0; }
    .facts dd { font-size: 15px; }
    .facts .money dd, .facts dd.small-dd { font-size: 13px; }
    .rail-search { min-height: 30px; font-size: 12px; }
    .rail-coach { gap: 5px; padding: 7px 8px; }
    .rc-ovr { font-size: 26px; }
    .rc-who b { font-size: 14px; }
    .rc-attrs { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px 8px; }
    .rc-attrs li { font-size: 9.5px; }
    .pyramid li { min-height: 24px; font-size: 9px; }
    .rung-here { margin-top: -2px; font-size: 13px; }
    .stage { padding: 10px; gap: 10px; }
    .section-head .label, .squad .section-head > .label { font-size: 10px; }
    .next { gap: 6px 10px; padding: 10px 12px; }
    .next .eyebrow { font-size: 10px; }
    .next h2 { font-size: 21px; }
    .next .cta { min-height: 40px; font-size: 16px; }
    .calendar { zoom: .86; }
    .squad-strip { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 128px; gap: 6px; margin-inline: -10px; padding: 0 10px 8px; scroll-padding-inline: 10px; }
    .squad-strip > :global(*) { zoom: .78; }
    .squad-actions .squad-btn { min-height: 30px; padding: 0 8px; font-size: 11px; }
    .week-meter { padding: 2px 6px 2px 4px; }
    .wm-pips i { width: 16px; height: 8px; }
    .week-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
    .week-cards .wcard { padding: 6px 7px; }
    .wcard b { font-size: 13px; }
    .free-train { padding: 8px; }
    .skills-pick button { min-height: 32px; font-size: 11px; }
    .map-train { zoom: .86; }
    .train-line { font-size: 12px; }
  }

  /* Rodada 3: semana em faixas (treino livre numa linha, cartas largas, mapas embaixo) e trilho sem amassar. */
  .week-grid { grid-template-columns: minmax(0, 1fr); }
  .free-train { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 7px 10px; }
  .ft-head { flex-direction: column; align-items: flex-start; gap: 3px; }
  .ft-head b { font-size: 16px; }
  .ft-head span { font-size: 11px; white-space: nowrap; }
  .skills-pick { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .ft-actions .secondary-btn { min-width: 116px; }
  .wcat { flex-wrap: wrap; row-gap: 3px; }
  .wcard b { overflow: visible; font-size: 15px; line-height: 1.08; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }
  .wcontact { white-space: normal; }
  .evolving { all: unset; box-sizing: border-box; display: block; width: 100%; overflow: hidden; margin: 6px 0 0; color: var(--accent); font: 700 10px/1.3 var(--body); letter-spacing: .08em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; cursor: pointer; }
  .evolving:hover, .evolving:focus-visible { color: var(--text); }
  .evolving:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .evolving i { margin-left: 6px; font-style: normal; }
  .evo-modal { width: min(560px, calc(100vw - 32px)); display: grid; gap: 12px; }
  .evo-stages { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin: 0; padding: 0; list-style: none; }
  .evo-stages li { display: grid; gap: 3px; padding: 7px 6px; border: 1px solid var(--line); color: var(--muted); text-align: center; }
  .evo-stages li b { font: 800 12px/1.1 var(--display); text-transform: uppercase; }
  .evo-stages li span { font-size: 10px; }
  .evo-stages li.here { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); color: var(--accent); }
  .evo-phase { margin: 0; font-size: 14px; line-height: 1.45; }
  .evo-growth { padding: 10px 12px; border-left: 3px solid var(--accent); background: var(--surface-2); font-size: 14px; line-height: 1.45; }
  .evo-growth.stopped { border-left-color: var(--accent-2); }
  .evo-growth b { color: var(--text); }
  .evo-skills { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .evo-skills li { display: grid; grid-template-columns: 110px minmax(0, 1fr) 90px; align-items: center; gap: 10px; font-size: 13px; }
  .evo-skills li i { height: 6px; background: linear-gradient(90deg, var(--accent) var(--v), color-mix(in srgb, var(--line) 80%, transparent) var(--v)); }
  .evo-skills li.full i { background: var(--gold); }
  .evo-skills li.neg i { background: var(--accent-2); }
  .evo-skills li b { font-variant-numeric: tabular-nums; text-align: right; }
  @media (max-width: 520px) { .evo-stages { grid-template-columns: repeat(3, minmax(0, 1fr)); } .evo-skills li { grid-template-columns: 80px minmax(0, 1fr) 70px; } }
  .evolving span { margin-right: 6px; color: var(--muted); font-size: 10px; }
  .evolving em { color: var(--muted); font-style: normal; }
  .age-phase { display: none; }
  .sub { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  @media (min-width: 961px) {
    .hub { gap: 6px; }
    .stage { padding-block: 12px; }
    .next { padding: 8px 16px; }
    .next h2 { font-size: clamp(24px, 2vw, 30px); }
    .next .cta { min-height: 40px; font-size: 18px; }
    .calendar { gap: 6px; }
    .events-row { zoom: .95; }
    .squad-strip > :global(*) { zoom: .92; }
    .week { gap: 6px; }
    .free-train { padding: 5px 10px; }
    .skills-pick button { min-height: 30px; }
    .rail { gap: 7px; }
    .rail-coach { gap: 5px; padding: 7px 9px; }
    .seat-line { font-size: 12px; line-height: 1.4; }
    .rail > * { flex-shrink: 0; }
    .rail > .rail-seasons { flex-shrink: 1; }
    .nick { font-size: clamp(30px, 2.8vw, 40px); }
    .nick.long { font-size: 32px; }
    .nick.xlong { font-size: 26px; }
  }
  @media (max-width: 680px) {
    .free-train { grid-template-columns: minmax(0, 1fr) auto; gap: 6px 8px; }
    .free-train .skills-pick { grid-column: 1 / -1; grid-row: 1; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .evolving { white-space: normal; }
    .wcard b { font-size: 13px; }
    /* Hub no celular: o último campeonato quebra linha; os botões do elenco descem para a linha de baixo e o do banco
       ocupa a linha inteira (os dois de ação seguem lado a lado). */
    .report-copy { flex: 1 1 160px; }
    .report-copy .label { max-width: 100%; }
    .squad-actions { flex: 1 1 100%; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }
    .squad-actions .bench-btn { flex: 1 1 100%; white-space: normal; }
    /* Ao vivo no celular: AO VIVO e o nome do campeonato na primeira linha; o rival e o botão da tabela embaixo. */
    .live-strip { flex-wrap: wrap; gap: 8px 10px; }
    .live-strip strong { flex: 1 1 140px; }
    .rival-chip { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
    /* Sala de troféus: abas com 44px de toque (quebram em duas linhas). */
    .room-tabs button { display: inline-flex; align-items: center; box-sizing: border-box; min-height: 44px; padding: 0 10px; }
    .modal.confirm h2 { font-size: 28px; }
    /* Round decisivo no celular: lados e dinheiro numa linha só, a situação e as 3 calls na mesma tela (cada call com
       52px de toque). Quando cada call é certa fica atrás de "Quando cada uma é certa" (e no title da call). */
    .clutch { gap: 8px; margin: 8px -6px 0; padding: 10px; }
    .board { grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; padding-bottom: 8px; }
    .board .label { grid-column: auto; grid-row: auto; font-size: 10px; letter-spacing: .06em; line-height: 1.25; }
    .side-cell { flex-direction: column; align-items: flex-start; gap: 3px; }
    .side-cell.right { flex-direction: column-reverse; align-items: flex-end; }
    .side { font-size: 12px; }
    .money { font-size: 11px; }
    .clutch-q .eyebrow { margin-bottom: 4px; font-size: 10px; letter-spacing: .08em; }
    .clutch-q h2 { font-size: 25px; }
    .clutch-ctx { align-items: center; gap: 2px 10px; margin-top: 6px; font-size: 12px; }
    .clutch-ctx.hints-only { display: flex; }
    .hints-btn { display: inline-flex; align-items: center; min-height: 44px; margin: -10px 0 -10px auto; padding: 0 2px; border: 0; background: none; color: var(--accent); font: 700 11px/1 var(--body); letter-spacing: .04em; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .calls { gap: 6px; }
    .call { grid-template-columns: 72px minmax(0, 1fr); align-content: center; gap: 4px 10px; min-height: 52px; padding: 8px 10px; }
    .call .risk { justify-self: stretch; padding: 5px 4px; font-size: 10px; letter-spacing: .06em; text-align: center; }
    .call b { font-size: 18px; line-height: 1; }
    .call .risk-hint { display: none; font-size: 12px; line-height: 1.3; }
    .calls.hints-open .call .risk-hint { display: block; }
    .clutch-foot { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .clutch-foot .auto { gap: 8px; font-size: 12px; line-height: 1.25; }
    .clutch-foot .link-btn { max-width: 10em; padding: 0; font-size: 11px; letter-spacing: .06em; line-height: 1.25; text-align: right; }
  }
</style>
