import type { Language } from '../types';

/**
 * Country flags: the only real-world images the game ships. They come from flag-icons (MIT), self-hosted under
 * `static/flags/` by `scripts/sync-flags.mjs`, which copies only the codes present in `identities.game.json`.
 * Codes are ISO 3166-1 alpha-2 in lowercase (`br`, `dk`) plus the flag-icons subdivisions (`gb-eng`, `gb-sct`).
 * Pure module: no data imports, safe for the components shared with `/online`.
 */
export const FLAG_CODE_PATTERN = /^[a-z]{2}(-[a-z]{3})?$/;

export const isFlagCode = (value: unknown): value is string => typeof value === 'string' && FLAG_CODE_PATTERN.test(value);

/** Lowercased, trimmed code when valid; null for anything else (never throws, so a bad identity only hides the flag). */
export function normalizeFlagCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return isFlagCode(code) ? code : null;
}

/** flag-icons subdivisions that `Intl.DisplayNames` does not know. */
const SUBDIVISION_NAMES: Record<string, Record<Language, string>> = {
  'gb-eng': { 'pt-BR': 'Inglaterra', es: 'Inglaterra', en: 'England' },
  'gb-sct': { 'pt-BR': 'Escócia', es: 'Escocia', en: 'Scotland' },
  'gb-wls': { 'pt-BR': 'País de Gales', es: 'Gales', en: 'Wales' },
  'gb-nir': { 'pt-BR': 'Irlanda do Norte', es: 'Irlanda del Norte', en: 'Northern Ireland' }
};

const LOCALE_BY_LANGUAGE: Record<Language, string> = { 'pt-BR': 'pt-BR', es: 'es', en: 'en' };

/** Human name of a flag code in the UI language (for `alt`/`title`); falls back to the uppercased code. */
export function countryName(code: string, language: Language = 'en'): string {
  const subdivision = SUBDIVISION_NAMES[code];
  if (subdivision) return subdivision[language] ?? subdivision.en;
  try {
    const names = new Intl.DisplayNames([LOCALE_BY_LANGUAGE[language] ?? 'en'], { type: 'region' });
    return names.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
