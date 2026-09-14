import type { CircuitState, DynastyMajorPlan, DynastyMajorSummary, DynastyState, DynastyStatus, MajorRun, MajorStage, PlayerRunStats, SelectedPlayer, SeriesPlan, WindowState } from '../types';
import { awardsBonus, prizeForPlacement } from './prizes';

export const createDynastyState = (): DynastyState => ({
  majorNumber: 1,
  majorRules: 2,
  major: null,
  cash: 0,
  coachId: null,
  coachRerollsUsed: 0,
  status: 'challenger',
  entryStage: 'stage1',
  titles: 0,
  history: [],
  playerOverrides: {},
  window: null,
  circuit: null,
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
  overalls?: Record<string, number>;
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
    stats: input.stats,
    rules: dynasty.majorRules,
    training: dynasty.major?.training ?? null,
    ...(input.overalls ? { overalls: input.overalls } : {})
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
  const majorNumber = dynasty.majorNumber + 1;
  const major = dynasty.major ? { ...dynasty.major, majorNumber, plans: {}, confirmed: true as const, training: null } : null;
  return { ...dynasty, majorNumber, majorRules: 2, major, window: null };
}

const isStage = (value: unknown): value is MajorStage => value === 'stage1' || value === 'stage2' || value === 'stage3';
const isStyle = (value: unknown): value is SeriesPlan['style'] => value === 'aggressive' || value === 'balanced' || value === 'tactical';
const isTactic = (value: unknown): value is SeriesPlan['tactic'] => value === 'standard' || value === 'pressure' || value === 'control' || value === 'antistrat';
const isTraining = (value: unknown): value is NonNullable<DynastyMajorPlan['training']> => value === 'aim' || value === 'utility' || value === 'clutch' || value === 'opening' || value === 'recovery';
const normalizeSeriesPlan = (value: unknown): SeriesPlan | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SeriesPlan>;
  return isStyle(raw.style) && isTactic(raw.tactic) ? { style: raw.style, tactic: raw.tactic, study: raw.study === true } : null;
};
const normalizeMajorPlan = (value: unknown, majorNumber: number): DynastyMajorPlan | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DynastyMajorPlan>;
  const basePlan = normalizeSeriesPlan(raw.basePlan);
  if (!basePlan || raw.rules !== 2 || raw.majorNumber !== majorNumber) return null;
  const plans = Object.fromEntries(Object.entries(raw.plans && typeof raw.plans === 'object' ? raw.plans : {})
    .flatMap(([seriesId, plan]) => { const normalized = normalizeSeriesPlan(plan); return normalized ? [[seriesId, normalized]] : []; }));
  return { majorNumber, rules: 2, training: isTraining(raw.training) ? raw.training : null, basePlan, plans, confirmed: raw.confirmed !== false };
};
const positiveInt = (value: unknown, fallback: number, minimum: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : fallback;

const isWindowState = (value: unknown): value is WindowState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WindowState>;
  return typeof candidate.majorNumber === 'number' && typeof candidate.cashAtOpen === 'number' && typeof candidate.maxMoves === 'number'
    && Array.isArray(candidate.baseLineup) && Array.isArray(candidate.moves) && Array.isArray(candidate.offers)
    && Array.isArray(candidate.proposals) && Array.isArray(candidate.evolution) && Array.isArray(candidate.coachOfferIds);
};

const isCircuitState = (value: unknown): value is CircuitState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CircuitState>;
  return typeof candidate.majorNumber === 'number' && Array.isArray(candidate.events) && Array.isArray(candidate.results)
    && Array.isArray(candidate.skipped) && typeof candidate.finished === 'boolean'
    && Boolean(candidate.brackets) && typeof candidate.brackets === 'object';
};

/** A saved dynasty (possibly from an older build or edited by hand) comes back complete and inside its bounds. */
export function ensureDynastyState(saved: unknown): DynastyState {
  const base = createDynastyState();
  if (!saved || typeof saved !== 'object') return base;
  const raw = saved as Partial<Record<keyof DynastyState, unknown>>;
  const majorNumber = positiveInt(raw.majorNumber, 1, 1);
  const majorRules = raw.majorRules === 2 ? 2 : 1;
  const major = majorRules === 2 ? normalizeMajorPlan(raw.major, majorNumber) : null;
  return {
    ...base,
    majorRules,
    major,
    majorNumber,
    cash: typeof raw.cash === 'number' && Number.isFinite(raw.cash) ? Math.max(0, Math.round(raw.cash)) : 0,
    coachId: typeof raw.coachId === 'string' ? raw.coachId : null,
    coachRerollsUsed: positiveInt(raw.coachRerollsUsed, 0, 0),
    status: raw.status === 'legend' ? 'legend' : 'challenger',
    entryStage: isStage(raw.entryStage) ? raw.entryStage : 'stage1',
    titles: positiveInt(raw.titles, 0, 0),
    history: Array.isArray(raw.history) ? (raw.history as DynastyMajorSummary[]) : [],
    playerOverrides: raw.playerOverrides && typeof raw.playerOverrides === 'object' ? (raw.playerOverrides as DynastyState['playerOverrides']) : {},
    window: isWindowState(raw.window) ? raw.window : null,
    circuit: isCircuitState(raw.circuit) ? raw.circuit : null,
    prizeCreditedFor: positiveInt(raw.prizeCreditedFor, 0, 0)
  };
}
