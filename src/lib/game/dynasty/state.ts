import type { DynastyMajorSummary, DynastyState, DynastyStatus, MajorRun, MajorStage, PlayerRunStats, SelectedPlayer } from '../types';
import { awardsBonus, prizeForPlacement } from './prizes';

export const createDynastyState = (): DynastyState => ({
  majorNumber: 1,
  cash: 0,
  coachId: null,
  status: 'challenger',
  entryStage: 'stage1',
  titles: 0,
  history: [],
  playerOverrides: {},
  window: null,
  prizeCreditedFor: 0
});

/** Where the organization starts the next Major, given where the last one ended. Playoffs or better make it a Legend. */
export function entryForPlacement(placement: string): { entryStage: MajorStage; status: DynastyStatus } {
  if (placement === 'placementStage1' || placement === 'placementStage2') return { entryStage: 'stage1', status: 'challenger' };
  if (placement === 'placementStage3') return { entryStage: 'stage2', status: 'challenger' };
  return { entryStage: 'stage3', status: 'legend' };
}

export interface SettleInput {
  seed: string;
  lineup: SelectedPlayer[];
  stats: PlayerRunStats[];
}

/** Credits prize and bonus once, records the Major and decides the next entry. A second call for the same Major returns the same state. */
export function settleDynastyMajor(dynasty: DynastyState, run: MajorRun, input: SettleInput): DynastyState {
  if (dynasty.prizeCreditedFor >= dynasty.majorNumber) return dynasty;
  const prize = prizeForPlacement(run.placement);
  const bonus = awardsBonus(run.tournament?.awards, input.lineup.map((selected) => selected.playerId));
  const summary: DynastyMajorSummary = {
    majorNumber: dynasty.majorNumber,
    seed: input.seed,
    entryStage: dynasty.entryStage,
    placement: run.placement,
    prize,
    awardsBonus: bonus,
    lineup: input.lineup,
    coachId: dynasty.coachId,
    movesMade: 0,
    stats: input.stats
  };
  const next = entryForPlacement(run.placement);
  return {
    ...dynasty,
    cash: dynasty.cash + prize + bonus,
    titles: dynasty.titles + (run.champion ? 1 : 0),
    history: [...dynasty.history, summary],
    entryStage: next.entryStage,
    status: next.status,
    prizeCreditedFor: dynasty.majorNumber
  };
}

/** Opens the next Major of the dynasty. Only valid once the current one was settled. */
export function beginNextDynastyMajor(dynasty: DynastyState): DynastyState {
  if (dynasty.prizeCreditedFor < dynasty.majorNumber) throw new Error('Settle the current Major before starting the next one');
  return { ...dynasty, majorNumber: dynasty.majorNumber + 1, window: null };
}

const isStage = (value: unknown): value is MajorStage => value === 'stage1' || value === 'stage2' || value === 'stage3';
const positiveInt = (value: unknown, fallback: number, minimum: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : fallback;

/** A saved dynasty (possibly from an older build or edited by hand) comes back complete and inside its bounds. */
export function ensureDynastyState(saved: unknown): DynastyState {
  const base = createDynastyState();
  if (!saved || typeof saved !== 'object') return base;
  const raw = saved as Partial<Record<keyof DynastyState, unknown>>;
  return {
    ...base,
    majorNumber: positiveInt(raw.majorNumber, 1, 1),
    cash: typeof raw.cash === 'number' && Number.isFinite(raw.cash) ? Math.max(0, Math.round(raw.cash)) : 0,
    coachId: typeof raw.coachId === 'string' ? raw.coachId : null,
    status: raw.status === 'legend' ? 'legend' : 'challenger',
    entryStage: isStage(raw.entryStage) ? raw.entryStage : 'stage1',
    titles: positiveInt(raw.titles, 0, 0),
    history: Array.isArray(raw.history) ? (raw.history as DynastyMajorSummary[]) : [],
    playerOverrides: raw.playerOverrides && typeof raw.playerOverrides === 'object' ? (raw.playerOverrides as DynastyState['playerOverrides']) : {},
    window: null,
    prizeCreditedFor: positiveInt(raw.prizeCreditedFor, 0, 0)
  };
}
