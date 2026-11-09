// src/lib/game/playerCareer/language.ts
// Idioma da call. Cada time fala o idioma do elenco de partida (o de pelo menos 4 dos 5; time misto fala inglês) e
// só muda quando os 5 de hoje falam a mesma língua. Você fala o idioma do seu país e o inglês começa no nível típico
// do país; num time de outro idioma a comunicação custa sinergia até você aprender (imersão a cada campeonato e aulas
// na semana). Os times da cena também sentem: elenco misto com inglês fraco perde um pouco de força.
import type { SceneRosterMember } from './data';

export type Language = 'pt' | 'es' | 'en' | 'ru' | 'zh' | 'mn' | 'fr' | 'de' | 'pl' | 'tr' | 'da' | 'sv' | 'no' | 'fi' | 'pt-pt' | 'other';

export const LANGUAGE_LABEL: Record<Language, string> = {
  pt: 'Português', 'pt-pt': 'Português (PT)', es: 'Espanhol', en: 'Inglês', ru: 'Russo', zh: 'Chinês', mn: 'Mongol', fr: 'Francês', de: 'Alemão',
  pl: 'Polonês', tr: 'Turco', da: 'Dinamarquês', sv: 'Sueco', no: 'Norueguês', fi: 'Finlandês', other: 'Outro idioma'
};

const LANGUAGE_OF: Record<string, Language> = {
  Brazil: 'pt', Portugal: 'pt',
  Argentina: 'es', Chile: 'es', Uruguay: 'es', Peru: 'es', Colombia: 'es', Paraguay: 'es', Bolivia: 'es', Venezuela: 'es', Ecuador: 'es', Mexico: 'es', Guatemala: 'es', Spain: 'es',
  'United States': 'en', USA: 'en', Canada: 'en', 'United Kingdom': 'en', Ireland: 'en', Australia: 'en', 'New Zealand': 'en', 'South Africa': 'en',
  Russia: 'ru', Ukraine: 'ru', Belarus: 'ru', Kazakhstan: 'ru', Uzbekistan: 'ru', Kyrgyzstan: 'ru',
  China: 'zh', Taiwan: 'zh', 'Hong Kong': 'zh', Mongolia: 'mn', France: 'fr', Belgium: 'fr', Germany: 'de', Austria: 'de', Switzerland: 'de',
  Poland: 'pl', Turkey: 'tr', Denmark: 'da', Sweden: 'sv', Norway: 'no', Finland: 'fi'
};

/** Idioma nativo de quem é do país (desconhecido: outro). Português de Portugal conta como português. */
export const nativeLanguage = (country: string | null | undefined): Language => {
  const language = country ? LANGUAGE_OF[country] ?? 'other' : 'other';
  return language === 'pt-pt' ? 'pt' : language;
};

/** Inglês típico de quem vem do país (0-100): nativo 100, nórdicos 85, Europa central 65, CIS e América do Sul 45. */
export function englishBase(country: string | null | undefined): number {
  const language = nativeLanguage(country);
  if (language === 'en') return 100;
  if (['da', 'sv', 'no', 'fi'].includes(language) || country === 'Netherlands' || country === 'Estonia') return 85;
  if (['de', 'pl', 'fr'].includes(language) || ['Israel', 'Bosnia and Herzegovina', 'Serbia', 'Croatia', 'Slovakia', 'Czech Republic', 'Latvia', 'Lithuania', 'Hungary', 'Romania', 'Bulgaria', 'North Macedonia'].includes(country ?? '')) return 65;
  if (language === 'zh' || language === 'mn') return 35;
  return 45;
}

/** O idioma de pelo menos 4 do elenco; time misto fala inglês. */
function languageOfFour(roster: Array<Pick<SceneRosterMember, 'country'>>): Language {
  const counts = new Map<Language, number>();
  for (const member of roster) {
    if (!member.country) continue;
    const language = nativeLanguage(member.country);
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  const [language, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['en', 0];
  return count >= 4 && language !== 'other' ? language : 'en';
}

/**
 * O idioma da call. Sem `starting`: o de pelo menos 4 do elenco (misto fala inglês). Com `starting` (o idioma do
 * elenco de partida): ele mesmo, até o elenco de hoje inteiro (5+) falar uma língua só (time que falava inglês e
 * ficou com 5 brasileiros passa a falar português).
 */
export function teamLanguage(roster: Array<Pick<SceneRosterMember, 'country'>>, starting?: Language): Language {
  if (!starting) return languageOfFour(roster);
  const shared = roster[0]?.country ? nativeLanguage(roster[0].country) : null;
  const unanimous = roster.length >= 5 && shared !== null && shared !== 'other' && roster.every((member) => Boolean(member.country) && nativeLanguage(member.country) === shared);
  return unanimous ? shared : starting;
}

/** Fluência de um jogador da cena no idioma do time: nativo 100; inglês pelo país (pro de time misto treina, +15);
 *  outro idioma: quem já está no time aprendeu o básico (60). */
export function npcFluency(member: Pick<SceneRosterMember, 'country'>, language: Language): number {
  if (!member.country) return 70;
  if (nativeLanguage(member.country) === language) return 100;
  return language === 'en' ? Math.min(NON_NATIVE_MAX, englishBase(member.country) + 15) : 60;
}

/** Coesão da call de um time da cena: −1 de força quando um terço ou mais não se comunica bem (fluência < 60).
 *  `language` é o idioma da call do time (orgLanguage); sem ele, o de pelo menos 4 do elenco. */
export function npcLanguagePenalty(roster: Array<Pick<SceneRosterMember, 'country'>>, language: Language = teamLanguage(roster)): number {
  const known = roster.filter((member) => member.country);
  if (known.length < 3) return 0;
  const weak = known.filter((member) => npcFluency(member, language) < 60).length;
  return weak / known.length >= 1 / 3 ? 1 : 0;
}

export interface LanguageState { country: string; languages?: Partial<Record<Language, number>> }

/** A sua fluência num idioma (0-100). */
export function myFluency(state: LanguageState, language: Language): number {
  if (nativeLanguage(state.country) === language) return 100;
  return Math.min(NON_NATIVE_MAX, state.languages?.[language] ?? (language === 'en' ? englishBase(state.country) : 0));
}

/** Quem não nasceu falando nunca vira nativo: o teto é "muito bom". */
export const NON_NATIVE_MAX = 95;

/** Quanto a call trava: 0 (fluente, 70+), 1 (básico, 40+), 2 (não fala). Tira sinergia dos parceiros em quadra. */
export const languagePenalty = (fluency: number): number => (fluency >= 70 ? 0 : fluency >= 40 ? 1 : 2);

export const fluencyLabel = (fluency: number): string =>
  fluency >= 100 ? 'nativo' : fluency >= 90 ? 'muito bom' : fluency >= 70 ? 'fluente' : fluency >= 40 ? 'básico' : fluency > 0 ? 'iniciante' : 'não fala';

/** Aprende: soma fluência (até 100) no idioma. */
export function learn(state: LanguageState, language: Language, amount: number): Partial<Record<Language, number>> {
  if (nativeLanguage(state.country) === language) return state.languages ?? {};
  return { ...(state.languages ?? {}), [language]: Math.min(NON_NATIVE_MAX, myFluency(state, language) + amount) };
}

/** Bandeira (código do flag-icons) pelo país como a coleta grava ("Brazil" → br). Desconhecido: sem bandeira. */
const FLAG_OF: Record<string, string> = {
  Brazil: 'br', 'United States': 'us', USA: 'us', Russia: 'ru', Argentina: 'ar', Denmark: 'dk', Poland: 'pl', Australia: 'au', Sweden: 'se',
  Mongolia: 'mn', Ukraine: 'ua', China: 'cn', Kazakhstan: 'kz', Turkey: 'tr', France: 'fr', Romania: 'ro', 'United Kingdom': 'gb', India: 'in',
  Israel: 'il', Canada: 'ca', Germany: 'de', Portugal: 'pt', Lithuania: 'lt', Kosovo: 'xk', 'Czech Republic': 'cz', Uruguay: 'uy', Spain: 'es',
  Peru: 'pe', Bulgaria: 'bg', Finland: 'fi', Colombia: 'co', Latvia: 'lv', Serbia: 'rs', Belarus: 'by', Slovakia: 'sk', 'North Macedonia': 'mk',
  Chile: 'cl', 'Bosnia and Herzegovina': 'ba', 'South Africa': 'za', Mexico: 'mx', 'Hong Kong': 'hk', Hungary: 'hu', Estonia: 'ee', Belgium: 'be',
  'New Zealand': 'nz', Netherlands: 'nl', Lebanon: 'lb', Vietnam: 'vn', Guatemala: 'gt', Venezuela: 've', Taiwan: 'tw', Palestine: 'ps',
  Montenegro: 'me', Iraq: 'iq', Georgia: 'ge', Azerbaijan: 'az', Norway: 'no', Indonesia: 'id', Switzerland: 'ch', Austria: 'at', Ireland: 'ie',
  Uzbekistan: 'uz', Kyrgyzstan: 'kg', Malaysia: 'my', Jordan: 'jo', Paraguay: 'py', Bolivia: 'bo', Ecuador: 'ec', Croatia: 'hr'
};
export const flagOf = (country: string | null | undefined): string | null => (country ? FLAG_OF[country] ?? null : null);
const COUNTRY_OF_FLAG = new Map<string, string>();
for (const [country, code] of Object.entries(FLAG_OF)) if (!COUNTRY_OF_FLAG.has(code)) COUNTRY_OF_FLAG.set(code, country);
/** O país (como a coleta grava) pelo código da bandeira do catálogo do jogo ("fr" → France). */
export const countryOfFlag = (code: string | null | undefined): string | null => (code ? COUNTRY_OF_FLAG.get(code.toLowerCase()) ?? null : null);

/** Idiomas que não mudam a call (contam como "outro"), só para mostrar o que o jogador fala. */
const SPOKEN_OTHER: Record<string, string> = {
  Romania: 'Romeno', India: 'Hindi', Israel: 'Hebraico', Lithuania: 'Lituano', Kosovo: 'Albanês', 'Czech Republic': 'Tcheco', Bulgaria: 'Búlgaro',
  Latvia: 'Letão', Serbia: 'Sérvio', Slovakia: 'Eslovaco', 'North Macedonia': 'Macedônio', 'Bosnia and Herzegovina': 'Bósnio', Hungary: 'Húngaro',
  Estonia: 'Estoniano', Netherlands: 'Holandês', Lebanon: 'Árabe', Vietnam: 'Vietnamita', Palestine: 'Árabe', Montenegro: 'Montenegrino', Iraq: 'Árabe',
  Georgia: 'Georgiano', Azerbaijan: 'Azeri', Indonesia: 'Indonésio', Croatia: 'Croata', Malaysia: 'Malaio', Jordan: 'Árabe'
};

/** O idioma nativo para mostrar na carta ("Português", "Dinamarquês", "Estoniano"). */
export function spokenLabel(country: string | null | undefined): string {
  const language = nativeLanguage(country);
  return language === 'other' ? SPOKEN_OTHER[country ?? ''] ?? 'Outro idioma' : LANGUAGE_LABEL[language];
}
