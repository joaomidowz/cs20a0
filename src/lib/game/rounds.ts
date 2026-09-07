import { botEcoCall, botShouldTimeout, botSidePick, styleSidePreference } from './bot-policies';
import { MAP_SIDE_BIAS } from './maps';
import { getEligibleSlotRoles } from './roleRules';
import { getWinProbability, type SeededRng } from './simulation';
import type {
  BuyType,
  CombatTeam,
  LineupSlotRole,
  MapId,
  MapResult,
  MapSide,
  Player,
  Roster,
  RoundDetail,
  RoundEnding,
  RoundHighlight,
  RoundKill,
  RoundScore,
  RoundTag,
  SeriesDecision,
  TeamEconomy,
  TeamSide,
  Weapon
} from './types';

export type Controller = 'human' | 'bot';

export type MapDecision =
  | { type: 'side'; side: MapSide }
  | { type: 'eco-call'; call: 'force' | 'eco' };

export type MapPendingDecision =
  | { type: 'side'; teamId: string; side: TeamSide }
  | { type: 'eco-call'; teamId: string; side: TeamSide; roundNumber: number; money: number };

export interface MapStateOptions {
  rng: SeededRng;
  mapNumber?: number;
  mapId?: MapId;
  powerBonusA?: number;
  powerBonusB?: number;
  rosterA?: Roster;
  rosterB?: Roster;
  /** Team that chooses its starting side. Omit (or pass null) for a coin flip. */
  sidePickerTeamId?: string | null;
  controllers?: { a: Controller; b: Controller };
  pickedBy?: string | null;
}

interface TeamRuntime {
  team: CombatTeam;
  roster: Roster | null;
  awpers: Player[];
  money: number;
  lossStreak: number;
  momentum: number;
  timeoutsRemaining: number;
  maxDeficit: number;
  /** Buy the team committed to for the next round (eco call). */
  plannedBuy: BuyType | null;
  /** After saving on purpose the team buys as soon as it can afford rifles. */
  savedForBuy: boolean;
}

export interface MapState {
  mapNumber: number;
  mapId?: MapId;
  rng: SeededRng;
  controllers: { a: Controller; b: Controller };
  teams: { a: TeamRuntime; b: TeamRuntime };
  scoreA: number;
  scoreB: number;
  rounds: RoundScore[];
  details: RoundDetail[];
  halves: Array<{ a: number; b: number }>;
  halfStart: { a: number; b: number };
  aStartsCt: boolean | null;
  sidePicker: TeamSide | null;
  pickedBy: string | null;
  pendingSide: TeamSide | null;
  pendingEcoCall: { side: TeamSide; roundNumber: number } | null;
  pendingTimeout: TeamSide | null;
  finished: boolean;
  winner: TeamSide | null;
  comeback: TeamSide | null;
  decisions: SeriesDecision[];
}

export class MapDecisionError extends Error {
  constructor(public readonly code: 'DECISION_NOT_PENDING' | 'INVALID_DECISION' | 'TIMEOUT_UNAVAILABLE' | 'MAP_FINISHED', message: string) {
    super(message);
    this.name = 'MapDecisionError';
  }
}

const START_MONEY = 800;
const MAX_MONEY = 16000;
const OVERTIME_MONEY = 10000;
const LOSS_BONUS = [1400, 1900, 2400, 2900, 3400];
const WIN_REWARD: Record<RoundEnding, number> = { elimination: 3250, bomb: 3500, defuse: 3500, time: 3250 };
const KILL_REWARD: Record<Weapon, number> = {
  ak47: 300, m4a1: 300, famas: 300, galil: 300, awp: 100, usp: 300, glock: 300, deagle: 300,
  fiveseven: 300, p250: 300, tec9: 300, mac10: 600, mp9: 600, knife: 1500
};
const BUY_COST: Record<BuyType, number> = { pistol: 650, eco: 450, force: 2700, full: 4700 };
const SAVE_COST = 200;
const AWP_EXTRA_COST = 450;
const FULL_BUY_MONEY = 3600;
/** Share of a buy the round winner has to replace: utility plus the gear of the players who died. */
const WINNER_REBUY_BASE = 0.2;
const BUY_RANK: Record<BuyType, number> = { eco: 0, pistol: 1, force: 1, full: 2 };
/** Round-win edge of each buy: the difference between the two teams' values is added to the round probability. */
const BUY_EDGE: Record<BuyType, number> = { eco: 0, pistol: 0.112, force: 0.19, full: 0.35 };
/**
 * Kills the losing team gets before the round is decided, as weights for 0..4 kills, indexed by the buy gap
 * (winner rank minus loser rank, -2..2). A full buy that loses to an eco still trades most of its players;
 * an eco that loses to a full buy rarely gets more than one.
 */
const LOSER_KILL_WEIGHTS: number[][] = [
  [1, 3, 12, 48, 36],
  [1, 5, 20, 50, 24],
  [1, 4, 26, 53, 16],
  [13, 23, 33, 25, 6],
  [45, 35, 15, 4, 1]
];
/** Winner kills when the bomb or the clock decides the round instead of a wipe, as weights for 1..5 kills. */
const WINNER_KILL_WEIGHTS: Record<Exclude<RoundEnding, 'elimination'>, number[]> = {
  bomb: [3, 8, 27, 36, 26],
  defuse: [3, 8, 27, 36, 26],
  time: [6, 16, 38, 40, 0]
};
/**
 * Multiplier on a player's chance of the next kill by the kills it already has in the round: after an opening kill the
 * teammates take the trades, while a player with three kills is in a dominant position and tends to close the round.
 */
const HOT_HAND = [1, 0.55, 0.4, 2, 5];
const MOMENTUM_STEP = 0.01;
const MAX_MOMENTUM = 5;
const TIMEOUT_BONUS = 0.05;
const REGULATION_ROUNDS = 24;
const HALF_ROUNDS = 12;
const OVERTIME_HALF_ROUNDS = 3;
const COMEBACK_DEFICIT = 4;

const HEADSHOT_RATE: Record<Weapon, number> = {
  ak47: 0.45, m4a1: 0.42, famas: 0.4, galil: 0.4, awp: 0.08, usp: 0.52, glock: 0.48, deagle: 0.58,
  fiveseven: 0.5, p250: 0.5, tec9: 0.42, mac10: 0.33, mp9: 0.35, knife: 0
};

const number = (value: number | null | undefined, fallback: number) => (Number.isFinite(value) ? Number(value) : fallback);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const other = (side: TeamSide): TeamSide => (side === 'a' ? 'b' : 'a');
const playerName = (player: Player) => player.nickname?.trim() || player.id;

const pick = <T,>(rng: SeededRng, options: Array<[T, number]>): T => {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng() * total;
  for (const [value, weight] of options) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return options[options.length - 1][0];
};

const isAwper = (player: Player, roles?: Map<string, LineupSlotRole>) => {
  const assigned = roles?.get(player.id);
  if (assigned) return assigned === 'awper';
  return getEligibleSlotRoles(player).includes('awper') || (player.awp ?? 0) >= 85;
};

const killerWeight = (player: Player, holdsAwp: boolean) => {
  const base = (player.firepower ?? 70) * 0.6 + (player.entry ?? 65) * 0.25 + (player.overall ?? 75) * 0.15;
  const awpBonus = holdsAwp ? (player.awp ?? 70) * 0.5 : 0;
  // Squared so stars take a clearly bigger share of the frags (and of the multi-kills) than role players.
  return Math.max(10, base + awpBonus) ** 2;
};

const victimWeight = (player: Player) => Math.max(10, 115 - (player.consistency ?? 65) * 0.35 - (player.mental ?? 65) * 0.15);

const rosterAverage = (roster: Roster | null, keys: Array<keyof Player>, fallback: number) => {
  if (!roster?.players.length) return fallback;
  const values = roster.players.flatMap((player) => keys.map((key) => number(player[key] as number, fallback)));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

/** Steadier lineups swing less: 0 for consistency ≤ 70, 1 for consistency ≥ 100. */
export const stabilityOf = (team: Pick<CombatTeam, 'consistency'>) => clamp((number(team.consistency, 80) - 70) / 30, 0, 1);

function chooseBuy(runtime: TeamRuntime, pistolRound: boolean, rng: SeededRng): TeamEconomy {
  const money = runtime.money;
  const rounded = Math.round(money);
  const hasAwper = runtime.roster ? runtime.awpers.length > 0 : true;
  if (pistolRound) return { buy: 'pistol', awp: false, money: rounded };
  if (runtime.plannedBuy) {
    const planned = runtime.plannedBuy;
    runtime.plannedBuy = null;
    if (planned === 'eco') {
      runtime.savedForBuy = true;
      return { buy: 'eco', awp: false, money: rounded };
    }
    return { buy: 'force', awp: false, money: rounded };
  }
  if (runtime.savedForBuy && money >= 3200) {
    runtime.savedForBuy = false;
    return { buy: 'full', awp: hasAwper && money >= 5600 && rng() < 0.85, money: rounded };
  }
  if (money < 1900) return { buy: 'eco', awp: false, money: rounded };
  if (money < FULL_BUY_MONEY) {
    // Teams sometimes save with ~3.4k to guarantee a full buy next round.
    if (money >= 3400 && rng() < 0.3) {
      runtime.savedForBuy = true;
      return { buy: 'eco', awp: false, money: rounded };
    }
    return { buy: 'force', awp: false, money: rounded };
  }
  runtime.savedForBuy = false;
  const awp = hasAwper && money >= 5600 && rng() < 0.85;
  return { buy: 'full', awp, money: rounded };
}

function chooseWeapon(buy: TeamEconomy, side: MapSide, holdsAwp: boolean, rng: SeededRng): Weapon {
  if (rng() < 0.015) return 'knife';
  const sidePistol: Weapon = side === 'ct' ? 'usp' : 'glock';
  switch (buy.buy) {
    case 'pistol':
      return pick(rng, [[sidePistol, 88], ['deagle', 12]]);
    case 'eco':
      return pick(rng, [['p250', 40], [side === 'ct' ? 'fiveseven' : 'tec9', 25], ['deagle', 20], [sidePistol, 15]]);
    case 'force':
      return side === 'ct'
        ? pick(rng, [['famas', 45], ['mp9', 25], ['deagle', 20], ['usp', 10]])
        : pick(rng, [['galil', 45], ['mac10', 25], ['deagle', 20], ['glock', 10]]);
    case 'full':
      if (holdsAwp) return pick(rng, [['awp', 85], ['deagle', 15]]);
      return side === 'ct'
        ? pick(rng, [['m4a1', 85], ['deagle', 10], ['usp', 5]])
        : pick(rng, [['ak47', 85], ['deagle', 10], ['glock', 5]]);
  }
}

const halfIndexOf = (roundIndex: number) =>
  roundIndex < REGULATION_ROUNDS ? Math.floor(roundIndex / HALF_ROUNDS) : 2 + Math.floor((roundIndex - REGULATION_ROUNDS) / OVERTIME_HALF_ROUNDS);

function sideAFor(roundIndex: number, aStartsCt: boolean): MapSide {
  const aIsCt = halfIndexOf(roundIndex) % 2 === 0 ? aStartsCt : !aStartsCt;
  return aIsCt ? 'ct' : 't';
}

const createRuntime = (team: CombatTeam, roster: Roster | undefined, variation: number, bonus: number): TeamRuntime => ({
  team: { ...team, power: team.power + variation + bonus },
  roster: roster?.players.length ? roster : null,
  awpers: roster?.players.filter((player) => isAwper(player, roster.roles)) ?? [],
  money: START_MONEY,
  lossStreak: 0,
  momentum: 0,
  timeoutsRemaining: 1,
  maxDeficit: 0,
  plannedBuy: null,
  savedForBuy: false
});

export function createMapState(teamA: CombatTeam, teamB: CombatTeam, options: MapStateOptions): MapState {
  const { rng } = options;
  const swing = (team: CombatTeam) => (rng() - 0.5) * 4 * (1 - stabilityOf(team) * 0.5);
  const variationA = swing(teamA);
  const variationB = swing(teamB);
  const sidePicker: TeamSide | null = options.sidePickerTeamId === teamA.id ? 'a' : options.sidePickerTeamId === teamB.id ? 'b' : null;
  const coinFlip = rng() < 0.5;
  return {
    mapNumber: options.mapNumber ?? 1,
    mapId: options.mapId,
    rng,
    controllers: options.controllers ?? { a: 'bot', b: 'bot' },
    teams: {
      a: createRuntime(teamA, options.rosterA, variationA, options.powerBonusA ?? 0),
      b: createRuntime(teamB, options.rosterB, variationB, options.powerBonusB ?? 0)
    },
    scoreA: 0,
    scoreB: 0,
    rounds: [],
    details: [],
    halves: [],
    halfStart: { a: 0, b: 0 },
    aStartsCt: sidePicker ? null : coinFlip,
    sidePicker,
    pickedBy: options.pickedBy ?? null,
    pendingSide: sidePicker,
    pendingEcoCall: null,
    pendingTimeout: null,
    finished: false,
    winner: null,
    comeback: null,
    decisions: []
  };
}

const teamIdOf = (state: MapState, side: TeamSide) => state.teams[side].team.id;

export function pendingDecision(state: MapState): MapPendingDecision | null {
  if (state.finished) return null;
  if (state.pendingSide) return { type: 'side', teamId: teamIdOf(state, state.pendingSide), side: state.pendingSide };
  if (state.pendingEcoCall) {
    return {
      type: 'eco-call',
      teamId: teamIdOf(state, state.pendingEcoCall.side),
      side: state.pendingEcoCall.side,
      roundNumber: state.pendingEcoCall.roundNumber,
      money: Math.round(state.teams[state.pendingEcoCall.side].money)
    };
  }
  return null;
}

export function applyDecision(state: MapState, decision: MapDecision, auto = false): void {
  const pending = pendingDecision(state);
  if (!pending || pending.type !== decision.type) throw new MapDecisionError('DECISION_NOT_PENDING', `No ${decision.type} decision is pending`);
  const mapIndex = state.mapNumber - 1;
  if (decision.type === 'side') {
    if (decision.side !== 'ct' && decision.side !== 't') throw new MapDecisionError('INVALID_DECISION', 'Side must be ct or t');
    const pickerIsCt = decision.side === 'ct';
    state.aStartsCt = pending.side === 'a' ? pickerIsCt : !pickerIsCt;
    state.pendingSide = null;
    state.decisions.push({ kind: 'side', teamId: pending.teamId, mapIndex, side: decision.side, auto });
    return;
  }
  if (pending.type !== 'eco-call') throw new MapDecisionError('DECISION_NOT_PENDING', 'No eco call is pending');
  if (decision.call !== 'force' && decision.call !== 'eco') throw new MapDecisionError('INVALID_DECISION', 'Eco call must be force or eco');
  state.teams[pending.side].plannedBuy = decision.call;
  state.pendingEcoCall = null;
  state.decisions.push({ kind: 'eco-call', teamId: pending.teamId, mapIndex, roundNumber: pending.roundNumber, call: decision.call, auto });
}

/** Resolves the pending decision with the bot policy (used for bots and for humans whose timer expired). */
export function autoDecide(state: MapState): void {
  const pending = pendingDecision(state);
  if (!pending) return;
  const runtime = state.teams[pending.side];
  if (pending.type === 'side') {
    applyDecision(state, { type: 'side', side: botSidePick(runtime.team, state.mapId, state.rng) }, true);
    return;
  }
  applyDecision(state, { type: 'eco-call', call: botEcoCall(runtime.team, runtime.money, state.rng) }, true);
}

export const getTimeoutsRemaining = (state: MapState, teamId: string) =>
  teamIdOf(state, 'a') === teamId ? state.teams.a.timeoutsRemaining : teamIdOf(state, 'b') === teamId ? state.teams.b.timeoutsRemaining : 0;

export const getCurrentSideA = (state: MapState): MapSide | null =>
  state.aStartsCt === null || state.finished ? null : sideAFor(state.rounds.length, state.aStartsCt);

export const getMapScore = (state: MapState) => ({ a: state.scoreA, b: state.scoreB, overtime: state.rounds.length >= REGULATION_ROUNDS });

export const getRounds = (state: MapState): RoundDetail[] => state.details;

export const isMapFinished = (state: MapState) => state.finished;

/** Calls a tactical timeout before the next round (one per half). Returns false when none is left. */
export function requestTimeout(state: MapState, teamId: string, auto = false): boolean {
  if (state.finished) throw new MapDecisionError('MAP_FINISHED', 'The map is over');
  const side: TeamSide | null = teamIdOf(state, 'a') === teamId ? 'a' : teamIdOf(state, 'b') === teamId ? 'b' : null;
  if (!side) throw new MapDecisionError('INVALID_DECISION', 'Unknown team');
  if (state.pendingTimeout || state.teams[side].timeoutsRemaining <= 0) return false;
  state.teams[side].timeoutsRemaining -= 1;
  state.pendingTimeout = side;
  state.decisions.push({ kind: 'timeout', teamId, mapIndex: state.mapNumber - 1, roundNumber: state.rounds.length + 1, auto });
  return true;
}

function roundProbabilityA(state: MapState, roundIndex: number, economy: { a: TeamEconomy; b: TeamEconomy }, sideA: MapSide): number {
  const { a, b } = state.teams;
  const base = getWinProbability(a.team, b.team);
  const pistolRound = roundIndex === 0 || roundIndex === HALF_ROUNDS;
  const overtime = roundIndex >= REGULATION_ROUNDS;
  // Whoever is CT gets the map's CT tilt; each team's style adds its own preference for the side it is playing.
  const sideBias = (sideA === 'ct' ? 1 : -1) * ((state.mapId ? MAP_SIDE_BIAS[state.mapId] : 0) + styleSidePreference(a.team.style) + styleSidePreference(b.team.style));
  let probability: number;
  if (pistolRound) {
    const pistolSkill = (rosterAverage(a.roster, ['firepower', 'entry'], 80) - rosterAverage(b.roster, ['firepower', 'entry'], 80)) * 0.004;
    probability = 0.5 + (base - 0.5) * 0.3 + pistolSkill + sideBias * 0.5;
  } else {
    const economyEdge = BUY_EDGE[economy.a.buy] - BUY_EDGE[economy.b.buy];
    const momentumEdge = (streak: number, opponent: CombatTeam) => MOMENTUM_STEP * streak * (1 - clamp((number(opponent.mental, 80) - 80) / 100, -0.2, 0.2));
    probability = base + economyEdge + sideBias + momentumEdge(a.momentum, b.team) - momentumEdge(b.momentum, a.team);
  }
  if (state.pendingTimeout) probability += state.pendingTimeout === 'a' ? TIMEOUT_BONUS : -TIMEOUT_BONUS;
  if (overtime) {
    const mentalA = (number(a.team.mental, 80) + number(a.team.clutch, 80)) / 2;
    const mentalB = (number(b.team.mental, 80) + number(b.team.clutch, 80)) / 2;
    probability += (mentalA - mentalB) / 550;
  }
  const noise = (state.rng() - 0.5) * 0.06;
  return clamp(probability + noise, 0.03, 0.97);
}

function buildKills(state: MapState, winner: TeamSide, ending: RoundEnding, economy: { a: TeamEconomy; b: TeamEconomy }, sides: Record<TeamSide, MapSide>) {
  const rng = state.rng;
  const loser = other(winner);
  const gap = BUY_RANK[economy[winner].buy] - BUY_RANK[economy[loser].buy];
  const rosters = { a: state.teams.a.roster, b: state.teams.b.roster };
  const awpHolder: Record<TeamSide, string | null> = {
    a: economy.a.awp && state.teams.a.awpers.length ? state.teams.a.awpers[Math.floor(rng() * state.teams.a.awpers.length)]?.id ?? null : null,
    b: economy.b.awp && state.teams.b.awpers.length ? state.teams.b.awpers[Math.floor(rng() * state.teams.b.awpers.length)]?.id ?? null : null
  };
  const weighted = (weights: number[], offset: number) => pick(rng, weights.map((weight, index) => [index + offset, weight] as [number, number]));
  const winnerKills = ending === 'elimination' ? 5 : weighted(WINNER_KILL_WEIGHTS[ending], 1);
  const loserKills = weighted(LOSER_KILL_WEIGHTS[clamp(gap, -2, 2) + 2], 0);
  // Every loser kill happens before the final winner kill so an eliminated team never frags after dying out.
  const order: TeamSide[] = [...Array<TeamSide>(winnerKills - 1).fill(winner), ...Array<TeamSide>(loserKills).fill(loser)];
  for (let cursor = order.length - 1; cursor > 0; cursor -= 1) {
    const target = Math.floor(rng() * (cursor + 1));
    [order[cursor], order[target]] = [order[target], order[cursor]];
  }
  order.push(winner);
  const kills: RoundKill[] = [];
  if (!rosters.a || !rosters.b) return { kills, clutch: false, winnerDeaths: loserKills, highlight: null, multiKill: null };
  const alive: Record<TeamSide, Player[]> = { a: [...rosters.a.players], b: [...rosters.b.players] };
  const killsBy = new Map<string, number>();
  let second = 8 + rng() * 20;
  let clutch: { player: Player; against: number; kills: number } | null = null;
  for (const side of order) {
    const enemy = other(side);
    if (!alive[side].length || !alive[enemy].length) break;
    const killer = pick(rng, alive[side].map((player) => [player, killerWeight(player, awpHolder[side] === player.id) * HOT_HAND[Math.min(HOT_HAND.length - 1, killsBy.get(player.id) ?? 0)]] as [Player, number]));
    const victim = pick(rng, alive[enemy].map((player) => [player, victimWeight(player)] as [Player, number]));
    alive[enemy] = alive[enemy].filter((player) => player.id !== victim.id);
    const weapon = chooseWeapon(economy[side], sides[side], awpHolder[side] === killer.id, rng);
    kills.push({
      killerId: killer.id, killerName: playerName(killer), killerSide: side,
      victimId: victim.id, victimName: playerName(victim),
      weapon, headshot: rng() < HEADSHOT_RATE[weapon], second: Math.round(Math.min(115, second))
    });
    killsBy.set(killer.id, (killsBy.get(killer.id) ?? 0) + 1);
    second += 6 + rng() * 18;
    // The winner is down to its last player while two or more enemies still stand: a clutch is on. From here on
    // every kill in the round belongs to that survivor (the loser never frags after the winner's last death).
    if (side === loser && alive[winner].length === 1 && alive[loser].length >= 2 && !clutch) {
      clutch = { player: alive[winner][0], against: alive[loser].length, kills: 0 };
    } else if (clutch && side === winner) clutch.kills += 1;
  }
  return { kills, clutch: clutch !== null, winnerDeaths: loserKills, ...pickHighlight(kills, winner, clutch) };
}

const HIGHLIGHT_RANK: Record<RoundHighlight['kind'], number> = { ace: 5, quad: 3, triple: 1, clutch: 0 };
const highlightRank = (highlight: RoundHighlight) => (highlight.kind === 'clutch' ? ((highlight.against ?? 0) >= 3 ? 4 : 2) : HIGHLIGHT_RANK[highlight.kind]);

/**
 * The single feat worth flashing for the round: ace > 1v3+ clutch > 4k > 1v2 clutch > 3k, the winner's feat first on
 * ties. Also returns the multi-kill tag for the best fragger of the round (either side).
 */
function pickHighlight(kills: RoundKill[], winner: TeamSide, clutch: { player: Player; against: number; kills: number } | null): { highlight: RoundHighlight | null; multiKill: RoundTag | null } {
  const lines = new Map<string, RoundHighlight>();
  for (const kill of kills) {
    const line = lines.get(kill.killerId) ?? { kind: 'triple', playerId: kill.killerId, playerName: kill.killerName, side: kill.killerSide, kills: 0 };
    line.kills += 1;
    lines.set(kill.killerId, line);
  }
  const candidates: RoundHighlight[] = [...lines.values()]
    .filter((line) => line.kills >= 3)
    .map((line) => ({ ...line, kind: line.kills >= 5 ? 'ace' : line.kills === 4 ? 'quad' : 'triple' }));
  const best = candidates.reduce<RoundHighlight | null>((top, line) => (!top || line.kills > top.kills || (line.kills === top.kills && line.side === winner && top.side !== winner) ? line : top), null);
  const multiKill: RoundTag | null = best ? (best.kind === 'ace' ? 'ace' : best.kind === 'quad' ? '4k' : '3k') : null;
  const clutchHighlight: RoundHighlight | null = clutch
    ? { kind: 'clutch', playerId: clutch.player.id, playerName: playerName(clutch.player), side: winner, kills: clutch.kills, against: clutch.against }
    : null;
  const highlight = [best, clutchHighlight]
    .filter((entry): entry is RoundHighlight => entry !== null)
    .sort((left, right) => highlightRank(right) - highlightRank(left))[0] ?? null;
  return { highlight, multiKill };
}

/**
 * Plays the next round. Throws when a decision (side or eco call) is still pending: callers resolve it with
 * `applyDecision` (humans) or `autoDecide` (bots and expired timers) first.
 */
export function playNextRound(state: MapState): RoundDetail {
  if (state.finished) throw new MapDecisionError('MAP_FINISHED', 'The map is over');
  const pending = pendingDecision(state);
  if (pending) throw new MapDecisionError('DECISION_NOT_PENDING', `A ${pending.type} decision must be resolved first`);
  const rng = state.rng;
  const index = state.rounds.length;
  const overtime = index >= REGULATION_ROUNDS;
  const pistolRound = index === 0 || index === HALF_ROUNDS;
  const { a, b } = state.teams;

  // A new half: fresh timeout, momentum cools down, overtime resets the economy.
  if (index > 0 && halfIndexOf(index) !== halfIndexOf(index - 1)) {
    for (const runtime of [a, b]) {
      runtime.timeoutsRemaining = 1;
      runtime.momentum = Math.floor(runtime.momentum / 2);
      runtime.plannedBuy = null;
      runtime.savedForBuy = false;
    }
    state.halfStart = { a: state.scoreA, b: state.scoreB };
  }
  if (overtime && (index - REGULATION_ROUNDS) % OVERTIME_HALF_ROUNDS === 0) {
    a.money = OVERTIME_MONEY;
    b.money = OVERTIME_MONEY;
    a.lossStreak = 0;
    b.lossStreak = 0;
  }

  const sideA = sideAFor(index, state.aStartsCt ?? true);
  const sides: Record<TeamSide, MapSide> = { a: sideA, b: sideA === 'ct' ? 't' : 'ct' };
  const economy = { a: chooseBuy(a, pistolRound, rng), b: chooseBuy(b, pistolRound, rng) };
  const momentumBefore = { a: a.momentum, b: b.momentum };
  const timeout = state.pendingTimeout;
  if (timeout) state.teams[other(timeout)].momentum = 0;
  const deficitBefore = { a: state.scoreB - state.scoreA, b: state.scoreA - state.scoreB };

  const probability = roundProbabilityA(state, index, economy, sideA);
  const winner: TeamSide = rng() < probability ? 'a' : 'b';
  const loser = other(winner);

  const gap = BUY_RANK[economy[winner].buy] - BUY_RANK[economy[loser].buy];
  // Most rounds end with a wipe; the bomb and the clock decide the rest, more often when the buys are even.
  const eliminationChance = clamp(0.6 + gap * 0.125, 0.35, 0.92);
  let ending: RoundEnding;
  if (rng() < eliminationChance) ending = 'elimination';
  else if (sides[winner] === 't') ending = 'bomb';
  else ending = rng() < 0.7 ? 'defuse' : 'time';
  const { kills, clutch, winnerDeaths, highlight, multiKill } = buildKills(state, winner, ending, economy, sides);

  if (winner === 'a') state.scoreA += 1;
  else state.scoreB += 1;
  state.rounds.push({ a: state.scoreA, b: state.scoreB, overtime });

  // Settle the economy for the next round.
  const spend = (side: TeamSide) => (economy[side].buy === 'eco' && state.teams[side].savedForBuy ? SAVE_COST : BUY_COST[economy[side].buy]) + (economy[side].awp ? AWP_EXTRA_COST : 0);
  const killIncome = (side: TeamSide) => kills.filter((kill) => kill.killerSide === side).reduce((sum, kill) => sum + KILL_REWARD[kill.weapon], 0) / 5;
  const winnerRuntime = state.teams[winner];
  const loserRuntime = state.teams[loser];
  // Survivors keep their guns: the winner only replaces utility and what its fallen players carried.
  const winnerSpend = spend(winner) * Math.min(1, WINNER_REBUY_BASE + winnerDeaths / 5);
  winnerRuntime.money = Math.min(MAX_MONEY, Math.max(0, winnerRuntime.money - winnerSpend) + WIN_REWARD[ending] + killIncome(winner));
  const bonus = LOSS_BONUS[Math.min(loserRuntime.lossStreak, LOSS_BONUS.length - 1)];
  const plantBonus = ending !== 'elimination' && sides[loser] === 't' ? 800 : 0;
  loserRuntime.money = Math.min(MAX_MONEY, Math.max(0, loserRuntime.money - spend(loser)) + bonus + plantBonus + killIncome(loser));
  loserRuntime.lossStreak += 1;
  winnerRuntime.lossStreak = Math.max(0, winnerRuntime.lossStreak - 1);
  winnerRuntime.momentum = Math.min(MAX_MOMENTUM, winnerRuntime.momentum + 1);
  loserRuntime.momentum = 0;
  a.maxDeficit = Math.max(a.maxDeficit, state.scoreB - state.scoreA);
  b.maxDeficit = Math.max(b.maxDeficit, state.scoreA - state.scoreB);

  // Tags for the presentation layer.
  const tags: RoundTag[] = [];
  if (pistolRound) tags.push('pistol');
  if (!pistolRound && economy[winner].buy === 'full' && economy[loser].buy === 'eco') tags.push('anti-eco');
  if (!pistolRound && economy[winner].buy === 'eco' && economy[loser].buy !== 'eco') tags.push('eco-win');
  if (!pistolRound && economy[winner].buy === 'force' && economy[loser].buy === 'full') tags.push('force-win');
  if (clutch) tags.push('clutch');
  if (multiKill) tags.push(multiKill);
  if (momentumBefore[loser] >= 3) tags.push('streak-break');
  if (index === HALF_ROUNDS - 1 || index === REGULATION_ROUNDS - 1) tags.push('half-end');
  if (deficitBefore[winner] >= COMEBACK_DEFICIT - 3 && winnerRuntime.maxDeficit >= COMEBACK_DEFICIT && winnerRuntime.momentum >= 3) tags.push('comeback-alert');

  // Half bookkeeping and the end of the map.
  const total = state.scoreA + state.scoreB;
  const closeHalf = () => state.halves.push({ a: state.scoreA - state.halfStart.a, b: state.scoreB - state.halfStart.b });
  if (total === HALF_ROUNDS || total === REGULATION_ROUNDS) closeHalf();
  if (!overtime) {
    if (state.scoreA >= 13 || state.scoreB >= 13) finish(state, winner);
    else if ((state.scoreA === 12 && state.scoreB < 12) || (state.scoreB === 12 && state.scoreA < 12)) tags.push('match-point');
  } else {
    const blockStart = REGULATION_ROUNDS + Math.floor((index - REGULATION_ROUNDS) / (OVERTIME_HALF_ROUNDS * 2)) * OVERTIME_HALF_ROUNDS * 2;
    const before = state.rounds[blockStart - 1];
    const blockA = state.scoreA - before.a;
    const blockB = state.scoreB - before.b;
    const blockLength = state.rounds.length - blockStart;
    if (blockA === 4 || blockB === 4) {
      state.halves.push({ a: blockA, b: blockB });
      finish(state, winner);
    } else if (blockLength === OVERTIME_HALF_ROUNDS * 2) {
      // 3-3: another overtime block starts with a fresh economy.
      state.halves.push({ a: blockA, b: blockB });
    } else if ((blockA === 3 && blockB < 3) || (blockB === 3 && blockA < 3)) tags.push('match-point');
  }

  const detail: RoundDetail = {
    number: index + 1,
    winner,
    sideA,
    overtime,
    economy,
    kills,
    ending,
    momentum: momentumBefore,
    ...(timeout ? { timeout } : {}),
    tags,
    ...(highlight ? { highlight } : {})
  };
  state.details.push(detail);
  state.pendingTimeout = null;

  if (!state.finished) {
    // The pistol loser decides how to play the second round: humans get a prompt, bots decide now.
    if (pistolRound) {
      if (state.controllers[loser] === 'human') state.pendingEcoCall = { side: loser, roundNumber: index + 2 };
      else {
        state.pendingEcoCall = { side: loser, roundNumber: index + 2 };
        autoDecide(state);
      }
    }
    for (const side of ['a', 'b'] as TeamSide[]) {
      const runtime = state.teams[side];
      if (state.controllers[side] === 'bot' && botShouldTimeout(runtime.lossStreak, runtime.timeoutsRemaining)) requestTimeout(state, runtime.team.id, true);
    }
  }
  return detail;
}

function finish(state: MapState, winner: TeamSide) {
  state.finished = true;
  if (state.rounds.length <= REGULATION_ROUNDS && state.halves.length < 2) {
    state.halves.push({ a: state.scoreA - state.halfStart.a, b: state.scoreB - state.halfStart.b });
  }
  state.winner = winner;
  state.pendingEcoCall = null;
  state.pendingTimeout = null;
  const runtime = state.teams[winner];
  const firstHalf = state.halves[0];
  const lostFirstHalfBadly = firstHalf ? (winner === 'a' ? firstHalf.b - firstHalf.a : firstHalf.a - firstHalf.b) >= COMEBACK_DEFICIT : false;
  if (runtime.maxDeficit >= COMEBACK_DEFICIT || lostFirstHalfBadly) state.comeback = winner;
}

export function toMapResult(state: MapState): MapResult {
  const winnerId = state.finished && state.winner ? teamIdOf(state, state.winner) : '';
  return {
    map: state.mapNumber,
    ...(state.mapId ? { mapId: state.mapId } : {}),
    scoreA: state.scoreA,
    scoreB: state.scoreB,
    winnerId,
    rounds: [...state.rounds],
    overtime: state.rounds.some((round) => round.overtime),
    details: [...state.details],
    ...(state.aStartsCt === null ? {} : { aStartsCt: state.aStartsCt }),
    halves: state.halves.map((half) => ({ ...half })),
    ...(state.comeback ? { comeback: state.comeback } : {}),
    pickedBy: state.pickedBy,
    ...(state.sidePicker ? { sidePickerId: teamIdOf(state, state.sidePicker) } : {}),
    ...(state.decisions.length ? { decisions: state.decisions.map((decision) => ({ ...decision })) } : {})
  };
}

/** Runs a whole map with bot policies for every decision. */
export function playMapToEnd(state: MapState): MapResult {
  while (!state.finished) {
    if (pendingDecision(state)) autoDecide(state);
    else playNextRound(state);
  }
  return toMapResult(state);
}

/** Mirrors a round detail so team B becomes team A. */
export function flipRoundDetail(detail: RoundDetail): RoundDetail {
  return {
    ...detail,
    winner: other(detail.winner),
    sideA: detail.sideA === 'ct' ? 't' : 'ct',
    economy: { a: detail.economy.b, b: detail.economy.a },
    kills: detail.kills.map((kill) => ({ ...kill, killerSide: other(kill.killerSide) })),
    ...(detail.momentum ? { momentum: { a: detail.momentum.b, b: detail.momentum.a } } : {}),
    ...(detail.timeout ? { timeout: other(detail.timeout) } : {}),
    ...(detail.highlight ? { highlight: { ...detail.highlight, side: other(detail.highlight.side) } } : {})
  };
}

/** Mirrors a map result (scores, rounds, details, halves) so team B becomes team A. */
export function flipMapResult(map: MapResult): MapResult {
  return {
    ...map,
    scoreA: map.scoreB,
    scoreB: map.scoreA,
    rounds: map.rounds.map((round) => ({ ...round, a: round.b, b: round.a })),
    ...(map.details ? { details: map.details.map(flipRoundDetail) } : {}),
    ...(map.aStartsCt === undefined ? {} : { aStartsCt: !map.aStartsCt }),
    ...(map.halves ? { halves: map.halves.map((half) => ({ a: half.b, b: half.a })) } : {}),
    ...(map.comeback ? { comeback: other(map.comeback) } : {})
  };
}

export interface FragLine {
  playerId: string;
  name: string;
  side: TeamSide;
  kills: number;
  deaths: number;
  headshots: number;
}

/** Sums kills/deaths per player across the given rounds (optionally only the first `upToRound` rounds). */
export function aggregateKills(details: RoundDetail[], upToRound = details.length): FragLine[] {
  const lines = new Map<string, FragLine>();
  const line = (id: string, name: string, side: TeamSide) => {
    let entry = lines.get(id);
    if (!entry) {
      entry = { playerId: id, name, side, kills: 0, deaths: 0, headshots: 0 };
      lines.set(id, entry);
    }
    return entry;
  };
  for (const round of details.slice(0, Math.max(0, upToRound))) {
    for (const kill of round.kills) {
      const killer = line(kill.killerId, kill.killerName, kill.killerSide);
      killer.kills += 1;
      if (kill.headshot) killer.headshots += 1;
      line(kill.victimId, kill.victimName, other(kill.killerSide)).deaths += 1;
    }
  }
  return [...lines.values()].sort((left, right) => right.kills - left.kills || left.deaths - right.deaths || left.name.localeCompare(right.name));
}

/** Pistol rounds won by each team in a map (rounds 1 and 13). */
export function countPistolWins(details: RoundDetail[]): { a: number; b: number } {
  return details
    .filter((round) => round.number === 1 || round.number === HALF_ROUNDS + 1)
    .reduce((acc, round) => ({ ...acc, [round.winner]: acc[round.winner] + 1 }), { a: 0, b: 0 });
}
