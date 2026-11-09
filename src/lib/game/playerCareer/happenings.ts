// src/lib/game/playerCareer/happenings.ts
// Acontecimentos da carreira (career-events.game.json: 150 situações do usuário, por fase, com gatilho, peso e
// cooldown). A cada campeonato há chance de um antes do jogo, depois do jogo ou na semana; a chance sobe com o
// momento (título, queda feia, fama, moral baixa, cansaço, Major). A escolha tem 3 caminhos e o resultado depende
// do seu mental e da sua moral: a mesma decisão pode sair melhor ou pior.
import rawEvents from '$lib/data/cs/career-events.game.json';
import rawEventsV3 from '$lib/data/cs/career-events-v3.game.json';
import { careerCtx, conditionsHold, isUnsupported } from './conditions';
import { lifeOf, withFlags } from './life';
import { createSeededRng } from '../simulation';
import { addExtraEvent, happeningOffers, orgOf, playedCount, skipEvent, trophyCase, type PlayerCareerState, type PlayerRole, type TournamentResult } from './engine';
import { addReserve, bestOtherRole, matesOf, myPlayerOf, planOf, promoteReserve, synergyBump, takeRole, type ReserveKind } from './squad';
import { retier } from './tiers';

const ROLE_LABEL_PT: Record<PlayerRole, string> = { igl: 'IGL', awper: 'AWPer', entry: 'Entry', lurker: 'Lurker', support: 'Suporte', rifler: 'Rifler' };

export type HappeningTrigger = 'pre' | 'post' | 'between';
export type HappeningEffect = 'performance' | 'fatigue' | 'mental' | 'mind' | 'reputation' | 'money' | 'chemistry' | 'fame';

export interface HappeningChoice {
  text: string;
  effects: Partial<Record<HappeningEffect, number>>;
  consequence: string;
  /** Marcas que voltam depois (arco do acontecimento): "racha_interno:risco". */
  flags?: string[];
  /** Quanto a marca aumenta a chance do arco voltar (%). */
  futureWeight?: number;
}
export type Severity = 'comum' | 'moderado' | 'grave' | 'critico';
export interface Happening {
  id: string;
  phase: string;
  /** Fase mínima (1 online amador … 10 Tier S e legado). */
  tierMin: number;
  situation: string;
  trigger: HappeningTrigger;
  weight: number;
  /** Campeonatos até poder aparecer de novo. */
  cooldown: number;
  choices: HappeningChoice[];
  severity?: Severity;
  /** Meses até poder voltar (999: uma vez na carreira). */
  cooldownMonths?: number;
  /** Quantas vezes por temporada, no máximo. */
  yearLimit?: number;
  unique?: boolean;
  arc?: string;
  /** Acontecimentos novos (planilha de 350): condições conferidas no estado e nos resultados reais. */
  conditions?: string[];
}

interface LegacyMeta { severity: Severity; cooldownMonths: number; yearLimit: number; unique: boolean; arc: string }
interface V3Choice { text: string; effects: Record<string, number>; result: string; flags?: string[]; futureWeight?: number }
interface V3Event { id: string; phase: string; tierMin: number; situation: string; conditions: string[]; weight: number; severity: Severity; cooldownMonths: number; yearLimit: number; unique: boolean; arc: string; choices: V3Choice[] }
const V3 = rawEventsV3 as unknown as { legacy: Record<string, LegacyMeta>; events: V3Event[] };

/** Os 150 originais, com gravidade, limite por ano e cooldown em meses da planilha nova. */
export const HAPPENINGS: Happening[] = (rawEvents as unknown as { events: Happening[] }).events.map((event) => ({ ...event, ...(V3.legacy[event.id] ?? {}), phase: retier(event.phase), situation: retier(event.situation) }));

/** Efeito da planilha nova → efeito do jogo (forma, Mental, reputação, química, cansaço, fãs, caixa). */
const V3_EFFECT: Record<string, HappeningEffect> = { form: 'performance', mind: 'mind', reputation: 'reputation', chemistry: 'chemistry', fatigue: 'fatigue', fame: 'fame', money: 'money' };

/** Os 200 novos. Quem depende de fato de round que o motor não guarda fica de fora (e aparece no relatório). */
export const HAPPENINGS_V3: Happening[] = V3.events.filter((event) => !isUnsupported(event.conditions)).map((event) => ({
  id: event.id, phase: retier(event.phase), tierMin: event.tierMin, situation: retier(event.situation), weight: event.weight, cooldown: 8,
  // O momento da planilha (em série/antes da partida, pós-partida); sem momento, vale depois do jogo ou na semana.
  trigger: event.conditions.some((clause) => clause === 'em_serie' || clause === 'antes_da_partida') ? 'pre' as const : event.conditions.includes('pos_partida') ? 'post' as const : 'between' as const,
  severity: event.severity, cooldownMonths: event.cooldownMonths, yearLimit: event.yearLimit, unique: event.unique, arc: event.arc, conditions: event.conditions,
  choices: event.choices.map((choice) => ({
    text: choice.text,
    consequence: choice.result,
    flags: choice.flags,
    futureWeight: choice.futureWeight,
    effects: Object.fromEntries(Object.entries(choice.effects).flatMap(([key, value]) => (V3_EFFECT[key] ? [[V3_EFFECT[key], value]] : [])))
  }))
}));
export const UNSUPPORTED_V3 = V3.events.filter((event) => isUnsupported(event.conditions)).map((event) => event.id);

export const ALL_HAPPENINGS: Happening[] = [...HAPPENINGS, ...HAPPENINGS_V3];
export const HAPPENING_BY_ID = new Map(ALL_HAPPENINGS.map((event) => [event.id, event]));

/** Quanto cada marca de escolha aumenta a chance do arco voltar (da própria planilha). */
const FUTURE_WEIGHT = new Map<string, number>(HAPPENINGS_V3.flatMap((event) => event.choices.flatMap((choice) => (choice.flags ?? []).map((flag) => [flag, choice.futureWeight ?? 0] as [string, number]))));

export const SEVERITY_LABEL: Record<Severity, string> = { comum: 'Comum', moderado: 'Moderado', grave: 'Grave', critico: 'Crítico' };
/** Teto por temporada: no máximo 10 acontecimentos, 3 graves e 1 crítico. */
export const SEASON_CAP = { total: 10, grave: 3, critico: 1 };

/** Registro de cada acontecimento (para limite por ano, cooldown em meses, único e o histórico da carreira). */
export interface HappeningRecord { id: string; season: number; year: number; month: number; severity: Severity; choice?: number; success?: boolean; line?: string }
const HISTORY_CAP = 160;

/** As fases do documento que cada degrau da pirâmide vive (com uma abaixo, para o passado ainda aparecer). */
const PHASES_BY_LEVEL: Record<number, [number, number]> = { 5: [1, 2], 4: [2, 4], 3: [4, 5], 2: [5, 7], 1: [7, 8], 0: [8, 10] };

export const TRIGGER_LABEL: Record<HappeningTrigger, string> = { pre: 'Antes do jogo', post: 'Depois do jogo', between: 'Na semana' };

export interface HappeningContext {
  eventIndex: number;
  /** Resultado do campeonato que acabou (para o "depois do jogo"). */
  result?: TournamentResult;
}

/** Chance do acontecimento, pelo gatilho e pelo momento da carreira. */
export function happeningChance(state: PlayerCareerState, trigger: HappeningTrigger, context: HappeningContext): number {
  const fame = state.fame ?? 0;
  const famous = fame >= 20000 ? 0.08 : fame >= 5000 ? 0.04 : 0;
  if (trigger === 'post') {
    const result = context.result;
    const extreme = result && (result.placement === 'Campeão' || result.mvp?.you || (result.placement === 'Quartas' && result.rating < 0.95));
    return Math.min(0.6, 0.3 + (extreme ? 0.15 : 0) + famous);
  }
  if (trigger === 'between') {
    const pressure = ((state.morale ?? 60) < 40 ? 0.1 : 0) + ((state.fatigue ?? 0) >= 70 ? 0.1 : 0);
    return Math.min(0.55, 0.25 + pressure + famous / 2);
  }
  const entry = state.calendar?.[context.eventIndex];
  const big = entry?.format === 'major' || entry?.tier === 'Major' || entry?.tier === 'S';
  return Math.min(0.5, 0.2 + (big ? 0.15 : 0) + famous);
}

/** O que o acontecimento afirma precisa ser verdade: "perde a final" só depois de um vice, "0 a 2 no suíço" só com
 *  campanha ruim no Major. Os que falam de final/semifinal do campeonato saem DEPOIS do jogo (o resultado existe). */
interface NeedContext { state: PlayerCareerState; trigger: HappeningTrigger; result?: TournamentResult; last?: TournamentResult; next?: NonNullable<PlayerCareerState['calendar']>[number] }
type Need = (context: NeedContext) => boolean;

const PLAYOFF = new Set(['quarterfinal', 'semifinal', 'final']);
const reachedFinal = (result?: TournamentResult) => result?.placement === 'Campeão' || result?.placement === 'Vice';
const champion = (result?: TournamentResult) => result?.placement === 'Campeão';
const lostSeries = (result?: TournamentResult) => (result?.opponents ?? []).some((game) => !game.won);
const wonPlayoff = (result?: TournamentResult) => (result?.opponents ?? []).some((game) => game.won && PLAYOFF.has(game.phase ?? ''));
const bigEvent = (result?: TournamentResult) => result?.tier === 'Major' || result?.tier === 'S';
/** Os campeonatos jogados, do mais recente ao mais antigo (temporada atual e as anteriores). */
function playedResults(state: PlayerCareerState): TournamentResult[] {
  const now = (state.calendar ?? []).flatMap((entry) => (entry.result ? [entry.result] : []));
  return [...state.history.flatMap((log) => log.tournaments), ...now].reverse();
}
const badRun = (state: PlayerCareerState) => {
  const recent = playedResults(state).slice(0, 2);
  return recent.length === 2 && recent.every((result) => !['Campeão', 'Vice', 'Semis'].includes(result.placement));
};

/** Depois do jogo: o resultado do campeonato que acabou. Antes/na semana: o último campeonato jogado. */
const NEEDS: Record<string, Need> = {
  EV008: ({ result }) => reachedFinal(result),
  EV010: ({ last }) => lostSeries(last),
  EV012: ({ result }) => wonPlayoff(result),
  EV014: ({ result }) => !!result && !champion(result),
  EV015: ({ state, result }) => reachedFinal(result) && !playedResults(state).slice(1).some(reachedFinal),
  EV019: ({ last }) => lostSeries(last),
  EV020: ({ state }) => badRun(state),
  EV023: ({ result }) => reachedFinal(result),
  EV025: ({ last }) => lostSeries(last),
  EV036: ({ result }) => !!result && !champion(result),
  EV041: ({ result }) => !!result && !reachedFinal(result),
  EV045: ({ last }) => lostSeries(last),
  EV050: ({ result }) => lostSeries(result),
  EV054: ({ result }) => !!result && ['Semis', 'Vice', 'Campeão'].includes(result.placement),
  EV058: ({ last }) => lostSeries(last),
  EV060: ({ result }) => reachedFinal(result) && !bigEvent(result),
  EV068: ({ result }) => !!result && !champion(result) && lostSeries(result),
  EV071: ({ result }) => reachedFinal(result),
  EV072: ({ last }) => lostSeries(last),
  EV078: ({ state }) => badRun(state),
  EV079: ({ last }) => (last?.rating ?? 0) >= 1.25,
  EV085: ({ last }) => last?.placement === 'Semis',
  EV090: () => false,
  EV094: ({ last }) => lostSeries(last),
  EV100: ({ last }) => lostSeries(last),
  EV103: ({ last }) => wonPlayoff(last),
  EV106: ({ state, next }) => next?.format === 'major' && !playedResults(state).some((result) => result.tier === 'Major'),
  EV107: ({ result }) => !!result && !champion(result),
  EV108: ({ result }) => result?.tier === 'Major' && ['Stage 1', 'Stage 2', 'Fase suíça'].includes(result.placement),
  EV109: ({ last }) => wonPlayoff(last),
  EV113: ({ result }) => !!result && bigEvent(result) && ['Quartas', 'Semis', 'Vice', 'Campeão'].includes(result.placement),
  EV115: ({ last }) => lostSeries(last),
  EV116: ({ result }) => result?.placement === 'Semis',
  EV120: ({ result }) => result?.tier === 'Major' && reachedFinal(result),
  EV122: ({ result }) => reachedFinal(result),
  EV123: ({ state }) => trophyCase(state).total >= 6,
  EV125: ({ result }) => champion(result),
  EV129: ({ result }) => reachedFinal(result),
  EV135: ({ state }) => state.history.some((log) => (log.hltvRank ?? 99) <= 3),
  EV136: ({ last }) => last?.tier === 'Major' && champion(last),
  EV140: ({ result }) => result?.placement === 'Vice',
  EV141: ({ result }) => reachedFinal(result) && bigEvent(result),
  EV146: ({ result }) => champion(result) && bigEvent(result),
  EV147: ({ result }) => champion(result),
  EV150: ({ result }) => reachedFinal(result) && bigEvent(result)
};

/** As condições acima em português, para a planilha de conteúdo. */
export const NEED_LABEL: Record<string, string> = {
  EV008: 'chegou à final', EV010: 'perdeu uma série no último campeonato', EV012: 'ganhou série de playoff',
  EV014: 'não foi campeão', EV015: 'primeira final da carreira', EV019: 'perdeu uma série no último campeonato',
  EV020: 'dois campeonatos seguidos sem semifinal', EV023: 'chegou à final', EV025: 'perdeu uma série no último campeonato',
  EV036: 'não foi campeão', EV041: 'não chegou à final', EV045: 'perdeu uma série no último campeonato',
  EV050: 'perdeu uma série no campeonato', EV054: 'chegou à semifinal ou mais', EV058: 'perdeu uma série no último campeonato',
  EV060: 'final de campeonato que não é Tier S nem Major', EV068: 'não foi campeão e perdeu uma série', EV071: 'chegou à final',
  EV072: 'perdeu uma série no último campeonato', EV078: 'dois campeonatos seguidos sem semifinal', EV079: 'rating 1.25+ no último campeonato',
  EV085: 'caiu na semifinal do último campeonato', EV090: 'desligado (o jogo não tem tiebreak)', EV094: 'perdeu uma série no último campeonato',
  EV100: 'perdeu uma série no último campeonato', EV103: 'ganhou série de playoff no último campeonato', EV106: 'o próximo é Major e você nunca jogou um',
  EV107: 'não foi campeão', EV108: 'caiu num stage do Major', EV109: 'ganhou série de playoff no último campeonato',
  EV113: 'playoffs de Tier S ou Major', EV115: 'perdeu uma série no último campeonato', EV116: 'caiu na semifinal',
  EV120: 'chegou à final de Major', EV122: 'chegou à final', EV123: '6 títulos ou mais na carreira', EV125: 'foi campeão',
  EV129: 'chegou à final', EV135: 'já foi top 3 da HLTV', EV136: 'ganhou um Major no último campeonato', EV140: 'foi vice',
  EV141: 'final de Tier S ou Major', EV146: 'campeão de Tier S ou Major', EV147: 'foi campeão', EV150: 'final de Tier S ou Major'
};

/** O que cada escolha muda no calendário/time, em português. */
export const CALENDAR_MOVE_LABEL: Record<CalendarMove, string> = { skip: 'tira um campeonato (folga)', add: 'põe mais um campeonato', up: 'abre proposta de time maior', region: 'abre proposta de time de outra região' };

/** Os que o documento põe antes do jogo, mas contam o que aconteceu NO campeonato: saem depois dele. */
const AFTER_THE_GAME = new Set(['EV012', 'EV015', 'EV036', 'EV054', 'EV060', 'EV108', 'EV120', 'EV129', 'EV141', 'EV147', 'EV150']);
export const triggerOf = (event: Happening): HappeningTrigger => (AFTER_THE_GAME.has(event.id) ? 'post' : event.trigger);

function fits(event: Happening, context: NeedContext): boolean {
  const need = NEEDS[event.id];
  return !need || need(context);
}

/** Mês absoluto (ano × 12 + mês) do momento do acontecimento: o mês do campeonato em jogo, ou dezembro. */
function monthOf(state: PlayerCareerState, eventIndex: number): number {
  const entry = state.calendar?.find((candidate) => candidate.index === eventIndex) ?? state.calendar?.[eventIndex];
  return state.year * 12 + Math.max(0, Math.min(11, (entry?.month ?? 12) - 1));
}

/** Pode aparecer agora? Único (uma vez na carreira), limite por temporada, cooldown em meses e o teto de gravidade. */
function allowedBySchedule(event: Happening, state: PlayerCareerState, now: number): boolean {
  const history = state.happeningHistory ?? [];
  const mine = history.filter((record) => record.id === event.id);
  if (event.unique && (mine.length || state.happeningLog?.[event.id] !== undefined)) return false;
  const season = history.filter((record) => record.season === state.seasonNumber);
  if (event.yearLimit !== undefined && season.filter((record) => record.id === event.id).length >= event.yearLimit) return false;
  const last = mine[mine.length - 1];
  if (last && event.cooldownMonths !== undefined && now - (last.year * 12 + last.month) < event.cooldownMonths) return false;
  if (event.severity === 'critico' && season.filter((record) => record.severity === 'critico').length >= SEASON_CAP.critico) return false;
  if (event.severity === 'grave' && season.filter((record) => record.severity === 'grave').length >= SEASON_CAP.grave) return false;
  return true;
}

/** O arco volta com mais chance se uma escolha sua deixou marca nele (até +70%). */
function arcBoost(event: Happening, flags: string[]): number {
  if (!event.arc) return 1;
  const marks = flags.filter((flag) => flag.startsWith(`${event.arc}:`));
  return marks.length ? 1 + Math.max(...marks.map((flag) => FUTURE_WEIGHT.get(flag) ?? 30)) / 100 : 1;
}

/** Sorteia (ou não) um acontecimento para o gatilho e deixa esperando a sua escolha. */
export function rollHappening(state: PlayerCareerState, trigger: HappeningTrigger, context: HappeningContext): PlayerCareerState {
  if (state.status !== 'ACTIVE' || state.pendingHappening || state.pendingMove) return state;
  // Teto da temporada: quem já viveu 10 acontecimentos no ano só volta a ter no próximo.
  if ((state.happeningHistory ?? []).filter((record) => record.season === state.seasonNumber).length >= SEASON_CAP.total) return state;
  const played = playedCount(state);
  const rng = createSeededRng(`${state.seed}:happening:${state.seasonNumber}:${played}:${trigger}:${context.eventIndex}`);
  if (rng() >= happeningChance(state, trigger, context)) return state;
  const [low, high] = PHASES_BY_LEVEL[orgOf(state.orgId, state).level] ?? [1, 2];
  const log = state.happeningLog ?? {};
  const needContext: NeedContext = {
    state, trigger, result: trigger === 'post' ? context.result : undefined,
    last: context.result ?? playedResults(state)[0], next: state.calendar?.[context.eventIndex]
  };
  const now = monthOf(state, context.eventIndex);
  const inBand = (event: Happening) => event.tierMin >= low && event.tierMin <= high;
  const legacy = HAPPENINGS.filter((event) => triggerOf(event) === trigger && inBand(event)
    && (log[event.id] === undefined || played - log[event.id] >= Math.max(event.cooldown, 8)) && fits(event, needContext));
  // Os novos: as condições da planilha conferidas no estado real (momento, resultados, vida, elenco, calendário).
  // Sem momento marcado, eles acontecem depois do jogo ou na semana (nunca "antes" sem a planilha dizer).
  const ctx = careerCtx(state, trigger, trigger === 'post' ? context.result ?? null : null);
  const fresh = HAPPENINGS_V3.filter((event) => inBand(event) && conditionsHold(event.conditions ?? [], ctx)
    && (trigger !== 'pre' || (event.conditions ?? []).some((clause) => ['em_serie', 'antes_da_partida'].includes(clause))));
  const flags = lifeOf(state).flags;
  const pool = [...legacy, ...fresh].filter((event) => allowedBySchedule(event, state, now)).map((event) => ({ event, weight: event.weight * arcBoost(event, flags) }));
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return state;
  let ticket = rng() * total;
  const picked = (pool.find((item) => (ticket -= item.weight) < 0) ?? pool[pool.length - 1]).event;
  const record: HappeningRecord = { id: picked.id, season: state.seasonNumber, year: Math.floor(now / 12), month: now % 12, severity: picked.severity ?? 'comum' };
  return {
    ...state,
    pendingHappening: { id: picked.id, trigger, eventIndex: context.eventIndex },
    happeningLog: { ...log, [picked.id]: played },
    happeningHistory: [...(state.happeningHistory ?? []), record].slice(-HISTORY_CAP)
  };
}

/** Unidades de cada efeito por degrau: fama e dinheiro valem mais lá em cima. */
const FAME_UNIT: Record<number, number> = { 5: 20, 4: 60, 3: 150, 2: 400, 1: 1000, 0: 2500 };
const MONEY_UNIT: Record<number, number> = { 5: 50, 4: 200, 3: 800, 2: 2500, 1: 6000, 0: 12000 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface HappeningChip { label: string; value: number; display?: string }

export interface HappeningOutcome {
  state: PlayerCareerState;
  success: boolean;
  line: string;
  chips: HappeningChip[];
}

/** Escolhas que tiram você do time no próximo campeonato (o documento diz "aceitar banco", "procurar substituto"). */
const BENCH_CHOICES: Record<string, Record<number, number>> = { EV102: { 2: 1 }, EV023: { 2: 1 }, EV018: { 2: 1 } };
export const benchOf = (eventId: string, choiceIndex: number): number => BENCH_CHOICES[eventId]?.[choiceIndex] ?? 0;

/** Escolhas que mexem de verdade no calendário ou no time: folga tira um campeonato, "aceitar todos" põe mais um,
 *  aceitar proposta abre a tela de mercado. */
export type CalendarMove = 'skip' | 'add' | 'up' | 'region';
const CALENDAR_CHOICES: Record<string, Record<number, CalendarMove>> = {
  EV018: { 1: 'skip' },
  EV123: { 0: 'skip' },
  EV146: { 0: 'skip' },
  EV101: { 2: 'add' },
  EV136: { 1: 'add' },
  EV138: { 2: 'add' },
  EV005: { 0: 'up' },
  EV067: { 1: 'up' },
  EV145: { 1: 'up' },
  EV038: { 1: 'region' }
};
export const calendarMoveOf = (eventId: string, choiceIndex: number): CalendarMove | null => CALENDAR_CHOICES[eventId]?.[choiceIndex] ?? null;

/** Escolhas que mudam a sua função de verdade: virar IGL e capitão, assumir as calls, trocar de função a pedido
 *  do coach ('melhor' = a função em que a sua carta rende mais, fora a atual). */
const ROLE_CHOICES: Record<string, Record<number, PlayerRole | 'melhor'>> = {
  EV144: { 0: 'igl', 1: 'igl' },
  EV007: { 0: 'igl' },
  EV111: { 2: 'melhor' }
};
export const roleMoveOf = (eventId: string, choiceIndex: number): PlayerRole | 'melhor' | null => ROLE_CHOICES[eventId]?.[choiceIndex] ?? null;

/** Escolhas que mexem no banco: o jovem/o dos pugs chega como reserva, ou já entra no lugar do mais fraco; o entry
 *  em má fase vai para o banco (entra o reserva, ou um stand-in). */
const BENCH_MOVES: Record<string, Record<number, { kind: ReserveKind; promote?: 'fraco' | 'entry' }>> = {
  EV134: { 0: { kind: 'jovem' }, 2: { kind: 'jovem', promote: 'fraco' } },
  EV011: { 0: { kind: 'pugs' }, 1: { kind: 'pugs', promote: 'fraco' } },
  EV041: { 1: { kind: 'stand-in', promote: 'entry' } }
};
export const benchMoveOf = (eventId: string, choiceIndex: number) => BENCH_MOVES[eventId]?.[choiceIndex] ?? null;
export const BENCH_MOVE_LABEL = (move: { kind: ReserveKind; promote?: 'fraco' | 'entry' }) =>
  move.promote === 'entry' ? 'o entry vai para o banco (entra o reserva ou um stand-in)'
    : move.promote ? `o ${move.kind === 'jovem' ? 'jovem' : 'jogador dos pugs'} entra no lugar do titular mais fraco`
      : `o ${move.kind === 'jovem' ? 'jovem' : 'jogador dos pugs'} fica no banco do time`;

/** Chance de a escolha sair como você planejou: mental da carta e moral (25% a 90%). */
export function happeningSuccessChance(state: PlayerCareerState): number {
  const mental = Number(myPlayerOf(state).mental ?? 60);
  return clamp(0.5 + (mental - 70) / 80 + ((state.morale ?? 60) - 60) / 200, 0.25, 0.9);
}

/** Aplica a escolha: deu certo, o lado bom vale inteiro e o ruim pela metade; deu errado, o contrário. */
export function resolveHappening(state: PlayerCareerState, choiceIndex: number): HappeningOutcome {
  const pending = state.pendingHappening;
  const event = pending ? HAPPENING_BY_ID.get(pending.id) : undefined;
  const choice = event?.choices[choiceIndex];
  if (!pending || !event || !choice) return { state, success: false, line: '', chips: [] };
  const rng = createSeededRng(`${state.seed}:happening-roll:${event.id}:${playedCount(state)}:${choiceIndex}`);
  const success = rng() < happeningSuccessChance(state);
  const scaled = (value: number) => (value > 0 ? (success ? value : Math.trunc(value / 2)) : (success ? Math.trunc(value / 2) : value));
  const effect = (key: HappeningEffect) => scaled(choice.effects[key] ?? 0);
  const level = orgOf(state.orgId, state).level;
  const chips: HappeningChip[] = [];

  const formDelta = Math.round(effect('performance') / 2);
  const fatigueDelta = effect('fatigue') * 2;
  // Mental (aguentar pressão) e Moral (vontade) são coisas diferentes: o "mental" dos 150 originais pesa nos dois,
  // o "mind" dos novos só no Mental.
  const mindDelta = (effect('mental') + effect('mind')) * 2;
  const moraleDelta = effect('mental');
  const reputationDelta = effect('reputation') * 2;
  const chemistryDelta = effect('chemistry') * 2;
  const fameDelta = effect('fame') * (FAME_UNIT[level] ?? 100);
  const moneyDelta = effect('money') * (MONEY_UNIT[level] ?? 200);

  const relationships = { ...state.relationships };
  if (chemistryDelta) for (const mate of matesOf(state)) relationships[mate.player.id] = clamp((relationships[mate.player.id] ?? mate.relationship) + chemistryDelta, 0, 100);
  const life = lifeOf(state);
  const flagged = choice.flags?.length ? withFlags(life, choice.flags) : life;
  const next: PlayerCareerState = {
    ...state,
    pendingHappening: null,
    life: { ...flagged, mind: clamp(life.mind + mindDelta, 0, 100) },
    form: clamp((state.form ?? 0) + formDelta, -3, 3),
    fatigue: clamp((state.fatigue ?? 0) + fatigueDelta, 0, 100),
    morale: clamp((state.morale ?? 60) + moraleDelta, 0, 100),
    reputation: clamp((state.reputation ?? 50) + reputationDelta, 0, 100),
    relationships,
    fame: Math.max(0, (state.fame ?? 0) + fameDelta),
    money: Math.max(0, (state.money ?? 0) + moneyDelta),
    ...(benchOf(event.id, choiceIndex) ? { benchedEvents: (state.benchedEvents ?? 0) + benchOf(event.id, choiceIndex) } : {})
  };
  if (formDelta) chips.push({ label: 'Forma', value: formDelta });
  if (mindDelta) chips.push({ label: 'Fase mental', value: mindDelta });
  if (moraleDelta) chips.push({ label: 'Moral', value: moraleDelta });
  if (chemistryDelta) chips.push({ label: 'Química', value: chemistryDelta });
  if (reputationDelta) chips.push({ label: 'Reputação', value: reputationDelta });
  if (fameDelta) chips.push({ label: 'Fãs', value: fameDelta, display: `${fameDelta > 0 ? '+' : '−'}${Math.abs(fameDelta).toLocaleString('pt-BR')} fãs` });
  if (moneyDelta) chips.push({ label: 'Caixa', value: moneyDelta, display: `${moneyDelta > 0 ? '+' : '−'}US$ ${Math.abs(moneyDelta).toLocaleString('pt-BR')}` });
  if (fatigueDelta) chips.push({ label: 'Cansaço', value: -fatigueDelta, display: `Cansaço ${fatigueDelta > 0 ? '+' : '−'}${Math.abs(fatigueDelta)}` });
  const bench = benchOf(event.id, choiceIndex);
  if (bench) chips.push({ label: 'Banco', value: -bench, display: `Banco no próximo campeonato` });
  // O que muda no calendário ou no time (independe de sair como você queria: a decisão foi tomada).
  let moved = next;
  let extraLine = '';
  const calendarMove = calendarMoveOf(event.id, choiceIndex);
  if (calendarMove === 'skip') {
    const skipped = skipEvent(moved, pending.trigger === 'pre' ? pending.eventIndex : undefined);
    moved = skipped.state;
    if (skipped.name) {
      extraLine = ` O time abriu mão do ${skipped.name}.`;
      chips.push({ label: 'Calendário', value: 1, display: 'Um campeonato a menos' });
    }
  } else if (calendarMove === 'add') {
    const added = addExtraEvent(moved);
    moved = added.state;
    if (added.name) {
      extraLine = ` Entrou no calendário: ${added.name}.`;
      chips.push({ label: 'Calendário', value: -1, display: 'Um campeonato a mais' });
    }
  }
  const roleMove = roleMoveOf(event.id, choiceIndex);
  if (roleMove) {
    const role = roleMove === 'melhor' ? bestOtherRole(moved) : roleMove;
    if (role !== moved.role) {
      const taken = takeRole(moved, role);
      moved = taken.state;
      extraLine += ` ${taken.line}`;
      chips.push({ label: 'Função', value: taken.good ? 1 : -1, display: `Agora: ${ROLE_LABEL_PT[role]}` });
    }
  }
  const benchMove = benchMoveOf(event.id, choiceIndex);
  if (benchMove && moved.orgId !== 'lan-house') {
    const mates = matesOf(moved);
    const target = benchMove.promote === 'entry'
      ? mates.find((mate) => mate.player.role === 'entry')
      : [...mates].sort((a, b) => ((a.player.overall ?? 70) - synergyBump(a.relationship)) - ((b.player.overall ?? 70) - synergyBump(b.relationship)))[0];
    // O entry vai para o banco: entra o reserva que já existe; sem reserva, chega um stand-in da função.
    if (!(benchMove.promote === 'entry' && planOf(moved).reserve)) {
      const added = addReserve(moved, benchMove.kind, benchMove.promote === 'entry' ? 'entry' : undefined);
      moved = added.state;
      extraLine += ` ${added.line}`;
      chips.push({ label: 'Banco', value: 1, display: `Reserva: ${added.reserve.nick}` });
    }
    if (benchMove.promote && target) {
      const promoted = promoteReserve(moved, target.player.id);
      moved = promoted.state;
      extraLine += ` ${promoted.line}`;
    }
  }
  if (calendarMove === 'up' || calendarMove === 'region') {
    const reason = calendarMove === 'up' ? `${event.situation}. A proposta virou oferta de verdade.` : `${event.situation}. O time de fora quer você.`;
    const offered = happeningOffers(moved, calendarMove, reason);
    if (offered.pendingMove) extraLine = ' A proposta chegou: decida na tela de mercado.';
    moved = offered;
  }
  const line = `${choice.consequence} ${success ? 'Saiu como você queria.' : 'Não saiu como você queria.'}${bench ? ' Você fica de fora do próximo campeonato.' : ''}${extraLine}`;
  // O histórico guarda a escolha e como saiu (a última entrada é a deste acontecimento).
  const history = [...(moved.happeningHistory ?? [])];
  const at = history.map((record) => record.id).lastIndexOf(event.id);
  if (at >= 0) history[at] = { ...history[at], choice: choiceIndex, success, line: choice.text };
  return { state: { ...moved, happeningHistory: history }, success, line, chips };
}
