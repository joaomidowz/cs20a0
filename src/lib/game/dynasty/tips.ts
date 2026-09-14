export type TipContext = 'identity' | 'series-plan' | 'team-tab' | 'training' | 'window' | 'swap';

export interface DynastyTip {
  id: string;
  context: TipContext;
}

/** One tip per screen of the Dinastia, in the order the player meets them. The texts live in DynastyTip.svelte. */
export const DYNASTY_TIPS: readonly DynastyTip[] = [
  { id: 'tip-identity', context: 'identity' },
  { id: 'tip-series-plan', context: 'series-plan' },
  { id: 'tip-team-tab', context: 'team-tab' },
  { id: 'tip-training', context: 'training' },
  { id: 'tip-window', context: 'window' },
  { id: 'tip-swap', context: 'swap' }
];

export interface TipState {
  seen: string[];
  disabled: boolean;
}

export const DEFAULT_TIP_STATE: TipState = { seen: [], disabled: false };

const KNOWN_IDS = new Set(DYNASTY_TIPS.map((tip) => tip.id));

export function nextTip(context: TipContext, state: TipState): DynastyTip | null {
  if (state.disabled) return null;
  return DYNASTY_TIPS.find((tip) => tip.context === context && !state.seen.includes(tip.id)) ?? null;
}

export const markTipSeen = (state: TipState, id: string): TipState =>
  state.seen.includes(id) ? state : { ...state, seen: [...state.seen, id] };

export const disableTips = (state: TipState): TipState => ({ ...state, disabled: true });

export function parseTipState(raw: string | null): TipState {
  if (!raw) return DEFAULT_TIP_STATE;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_TIP_STATE;
    const { seen, disabled } = value as { seen?: unknown; disabled?: unknown };
    if (!Array.isArray(seen) || typeof disabled !== 'boolean') return DEFAULT_TIP_STATE;
    return { seen: seen.filter((id): id is string => typeof id === 'string' && KNOWN_IDS.has(id)), disabled };
  } catch {
    return DEFAULT_TIP_STATE;
  }
}

export const serializeTipState = (state: TipState): string => JSON.stringify({ seen: state.seen, disabled: state.disabled });
