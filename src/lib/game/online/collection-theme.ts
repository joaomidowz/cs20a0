import { THEME_TOTAL_CAP } from '../balance';
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
 * How much a shared theme is worth by how many share it: the closer the group gets to the whole lineup, the more
 * each extra member is worth — the last one is worth more than the first three together. Team and year count the
 * coach, so they close at six; country never does, so it closes at five.
 *
 * These ladders ARE the affinity: a real core (five of one team plus its coach) is the biggest synergy line in
 * the game, bigger than any structure bonus. A same-year or same-country group is a real identity too, worth
 * less than a core but more than any leftover. Values are in the shared "%" currency of synergy lines; see
 * `SYNERGY_POWER_TO_COURT` for what they are worth on the court.
 */
export const THEME_LADDER: Readonly<Record<number, number>> = { 0: 0, 1: 0, 2: 1.5, 3: 4, 4: 8, 5: 13, 6: 17 };
/** The ladder of a line the coach cannot join: the fifth player is the one that closes it. */
// Buff de país (dono, 2026-10-05): 4 e 5 do mesmo país valem mais (5.5→6, 9→10.5).
export const THEME_LADDER_PLAYERS: Readonly<Record<number, number>> = { 0: 0, 1: 0, 2: 0.5, 3: 2.5, 4: 6, 5: 10.5 };
/** Same year is a real bond, but the loosest of the three: a squad of one season, not a core. */
export const THEME_LADDER_YEAR: Readonly<Record<number, number>> = { 0: 0, 1: 0, 2: 0.5, 3: 1.5, 4: 3, 5: 4.5, 6: 5 };
/** Each theme line is worth at most this much power... */
export const THEME_LINE_CAP = 17;
/** ...and the three of them together at most this much (`balance.ts`). */
export { THEME_TOTAL_CAP };
/** The looser level of a line (same org across eras, same era of years) pays this share of the ladder. */
export const THEME_LOOSE_RATIO = 0.5;
/** A scene bloc (five of the CIS, say) is a tighter identity than "same org" — it pays a bit more (dono, 2026-10-05). */
export const THEME_BLOC_RATIO = 0.6;
/** Country groups beyond the biggest one (3 fr + 2 br; 2 + 2 + 1) pay this share of their own ladder step. */
export const THEME_SECONDARY_RATIO = 0.5;

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

/** Eras do CS, o nível frouxo da linha de ano: capítulos reais da cena, não janelas móveis. */
const ERAS: ReadonlyArray<{ label: string; from: number; to: number }> = [
  { label: '2013–2015', from: 2013, to: 2015 },
  { label: '2016–2017', from: 2016, to: 2017 },
  { label: '2018–2019', from: 2018, to: 2019 },
  { label: '2020–2021', from: 2020, to: 2021 },
  { label: '2022–2023', from: 2022, to: 2023 },
  { label: '2024–2026', from: 2024, to: 2026 }
];

export const eraOf = (year: number | null | undefined): string | null =>
  year == null ? null : ERAS.find((era) => year >= era.from && year <= era.to)?.label ?? null;

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
 * A linha de país com grupos secundários (dono, 2026-10-05): o maior grupo paga a escada cheia e cada outro
 * grupo de 2+ paga THEME_SECONDARY_RATIO da escada dele (3 fr + 2 br; 2 + 2 + 1). A leitura de bloco paga
 * THEME_BLOC_RATIO da escada do maior grupo de cena, mais os grupos exatos de FORA do bloco como secundários
 * (sem contar ninguém duas vezes). Vale a leitura que render mais; o teto por linha continua THEME_LINE_CAP.
 */
function countryLine(players: readonly ThemeMember[]): Omit<ThemeLine, 'key'> | null {
  const countryCounts = new Map<string, number>();
  for (const member of players) if (member.country) countryCounts.set(member.country, (countryCounts.get(member.country) ?? 0) + 1);
  const groups = [...countryCounts.entries()].filter(([, count]) => count >= 2)
    .sort((left, right) => ladder(THEME_LADDER_PLAYERS, right[1]) - ladder(THEME_LADDER_PLAYERS, left[1]));
  const blocCounts = new Map<SceneBloc, number>();
  for (const member of players) {
    const bloc = blocOf(member.country);
    if (bloc) blocCounts.set(bloc, (blocCounts.get(bloc) ?? 0) + 1);
  }
  let bestBloc: { value: SceneBloc; count: number } | null = null;
  for (const [value, count] of blocCounts) if (count >= 2 && (!bestBloc || count > bestBloc.count)) bestBloc = { value, count };

  let exactScore = 0;
  groups.forEach(([, count], index) => { exactScore += ladder(THEME_LADDER_PLAYERS, count) * (index === 0 ? 1 : THEME_SECONDARY_RATIO); });
  let blocScore = 0;
  if (bestBloc) {
    blocScore = ladder(THEME_LADDER_PLAYERS, bestBloc.count) * THEME_BLOC_RATIO;
    for (const [country, count] of groups) {
      if (blocOf(country) !== bestBloc.value) blocScore += ladder(THEME_LADDER_PLAYERS, count) * THEME_SECONDARY_RATIO;
    }
  }
  if (groups.length && exactScore >= blocScore) return { power: Math.min(THEME_LINE_CAP, exactScore), theme: groups[0][0], count: groups[0][1], exact: true };
  if (bestBloc && blocScore > 0) return { power: Math.min(THEME_LINE_CAP, blocScore), theme: bestBloc.value, count: bestBloc.count, exact: false };
  return null;
}

/**
 * The thematic lines of a lineup. The coach counts as a sixth member for team and year — it is what closes the
 * ladder — and stays out of country, where only 13% of the coach cards know their own. Lines worth nothing are
 * left out, and the total is capped at THEME_TOTAL_CAP, spending the budget on the biggest lines first.
 * O ano ganhou o nível frouxo de ERA (dono, 2026-10-05): mesma era paga THEME_LOOSE_RATIO da escada do ano.
 */
export function themeLines(players: readonly ThemeMember[], coach: ThemeMember | null): ThemeLine[] {
  if (!players.length) return [];
  const withCoach = coach ? [...players, coach] : [...players];
  const team = bestLevel(THEME_LADDER, withCoach.map((member) => member.teamId), withCoach.map((member) => member.org));
  const country = countryLine(players);
  const year = bestLevel(THEME_LADDER_YEAR, withCoach.map((member) => (member.year == null ? null : String(member.year))), withCoach.map((member) => eraOf(member.year)));
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
