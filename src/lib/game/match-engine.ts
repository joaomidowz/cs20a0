import type {
  BuyDecision,
  CombatTeam,
  MapId,
  MapResult,
  OrgStyle,
  RoundDecision,
  RoundEconomyEvent,
  RoundEvent,
  RoundHighlight,
  RoundKillEvent,
  RoundSide,
  RoundWeapon,
  TeamSide
} from './types';

export type SeededRng = () => number;

const hashSeed = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRng = (seed: string): SeededRng => {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const MATCH_ENGINE_VERSION = 2 as const;
export const ROUND_DECISION_TIMEOUT_MS = 10_000;
export const MAX_MONEY = 16_000;

const LOSS_BONUS = [1_400, 1_900, 2_400, 2_900, 3_400] as const;
const BUY_COST: Record<BuyDecision | 'pistol', number> = { pistol: 650, eco: 450, force: 2_700, full: 4_700 };
const EQUIPMENT_STRENGTH: Record<BuyDecision | 'pistol', number> = { pistol: 0, eco: -7, force: -1.8, full: 4.2 };
const KILL_REWARD: Record<RoundWeapon, number> = {
  ak47: 300, m4a1: 300, awp: 100, usp: 300, glock: 300, deagle: 300, famas: 300,
  galil: 300, mac10: 600, mp9: 600, fiveseven: 300, p250: 300, tec9: 300, knife: 1_500
};
const HEADSHOT_RATE: Record<RoundWeapon, number> = {
  ak47: .45, m4a1: .42, awp: .08, usp: .52, glock: .48, deagle: .58, famas: .4,
  galil: .4, mac10: .33, mp9: .35, fiveseven: .5, p250: .5, tec9: .42, knife: 0
};

export interface TeamRoundState {
  money: number;
  lossStreak: number;
  opponentRoundStreak: number;
  pauseHalf: number;
  pauseBoostRounds: number;
}

export interface IncrementalMapState {
  version: typeof MATCH_ENGINE_VERSION;
  seed: string;
  map: number;
  mapId?: MapId;
  teamA: CombatTeam;
  teamB: CombatTeam;
  scoreA: number;
  scoreB: number;
  round: number;
  overtime: boolean;
  finished: boolean;
  winnerId: string;
  stateA: TeamRoundState;
  stateB: TeamRoundState;
  rounds: Array<{ a: number; b: number; overtime: boolean }>;
  events: RoundEvent[];
  powerBonusA: number;
  powerBonusB: number;
  strongMapA: boolean;
  strongMapB: boolean;
}

export interface RoundDecisionContext {
  team: CombatTeam;
  money: number;
  score: number;
  opponentScore: number;
  opponentRoundStreak: number;
  pauseAvailable: boolean;
  strongMap: boolean;
  pistolRound: boolean;
  seed: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const styleOf = (team: CombatTeam): OrgStyle => team.style ?? 'balanced';

export function getLegalBuys(money: number, pistolRound = false): BuyDecision[] {
  if (pistolRound) return ['eco'];
  const legal: BuyDecision[] = ['eco'];
  // A force can spend the available budget on a partial kit after a lost pistol.
  if (money >= 1_500) legal.push('force');
  if (money >= BUY_COST.full) legal.push('full');
  return legal;
}

export function tacticalPauseThreshold(style: OrgStyle): number {
  return style === 'tactical' ? 3 : style === 'balanced' ? 4 : 5;
}

export function getTacticalPauseBoost(team: CombatTeam): number {
  const leadership = team.igl ?? (team.lineup?.some((pick) => pick.selectedSlotRole === 'igl') ? 84 : 64);
  const style = styleOf(team);
  const styleFactor = style === 'tactical' ? 1.12 : style === 'aggressive' ? .88 : 1;
  return clamp(((leadership + team.mental) / 2 - 50) / 12 * styleFactor, 1.2, 4.2);
}

/** Competent but intentionally imperfect deterministic recommendation. */
export function recommendRoundDecision(context: RoundDecisionContext): RoundDecision {
  const rng = createSeededRng(`${context.seed}:recommendation`);
  const legal = getLegalBuys(context.money, context.pistolRound);
  if (context.pistolRound) return { buy: 'eco', tacticalPause: false };
  const style = styleOf(context.team);
  const deficit = context.opponentScore - context.score;
  const desperation = context.opponentScore >= 9 && deficit >= 6;
  let scores: Record<BuyDecision, number> = {
    eco: context.money < 4_000 ? 4 : -2,
    force: style === 'aggressive' ? 3.4 : style === 'tactical' ? .4 : 1.8,
    full: context.money >= 4_700 ? 8 : 2
  };
  if (context.money >= 3_400 && context.money < 4_000) scores.eco += style === 'tactical' ? 4 : 2;
  if (style === 'aggressive' && context.strongMap && context.score + context.opponentScore <= 3) scores.force += 3.2;
  if (desperation) scores = { eco: scores.eco - 8, force: scores.force + 14, full: scores.full + 3 };
  const ranked = legal
    .map((buy) => ({ buy, score: scores[buy] + (rng() - .5) * 2.2 }))
    .sort((left, right) => right.score - left.score || left.buy.localeCompare(right.buy));
  const threshold = tacticalPauseThreshold(style);
  const matchPoint = context.opponentScore >= 12 && context.opponentScore > context.score;
  const crisis = context.opponentScore >= 9 && deficit >= 6;
  const pauseScore = context.opponentRoundStreak >= threshold ? 8 + context.opponentRoundStreak - threshold : 0;
  const tacticalPause = context.pauseAvailable && (matchPoint || crisis || pauseScore + rng() * 3 >= 9);
  return { buy: ranked[0]?.buy ?? 'eco', tacticalPause };
}

export function normalizeRoundDecision(decision: RoundDecision, context: RoundDecisionContext): RoundDecision {
  const legal = getLegalBuys(context.money, context.pistolRound);
  const recommendation = recommendRoundDecision(context);
  return {
    buy: legal.includes(decision.buy) ? decision.buy : recommendation.buy,
    tacticalPause: Boolean(decision.tacticalPause && context.pauseAvailable && !context.pistolRound)
  };
}

export function createIncrementalMap(options: {
  teamA: CombatTeam;
  teamB: CombatTeam;
  seed: string;
  map?: number;
  mapId?: MapId;
  powerBonusA?: number;
  powerBonusB?: number;
  strongMapA?: boolean;
  strongMapB?: boolean;
}): IncrementalMapState {
  return {
    version: MATCH_ENGINE_VERSION,
    seed: options.seed,
    map: options.map ?? 1,
    ...(options.mapId ? { mapId: options.mapId } : {}),
    teamA: options.teamA,
    teamB: options.teamB,
    scoreA: 0,
    scoreB: 0,
    round: 0,
    overtime: false,
    finished: false,
    winnerId: '',
    stateA: { money: 800, lossStreak: 0, opponentRoundStreak: 0, pauseHalf: -1, pauseBoostRounds: 0 },
    stateB: { money: 800, lossStreak: 0, opponentRoundStreak: 0, pauseHalf: -1, pauseBoostRounds: 0 },
    rounds: [],
    events: [],
    powerBonusA: options.powerBonusA ?? 0,
    powerBonusB: options.powerBonusB ?? 0,
    strongMapA: options.strongMapA ?? (options.powerBonusA ?? 0) > 0,
    strongMapB: options.strongMapB ?? (options.powerBonusB ?? 0) > 0
  };
}

export function getHalfId(roundIndex: number): number {
  if (roundIndex < 24) return Math.floor(roundIndex / 12);
  return 2 + Math.floor((roundIndex - 24) / 3);
}

const sideFor = (roundIndex: number, aStartsCt: boolean): TeamSide => {
  const aCt = getHalfId(roundIndex) % 2 === 0 ? aStartsCt : !aStartsCt;
  return aCt ? 'ct' : 't';
};

const choose = <T>(rng: SeededRng, weighted: Array<[T, number]>): T => {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng() * total;
  for (const [value, weight] of weighted) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return weighted[weighted.length - 1][0];
};

const teamPlayers = (team: CombatTeam) => {
  const profile = new Map((team.players ?? []).map((player) => [player.id, player]));
  const ids = team.lineup?.map((pick) => pick.playerId) ?? team.players?.map((player) => player.id) ?? [];
  return (ids.length ? ids : Array.from({ length: 5 }, (_, index) => `${team.id}-p${index + 1}`)).slice(0, 5).map((id) => ({
    id,
    name: profile.get(id)?.nickname?.trim() || id,
    awper: team.lineup?.find((pick) => pick.playerId === id)?.selectedSlotRole === 'awper' || (profile.get(id)?.awp ?? 0) >= 85,
    firepower: profile.get(id)?.firepower ?? profile.get(id)?.overall ?? team.power,
    consistency: profile.get(id)?.consistency ?? team.mental
  }));
};

const weaponFor = (buy: BuyDecision | 'pistol', side: TeamSide, awper: boolean, rng: SeededRng): RoundWeapon => {
  if (rng() < .012) return 'knife';
  if (buy === 'pistol') return choose(rng, [[side === 'ct' ? 'usp' : 'glock', 88], ['deagle', 12]]);
  if (buy === 'eco') return choose(rng, [['p250', 40], [side === 'ct' ? 'fiveseven' : 'tec9', 25], ['deagle', 20], [side === 'ct' ? 'usp' : 'glock', 15]]);
  if (buy === 'force') return side === 'ct'
    ? choose(rng, [['famas', 45], ['mp9', 25], ['deagle', 20], ['usp', 10]])
    : choose(rng, [['galil', 45], ['mac10', 25], ['deagle', 20], ['glock', 10]]);
  if (awper) return choose(rng, [['awp', 85], ['deagle', 15]]);
  return side === 'ct' ? choose(rng, [['m4a1', 88], ['deagle', 8], ['usp', 4]]) : choose(rng, [['ak47', 88], ['deagle', 8], ['glock', 4]]);
};

function buildKills(
  state: IncrementalMapState,
  winner: RoundSide,
  buys: { a: BuyDecision | 'pistol'; b: BuyDecision | 'pistol' },
  sides: { a: TeamSide; b: TeamSide },
  rng: SeededRng
): { kills: RoundKillEvent[]; ending: RoundEvent['ending']; highlight: RoundHighlight | null } {
  const loser: RoundSide = winner === 'a' ? 'b' : 'a';
  const gearGap = EQUIPMENT_STRENGTH[buys[winner]] - EQUIPMENT_STRENGTH[buys[loser]];
  const ending: RoundEvent['ending'] = rng() < clamp(.52 + gearGap * .025, .28, .9)
    ? 'elimination'
    : sides[winner] === 't' ? 'bomb' : rng() < .72 ? 'defuse' : 'time';
  const winnerKills = ending === 'elimination' ? 5 : 2 + Math.floor(rng() * 3);
  const loserKills = clamp(Math.floor(rng() * 5 - gearGap * .12), 0, 4);
  const order: RoundSide[] = [...Array<RoundSide>(Math.max(0, winnerKills - 1)).fill(winner), ...Array<RoundSide>(loserKills).fill(loser)];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  order.push(winner);
  const alive = { a: teamPlayers(state.teamA), b: teamPlayers(state.teamB) };
  const initial = { a: alive.a.length, b: alive.b.length };
  const kills: RoundKillEvent[] = [];
  let clutch: { id: string; name: string; versus: number } | null = null;
  let second = 9 + rng() * 15;
  for (const side of order) {
    const other: RoundSide = side === 'a' ? 'b' : 'a';
    if (!alive[side].length || !alive[other].length) break;
    if (side === winner && alive[side].length === 1 && alive[other].length >= 2) {
      clutch = { id: alive[side][0].id, name: alive[side][0].name, versus: alive[other].length };
    }
    const killer = choose(rng, alive[side].map((player) => [player, Math.max(10, player.firepower + (player.awper ? 18 : 0))]));
    const victim = choose(rng, alive[other].map((player) => [player, Math.max(10, 120 - player.consistency)]));
    alive[other] = alive[other].filter((player) => player.id !== victim.id);
    const weapon = weaponFor(buys[side], sides[side], killer.awper && buys[side] === 'full', rng);
    kills.push({
      killerId: killer.id, killerName: killer.name, killerSide: side,
      victimId: victim.id, victimName: victim.name, weapon,
      headshot: rng() < HEADSHOT_RATE[weapon], second: Math.round(Math.min(115, second))
    });
    second += 6 + rng() * 16;
  }
  const counts = new Map<string, { name: string; side: RoundSide; kills: number }>();
  for (const kill of kills) {
    const item = counts.get(kill.killerId) ?? { name: kill.killerName, side: kill.killerSide, kills: 0 };
    item.kills += 1;
    counts.set(kill.killerId, item);
  }
  const top = [...counts.entries()].sort((a, b) => b[1].kills - a[1].kills || a[0].localeCompare(b[0]))[0];
  let highlight: RoundHighlight | null = null;
  if (clutch && counts.get(clutch.id)?.side === winner) highlight = { type: 'clutch', playerId: clutch.id, playerName: clutch.name, kills: counts.get(clutch.id)?.kills ?? 0, versus: clutch.versus };
  else if (top?.[1].kills >= initial[top[1].side === 'a' ? 'b' : 'a']) highlight = { type: 'ace', playerId: top[0], playerName: top[1].name, kills: top[1].kills };
  else if (top?.[1].kills === 4) highlight = { type: '4k', playerId: top[0], playerName: top[1].name, kills: 4 };
  else if (top?.[1].kills === 3) highlight = { type: '3k', playerId: top[0], playerName: top[1].name, kills: 3 };
  return { kills, ending, highlight };
}

const settleEconomy = (
  before: TeamRoundState,
  buy: BuyDecision | 'pistol',
  awp: boolean,
  won: boolean,
  ending: RoundEvent['ending'],
  kills: RoundKillEvent[],
  side: RoundSide,
  planted: boolean,
  paused: boolean
): { state: TeamRoundState; event: RoundEconomyEvent } => {
  const spent = Math.min(before.money, BUY_COST[buy] + (awp ? 450 : 0));
  const killIncome = kills.filter((kill) => kill.killerSide === side).reduce((sum, kill) => sum + KILL_REWARD[kill.weapon], 0) / 5;
  const reward = won ? (ending === 'bomb' || ending === 'defuse' ? 3_500 : 3_250) : LOSS_BONUS[Math.min(before.lossStreak, 4)] + (planted ? 800 : 0);
  const moneyAfter = clamp(Math.round(before.money - spent + reward + killIncome), 0, MAX_MONEY);
  return {
    state: {
      money: moneyAfter,
      lossStreak: won ? 0 : Math.min(4, before.lossStreak + 1),
      opponentRoundStreak: won ? 0 : before.opponentRoundStreak + 1,
      pauseHalf: before.pauseHalf,
      pauseBoostRounds: Math.max(0, before.pauseBoostRounds - 1)
    },
    event: { buy, moneyBefore: Math.round(before.money), moneyAfter, spent, equipmentStrength: EQUIPMENT_STRENGTH[buy], awp, tacticalPause: paused }
  };
};

const mapFinished = (a: number, b: number) => {
  if (a < 12 && b < 12) return false;
  if ((a === 13 && b <= 11) || (b === 13 && a <= 11)) return true;
  return a >= 16 || b >= 16 ? Math.abs(a - b) >= 2 : false;
};

export function advanceIncrementalMap(
  source: IncrementalMapState,
  decisions: Partial<Record<RoundSide, RoundDecision>> = {}
): IncrementalMapState {
  if (source.finished) return source;
  const state: IncrementalMapState = structuredClone(source);
  const roundIndex = state.round;
  const half = getHalfId(roundIndex);
  const pistolRound = roundIndex === 0 || roundIndex === 12;
  if (roundIndex === 12) {
    state.stateA.money = state.stateB.money = 800;
    state.stateA.lossStreak = state.stateB.lossStreak = 0;
    state.stateA.opponentRoundStreak = state.stateB.opponentRoundStreak = 0;
    state.stateA.pauseBoostRounds = state.stateB.pauseBoostRounds = 0;
  }
  if (roundIndex >= 24 && (roundIndex - 24) % 3 === 0) {
    state.stateA.money = 10_000;
    state.stateB.money = 10_000;
    state.stateA.lossStreak = state.stateB.lossStreak = 0;
  }
  const contextA: RoundDecisionContext = { team: state.teamA, money: state.stateA.money, score: state.scoreA, opponentScore: state.scoreB, opponentRoundStreak: state.stateA.opponentRoundStreak, pauseAvailable: state.stateA.pauseHalf !== half, strongMap: state.strongMapA, pistolRound, seed: `${state.seed}:${roundIndex}:a` };
  const contextB: RoundDecisionContext = { team: state.teamB, money: state.stateB.money, score: state.scoreB, opponentScore: state.scoreA, opponentRoundStreak: state.stateB.opponentRoundStreak, pauseAvailable: state.stateB.pauseHalf !== half, strongMap: state.strongMapB, pistolRound, seed: `${state.seed}:${roundIndex}:b` };
  const decisionA = normalizeRoundDecision(decisions.a ?? recommendRoundDecision(contextA), contextA);
  const decisionB = normalizeRoundDecision(decisions.b ?? recommendRoundDecision(contextB), contextB);
  if (decisionA.tacticalPause) { state.stateA.pauseHalf = half; state.stateA.pauseBoostRounds = 2; }
  if (decisionB.tacticalPause) { state.stateB.pauseHalf = half; state.stateB.pauseBoostRounds = 2; }
  const buyA: BuyDecision | 'pistol' = pistolRound ? 'pistol' : decisionA.buy;
  const buyB: BuyDecision | 'pistol' = pistolRound ? 'pistol' : decisionB.buy;
  const rng = createSeededRng(`${state.seed}:round:${roundIndex}`);
  const variationA = (createSeededRng(`${state.seed}:map-variation:a`)() - .5) * 7;
  const variationB = (createSeededRng(`${state.seed}:map-variation:b`)() - .5) * 7;
  const pauseA = state.stateA.pauseBoostRounds > 0 ? getTacticalPauseBoost(state.teamA) : 0;
  const pauseB = state.stateB.pauseBoostRounds > 0 ? getTacticalPauseBoost(state.teamB) : 0;
  const effectiveA = state.teamA.power + state.powerBonusA + variationA + EQUIPMENT_STRENGTH[buyA] + pauseA;
  const effectiveB = state.teamB.power + state.powerBonusB + variationB + EQUIPMENT_STRENGTH[buyB] + pauseB;
  let probabilityA = 1 / (1 + Math.exp(-(effectiveA - effectiveB) / 9));
  probabilityA -= clamp((state.scoreA - state.scoreB) * .004, -.035, .035);
  if (roundIndex >= 24) probabilityA += ((state.teamA.mental + state.teamA.clutch) - (state.teamB.mental + state.teamB.clutch)) / 1_100;
  probabilityA = clamp(probabilityA + (rng() - .5) * .09, .08, .92);
  const winner: RoundSide = rng() < probabilityA ? 'a' : 'b';
  if (winner === 'a') state.scoreA += 1; else state.scoreB += 1;
  state.overtime = state.overtime || (state.scoreA >= 12 && state.scoreB >= 12);
  const aStartsCt = createSeededRng(`${state.seed}:starting-side`)() < .5;
  const sideA = sideFor(roundIndex, aStartsCt);
  const sides: { a: TeamSide; b: TeamSide } = { a: sideA, b: sideA === 'ct' ? 't' : 'ct' };
  const details = buildKills(state, winner, { a: buyA, b: buyB }, sides, rng);
  const awpA = buyA === 'full' && teamPlayers(state.teamA).some((player) => player.awper) && contextA.money >= 5_600 && rng() < .85;
  const awpB = buyB === 'full' && teamPlayers(state.teamB).some((player) => player.awper) && contextB.money >= 5_600 && rng() < .85;
  const loser = winner === 'a' ? 'b' : 'a';
  const plantedA = loser === 'a' && sides.a === 't' && details.ending !== 'elimination';
  const plantedB = loser === 'b' && sides.b === 't' && details.ending !== 'elimination';
  const settledA = settleEconomy(state.stateA, buyA, awpA, winner === 'a', details.ending, details.kills, 'a', plantedA, decisionA.tacticalPause);
  const settledB = settleEconomy(state.stateB, buyB, awpB, winner === 'b', details.ending, details.kills, 'b', plantedB, decisionB.tacticalPause);
  state.stateA = settledA.state;
  state.stateB = settledB.state;
  const score = { a: state.scoreA, b: state.scoreB, overtime: state.overtime };
  state.rounds.push(score);
  state.events.push({ number: roundIndex + 1, winner, sideA, overtime: state.overtime, score, economy: { a: settledA.event, b: settledB.event }, ...details });
  state.round += 1;
  state.finished = mapFinished(state.scoreA, state.scoreB);
  if (state.finished) state.winnerId = state.scoreA > state.scoreB ? state.teamA.id : state.teamB.id;
  return state;
}

export function completeIncrementalMap(
  initial: IncrementalMapState,
  decisionProvider?: (state: IncrementalMapState) => Partial<Record<RoundSide, RoundDecision>>
): IncrementalMapState {
  let state = initial;
  let guard = 0;
  while (!state.finished && guard < 200) { state = advanceIncrementalMap(state, decisionProvider?.(state)); guard += 1; }
  if (!state.finished) throw new Error('Incremental map exceeded the round safety limit');
  return state;
}

export function toMapResult(state: IncrementalMapState): MapResult {
  if (!state.finished) throw new Error('Cannot finalize an unfinished map');
  return {
    map: state.map,
    ...(state.mapId ? { mapId: state.mapId } : {}),
    scoreA: state.scoreA,
    scoreB: state.scoreB,
    winnerId: state.winnerId,
    rounds: state.rounds,
    overtime: state.overtime,
    events: state.events
  };
}
