// src/lib/game/playerCareer/engine.ts
// Motor do modo Carreira de Jogador (RPG): criação, temporadas na pirâmide real (lan house → GC/CCT → tier 2 →
// Major), mercado de ofertas, envelhecimento pelo motor calibrado (career/aging.ts) e veredito de aposentadoria.
// Assimetrias de função seguem o desenho do artifact (AWPer rating alto/oscila; IGL rating menor mas time mais
// forte) e os pesos do worldGen. Tudo determinístico por seed da carreira.
import { createSeededRng } from '../simulation';
import { applyAging, type AgingEntity } from '../career/aging';
import { orgIn, rosterIn } from './world';
import { EVENT_RANGE, eventCount, regionOf, seasonEvents, type EventFormat, type EventTier, type Region } from './calendar';
import { calibration, memberNick, memberRoles, nationFits, ORG_BASE_POWER, resolvedRoster, sceneOrgById, sceneOrgs, type SceneOrg } from './data';
import { randomNick } from './extraTeams';
import { seasonAwards } from './awards';
import { myFluency, teamLanguage, type Language } from './language';
import type { Rival } from './rivals';
import type { DecisionLog } from './decisions';
import type { CareerLife } from './life';
import type { Talk, TalkMemory } from './talks';
import type { MapId } from '../types';

export type PlayerRole = 'awper' | 'rifler' | 'entry' | 'igl' | 'lurker' | 'support';

/** Origem do jogador criado: define idade de entrada, começo, teto e ritmo — a distribuição de desfechos
 *  (flop no C/B, salto pro tier 1, pico GOAT) é medida por simulação em playerCareerSimulation.test.ts. */
export type PlayerArchetype = 'prodigio' | 'talento-bruto' | 'solido' | 'tardio';

export interface ArchetypeMeta {
  label: string;
  blurb: string;
  entryAge: [number, number];
  startOverall: [number, number];
  potential: [number, number];
  devRate: [number, number];
}

export const ARCHETYPES: Record<PlayerArchetype, ArchetypeMeta> = {
  prodigio: {
    label: 'Prodígio',
    blurb: 'Entra aos 16 chamando atenção. Teto de estrela, mas é quem mais trava se não entregar.',
    entryAge: [16, 16], startOverall: [65, 70], potential: [86, 97], devRate: [0.85, 1.3]
  },
  'talento-bruto': {
    label: 'Talento bruto',
    blurb: 'Chega cru e longe do topo. Pode explodir mais tarde.',
    entryAge: [16, 17], startOverall: [57, 62], potential: [80, 94], devRate: [0.85, 1.25]
  },
  solido: {
    label: 'Player sólido',
    blurb: 'Carreira estável no circuito. Chegar ao tier 1 é raro.',
    entryAge: [17, 18], startOverall: [64, 69], potential: [70, 82], devRate: [0.9, 1.05]
  },
  tardio: {
    label: 'Estreia tardia',
    blurb: 'Chega mais velho e pronto. Janela curta: sobe logo ou fica no challenger.',
    entryAge: [19, 20], startOverall: [68, 73], potential: [76, 90], devRate: [1.0, 1.15]
  }
};

/** Trade-offs de função: viés de rating, oscilação e o quanto carrega o time (filosofia do artifact + ROLE_WEIGHTS). */
export const ROLE_META: Record<PlayerRole, { label: string; ratingBias: number; variance: number; teamImpact: number; blurb: string }> = {
  awper: { label: 'AWPer', ratingBias: 0.08, variance: 0.16, teamImpact: 0, blurb: 'Rating alto, oscila mais. Carrega o time nos dias bons.' },
  rifler: { label: 'Rifler', ratingBias: 0.02, variance: 0.08, teamImpact: 0, blurb: 'Duelo em qualquer distância. Joga onde o time precisar.' },
  entry: { label: 'Entry fragger', ratingBias: -0.05, variance: 0.10, teamImpact: 0, blurb: 'Abre os bombs. Morre primeiro, rating mais baixo.' },
  igl: { label: 'IGL', ratingBias: -0.10, variance: 0.07, teamImpact: 3, blurb: 'Faz a call. Rating menor, time bem mais forte.' },
  lurker: { label: 'Lurker', ratingBias: 0.0, variance: 0.05, teamImpact: 0, blurb: 'Joga sozinho no outro lado do mapa. Consistente.' },
  support: { label: 'Suporte', ratingBias: -0.04, variance: 0.06, teamImpact: 1, blurb: 'Flash, smoke e trade. Pouco holofote, muito título.' }
};


export interface TournamentResult {
  name: string;
  /** Não classificado · Stage 1 · Stage 2 · Fase suíça · Quartas · Semis · Vice · Campeão */
  placement: string;
  rating: number; // rating do kill feed real do motor (Rating 3.0)
  seriesWins: number;
  seriesLosses: number;
  /** Não jogou (não se classificou para o Major): não conta na média, nem no corte. */
  skipped?: boolean;
  /** Tier do evento (Major, S, A, B, C), para o histórico de títulos. */
  tier?: EventTier;
  /** Você ficou no banco: o time jogou com o substituto (não conta no seu rating nem no HLTV). */
  benched?: boolean;
  /** Campeão do evento e o MVP (pelo kill feed de todas as séries, como no modo online). */
  champion?: string;
  mvp?: EventMvp;
  /** Suas jogadas no evento (ace, quad, clutch): viram fãs e marcam o histórico. */
  plays?: EventPlays;
  /** O mata-mata inteiro: quem passou, quem caiu e os placares. */
  bracket?: BracketLine[];
  /** Todos os times que você enfrentou no evento, a fase, o placar (seu lado primeiro) e se ganhou a série. */
  opponents?: Array<{ team: string; won: boolean; phase?: string; score?: string }>;
  /** Major: a tabela final de cada stage (time, campanha e se passou). */
  stages?: Array<{ stage: string; standings: Array<{ name: string; wins: number; losses: number; status: string; you?: boolean }> }>;
  /** Suas jogadas do evento com mapa, round e adversário (as melhores, até 8). */
  highlights?: PlayHighlight[];
}

export interface PlayHighlight { kind: 'ace' | 'quad' | 'triple' | 'clutch'; kills: number; against?: number; map: string; round: number; opponent: string }

/** Tier de um resultado antigo (antes do calendário real): pelo nível do time na temporada. */
const legacyTier = (orgLevel: number): EventTier => (orgLevel <= 1 ? 'A' : orgLevel === 2 ? 'B' : 'C');

export interface TrophyCase { byTier: Record<EventTier, number>; mvps: number; /** MVPs de Major (já contados em `mvps`). */ majorMvps: number; aces: number; total: number; clutches: number; hltvBest: number | null; hltvTop1: number; hltvTop20: number; rookie: boolean }

/** Sala de troféus: títulos por tier (Major, S, A, B, C), MVPs de evento e aces da carreira (inclui a temporada em curso). */
export function trophyCase(state: Pick<PlayerCareerState, 'history' | 'calendar' | 'orgId'>): TrophyCase {
  const byTier: Record<EventTier, number> = { Major: 0, S: 0, A: 0, B: 0, C: 0 };
  let mvps = 0;
  let majorMvps = 0;
  let aces = 0;
  const count = (result: TournamentResult, orgLevel: number) => {
    if (result.placement === 'Campeão') byTier[result.tier ?? legacyTier(orgLevel)] += 1;
    if (result.mvp?.you) mvps += 1;
    if (result.mvp?.you && result.tier === 'Major') majorMvps += 1;
    aces += result.plays?.aces ?? 0;
  };
  let clutches = 0;
  for (const log of state.history) for (const result of log.tournaments) { count(result, log.orgLevel); clutches += result.plays?.clutches ?? 0; }
  const level = orgOf(state.orgId).level;
  for (const entry of state.calendar ?? []) if (entry.result) { count(entry.result, level); clutches += entry.result.plays?.clutches ?? 0; }
  const ranks = state.history.flatMap((log) => (log.hltvRank ? [log.hltvRank] : []));
  return {
    byTier, mvps, majorMvps, aces, clutches, total: Object.values(byTier).reduce((sum, value) => sum + value, 0),
    hltvBest: ranks.length ? Math.min(...ranks) : null,
    hltvTop1: ranks.filter((rank) => rank === 1).length,
    hltvTop20: ranks.filter((rank) => rank <= 20).length,
    rookie: state.history.some((log) => log.rookie?.you)
  };
}

export interface EventMvp { nick: string; team: string; rating: number; you?: boolean }
export interface EventPlays { aces: number; quads: number; clutches: number }
export interface BracketLine { phase: 'quarterfinal' | 'semifinal' | 'final'; a: string; b: string; scoreA: number; scoreB: number; aWon: boolean; /** Lado do seu time na série, quando é sua. */ you?: 'a' | 'b' }

/** Um campeonato da temporada, disputado um a um no motor de Major. */
export interface CalendarEntry {
  index: number;
  name: string;
  status: 'UPCOMING' | 'PLAYED';
  result?: TournamentResult;
  /** Campeonato real do circuito: mês (1-12), tier do evento, formato e final em MD3/MD5. */
  month?: number;
  tier?: EventTier;
  format?: EventFormat;
  finalBestOf?: 3 | 5;
  organizer?: string;
  location?: string;
  prizePool?: number;
}

/** O que o save guarda de um evento em andamento: a chave e as séries já fechadas (rebuild determinístico). */
export interface LiveEventSave {
  eventIndex: number;
  played: Record<string, unknown>;
  /** Major: o stage em andamento e as séries dos stages já passados. */
  stage?: 'stage1' | 'stage2' | 'stage3' | null;
  carry?: { wins: number; losses: number };
}

/** Atributos que o treino entre campeonatos pode acumular de bônus (efeitos da Dinastia, dynasty/training.ts). */
export type TrainedAttribute = 'firepower' | 'support' | 'clutch' | 'entry' | 'mental' | 'consistency' | 'igl' | 'awp';
export type TrainedBonus = Partial<Record<TrainedAttribute, number>>;

export interface CareerOffer {
  orgId: string;
  orgName: string;
  orgLevel: number;
  salaryUsd: number;
}

/** Corte ou proposta no meio da temporada, esperando a sua decisão. */
export interface PendingMove {
  /** cut: o time te cortou · poach: um time de cima te chamou · request: você pediu para sair. */
  kind: 'cut' | 'poach' | 'request';
  /** Média de rating dos últimos campeonatos que motivou a mudança. */
  average: number;
  reason: string;
  offers: CareerOffer[];
}

export interface SeasonLog {
  seasonNumber: number;
  year: number;
  orgId: string;
  orgName: string;
  orgLevel: number;
  tournaments: TournamentResult[];
  seasonRating: number;
  overallBefore: number;
  overallAfter: number;
  titles: number;
  injury: string | null;
  agingNote: string | null;
  /** Idade ao fim da temporada e quanto a idade tirou de overall (declínio de veterano). */
  age?: number;
  ageDecline?: number;
  /** O corpo pediu para parar (risco real de aposentadoria pela idade): só um aviso, a decisão é sua. */
  retireHint?: boolean;
  /** Trocas de time durante a temporada (cortes, propostas aceitas). */
  moves?: string[];
  /** O seu time subiu ou caiu de tier no fim da temporada. */
  orgChange?: { from: number; to: number };
  /** Top 20 HLTV da temporada (você incluso, se entrou) e a sua posição (null: jogou pouco para ranquear). */
  hltvTop?: RankedPlayer[];
  hltvRank?: number | null;
  /** Rookie of the Year da temporada (quem estreou em Major) e se foi você. */
  rookie?: RankedPlayer | null;
  rookieEligible?: boolean;
}

export interface RankedPlayer { nick: string; team: string; score: number; you?: boolean; /** Rating da temporada (o seu é o real; o da cena, pela força). */ rating?: number; teamId?: string; age?: number | null }

export interface CareerVerdict {
  seasons: number;
  titles: number;
  bestOverall: number;
  topOrgName: string | null;
  topOrgLevel: number;
  bestSeasonRating: number;
  line: string;
  /** Chegou aos 40: pendurou o mouse e virou coach. */
  becameCoach?: boolean;
}

/** Um jogador do banco (ou que entrou no lugar de um titular): jovem evolui a cada temporada até o teto. */
export interface BenchPlayer { nick: string; role: PlayerRole; overall: number; potential: number; born: number; country: string | null }

export interface SquadPlan {
  orgId: string;
  /** Quem joga no lugar de quem: nick do titular original (minúsculo) → quem entrou. */
  lineup: Record<string, BenchPlayer>;
  /** O reserva no banco (um por time). */
  reserve: BenchPlayer | null;
  /** Funções trocadas a pedido do IGL: nick de quem joga (minúsculo) → função. */
  roles: Record<string, PlayerRole>;
  /** Janela em que o IGL já mexeu nas funções (uma vez por semana). */
  swapWindow?: string | null;
}

export interface SeatTaken { orgId: string; orgName: string; nick: string; viaRole: boolean; /** Temporada em que você tomou a vaga (saves antigos: sem). */ season?: number }

export interface StartingOption {
  orgId: string; // 'lan-house' ou id real da cena
  name: string;
  level: number;
  country: string | null;
  density: number;
  rosterPreview: string[];
  seat: SeatTaken | null; // vaga que você toma ao assinar (só nos times reais)
  kind: 'real' | 'lan-house';
}

export interface PlayerCareerState {
  version: 1;
  seed: string;
  nick: string;
  country: string;
  role: PlayerRole;
  archetype: PlayerArchetype;
  age: number;
  overall: number;
  truePotential: number;
  developmentRate: number;
  orgId: string; // 'lan-house' até o primeiro contrato
  /** True depois do primeiro sorteio consumido (mesmo quem ficou na lan house) — o sorteio nunca reabre. */
  drawDone: boolean;
  seasonNumber: number;
  year: number;
  history: SeasonLog[];
  calendar: CalendarEntry[] | null;
  liveEvent: LiveEventSave | null;
  pendingDraw: StartingOption[] | null;
  seatsTaken: SeatTaken[];
  pendingOffers: CareerOffer[] | null;
  /** Como jogar a temporada: todos ao vivo, 1 a cada 2 (o outro simulado) ou simular até a final. */
  playMode?: 'all' | 'every2' | 'finals';
  /** Moral 0-100 (60 = normal): puxa o Mental da sua carta pra cima ou pra baixo. */
  morale?: number;
  /** Forma −3..+3: vale só no próximo campeonato (overall em quadra) e zera depois dele. */
  form?: number;
  /** Seguidores (stream, vídeos, entrevistas, títulos e MVPs). */
  fame?: number;
  /** Cansaço 0-100: treino e bootcamp cansam, descanso recupera; cansado rende menos e se machuca mais. */
  fatigue?: number;
  /** Pancada leve por cansaço (vale até o próximo campeonato). */
  knock?: string | null;
  /** Conversas com o coach na janela atual (até 3) e o que ele indicou treinar. */
  coachTalk?: { window: string; count: number; tips: TrainedAttribute[]; /** Semana em que a dica foi dada. */ tipWindow?: string };
  /** Corte ou proposta esperando decisão (entre campeonatos). */
  pendingMove?: PendingMove | null;
  /** Trocas de time da temporada em andamento (vão para o SeasonLog). */
  seasonMoves?: string[];
  /** Fim de temporada ruim: a org não renova (sem "Ficar" na janela de mercado). */
  released?: boolean;
  /** Nível que os times ganharam ou perderam NESTA carreira (você carregou o time para cima, ou ele caiu). */
  orgLevels?: Record<string, number>;
  /** Treino de mapa do seu time (0-30 por mapa, soma no perfil de mapas da org) e a semana do último treino. */
  mapTraining?: Partial<Record<MapId, number>>;
  mapTrainedWindow?: string | null;
  /** Fluência nos idiomas que não são o seu (0-100); o inglês sem valor parte do nível típico do seu país. */
  languages?: Partial<Record<Language, number>>;
  /** Reputação 0-100 (imagem com times, imprensa e torcida; começa em 50). */
  reputation?: number;
  /** Caixa em US$: a sua parte das premiações e o que os acontecimentos dão ou custam. */
  money?: number;
  /** Acontecimento esperando a sua escolha (antes do jogo, depois do jogo ou na semana). */
  pendingHappening?: { id: string; trigger: 'pre' | 'post' | 'between'; eventIndex: number } | null;
  /** Quando cada acontecimento apareceu (contagem de campeonatos da carreira), para o cooldown. */
  happeningLog?: Record<string, number>;
  /** Troca de função: a de antes (o parceiro dela assume a sua antiga), a temporada e como foi a adaptação. */
  roleChange?: { from: PlayerRole; season: number; outcome: 'adapting' | 'good' | 'bad' } | null;
  /** Parceiros que saíram a seu pedido (por org): nick que saiu e o substituto que entrou. */
  kickedMates?: Record<string, Array<{ nick: string; replacement: string; delta: number }>>;
  /** Temporada em que você já pediu a saída de alguém (uma vez por temporada). */
  kickRequestedSeason?: number;
  /** As suas calls no round decisivo: leituras certas, razoáveis e erradas, rounds ganhos, por estilo. */
  decisions?: DecisionLog;
  /** Banco e escalação do seu time: o reserva, quem joga no lugar de quem e as funções trocadas pelo IGL. */
  squadPlan?: SquadPlan | null;
  /** Vida fora do servidor: Mental, saudade, adaptação, pressão, confiança do coach, condição física (saves antigos: padrão). */
  life?: CareerLife;
  /** Memória das conversas fora de partida (últimas 30, quem ficou atravessado, cooldown das falas). */
  talkMemory?: TalkMemory;
  /** Conversa esperando a sua resposta (clique em Conversar, início da temporada, antes ou depois do campeonato). */
  pendingTalk?: Talk | null;
  /** Temporada em que você já pediu para sair (uma vez por temporada). */
  transferRequestedSeason?: number;
  /** Times de call em inglês que te queriam no fim da temporada, mas o seu inglês ficou abaixo do exigido. */
  blockedOffers?: Array<{ orgName: string; need: number }>;
  /** Campeonatos que você passa no banco (aceitou perder a vaga num acontecimento): o substituto joga. */
  benchedEvents?: number;
  /** Provocação de rival esperando a sua resposta, e o rival do campeonato em curso (depois de responder). */
  pendingRival?: Rival | null;
  rival?: Rival | null;
  /** Campeonato que já sorteou o acontecimento de antes do jogo (não sorteia de novo ao continuar). */
  preRolled?: string | null;
  /** Relacionamento (0-100) com cada parceiro, por id estável (org:função) — sinergia do elenco. */
  relationships: Record<string, number>;
  /** Conversas desta janela entre campeonatos (zera quando um evento é jogado). */
  talks: Record<string, number>;
  /** Bônus acumulado de treino por atributo (aplicado por cima da carta derivada do overall). */
  trained: TrainedBonus;
  /** Janela (temporada:evento) do último treino — um treino por janela. */
  trainedWindow: string | null;
  /** Treinos feitos na carreira: a cada 3, overall +1 (se abaixo do teto). */
  trainCount: number;
  status: 'ACTIVE' | 'RETIRED';
  verdict: CareerVerdict | null;
}

const LAN_HOUSE = { id: 'lan-house', name: 'Lan House do Bairro', level: 5 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Campeonatos por temporada do nível (o meio da faixa; a temporada sorteia dentro dela). */
export const eventsFor = (orgId: string, state?: Pick<PlayerCareerState, 'orgLevels'> | null): number => {
  const [min, max] = EVENT_RANGE[orgOf(orgId, state).level] ?? [8, 10];
  return Math.round((min + max) / 2);
};

/** A faixa "9-12" para mostrar nas ofertas. */
export const eventsRangeFor = (orgId: string, state?: Pick<PlayerCareerState, 'orgLevels'> | null): string => {
  const [min, max] = EVENT_RANGE[orgOf(orgId, state).level] ?? [8, 10];
  return min === max ? `${min}` : `${min}-${max}`;
};

/** Os campeonatos reais do circuito do time, a partir de um mês (troca no meio da temporada). */
function calendarFor(state: PlayerCareerState, orgId: string, seed: string, count: number, fromIndex = 0, afterMonth = 0): CalendarEntry[] {
  const org = orgOf(orgId, state);
  const orgRegion = 'region' in org ? (org.region as Region | undefined) : undefined;
  const orgCountry = 'country' in org ? (org.country as string | null) : null;
  const region = orgRegion ?? regionOf(orgCountry ?? state.country);
  const events = seasonEvents(org.level, region, count, seed, state.year).filter((event) => event.month > afterMonth);
  return events.map((event, offset) => ({
    index: fromIndex + offset,
    name: `${event.name} ${state.year}`,
    status: 'UPCOMING' as const,
    month: event.month,
    tier: event.tier,
    format: event.format,
    finalBestOf: event.finalBestOf,
    ...(event.organizer ? { organizer: event.organizer } : {}),
    ...(event.location ? { location: event.location } : {}),
    ...(event.prizePool ? { prizePool: event.prizePool } : {})
  }));
}

/** Valor de mercado do jogador pela fórmula de valuation do jogo (dinastia): 50k×1.09^(ovr−60), piso 30k. */
export const marketValueUsd = (overall: number) => Math.max(30_000, Math.round((50_000 * Math.pow(1.09, overall - 60)) / 1000) * 1000);

/** Quem você desloca ao assinar: o jogador da SUA função no elenco real; sem função casada, o primeiro genérico. */
export function seatToTake(org: SceneOrg, role: PlayerRole): SeatTaken {
  // Função da coleta ou, se ela veio vazia, a do catálogo do jogo (ZywOo é AWPer mesmo sem role na Liquipedia).
  const byRole = org.roster.find((member) => memberRoles(member)[0] === role) ?? org.roster.find((member) => memberRoles(member).includes(role));
  const generic = org.roster.find((member) => !memberRoles(member).length);
  const chosen = byRole ?? generic ?? org.roster[0];
  return { orgId: org.id, orgName: org.name, nick: chosen ? memberNick(chosen) : 'a definir', viaRole: Boolean(byRole) };
}

/** Sorteio inicial: 3 orgs reais do nível CCT/GC (preferindo o país do jogador) + a opção Lan House. */
export function drawStartingOptions(seed: string, country: string, role: PlayerRole): StartingOption[] {
  const rng = createSeededRng(`${seed}:draw`);
  const level4 = sceneOrgs.filter((org) => org.level === 4);
  const sameCountry = level4.filter((org) => org.country?.toLowerCase() === country.toLowerCase());
  // Sem 3 times do seu país, completa com times mistos (nunca com time nacional de outro país).
  const pool = sameCountry.length >= 3 ? sameCountry : [...sameCountry, ...level4.filter((org) => !sameCountry.includes(org) && nationFits(org.roster, country))];
  const picked: SceneOrg[] = [];
  while (picked.length < 3 && picked.length < pool.length) {
    const candidate = pool[Math.floor(rng() * pool.length)];
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  const options: StartingOption[] = picked.map((org) => ({
    orgId: org.id,
    name: org.name,
    level: org.level,
    country: org.country,
    density: eventsFor(org.id),
    rosterPreview: org.roster.slice(0, 5).map((member) => memberNick(member)),
    seat: seatToTake(org, role),
    kind: 'real'
  }));
  options.push({
    orgId: LAN_HOUSE.id,
    name: LAN_HOUSE.name,
    level: LAN_HOUSE.level,
    country: country,
    density: eventsFor(LAN_HOUSE.id),
    rosterPreview: [],
    seat: null,
    kind: 'lan-house'
  });
  return options;
}

export function createPlayerCareer(input: { nick: string; country: string; role: PlayerRole; archetype?: PlayerArchetype; seed?: string }): PlayerCareerState {
  const seed = input.seed ?? `pc-${Date.now().toString(36)}`;
  const rng = createSeededRng(`${seed}:create`);
  const archetype = input.archetype ?? 'prodigio';
  const meta = ARCHETYPES[archetype];
  const roll = ([min, max]: [number, number]) => min + Math.floor(rng() * (max - min + 1));
  const rollFraction = ([min, max]: [number, number]) => min + rng() * (max - min);
  return {
    version: 1,
    seed,
    nick: input.nick.trim().slice(0, 16) || randomNick(seed), // campo vazio: um nick sorteado
    country: input.country,
    role: input.role,
    archetype,
    age: roll(meta.entryAge),
    overall: roll(meta.startOverall), // ninguém nasce pronto; o arquétipo define o começo
    truePotential: roll(meta.potential), // o teto é oculto e a carreira revela
    developmentRate: Number(rollFraction(meta.devRate).toFixed(2)),
    orgId: LAN_HOUSE.id,
    drawDone: false,
    seasonNumber: 1,
    year: 2026,
    history: [],
    calendar: null,
    liveEvent: null,
    pendingDraw: drawStartingOptions(seed, input.country, input.role),
    seatsTaken: [],
    relationships: {},
    talks: {},
    trained: {},
    trainedWindow: null,
    trainCount: 0,
    morale: 60,
    form: 0,
    fame: 0,
    fatigue: 0,
    pendingOffers: null,
    status: 'ACTIVE',
    verdict: null
  };
}

/** Assina com uma das opções do sorteio (ou fica na lan house) e toma a vaga da sua função. */
export function chooseStartingOrg(state: PlayerCareerState, orgId: string): PlayerCareerState {
  const option = state.pendingDraw?.find((candidate) => candidate.orgId === orgId);
  if (!option) return state;
  return {
    ...state,
    orgId: option.orgId,
    pendingDraw: null,
    drawDone: true,
    seatsTaken: option.seat ? [option.seat] : []
  };
}

/** Saves antigos (sem sorteio) voltam ao sorteio apenas se a carreira de fato não começou — assinado,
 *  com temporada aberta ou evento em andamento NUNCA reabre o sorteio (o reload não apaga a escolha). */
export function ensureDraw(state: PlayerCareerState): PlayerCareerState {
  // Sorteio pendente junto de temporada/evento/histórico é resíduo do bug do reload: a escolha já foi feita.
  if (state.pendingDraw && (state.calendar || state.liveEvent || state.history.length)) {
    return { ...state, pendingDraw: null };
  }
  if (state.pendingDraw || state.history.length || state.status !== 'ACTIVE') return state;
  if (state.drawDone || state.calendar || state.liveEvent || state.seatsTaken.length) return state;
  return { ...state, pendingDraw: drawStartingOptions(state.seed, state.country, state.role) };
}

const baseOrgOf = (orgId: string) => (orgId === LAN_HOUSE.id ? LAN_HOUSE : sceneOrgById.get(orgId) ?? { id: orgId, name: orgId, level: 5 });

/** A org com o nível desta carreira: quem foi promovido (ou rebaixado) joga o circuito do nível novo. */
export function orgOf(orgId: string, state?: Pick<PlayerCareerState, 'orgLevels'> | null) {
  const base = baseOrgOf(orgId);
  const level = state?.orgLevels?.[orgId];
  if (level === undefined || level === base.level) return base;
  // A força acompanha o degrau: subiu, pelo menos o piso do nível novo; caiu, no máximo o teto do de baixo.
  const power = 'power' in base && typeof base.power === 'number' ? base.power : ORG_BASE_POWER[base.level] ?? 60;
  const floor = ORG_BASE_POWER[level] ?? power;
  return { ...base, level, power: level < base.level ? Math.max(power, floor) : Math.min(power, floor + 3) };
}

/** O nível de um time da cena nesta carreira (para filtrar ofertas e rivais). */
export const levelIn = (state: Pick<PlayerCareerState, 'orgLevels'> | null | undefined, org: { id: string; level: number }) => state?.orgLevels?.[org.id] ?? org.level;

/**
 * O time sobe ou cai de tier pela temporada que fez (a Carreira do EA FC com acesso e rebaixamento):
 * CCT/GC sobe com 3 títulos (ou 2 e final em metade dos eventos); Challenger com 3 títulos e final em metade;
 * o Tier 2 precisa de 4 títulos (ou 3 e finais); o Tier 1 só vira Tier S com 4 títulos ou final de Major.
 * Temporada inteira sem semifinal derruba um degrau.
 */
export function orgLevelChange(level: number, results: TournamentResult[]): number {
  if (level >= 5) return level;
  const played = results.filter((result) => !result.skipped);
  if (played.length < 4) return level;
  const titles = played.filter((result) => result.placement === 'Campeão').length;
  const finals = played.filter((result) => result.placement === 'Campeão' || result.placement === 'Vice').length;
  const majorFinal = played.some((result) => result.tier === 'Major' && (result.placement === 'Campeão' || result.placement === 'Vice'));
  const half = Math.ceil(played.length / 2);
  const up = level === 4 ? titles >= 3 || (titles >= 2 && finals >= half)
    : level === 3 ? titles >= 3 && finals >= half
    : level === 2 ? titles >= 4 || (titles >= 3 && finals >= half)
    : level === 1 ? titles >= 4 || majorFinal
    : false;
  if (up) return level - 1;
  const deep = played.filter((result) => ['Campeão', 'Vice', 'Semis'].includes(result.placement)).length;
  if (deep === 0 && level < 4) return level + 1;
  return level;
}

/** Abre a temporada: os campeonatos reais do circuito do nível, em ordem de mês, cada um no motor de Major. */
export function startSeason(state: PlayerCareerState): PlayerCareerState {
  if (state.status !== 'ACTIVE' || state.pendingDraw || state.calendar) return state;
  const seed = `${state.seed}:season:${state.seasonNumber}:${state.orgId}`;
  const count = eventCount(orgOf(state.orgId, state).level, seed);
  return { ...state, calendar: calendarFor(state, state.orgId, seed, count) };
}

/** Registra o resultado de um campeonato jogado no motor (rating vem do kill feed real). */
/** Premiação de referência quando o catálogo não traz a do evento (regionais, qualificatórias, lan house). */
const DEFAULT_POOL: Record<string, number> = { Major: 1250000, S: 1000000, A: 60000, B: 20000, C: 4000 };
const PRIZE_SHARE: Record<string, number> = { 'Campeão': 0.4, Vice: 0.16, Semis: 0.08, Quartas: 0.04, 'Fase suíça': 0.02, 'Stage 1': 0.01, 'Stage 2': 0.015 };

/** A sua parte do prêmio (a do time dividida por 5). Lan house paga só o simbólico. */
export function prizeShare(entry: Pick<CalendarEntry, 'prizePool' | 'tier'> | undefined, placement: string, orgId: string): number {
  const pool = entry?.prizePool ?? DEFAULT_POOL[entry?.tier ?? 'C'] ?? 4000;
  const scaled = orgId === LAN_HOUSE.id ? Math.min(pool, 1000) : pool;
  return Math.round((scaled * (PRIZE_SHARE[placement] ?? 0)) / 5);
}

/** Quantos campeonatos a carreira já jogou (o relógio do cooldown dos acontecimentos). */
export const playedCount = (state: Pick<PlayerCareerState, 'history' | 'calendar'>) =>
  state.history.reduce((sum, log) => sum + log.tournaments.length, 0) + (state.calendar ?? []).filter((entry) => entry.status === 'PLAYED').length;

export function recordEventResult(state: PlayerCareerState, index: number, result: TournamentResult): PlayerCareerState {
  if (!state.calendar) return state;
  const entry = state.calendar.find((candidate) => candidate.index === index);
  const calendar = state.calendar.map((candidate) => (candidate.index === index ? { ...candidate, status: 'PLAYED' as const, result } : candidate));
  // Campeonato jogado: a janela de conversas fecha, o treino libera de novo.
  // A forma da semana valia só para este campeonato. A premiação cai no caixa.
  const prize = result.skipped ? 0 : prizeShare(entry, result.placement, state.orgId);
  const benchedEvents = result.benched ? Math.max(0, (state.benchedEvents ?? 0) - 1) : state.benchedEvents;
  return { ...state, calendar, liveEvent: null, talks: {}, form: 0, knock: null, money: (state.money ?? 0) + prize, ...(benchedEvents !== undefined ? { benchedEvents } : {}) };
}

/** Fecha a temporada: lesão, aging calibrado e janela de mercado. */
/** Idade limite de jogador: aos 40, pendura o mouse e vira coach. */
export const MAX_CAREER_AGE = 40;

/**
 * Declínio de veterano por temporada. A curva real do catálogo tem amostra boa até ~29 anos; depois quase não há
 * jogador para medir e a média oscila. Aqui o desgaste é explícito: −1 aos 29-30, −2 aos 31-33, −3 dos 34 em diante.
 */
export const ageDecline = (age: number): number => (age >= 34 ? 3 : age >= 31 ? 2 : age >= 29 ? 1 : 0);

/** Quanto mais velho, mais lesão: 6% até os 24, +2,5 pontos por ano depois, até 45%. */
export const injuryChance = (age: number): number => Math.min(0.45, 0.06 + Math.max(0, age - 24) * 0.025);

/** Fase da carreira pela idade (pico real do catálogo: mediana 23, p90 27). */
export function agePhase(age: number): { label: string; detail: string } {
  if (age <= 21) return { label: 'Em formação', detail: 'Sobe rápido se jogar bem.' };
  if (age <= 26) return { label: 'Auge', detail: 'Melhor fase da carreira.' };
  if (age <= 28) return { label: 'Experiente', detail: 'Parou de crescer. Segura o nível.' };
  const next = ageDecline(age + 1);
  return { label: age <= 33 ? 'Veterano' : 'Fim de carreira', detail: `Perde ${next} de overall por temporada. Limite: ${MAX_CAREER_AGE}.` };
}

const INJURIES_YOUNG = ['Tendinite no punho', 'Lombalgia'];
const INJURIES_OLD = ['Tendinite crônica no punho', 'Hérnia de disco', 'Lesão no ombro', 'Dor nas costas'];

/** Na virada da temporada o jovem do banco (ou que entrou no time) cresce até o teto; quem passou dos 24 fica como está. */
function growBench(plan: SquadPlan | null | undefined, year: number, rng: () => number): SquadPlan | null | undefined {
  if (!plan) return plan;
  const grow = (player: BenchPlayer): BenchPlayer => (year - player.born < 24 && player.overall < player.potential
    ? { ...player, overall: Math.min(player.potential, player.overall + 2 + Math.floor(rng() * 2)) }
    : player);
  return { ...plan, reserve: plan.reserve ? grow(plan.reserve) : null, lineup: Object.fromEntries(Object.entries(plan.lineup).map(([key, player]) => [key, grow(player)])) };
}

export function finishSeason(state: PlayerCareerState): PlayerCareerState {
  if (state.status !== 'ACTIVE' || !state.calendar || state.calendar.some((entry) => entry.status !== 'PLAYED')) return state;
  const rng = createSeededRng(`${state.seed}:season:${state.seasonNumber}`);
  const org = orgOf(state.orgId, state);
  const results = state.calendar.flatMap((entry) => (entry.result && !entry.result.skipped ? [entry.result] : []));
  const titles = results.filter((result) => result.placement === 'Campeão').length;
  const seasonRating = results.length ? Number((results.reduce((sum, result) => sum + result.rating, 0) / results.length).toFixed(2)) : 0.9;

  // Lesão: a chance e o peso sobem com a idade.
  const injured = rng() < Math.min(0.6, injuryChance(state.age) + (state.fatigue ?? 0) / 250);
  const injuryPool = state.age >= 30 ? INJURIES_OLD : INJURIES_YOUNG;
  const injury = injured ? injuryPool[Math.floor(rng() * injuryPool.length)] : null;
  const injuryWeight = injured ? 0.03 + 0.012 * Math.max(0, state.age - 27) : 0;

  const before = state.overall;
  const aged = applyAging({
    entity: { id: `${state.seed}:me`, age: state.age, overall: state.overall, truePotential: state.truePotential, developmentRate: state.developmentRate, runRating: seasonRating - injuryWeight },
    calibration,
    seasonKey: `${state.seed}:season:${state.seasonNumber}`
  });
  // O sorteio de aposentadoria do motor de idade vira AVISO (o corpo pede para parar); quem decide é você.
  const retireHint = aged.retired;
  const decline = ageDecline(aged.entity.age) + (injured && state.age >= 30 ? 1 : 0);
  const finalOverall = Math.max(40, Math.min(99, aged.entity.overall - decline));
  const agingNote = finalOverall > before ? `Evoluiu para ${finalOverall} de overall`
    : finalOverall < before ? `Caiu para ${finalOverall} de overall`
    : 'Manteve o nível';

  const log: SeasonLog = {
    seasonNumber: state.seasonNumber,
    year: state.year,
    orgId: org.id,
    orgName: org.name,
    orgLevel: org.level,
    tournaments: results,
    seasonRating,
    overallBefore: before,
    overallAfter: finalOverall,
    titles,
    injury,
    agingNote,
    age: aged.entity.age,
    ageDecline: decline,
    retireHint,
    ...(state.seasonMoves?.length ? { moves: state.seasonMoves } : {})
  };
  // Prêmios da temporada: Top 20 HLTV e Rookie of the Year (estreia em Major).
  const awards = seasonAwards(state, org.level, org.name);
  log.hltvTop = awards.hltvTop;
  log.hltvRank = awards.hltvRank;
  log.rookie = awards.rookie;
  log.rookieEligible = awards.rookieEligible;
  // Acesso e rebaixamento do seu time pela temporada (quem acabou de chegar por troca também conta).
  const newLevel = org.id === LAN_HOUSE.id ? org.level : orgLevelChange(org.level, results);
  if (newLevel !== org.level) log.orgChange = { from: org.level, to: newLevel };
  const orgLevels = newLevel !== org.level ? { ...(state.orgLevels ?? {}), [org.id]: newLevel } : state.orgLevels;
  const promotedState = orgLevels === state.orgLevels ? state : { ...state, orgLevels };

  // O mercado olha a temporada no nível em que ela foi jogada (a promoção vale para a próxima).
  const blockedOffers: Array<{ orgName: string; need: number }> = [];
  const offers = buildOffers(state, seasonRating, titles, rng, blockedOffers);
  // Temporada ruim sem título numa org real: não renovam. Sem "Ficar"; sobram as ofertas ou a Lan House.
  const released = org.id !== LAN_HOUSE.id && titles === 0 && seasonRating < decentRatingFor(state.role, org.level) - 0.12;
  const next: PlayerCareerState = {
    ...promotedState,
    // Férias na virada da temporada: sobra só um quinto do cansaço.
    fatigue: Math.round((state.fatigue ?? 0) * 0.2),
    squadPlan: growBench(state.squadPlan, state.year + 1, rng),
    age: aged.entity.age,
    overall: finalOverall,
    seasonNumber: state.seasonNumber + 1,
    year: state.year + 1,
    history: [...state.history, log],
    calendar: null,
    pendingOffers: offers.length ? offers : released ? [] : null,
    blockedOffers,
    pendingMove: null,
    seasonMoves: [],
    released
  };
  // Aos 40 a carreira de jogador acaba: pendura o mouse e vira coach.
  return next.age >= MAX_CAREER_AGE ? retire(next, { coach: true }) : next;
}

function offerFrom(candidate: SceneOrg, state: PlayerCareerState, bump = 0): CareerOffer {
  const level = levelIn(state, candidate);
  return {
    orgId: candidate.id,
    orgName: candidate.name,
    orgLevel: level,
    salaryUsd: Math.round(Math.max(400, marketValueUsd(state.overall) * (0.08 + level * 0.02) * (1 + bump)))
  };
}

/** Rating esperado no nível: sobe com o circuito e acompanha o viés da função (entry/IGL rendem menos). */
export const decentRatingFor = (role: PlayerRole, level: number) => (({ 0: 0.98, 1: 0.97, 2: 0.95, 3: 0.93, 4: 0.90, 5: 0.90 })[level] ?? 0.93) + ROLE_META[role].ratingBias;
/** Régua de estrela para subir ao nível: degrau por degrau, a porta do tier 1 é a mais dura. */
export const starRatingFor = (role: PlayerRole, targetLevel: number) => (({ 4: 1.0, 3: 1.06, 2: 1.12, 1: 1.18, 0: 1.25 })[targetLevel] ?? 1.12) + ROLE_META[role].ratingBias;

/** Inglês mínimo para assinar com time de call em inglês: Tier S 55, Tier 1 50, Tier 2 40 (abaixo, ninguém exige). */
export const ENGLISH_REQUIRED: Record<number, number> = { 0: 55, 1: 50, 2: 40 };

/** Quanto de inglês o time exige de você (null: não exige ou você já tem). */
export function englishGate(state: PlayerCareerState, candidate: SceneOrg): number | null {
  const need = ENGLISH_REQUIRED[levelIn(state, candidate)];
  if (!need || teamLanguage(resolvedRoster(candidate)) !== 'en') return null;
  return myFluency(state, 'en') >= need ? null : need;
}

function buildOffers(state: PlayerCareerState, seasonRating: number, titles: number, rng: () => number, blocked: Array<{ orgName: string; need: number }> = []): CareerOffer[] {
  const org = orgOf(state.orgId, state);
  const isLanHouse = org.id === LAN_HOUSE.id;
  const decentFor = (level: number) => decentRatingFor(state.role, level);
  const decent = seasonRating >= decentFor(org.level) || titles >= 1;
  // A subida é DEGRAU por degrau e a régua cresce E acompanha a função (1.15 de entry ≠ 1.15 de AWPer).
  // A porta do tier 1 (2→1) é a mais dura: só pico alto sustenta a régua — lógica de VRS/ambiência.
  const starBarFor = (targetLevel: number) => starRatingFor(state.role, targetLevel);
  const offers: CareerOffer[] = [];
  const takeFrom = (all: SceneOrg[], bump = 0, tries = 4) => {
    // Time nacional de outro país não contrata você (MongolZ joga com mongóis). O mundo preserva o país nas trocas.
    const pool = all.filter((candidate) => nationFits(candidate.roster, state.country));
    for (let i = 0; i < tries && offers.length < 3; i += 1) {
      const candidate = pool[Math.floor(rng() * pool.length)];
      if (!candidate || candidate.id === org.id || offers.some((offer) => offer.orgId === candidate.id)) continue;
      // Time de call em inglês exige o idioma: abaixo do mínimo, a proposta não sai (e você fica sabendo).
      const need = englishGate(state, candidate);
      if (need) {
        if (!blocked.some((entry) => entry.orgName === candidate.name)) blocked.push({ orgName: candidate.name, need });
        continue;
      }
      offers.push(offerFrom(candidate, state, bump));
    }
  };

  if (isLanHouse) {
    // Caminho pra fora do circuito amador: brilhou na lan house → CCT/GC assina.
    if (titles >= 1 || seasonRating >= starBarFor(4)) takeFrom(sceneOrgs.filter((candidate) => levelIn(state, candidate) === 4), 0.04, 6);
    return offers;
  }
  const target = org.level - 1;
  const upgrades = target >= 0 ? sceneOrgs.filter((candidate) => levelIn(state, candidate) === target) : [];
  const laterals = sceneOrgs.filter((candidate) => levelIn(state, candidate) === org.level && candidate.id !== org.id);
  const downgrades = sceneOrgs.filter((candidate) => levelIn(state, candidate) > org.level && levelIn(state, candidate) <= 4);
  // Título abre a porta de saída do C/B (campeão de CCT chama atenção); acima disso, só a régua de rating.
  const starred = seasonRating >= starBarFor(target) || (org.level >= 3 && titles >= 3);
  if (starred) takeFrom(upgrades, 0.04, 6);
  if (decent || starred) takeFrom(laterals, 0, 3);
  if (seasonRating < decentFor(org.level) - 0.08) takeFrom(downgrades, 0, 2); // ano ruim: porta de saída pra não travar.
  return offers;}

export function acceptOffer(state: PlayerCareerState, orgId: string): PlayerCareerState {
  const offer = state.pendingOffers?.find((candidate) => candidate.orgId === orgId);
  if (!offer) return state;
  // A vaga é de quem está no time NESTA temporada (o mundo também troca jogadores).
  const org = orgIn(state.seed, state.seasonNumber, orgId);
  const seat = org ? { ...seatToTake(org, state.role), season: state.seasonNumber } : null;
  return { ...state, orgId, pendingOffers: null, ...(seat ? { seatsTaken: [...state.seatsTaken, seat] } : {}) };
}

export function stayAtOrg(state: PlayerCareerState): PlayerCareerState {
  if (state.released) return state;
  return { ...state, pendingOffers: null };
}

/** Dispensado (ou por escolha): volta a grindar na lan house. */
export function goToLanHouse(state: PlayerCareerState): PlayerCareerState {
  const from = orgOf(state.orgId).name;
  return { ...state, orgId: LAN_HOUSE.id, pendingOffers: null, released: false, seasonMoves: [...(state.seasonMoves ?? []), `${from} → Lan House`] };
}

/** Média dos últimos campeonatos jogados na temporada (os mais recentes pesam a decisão do time). */
export function recentRating(state: PlayerCareerState, last = 3): { average: number; played: number } | null {
  const played = (state.calendar ?? []).filter((entry) => entry.result && !entry.result.skipped);
  if (!played.length) return null;
  const recent = played.slice(-last);
  return { average: Number((recent.reduce((sum, entry) => sum + (entry.result?.rating ?? 0), 0) / recent.length).toFixed(2)), played: played.length };
}

/**
 * Depois de cada campeonato (com mais pela frente): o time pode te cortar se a fase está ruim e o clima pesa,
 * e um time de cima pode te chamar se você está voando. Seeded: a mesma carreira, a mesma decisão.
 */
export function midSeasonCheck(state: PlayerCareerState, relationshipAverage = 55): PlayerCareerState {
  const org = orgOf(state.orgId, state);
  if (state.status !== 'ACTIVE' || state.pendingMove || org.id === LAN_HOUSE.id || !state.calendar) return state;
  if (!state.calendar.some((entry) => entry.status === 'UPCOMING')) return state;
  const recent = recentRating(state);
  if (!recent || recent.played < 2) return state;
  const rng = createSeededRng(`${state.seed}:move:${state.seasonNumber}:${recent.played}`);
  const decent = decentRatingFor(state.role, org.level);
  const pickFrom = (all: SceneOrg[], count: number, bump: number): CareerOffer[] => {
    // Time nacional de outro país não contrata você (MongolZ joga com mongóis). O mundo preserva o país nas trocas.
    const pool = all.filter((candidate) => nationFits(candidate.roster, state.country));
    const offers: CareerOffer[] = [];
    for (let tries = 0; tries < count * 3 && offers.length < count; tries += 1) {
      const candidate = pool[Math.floor(rng() * pool.length)];
      if (!candidate || candidate.id === org.id || offers.some((offer) => offer.orgId === candidate.id)) continue;
      if (englishGate(state, candidate)) continue;
      offers.push(offerFrom(candidate, state, bump));
    }
    return offers;
  };
  const morale = state.morale ?? 60;
  const struggling = recent.average < decent - 0.10;
  const tense = morale < 50 || relationshipAverage < 45 || recent.average < decent - 0.18;
  if (struggling && tense && rng() < 0.55) {
    const laterals = sceneOrgs.filter((candidate) => levelIn(state, candidate) === org.level && candidate.id !== org.id);
    const lower = sceneOrgs.filter((candidate) => levelIn(state, candidate) > org.level && levelIn(state, candidate) <= 4);
    const offers = [...pickFrom(laterals, 1, -0.05), ...pickFrom(lower.length ? lower : laterals, 2, 0)];
    return {
      ...state,
      pendingMove: {
        kind: 'cut',
        average: recent.average,
        reason: `Média ${recent.average.toFixed(2)} nos últimos ${Math.min(3, recent.played)} campeonatos. O ${org.name} esperava ${decent.toFixed(2)}.`,
        offers
      }
    };
  }
  const target = org.level - 1;
  if (target >= 0 && recent.average >= starRatingFor(state.role, target) && rng() < 0.4) {
    const offers = pickFrom(sceneOrgs.filter((candidate) => levelIn(state, candidate) === target), 1, 0.06);
    if (offers.length) {
      return {
        ...state,
        pendingMove: {
          kind: 'poach',
          average: recent.average,
          reason: `Média ${recent.average.toFixed(2)} nos últimos ${Math.min(3, recent.played)} campeonatos chamou atenção.`,
          offers
        }
      };
    }
  }
  return state;
}

/** Troca de time no meio da temporada: os jogados ficam, os que faltam viram o calendário da org nova. */
function moveMidSeason(state: PlayerCareerState, orgId: string, note: string): PlayerCareerState {
  const calendar = state.calendar ?? [];
  const played = calendar.filter((entry) => entry.status === 'PLAYED');
  // O time novo segue o circuito dele dali em diante (só os meses que ainda faltam).
  const lastMonth = Math.max(0, ...played.map((entry) => entry.month ?? 0));
  const seed = `${state.seed}:season:${state.seasonNumber}:${orgId}`;
  // Só os meses que faltam; se a troca é no fim do ano, a temporada acaba com o que já foi jogado (antes, um
  // "campeonato extra" de elite trazia os 2 Majors de novo: a temporada com 4 Majors).
  const playedMajors = played.filter((entry) => entry.format === 'major').length;
  const next = calendarFor(state, orgId, seed, eventCount(orgOf(orgId, state).level, seed), played.length, lastMonth)
    .filter((entry, index, list) => entry.format !== 'major' || playedMajors + list.slice(0, index + 1).filter((other) => other.format === 'major').length <= 2)
    .map((entry, offset) => ({ ...entry, index: played.length + offset }));
  const target = orgIn(state.seed, state.seasonNumber, orgId);
  const seat = target ? { ...seatToTake(target, state.role), season: state.seasonNumber } : null;
  return {
    ...state,
    orgId,
    calendar: [...played, ...next],
    liveEvent: null,
    pendingMove: null,
    seasonMoves: [...(state.seasonMoves ?? []), note],
    ...(seat ? { seatsTaken: [...state.seatsTaken, seat] } : {})
  };
}

/** Aceita a oferta do corte/proposta (ou 'lan-house' quando cortado). */
export function acceptMove(state: PlayerCareerState, orgId: string): PlayerCareerState {
  const move = state.pendingMove;
  if (!move) return state;
  const from = orgOf(state.orgId).name;
  if (orgId === LAN_HOUSE.id) {
    if (move.kind !== 'cut') return state;
    return moveMidSeason(state, LAN_HOUSE.id, `Cortado do ${from} → Lan House`);
  }
  const offer = move.offers.find((candidate) => candidate.orgId === orgId);
  if (!offer) return state;
  return moveMidSeason(state, orgId, `${move.kind === 'cut' ? 'Cortado do' : 'Saiu do'} ${from} → ${offer.orgName}`);
}

/** Recusa a proposta de um time de cima: o elenco atual gosta (moral +4). Corte não dá pra recusar. */
export function declineMove(state: PlayerCareerState): PlayerCareerState {
  if (!state.pendingMove || state.pendingMove.kind === 'cut') return state;
  // Pediu para sair e desistiu: fica, sem o bônus de moral de quem recusou proposta.
  if (state.pendingMove.kind === 'request') return { ...state, pendingMove: null };
  return { ...state, pendingMove: null, morale: Math.min(100, (state.morale ?? 60) + 4) };
}

/** Pode pedir para sair agora? (time de verdade, temporada em andamento, uma vez por temporada) */
export function canRequestTransfer(state: PlayerCareerState): boolean {
  return state.status === 'ACTIVE' && state.orgId !== LAN_HOUSE.id && !state.pendingMove && state.transferRequestedSeason !== state.seasonNumber
    && Boolean(state.calendar?.some((entry) => entry.status === 'UPCOMING'));
}

/**
 * Você pede para sair (ambição, querer ser maior): o agente procura times do mesmo nível e, se você está bem,
 * de um acima. O elenco não gosta (moral −4, relação −6 com os parceiros, reputação −2). Sem proposta, você fica
 * com o clima pior. Uma vez por temporada.
 */
export function requestTransfer(state: PlayerCareerState, relationships: Record<string, number> = state.relationships): PlayerCareerState {
  if (!canRequestTransfer(state)) return state;
  const org = orgOf(state.orgId, state);
  const rng = createSeededRng(`${state.seed}:request:${state.seasonNumber}:${playedCount(state)}`);
  const recent = recentRating(state);
  const good = (recent?.average ?? 1) >= decentRatingFor(state.role, org.level) + 0.05 || state.overall >= 80;
  const pool = (level: number) => sceneOrgs.filter((candidate) => candidate.id !== org.id && levelIn(state, candidate) === level && nationFits(candidate.roster, state.country) && !englishGate(state, candidate));
  const offers: CareerOffer[] = [];
  const take = (candidates: SceneOrg[], count: number, bump: number) => {
    for (let tries = 0; tries < count * 4 && offers.length < 3; tries += 1) {
      const candidate = candidates[Math.floor(rng() * candidates.length)];
      if (!candidate || offers.some((offer) => offer.orgId === candidate.id)) continue;
      offers.push(offerFrom(candidate, state, bump));
      if (offers.length >= count) break;
    }
  };
  if (good && org.level > 0) take(pool(org.level - 1), 1, 0.04);
  take(pool(org.level), good ? 2 : 1, 0);
  const cooled = Object.fromEntries(Object.entries(relationships).map(([id, value]) => [id, Math.max(0, value - 6)]));
  const base: PlayerCareerState = {
    ...state,
    transferRequestedSeason: state.seasonNumber,
    morale: Math.max(0, (state.morale ?? 60) - 4),
    reputation: Math.max(0, (state.reputation ?? 50) - 2),
    relationships: cooled
  };
  const reason = offers.length
    ? `Você pediu para sair do ${org.name}. O agente achou ${offers.length} interessado${offers.length > 1 ? 's' : ''}.`
    : `Você pediu para sair do ${org.name}, mas ninguém fez proposta agora. O clima no time ficou pesado.`;
  return { ...base, pendingMove: { kind: 'request', average: recent?.average ?? 0, reason, offers } };
}

/** O time abre mão de um campeonato (folga, rodízio, recusa): fica no calendário como "Folga", sem prêmio e sem
 *  contar no rating, e o cansaço cai 25. Major não se pula. `preferIndex`: o campeonato que estava para começar. */
export function skipEvent(state: PlayerCareerState, preferIndex?: number): { state: PlayerCareerState; name: string | null } {
  const calendar = state.calendar ?? [];
  const open = calendar.filter((entry) => entry.status === 'UPCOMING' && entry.format !== 'major' && entry.tier !== 'Major');
  const entry = open.find((candidate) => candidate.index === preferIndex) ?? open[0];
  if (!entry) return { state, name: null };
  const result: TournamentResult = { name: entry.name, placement: 'Folga', rating: 0, seriesWins: 0, seriesLosses: 0, skipped: true, ...(entry.tier ? { tier: entry.tier } : {}) };
  return {
    state: { ...state, calendar: calendar.map((candidate) => (candidate === entry ? { ...candidate, status: 'PLAYED' as const, result } : candidate)), fatigue: Math.max(0, (state.fatigue ?? 0) - 25) },
    name: entry.name
  };
}

/** Mais um campeonato na temporada ("aceitar todos os eventos"): um do circuito do seu nível que ainda não está no
 *  calendário, no fim do ano. Cansa mais, mas é mais uma chance de título. */
export function addExtraEvent(state: PlayerCareerState): { state: PlayerCareerState; name: string | null } {
  const calendar = state.calendar ?? [];
  if (!calendar.length) return { state, name: null };
  const extra = calendarFor(state, state.orgId, `${state.seed}:extra:${state.seasonNumber}:${calendar.length}`, 12, calendar.length)
    .find((entry) => entry.format !== 'major' && entry.tier !== 'Major' && !calendar.some((other) => other.name === entry.name));
  if (!extra) return { state, name: null };
  const lastMonth = Math.max(0, ...calendar.map((entry) => entry.month ?? 0));
  const entry: CalendarEntry = { ...extra, index: calendar.length, month: Math.min(12, Math.max(lastMonth, extra.month ?? lastMonth)) };
  return { state: { ...state, calendar: [...calendar, entry] }, name: entry.name };
}

/** Proposta que nasce de um acontecimento ("aceitar a proposta em dólar", "salário recorde", "outra região"): vira
 *  oferta de verdade na tela de mercado, que você aceita ou recusa. `up`: um degrau acima (ou o topo); `region`: mesmo
 *  nível em outra região. */
export function happeningOffers(state: PlayerCareerState, kind: 'up' | 'region', reason: string): PlayerCareerState {
  if (state.status !== 'ACTIVE' || state.pendingMove || state.orgId === LAN_HOUSE.id) return state;
  const org = orgOf(state.orgId, state);
  const region = 'region' in org ? (org as SceneOrg).region : undefined;
  const rng = createSeededRng(`${state.seed}:happening-offer:${state.seasonNumber}:${playedCount(state)}:${kind}`);
  const target = kind === 'up' ? Math.max(0, org.level - 1) : org.level;
  const pool = sceneOrgs.filter((candidate) => candidate.id !== org.id && levelIn(state, candidate) === target && nationFits(candidate.roster, state.country)
    && !englishGate(state, candidate) && (kind === 'region' ? candidate.region !== region : true));
  const offers: CareerOffer[] = [];
  for (let tries = 0; tries < 12 && offers.length < 2; tries += 1) {
    const candidate = pool[Math.floor(rng() * pool.length)];
    if (candidate && !offers.some((offer) => offer.orgId === candidate.id)) offers.push(offerFrom(candidate, state, kind === 'up' ? 0.04 : 0.02));
  }
  if (!offers.length) return state;
  return { ...state, pendingMove: { kind: 'poach', average: recentRating(state)?.average ?? 0, reason, offers } };
}

export function retire(state: PlayerCareerState, options: { coach?: boolean } = {}): PlayerCareerState {
  if (state.status === 'RETIRED') return state;
  const best = state.history.reduce((acc, log) => (log.seasonRating > acc ? log.seasonRating : acc), 0);
  const topLog = state.history.reduce<SeasonLog | null>((acc, log) => (!acc || log.orgLevel < acc.orgLevel ? log : acc), null);
  const titles = state.history.reduce((sum, log) => sum + log.titles, 0);
  const bestOverall = Math.max(state.overall, ...state.history.map((log) => log.overallAfter));
  const career = topLog && topLog.orgLevel <= 1
    ? 'Do lan house ao Major: carreira de filme.'
    : topLog && topLog.orgLevel <= 2 ? 'Chegou ao tier 2 e deixou nome.' : topLog && topLog.orgLevel <= 3 ? 'Carreira sólida no circuito challenger.' : 'Guerreiro do circuito. O bairro se lembra.';
  const line = options.coach ? `Aos ${state.age}, pendurou o mouse e virou coach. ${career}` : career;
  return {
    ...state,
    status: 'RETIRED',
    pendingOffers: null,
    verdict: { seasons: state.history.length, titles, bestOverall, topOrgName: topLog?.orgName ?? null, topOrgLevel: topLog?.orgLevel ?? 9, bestSeasonRating: best, line, ...(options.coach ? { becameCoach: true } : {}) }
  };
}

/** Elenco da org envelhecido deterministicamente até a temporada atual (para exibir o mundo girando). */
export function agedRosterPreview(orgId: string, seasons: number): Array<{ nick: string; age: number | null; overall: number | null }> {
  const org = sceneOrgById.get(orgId);
  if (!org) return [];
  const entities: AgingEntity[] = org.roster
    .filter((member) => member.birthDate)
    .map((member) => ({
      id: member.nick,
      age: 2026 - Number(member.birthDate!.slice(0, 4)),
      overall: ORG_BASE_POWER[org.level] ?? 60
    }));
  let current = entities;
  for (let season = 1; season <= seasons; season += 1) {
    const result = advanceRosterLight(current, `${org.id}:season:${season}`);
    current = result;
  }
  return current.map((entity) => ({ nick: entity.id, age: entity.age, overall: entity.overall }));
}

function advanceRosterLight(entities: AgingEntity[], seasonKey: string): AgingEntity[] {
  return entities.map((entity) => applyAging({ entity, calibration, seasonKey }).entity);
}
