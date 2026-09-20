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
