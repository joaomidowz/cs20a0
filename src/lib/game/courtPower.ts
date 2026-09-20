/**
 * Court power: the real power scale of the online modes. It is the number on screen and the number that plays, and
 * it never reaches 100.
 *
 * The engine used to cut every team at MAX_TEAM_POWER + 4 (110) on match day, while collection synergy pushes raw
 * power to ~139: lineups of 112, 125 and 134 played exactly the same, so building a lineup well was worth nothing
 * once the cards were strong. Here nothing is cut. Up to the knee every point counts; above it each extra point
 * still counts, only less.
 *
 * The shift only renames the scale so the top sits below 100: inside a match `rounds.ts` reads power through the
 * DIFFERENCE between the two teams alone, so subtracting the same constant from both changes no result.
 *
 * No imports on purpose: this is a leaf, shared by the engine, the server and the screens.
 */

/** Raw power up to here counts in full. */
export const COURT_KNEE = 104;
/** Above the knee, how much of each extra raw point reaches the court. */
export const COURT_SLOPE = 0.12;
/** Subtracted everywhere so the strongest lineup on its best day stays under 100. Outcome-neutral. */
export const COURT_SHIFT = 10;
/** Raw power never goes below this before the curve (the floor `getMatchDayPower` has always had). */
export const COURT_RAW_FLOOR = 45;

/** Raw engine power to court power. */
export function courtPower(raw: number): number {
  return raw <= COURT_KNEE ? raw - COURT_SHIFT : COURT_KNEE - COURT_SHIFT + (raw - COURT_KNEE) * COURT_SLOPE;
}

/** The exact inverse of `courtPower`. */
export function rawFromCourt(court: number): number {
  const knee = COURT_KNEE - COURT_SHIFT;
  return court <= knee ? court + COURT_SHIFT : COURT_KNEE + (court - knee) / COURT_SLOPE;
}

/**
 * Raw power after adding `points` on the court scale. Structure (no IGL, a bot's Major pedigree) is priced this way
 * instead of as a percentage: under a compressive curve 1% is about one court point near 100 and about 0.12 at the
 * top, so a percentage that stings a lineup of GOATs would erase a beginner's. Court points hurt everybody the same.
 */
export const addCourtPoints = (raw: number, points: number): number => rawFromCourt(courtPower(raw) + points);

/** Match-day power from the team power and the day multiplier; the engine's default keeps the old cut at 110. */
export type MatchDayCurve = (power: number, multiplier: number) => number;

/** The curve goes over power × multiplier, where the old cut used to be: a good day still helps, it just helps less at the top. */
export const courtMatchDay: MatchDayCurve = (power, multiplier) => courtPower(Math.max(COURT_RAW_FLOOR, power * multiplier));
