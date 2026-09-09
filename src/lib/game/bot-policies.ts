import { MAP_SIDE_BIAS } from './maps';
import type { SeededRng } from './simulation';
import type { CombatTeam, MapId, MapSide, OrgStyle } from './types';

/** How much a style likes the CT side (aggressive lineups prefer T, tactical lineups prefer CT). */
export const styleSidePreference = (style: OrgStyle | undefined) => (style === 'aggressive' ? -0.02 : style === 'tactical' ? 0.02 : 0);

/** CT preference of a team on a map: map bias plus the team's style. */
export const sidePreference = (style: OrgStyle | undefined, mapId: MapId | undefined) =>
  (mapId ? MAP_SIDE_BIAS[mapId] : 0) + styleSidePreference(style);

/** Bots lean towards the favoured side but stay a little unpredictable. */
export function botSidePick(team: Pick<CombatTeam, 'style'>, mapId: MapId | undefined, rng: SeededRng): MapSide {
  const ctProbability = 0.5 + sidePreference(team.style, mapId) * 6;
  return rng() < Math.max(0.15, Math.min(0.9, ctProbability)) ? 'ct' : 't';
}

/** Deterministic default for a human who let the side timer expire. */
export const defaultHumanSide = (style: OrgStyle | undefined, mapId: MapId | undefined): MapSide =>
  sidePreference(style, mapId) >= 0 ? 'ct' : 't';

/** What a bot does after losing the pistol round: force the second round or save for a guaranteed buy in the third. */
export function botEcoCall(team: Pick<CombatTeam, 'style'>, money: number, rng: SeededRng): 'force' | 'eco' {
  if (team.style === 'aggressive') return rng() < 0.8 ? 'force' : 'eco';
  if (team.style === 'tactical') return rng() < 0.75 ? 'eco' : 'force';
  if (money >= 2400) return rng() < 0.65 ? 'force' : 'eco';
  return rng() < 0.3 ? 'force' : 'eco';
}

/** Deterministic default for a human who let the eco-call timer expire. */
export const defaultHumanEcoCall = (style: OrgStyle | undefined, money = 0): 'force' | 'eco' =>
  style === 'aggressive' ? 'force' : style === 'tactical' ? 'eco' : money >= 2400 ? 'force' : 'eco';

/** Lost rounds in a row that call for a tactical timeout (bots, and players with the pause on automatic). */
export const TIMEOUT_LOSS_STREAK = 4;

/** Bots burn their tactical timeout after four straight lost rounds. */
export const botShouldTimeout = (lossStreak: number, timeoutsRemaining: number) => lossStreak >= TIMEOUT_LOSS_STREAK && timeoutsRemaining > 0;
