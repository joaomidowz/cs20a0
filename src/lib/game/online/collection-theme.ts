/**
 * Thematic synergy of the collection: a lineup built around one team, one country or one year gets a bonus.
 * Pure and shared — the server applies it to the tournament team and the builder previews the same numbers.
 */

/** Scene blocs: the country groups Counter-Strike actually splits into. Every country of the pool belongs to one. */
export type SceneBloc = 'cis' | 'nordic' | 'latam' | 'westEurope' | 'eastEurope' | 'asiaOceania' | 'northAmerica' | 'mena';

const BLOC_COUNTRIES: Readonly<Record<SceneBloc, readonly string[]>> = {
  cis: ['ru', 'ua', 'kz', 'by', 'uz', 'az'],
  nordic: ['dk', 'se', 'fi', 'no'],
  latam: ['br', 'ar', 'uy', 'cl', 'gt'],
  westEurope: ['fr', 'de', 'gb', 'es', 'pt', 'nl', 'be', 'ch'],
  eastEurope: ['pl', 'cz', 'sk', 'hu', 'ro', 'bg', 'lt', 'lv', 'ee', 'xk', 'mk', 'ba', 'rs', 'me'],
  asiaOceania: ['cn', 'mn', 'au', 'nz', 'in', 'id', 'hk', 'my', 'tw'],
  northAmerica: ['us', 'ca'],
  mena: ['tr', 'il', 'jo', 'za']
};

/** Country (flag-icons code) to its bloc; the map the lookup reads. */
export const SCENE_BLOCS: Readonly<Record<string, SceneBloc>> = Object.fromEntries(
  Object.entries(BLOC_COUNTRIES).flatMap(([bloc, countries]) => countries.map((country) => [country, bloc as SceneBloc]))
);

export const blocOf = (country: string | null | undefined): SceneBloc | null => (country ? SCENE_BLOCS[country] ?? null : null);

/**
 * How much a shared theme is worth by how many share it: the last member is worth more than the others together.
 * Team and year count the coach, so they close at six; country never does, so it closes at five for the same +2%.
 */
export const THEME_LADDER: Readonly<Record<number, number>> = { 0: 0, 1: 0, 2: 0.25, 3: 0.5, 4: 1, 5: 1.5, 6: 2 };
/** The ladder of a line the coach cannot join: the fifth player is the one that closes it. */
export const THEME_LADDER_PLAYERS: Readonly<Record<number, number>> = { 0: 0, 1: 0, 2: 0.25, 3: 0.5, 4: 1, 5: 2 };
/** Each theme line is worth at most this much power... */
export const THEME_LINE_CAP = 2;
/** ...and the three of them together at most this much. */
export const THEME_TOTAL_CAP = 6;
/** The looser level of a line (same org, same bloc) pays this share of the ladder. */
export const THEME_LOOSE_RATIO = 0.5;

/** What the rule needs from one card; the coach fills the same shape with `country` null (it never counts for country). */
export interface ThemeMember {
  country: string | null;
  teamId: string | null;
  /** Organization of the team-year, so Astralis 2016 and Astralis 2019 recognise each other. */
  org: string | null;
  year: number | null;
}

export interface ThemeLine {
  key: 'theme_team' | 'theme_country' | 'theme_year';
  power: number;
  /** What the lineup is built around, for the builder to name it: a team-year id, a country code, a bloc or a year. */
  theme: string;
  count: number;
  /** The tight level (same team-year, same country) instead of the loose one (same org, same bloc). */
  exact: boolean;
}

/** The value shared by most members, with how many share it; null values never form a group, and one alone is no theme. */
function biggestGroup<T>(values: readonly (T | null | undefined)[]): { value: T; count: number } | null {
  const counts = new Map<T, number>();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: T; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best && best.count >= 2 ? best : null;
}

type Ladder = Readonly<Record<number, number>>;
const ladder = (scale: Ladder, count: number) => scale[Math.min(count, 6)] ?? 0;

/** The better of the two levels of a line: the tight one at full value, the loose one at THEME_LOOSE_RATIO. */
function bestLevel<T, L>(scale: Ladder, tight: readonly (T | null)[], loose: readonly (L | null)[]): Omit<ThemeLine, 'key'> | null {
  const exact = biggestGroup(tight);
  const wide = biggestGroup(loose);
  const exactPower = exact ? ladder(scale, exact.count) : 0;
  const widePower = wide ? ladder(scale, wide.count) * THEME_LOOSE_RATIO : 0;
  if (exact && exactPower >= widePower) return { power: Math.min(THEME_LINE_CAP, exactPower), theme: String(exact.value), count: exact.count, exact: true };
  if (wide) return { power: Math.min(THEME_LINE_CAP, widePower), theme: String(wide.value), count: wide.count, exact: false };
  return null;
}

/**
 * The thematic lines of a lineup. The coach counts as a sixth member for team and year — it is what closes the
 * ladder — and stays out of country, where only 13% of the coach cards know their own. Lines worth nothing are
 * left out, and the total is capped at THEME_TOTAL_CAP, spending the budget on the biggest lines first.
 */
export function themeLines(players: readonly ThemeMember[], coach: ThemeMember | null): ThemeLine[] {
  if (!players.length) return [];
  const withCoach = coach ? [...players, coach] : [...players];
  const team = bestLevel(THEME_LADDER, withCoach.map((member) => member.teamId), withCoach.map((member) => member.org));
  const country = bestLevel(THEME_LADDER_PLAYERS, players.map((member) => member.country), players.map((member) => blocOf(member.country)));
  const year = bestLevel(THEME_LADDER, withCoach.map((member) => (member.year == null ? null : String(member.year))), []);
  const lines: ThemeLine[] = [];
  if (team?.power) lines.push({ key: 'theme_team', ...team });
  if (country?.power) lines.push({ key: 'theme_country', ...country });
  if (year?.power) lines.push({ key: 'theme_year', ...year });
  let budget = THEME_TOTAL_CAP;
  return lines
    .sort((left, right) => right.power - left.power)
    .map((line) => {
      const power = Math.min(line.power, budget);
      budget -= power;
      return { ...line, power };
    })
    .filter((line) => line.power > 0);
}
