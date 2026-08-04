import { translate, type TranslationKey } from './i18n';
import { PICK_REASONS } from './roleRules';
import type { Language } from './types';

export function getPickReasonKey(reason?: string): TranslationKey {
  if (reason === PICK_REASONS.duplicate) return 'samePlayerPicked';
  if (reason === PICK_REASONS.awper) return 'lineHasAwper';
  if (reason === PICK_REASONS.igl) return 'lineHasIgl';
  if (reason === PICK_REASONS.entry) return 'lineHasEntry';
  if (reason === PICK_REASONS.lurker) return 'lineHasLurker';
  if (reason === PICK_REASONS.rifler) return 'rifleLimitReached';
  if (reason === PICK_REASONS.support) return 'roleOccupied';
  return 'invalidRole';
}

export const getPickReasonText = (language: Language, reason?: string) =>
  translate(language, getPickReasonKey(reason));
