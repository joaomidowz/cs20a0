// src/lib/game/rating.ts
import { MAP_SIDE_BIAS } from './maps';
import type { MapId, MapSide, RoundDetail, TeamSide } from './types';

/**
 * Rating 3.0 (approximation) and Round Swing, read from the kill feed the engine already produced. Nothing here uses the
 * engine's RNG: damage and utility come from a private generator seeded by series, map and round, so the match is never
 * altered. HLTV does not publish the Rating 3.0 weights; the formula below extends the public 2.0 fit with Round Swing.
 */

export const TRADE_WINDOW_SECONDS = 5;
export const ROSTER_SIZE = 5;

/** Chance of winning the round with `own` players alive against `enemy`, before the map side. */
const ADVANTAGE: Readonly<Record<string, number>> = {
  '5:5': 0.5, '5:4': 0.71, '5:3': 0.87, '5:2': 0.96, '5:1': 0.99,
  '4:4': 0.5, '4:3': 0.7, '4:2': 0.88, '4:1': 0.97,
  '3:3': 0.5, '3:2': 0.72, '3:1': 0.92,
  '2:2': 0.5, '2:1': 0.78,
  '1:1': 0.5
};

const clampAlive = (value: number) => Math.max(0, Math.min(ROSTER_SIZE, Math.round(value)));

export function aliveWinProbability(own: number, enemy: number): number {
  const mine = clampAlive(own);
  const theirs = clampAlive(enemy);
  if (mine === 0) return 0;
  if (theirs === 0) return 1;
  return mine >= theirs ? ADVANTAGE[`${mine}:${theirs}`] : 1 - ADVANTAGE[`${theirs}:${mine}`];
}

/** Adds the map's CT tilt to an open round (a decided round stays at 0 or 1), kept inside 1%–99%. */
export function sideAdjustedProbability(probability: number, side: MapSide, mapId?: MapId): number {
  if (probability <= 0 || probability >= 1) return probability;
  const bias = mapId ? MAP_SIDE_BIAS[mapId] : 0;
  return Math.min(0.99, Math.max(0.01, probability + (side === 'ct' ? bias : -bias)));
}

/** Small deterministic generator (FNV-1a seed, mulberry32 steps) for statistics only. */
export function statRng(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export const contributionKey = (side: TeamSide, playerId: string) => `${side}:${playerId}`;

export interface RoundContribution {
  side: TeamSide;
  kills: number;
  deaths: number;
  assists: number;
  flashAssists: number;
  /** Kill, assist, survival or traded death in the round. */
  kast: boolean;
  /** Damage from kills and damage assists. */
  damage: number;
  utilityDamage: number;
  /** Sum of the round-win probability changes credited to the player (fraction: 0.21 = 21 percentage points). */
  swing: number;
  openingKill: boolean;
  openingDeath: boolean;
  tradeKills: number;
  tradedDeath: boolean;
}

export interface RoundAnalysisOptions {
  /** Players of each side on this map (everyone who killed, died or assisted on it). */
  roster: { a: readonly string[]; b: readonly string[] };
  mapId?: MapId;
  /** Unique per series, map and round. */
  seed: string;
  /** Relative chance of being credited with a utility event (defaults to 1). */
  utilityWeight?: (side: TeamSide, playerId: string) => number;
}

const other = (side: TeamSide): TeamSide => (side === 'a' ? 'b' : 'a');

export function analyzeRound(detail: RoundDetail, options: RoundAnalysisOptions): Map<string, RoundContribution> {
  const rng = statRng(options.seed);
  const lines = new Map<string, RoundContribution>();
  const ensure = (side: TeamSide, playerId: string) => {
    const key = contributionKey(side, playerId);
    let line = lines.get(key);
    if (!line) {
      line = { side, kills: 0, deaths: 0, assists: 0, flashAssists: 0, kast: false, damage: 0, utilityDamage: 0, swing: 0, openingKill: false, openingDeath: false, tradeKills: 0, tradedDeath: false };
      lines.set(key, line);
    }
    return line;
  };
  for (const side of ['a', 'b'] as TeamSide[]) for (const playerId of options.roster[side]) ensure(side, playerId);

  const alive: Record<TeamSide, number> = { a: ROSTER_SIZE, b: ROSTER_SIZE };
  const probabilityA = () => sideAdjustedProbability(aliveWinProbability(alive.a, alive.b), detail.sideA, options.mapId);
  const deaths: Array<{ victimSide: TeamSide; victimId: string; killerId: string; second: number; traded: boolean }> = [];

  detail.kills.forEach((kill, index) => {
    const killerSide = kill.killerSide;
    const victimSide = other(killerSide);
    const killer = ensure(killerSide, kill.killerId);
    const victim = ensure(victimSide, kill.victimId);
    const assistant = kill.assistId ? ensure(killerSide, kill.assistId) : null;

    const before = probabilityA();
    alive[victimSide] = Math.max(0, alive[victimSide] - 1);
    const after = probabilityA();
    const gain = killerSide === 'a' ? after - before : before - after;
    killer.swing += assistant ? gain * 0.7 : gain;
    if (assistant) assistant.swing += gain * 0.3;
    victim.swing -= gain;

    killer.kills += 1;
    victim.deaths += 1;
    if (index === 0) {
      killer.openingKill = true;
      victim.openingDeath = true;
    }
    const assistDamage = assistant ? 30 + Math.floor(rng() * 41) : 0;
    killer.damage += 100 - assistDamage;
    if (assistant) {
      assistant.damage += assistDamage;
      assistant.assists += 1;
    }
    if (kill.flashAssistId) ensure(killerSide, kill.flashAssistId).flashAssists += 1;

    // The killer of an earlier teammate dies within the window: that teammate's death was traded.
    const traded = deaths.find((death) => !death.traded && death.killerId === kill.victimId && death.victimSide === killerSide && kill.second - death.second <= TRADE_WINDOW_SECONDS);
    if (traded) {
      traded.traded = true;
      ensure(killerSide, traded.victimId).tradedDeath = true;
      killer.tradeKills += 1;
    }
    deaths.push({ victimSide, victimId: kill.victimId, killerId: kill.killerId, second: kill.second, traded: false });
  });

  for (const side of ['a', 'b'] as TeamSide[]) {
    const players = options.roster[side];
    if (!players.length) continue;
    const events = Math.floor(rng() * 3);
    for (let event = 0; event < events; event += 1) {
      const amount = 8 + Math.floor(rng() * 38);
      const weights = players.map((playerId) => Math.max(0.01, options.utilityWeight?.(side, playerId) ?? 1));
      let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
      let chosen = players[players.length - 1];
      for (let index = 0; index < players.length; index += 1) {
        roll -= weights[index];
        if (roll < 0) {
          chosen = players[index];
          break;
        }
      }
      ensure(side, chosen).utilityDamage += amount;
    }
  }

  for (const line of lines.values()) {
    line.kast = line.kills > 0 || line.assists > 0 || line.flashAssists > 0 || line.deaths === 0 || line.tradedDeath;
  }
  return lines;
}

export interface RatingLine {
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  kastRounds: number;
  damage: number;
  utilityDamage: number;
  /** Sum of swing fractions over every round played. */
  swing: number;
}

const perRound = (value: number, rounds: number) => value / Math.max(1, rounds);

export const kastPercent = (line: RatingLine) => perRound(line.kastRounds, line.rounds) * 100;
export const adrOf = (line: RatingLine) => perRound(line.damage + line.utilityDamage, line.rounds);
export const swingPerRound = (line: RatingLine) => perRound(line.swing, line.rounds) * 100;
export const impactOf = (line: RatingLine) => 2.13 * perRound(line.kills, line.rounds) + 0.42 * perRound(line.assists, line.rounds) - 0.41;

/** raw = 0.0073·KAST + 0.3591·KPR − 0.5329·DPR + 0.2372·impact + 0.0032·ADR + 0.03·swing (percentage points per round). */
export function rawRating3(line: RatingLine): number {
  if (line.rounds <= 0) return 0;
  return 0.0073 * kastPercent(line)
    + 0.3591 * perRound(line.kills, line.rounds)
    - 0.5329 * perRound(line.deaths, line.rounds)
    + 0.2372 * impactOf(line)
    + 0.0032 * adrOf(line)
    + 0.03 * swingPerRound(line);
}

/** Mean raw rating of every player with at least one round: the divisor that makes the field average 1.00. */
export function ratingBaseline(lines: RatingLine[]): number {
  const played = lines.filter((line) => line.rounds > 0);
  return played.length ? played.reduce((sum, line) => sum + rawRating3(line), 0) / played.length : 0;
}

export const rating3 = (raw: number, baseline: number) => Number((baseline > 0 ? raw / baseline : 0).toFixed(2));
