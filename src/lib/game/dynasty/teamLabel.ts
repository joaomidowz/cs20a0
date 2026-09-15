import { translate } from '../i18n';
import type { DynastyState, Language } from '../types';

/** Display name of the player's organization in a Dinastia run: the chosen name, or the translated default. */
export function userTeamLabel(language: Language, dynasty: Pick<DynastyState, 'teamName'> | null | undefined): string {
  return dynasty?.teamName || translate(language, 'yourOrg');
}

/** Shown name for a team slot: the user's slot takes the custom name when there is one. */
export function slotName(id: string | null | undefined, name: string, userTeamId: string, userTeamName?: string): string {
  return userTeamName && id && id === userTeamId ? userTeamName : name;
}
