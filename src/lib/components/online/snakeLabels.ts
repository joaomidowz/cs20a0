import { countryName } from '$lib/game/visuals/flags';
import { collectionTeams } from '$lib/game/online/collection-pool';
import { translateOnline, type OnlineTranslationKey } from '$lib/game/online/i18n';
import type { SnakeThemeHint } from '$lib/game/online/snake-hints';
import type { HistoricalTeam, Language, LineupSlotRole } from '$lib/game/types';

/** Abreviações das funções centrais para selos pequenos. */
export const ROLE_SHORT: Readonly<Record<LineupSlotRole, string>> = { igl: 'IGL', awper: 'AWP', support: 'SUP', entry: 'ENT', lurker: 'LRK', rifler: 'RFL' };

/** O slug da organização de volta ao nome ("ninjasinpyjamas" → "Ninjas in Pyjamas"), como no builder da coleção. */
const orgDisplayName = (slug: string): string =>
  collectionTeams.find((team) => (team.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === slug)?.name ?? slug;

/** Nome curto do tema: time (ou organização), país (ou bloco) ou ano (ou era). */
export function snakeThemeName(hint: Pick<SnakeThemeHint, 'key' | 'theme' | 'exact'>, language: Language, teams: ReadonlyMap<string, HistoricalTeam>): string {
  if (hint.key === 'theme_country') return hint.exact ? countryName(hint.theme, language) : translateOnline(language, `bloc_${hint.theme}` as OnlineTranslationKey);
  if (hint.key === 'theme_team') return hint.exact ? teams.get(hint.theme)?.name ?? hint.theme : orgDisplayName(hint.theme);
  return hint.theme;
}
