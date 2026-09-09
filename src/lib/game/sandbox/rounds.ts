import { getEligibleSlotRoles } from '../roleRules';
import { createSeededRng, type SeededRng } from '../simulation';
import type { LineupSlotRole, MapResult, Player, RoundEvent, RoundHighlight } from '../types';

export type SandboxBuy = 'pistol' | 'eco' | 'force' | 'full';
export type SandboxSide = 'ct' | 't';
export type SandboxTeamSide = 'a' | 'b';
export type SandboxWeapon =
  | 'ak47' | 'm4a1' | 'awp' | 'usp' | 'glock' | 'deagle' | 'famas' | 'galil'
  | 'mac10' | 'mp9' | 'fiveseven' | 'p250' | 'tec9' | 'knife';
export type SandboxRoundEnding = 'elimination' | 'bomb' | 'defuse' | 'time';

export interface SandboxTeamEconomy {
  buy: SandboxBuy;
  awp: boolean;
  /** Average money per player before the buy, rounded. */
  money: number;
}

export interface SandboxKill {
  killerId: string;
  killerName: string;
  killerSide: SandboxTeamSide;
  victimId: string;
  victimName: string;
  weapon: SandboxWeapon;
  headshot: boolean;
  /** Seconds into the round. */
  second: number;
}

export interface SandboxRoundDetail {
  number: number;
  winner: SandboxTeamSide;
  /** Side team A played this round (team B is the opposite). */
  sideA: SandboxSide;
  overtime: boolean;
  economy: { a: SandboxTeamEconomy; b: SandboxTeamEconomy };
  kills: SandboxKill[];
  ending: SandboxRoundEnding;
  highlight?: RoundHighlight | null;
}

export interface SandboxRoster {
  players: Player[];
  /** Roles assigned by the user (authoritative over data-derived roles). */
  roles?: Map<string, LineupSlotRole>;
}

export interface SandboxFragLine {
  playerId: string;
  name: string;
  side: SandboxTeamSide;
  kills: number;
  deaths: number;
  headshots: number;
}

/** Presentation adapter only: no randomness or narrative is generated after the shared engine finishes a round. */
export function roundEventsToSandboxDetails(events: RoundEvent[]): SandboxRoundDetail[] {
  return events.map((event) => ({
    number: event.number,
    winner: event.winner,
    sideA: event.sideA,
    overtime: event.overtime,
    economy: {
      a: { buy: event.economy.a.buy, awp: event.economy.a.awp, money: event.economy.a.moneyBefore },
      b: { buy: event.economy.b.buy, awp: event.economy.b.awp, money: event.economy.b.moneyBefore }
    },
    kills: event.kills,
    ending: event.ending,
    highlight: event.highlight
  }));
}

const START_MONEY = 800;
const MAX_MONEY = 16000;
const OVERTIME_MONEY = 10000;
const LOSS_BONUS = [1400, 1900, 2400, 2900, 3400];
const WIN_REWARD: Record<SandboxRoundEnding, number> = { elimination: 3250, bomb: 3500, defuse: 3500, time: 3250 };
const KILL_REWARD: Record<SandboxWeapon, number> = {
  ak47: 300, m4a1: 300, famas: 300, galil: 300, awp: 100, usp: 300, glock: 300, deagle: 300,
  fiveseven: 300, p250: 300, tec9: 300, mac10: 600, mp9: 600, knife: 1500
};
const BUY_COST: Record<SandboxBuy, number> = { pistol: 650, eco: 450, force: 2700, full: 4700 };
const AWP_EXTRA_COST = 450;
const BUY_RANK: Record<SandboxBuy, number> = { eco: 0, pistol: 1, force: 1, full: 2 };

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
  return Math.max(10, base + awpBonus);
};

const victimWeight = (player: Player) => Math.max(10, 115 - (player.consistency ?? 65) * 0.35 - (player.mental ?? 65) * 0.15);

function chooseBuy(money: number, pistolRound: boolean, hasAwper: boolean, rng: SeededRng): SandboxTeamEconomy {
  const rounded = Math.round(money);
  if (pistolRound) return { buy: 'pistol', awp: false, money: rounded };
  if (money < 1900) return { buy: 'eco', awp: false, money: rounded };
  if (money < 4000) {
    // Teams sometimes save with ~3.5k to guarantee a full buy next round.
    if (money >= 3400 && rng() < 0.3) return { buy: 'eco', awp: false, money: rounded };
    return { buy: 'force', awp: false, money: rounded };
  }
  const awp = hasAwper && money >= 5600 && rng() < 0.85;
  return { buy: 'full', awp, money: rounded };
}

function chooseWeapon(buy: SandboxTeamEconomy, side: SandboxSide, holdsAwp: boolean, rng: SeededRng): SandboxWeapon {
  if (rng() < 0.015) return 'knife';
  const sidePistol: SandboxWeapon = side === 'ct' ? 'usp' : 'glock';
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

const HEADSHOT_RATE: Record<SandboxWeapon, number> = {
  ak47: 0.45, m4a1: 0.42, famas: 0.4, galil: 0.4, awp: 0.08, usp: 0.52, glock: 0.48, deagle: 0.58,
  fiveseven: 0.5, p250: 0.5, tec9: 0.42, mac10: 0.33, mp9: 0.35, knife: 0
};

function roundSideA(index: number, aStartsCt: boolean): SandboxSide {
  const half = index < 24 ? Math.floor(index / 12) : 2 + Math.floor((index - 24) / 3);
  const aIsCt = half % 2 === 0 ? aStartsCt : !aStartsCt;
  return aIsCt ? 'ct' : 't';
}

/**
 * Derives a plausible economy + kill feed for a map that was already simulated.
 * Only the given seed drives the result, so the same map/seed always produces the same details.
 */
export function buildSandboxRoundDetails(map: MapResult, rosterA: SandboxRoster, rosterB: SandboxRoster, seed: string): SandboxRoundDetail[] {
  if (!rosterA.players.length || !rosterB.players.length) return [];
  const rng = createSeededRng(seed);
  const aStartsCt = rng() < 0.5;
  const rosters = { a: rosterA, b: rosterB };
  const awpers = {
    a: rosterA.players.filter((player) => isAwper(player, rosterA.roles)),
    b: rosterB.players.filter((player) => isAwper(player, rosterB.roles))
  };
  const money = { a: START_MONEY, b: START_MONEY };
  const lossStreak = { a: 0, b: 0 };
  const details: SandboxRoundDetail[] = [];

  map.rounds.forEach((score, index) => {
    const previous = index > 0 ? map.rounds[index - 1] : { a: 0, b: 0 };
    const winner: SandboxTeamSide = score.a > previous.a ? 'a' : 'b';
    const loser: SandboxTeamSide = winner === 'a' ? 'b' : 'a';
    const overtime = Boolean(score.overtime) || index >= 24;
    const pistolRound = index === 0 || index === 12;
    if (index >= 24 && (index - 24) % 3 === 0) {
      money.a = OVERTIME_MONEY;
      money.b = OVERTIME_MONEY;
      lossStreak.a = 0;
      lossStreak.b = 0;
    }
    const sideA = roundSideA(index, aStartsCt);
    const sides: Record<SandboxTeamSide, SandboxSide> = { a: sideA, b: sideA === 'ct' ? 't' : 'ct' };
    const economy = {
      a: chooseBuy(money.a, pistolRound, awpers.a.length > 0, rng),
      b: chooseBuy(money.b, pistolRound, awpers.b.length > 0, rng)
    };
    const awpHolder: Record<SandboxTeamSide, string | null> = {
      a: economy.a.awp ? awpers.a[Math.floor(rng() * awpers.a.length)]?.id ?? null : null,
      b: economy.b.awp ? awpers.b[Math.floor(rng() * awpers.b.length)]?.id ?? null : null
    };

    const gap = BUY_RANK[economy[winner].buy] - BUY_RANK[economy[loser].buy];
    const eliminationChance = Math.max(0.25, Math.min(0.9, 0.5 + gap * 0.15));
    let ending: SandboxRoundEnding;
    if (rng() < eliminationChance) ending = 'elimination';
    else if (sides[winner] === 't') ending = 'bomb';
    else ending = rng() < 0.7 ? 'defuse' : 'time';
    const winnerKills = ending === 'elimination' ? 5 : 1 + Math.floor(rng() * 4);
    const loserKills = Math.max(0, Math.min(4, Math.round(rng() * 3.6 - gap * 0.8 + (ending === 'elimination' ? -0.4 : 0.4))));

    // Every loser kill happens before the final winner kill so an eliminated team never frags after dying out.
    const order: SandboxTeamSide[] = [...Array<SandboxTeamSide>(winnerKills - 1).fill(winner), ...Array<SandboxTeamSide>(loserKills).fill(loser)];
    for (let cursor = order.length - 1; cursor > 0; cursor -= 1) {
      const target = Math.floor(rng() * (cursor + 1));
      [order[cursor], order[target]] = [order[target], order[cursor]];
    }
    order.push(winner);

    const alive: Record<SandboxTeamSide, Player[]> = { a: [...rosters.a.players], b: [...rosters.b.players] };
    const kills: SandboxKill[] = [];
    let second = 8 + rng() * 20;
    for (const side of order) {
      const other: SandboxTeamSide = side === 'a' ? 'b' : 'a';
      if (!alive[side].length || !alive[other].length) break;
      const killer = pick(rng, alive[side].map((player) => [player, killerWeight(player, awpHolder[side] === player.id)] as [Player, number]));
      const victim = pick(rng, alive[other].map((player) => [player, victimWeight(player)] as [Player, number]));
      alive[other] = alive[other].filter((player) => player.id !== victim.id);
      const weapon = chooseWeapon(economy[side], sides[side], awpHolder[side] === killer.id, rng);
      kills.push({
        killerId: killer.id, killerName: playerName(killer), killerSide: side,
        victimId: victim.id, victimName: playerName(victim),
        weapon, headshot: rng() < HEADSHOT_RATE[weapon], second: Math.round(Math.min(115, second))
      });
      second += 6 + rng() * 18;
    }

    details.push({ number: index + 1, winner, sideA, overtime, economy, kills, ending });

    // Settle the economy for the next round.
    const spend = (side: SandboxTeamSide) => BUY_COST[economy[side].buy] + (economy[side].awp ? AWP_EXTRA_COST : 0);
    const killIncome = (side: SandboxTeamSide) => kills.filter((kill) => kill.killerSide === side).reduce((sum, kill) => sum + KILL_REWARD[kill.weapon], 0) / 5;
    money[winner] = Math.min(MAX_MONEY, Math.max(0, money[winner] - spend(winner)) + WIN_REWARD[ending] + killIncome(winner));
    const bonus = LOSS_BONUS[Math.min(lossStreak[loser], LOSS_BONUS.length - 1)];
    const plantBonus = ending !== 'elimination' && sides[loser] === 't' ? 800 : 0;
    money[loser] = Math.min(MAX_MONEY, Math.max(0, money[loser] - spend(loser)) + bonus + plantBonus + killIncome(loser));
    lossStreak[loser] += 1;
    lossStreak[winner] = Math.max(0, lossStreak[winner] - 1);
  });

  return details;
}

/** Sums kills/deaths per player across the given rounds (optionally only the first `upToRound` rounds). */
export function aggregateSandboxKills(details: SandboxRoundDetail[], upToRound = details.length): SandboxFragLine[] {
  const lines = new Map<string, SandboxFragLine>();
  const line = (id: string, name: string, side: SandboxTeamSide) => {
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
      line(kill.victimId, kill.victimName, kill.killerSide === 'a' ? 'b' : 'a').deaths += 1;
    }
  }
  return [...lines.values()].sort((left, right) => right.kills - left.kills || left.deaths - right.deaths || left.name.localeCompare(right.name));
}

/** Pistol rounds won by each team in a map (rounds 1 and 13). */
export function countSandboxPistolWins(details: SandboxRoundDetail[]): { a: number; b: number } {
  return details
    .filter((round) => round.number === 1 || round.number === 13)
    .reduce((acc, round) => ({ ...acc, [round.winner]: acc[round.winner] + 1 }), { a: 0, b: 0 });
}
