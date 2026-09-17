import { createSeededRng } from '../simulation';
import type { CircuitEventStats, CircuitEvent, CircuitPlacement, CircuitResult, CircuitState, CircuitTier, DynastyState, HistoricalTeam, MajorRound, MajorStage } from '../types';
import circuitEventsJson from '../../data/cs/circuit-events.game.json';
import { stageOfTier } from './field';

export interface RealCircuitEvent {
  id: string;
  year: number;
  name: string;
  organizer: string;
  tier: CircuitTier;
  teams: number;
  format?: string;
  prizePool: number;
  location: string;
  liquipediaUrl: string;
  needsReview?: boolean;
}

export const REAL_CIRCUIT_EVENTS = circuitEventsJson as RealCircuitEvent[];
export const CIRCUIT_YEAR_MIN = 2016;
export const CIRCUIT_YEAR_MAX = 2026;

export function drawCircuitYear(seed: string, majorNumber: number): number {
  const rng = createSeededRng(`${seed}:circuit-year:${majorNumber}`);
  return CIRCUIT_YEAR_MIN + Math.floor(rng() * (CIRCUIT_YEAR_MAX - CIRCUIT_YEAR_MIN + 1));
}


/** Opponents of a legacy eight-team event (saves from before the Swiss stage). */
export const CIRCUIT_TEAMS = 7;
/** Opponents of a current event: 16 teams, a Swiss stage and an eight-team bracket. */
export const CIRCUIT_FIELD = 15;

export const CIRCUIT_PRIZES: Readonly<Record<CircuitTier, Readonly<Record<CircuitPlacement, number>>>> = {
  elite: { champion: 60_000, runnerUp: 25_000, semi: 12_000, quarter: 5_000, groups: 2_000 },
  open: { champion: 20_000, runnerUp: 8_000, semi: 4_000, quarter: 1_500, groups: 500 }
};

/** Events with this many opponents play a Swiss stage before the bracket; older events go straight to the playoffs. */
export const hasGroupStage = (event: Pick<CircuitEvent, 'teamIds'>) => event.teamIds.length >= CIRCUIT_FIELD;

/** Opponent pools by tier, strongest first; the last entry is the fallback when the main pools run dry. */
const TIER_POOLS: Readonly<Record<CircuitTier, readonly MajorStage[]>> = {
  elite: ['stage3', 'stage2', 'stage1'],
  open: ['stage2', 'stage1', 'stage3']
};

const LEGEND_PLACEMENTS = new Set(['placementChampion', 'placementRunnerUp', 'placement3to4', 'placement5to8']);

export function circuitPlacementFrom(placementKey: string): CircuitPlacement {
  if (placementKey === 'placementChampion') return 'champion';
  if (placementKey === 'placementRunnerUp') return 'runnerUp';
  if (placementKey === 'placement3to4') return 'semi';
  if (placementKey === 'placement5to8') return 'quarter';
  return 'groups';
}

function drawOpponents(tier: CircuitTier, teams: HistoricalTeam[], seed: string, count = CIRCUIT_FIELD): string[] {
  const rng = createSeededRng(seed);
  const pools = new Map<MajorStage, HistoricalTeam[]>([['stage1', []], ['stage2', []], ['stage3', []]]);
  for (const team of teams) pools.get(stageOfTier(team.tier))!.push(team);
  const [first, second, fallback] = TIER_POOLS[tier];
  const main = [...pools.get(first)!, ...pools.get(second)!].sort((left, right) => left.id.localeCompare(right.id));
  const backup = [...pools.get(fallback)!].sort((left, right) => left.id.localeCompare(right.id));
  const chosen: string[] = [];
  for (const pool of [main, backup]) {
    while (chosen.length < count && pool.length) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  }
  if (chosen.length < count) throw new Error(`Not enough teams for a ${tier} circuit event`);
  return chosen;
}

type CircuitPlan = Array<{ tier: CircuitTier; access: CircuitEvent['access']; index: number; unlockedByPrevious?: boolean }>;

/** Season between Majors by the placement just settled: Legends get three Elite invites plus two Open Cups, Stage 3 two of each, Challengers four Open Cups (the last two unlocked by a final in the previous one). */
export function circuitPlanFor(placement: string): CircuitPlan {
  if (LEGEND_PLACEMENTS.has(placement)) {
    return [
      { tier: 'elite', access: 'invite', index: 1 }, { tier: 'open', access: 'signup', index: 1 }, { tier: 'elite', access: 'invite', index: 2 },
      { tier: 'open', access: 'signup', index: 2 }, { tier: 'elite', access: 'invite', index: 3 }
    ];
  }
  if (placement === 'placementStage3') {
    return [
      { tier: 'open', access: 'signup', index: 1 }, { tier: 'elite', access: 'invite', index: 1 },
      { tier: 'open', access: 'signup', index: 2 }, { tier: 'elite', access: 'invite', index: 2 }
    ];
  }
  return [
    { tier: 'open', access: 'signup', index: 1 }, { tier: 'open', access: 'signup', index: 2 },
    { tier: 'open', access: 'signup', index: 3, unlockedByPrevious: true }, { tier: 'open', access: 'signup', index: 4, unlockedByPrevious: true }
  ];
}

export function createCircuit(input: { dynasty: DynastyState; teams: HistoricalTeam[]; seed: string }): CircuitState {
  const { dynasty } = input;
  const placement = dynasty.history.at(-1)?.placement ?? 'placementStage1';
  const plan = circuitPlanFor(placement);
  const year = drawCircuitYear(input.seed, dynasty.majorNumber);
  const pickRng = createSeededRng(`${input.seed}:circuit-events:${dynasty.majorNumber}`);
  const pools: Record<CircuitTier, RealCircuitEvent[]> = {
    elite: REAL_CIRCUIT_EVENTS.filter((real) => real.year === year && real.tier === 'elite').sort((a, b) => a.id.localeCompare(b.id)),
    open: REAL_CIRCUIT_EVENTS.filter((real) => real.year === year && real.tier === 'open').sort((a, b) => a.id.localeCompare(b.id))
  };
  const pickReal = (tier: CircuitTier): Partial<CircuitEvent> => {
    const pool = pools[tier];
    if (!pool.length) return {};
    const real = pool.splice(Math.floor(pickRng() * pool.length), 1)[0];
    return { sourceId: real.id, name: real.name, year: real.year, realPrizePool: real.prizePool, location: real.location, organizer: real.organizer };
  };
  const events: CircuitEvent[] = [];
  plan.forEach((item, position) => {
    const id = `circuit-${dynasty.majorNumber}-${position + 1}`;
    const teamIds = drawOpponents(item.tier, input.teams, `${input.seed}:circuit:${dynasty.majorNumber}:${position + 1}`);
    events.push({ ...pickReal(item.tier), id, tier: item.tier, access: item.access, index: item.index, teamIds, ...(item.unlockedByPrevious ? { unlockedBy: events[position - 1].id } : {}) });
  });
  return { majorNumber: dynasty.majorNumber, year, events, results: [], skipped: [], brackets: {}, finished: false };
}

export const isEventDone = (circuit: CircuitState, eventId: string): boolean =>
  circuit.results.some((result) => result.eventId === eventId) || circuit.skipped.includes(eventId);

export function isEventAvailable(circuit: CircuitState, event: CircuitEvent): boolean {
  if (isEventDone(circuit, event.id)) return false;
  if (!event.unlockedBy) return true;
  const gate = circuit.results.find((result) => result.eventId === event.unlockedBy);
  return Boolean(gate && (gate.placement === 'champion' || gate.placement === 'runnerUp'));
}

/** Credits one event once; a second call for the same event returns the same state. */
export function settleCircuitEvent(dynasty: DynastyState, result: CircuitResult, rounds: MajorRound[], stats?: CircuitEventStats): DynastyState {
  const circuit = dynasty.circuit;
  if (!circuit || isEventDone(circuit, result.eventId)) return dynasty;
  return {
    ...dynasty,
    cash: dynasty.cash + Math.round(result.prize),
    circuit: {
      ...circuit,
      results: [...circuit.results, result],
      brackets: { ...circuit.brackets, [result.eventId]: rounds },
      ...(stats ? { stats: { ...(circuit.stats ?? {}), [result.eventId]: stats } } : {})
    }
  };
}

export function skipCircuitEvent(dynasty: DynastyState, eventId: string): DynastyState {
  const circuit = dynasty.circuit;
  if (!circuit || isEventDone(circuit, eventId)) return dynasty;
  return { ...dynasty, circuit: { ...circuit, skipped: [...circuit.skipped, eventId] } };
}

/** Closes the circuit and records its results on the Major that opened it. */
export function finishCircuit(dynasty: DynastyState): DynastyState {
  const circuit = dynasty.circuit;
  if (!circuit || circuit.finished) return dynasty;
  const history = dynasty.history.map((summary, index) =>
    index === dynasty.history.length - 1 && summary.majorNumber === circuit.majorNumber ? { ...summary, circuit: circuit.results } : summary);
  return { ...dynasty, history, circuit: { ...circuit, finished: true } };
}
