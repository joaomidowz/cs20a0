// src/lib/game/playerCareer/language.ts
// Idioma da call. Cada time fala o idioma de pelo menos 4 dos 5 (FURIA com quatro brasileiros fala português);
// time misto fala inglês. Você fala o idioma do seu país e o inglês começa no nível típico do país; num time de
// outro idioma a comunicação custa sinergia até você aprender (imersão a cada campeonato e aulas na semana).
// Os times da cena também sentem: elenco misto com inglês fraco perde um pouco de força.
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

/** O idioma da call: o de pelo menos 4 do elenco; time misto fala inglês. */
export function teamLanguage(roster: Array<Pick<SceneRosterMember, 'country'>>): Language {
  const counts = new Map<Language, number>();
  for (const member of roster) {
    if (!member.country) continue;
    const language = nativeLanguage(member.country);
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  const [language, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['en', 0];
  return count >= 4 && language !== 'other' ? language : 'en';
}

/** Fluência de um jogador da cena no idioma do time: nativo 100; inglês pelo país (pro de time misto treina, +15);
 *  outro idioma: quem já está no time aprendeu o básico (60). */
export function npcFluency(member: Pick<SceneRosterMember, 'country'>, language: Language): number {
  if (!member.country) return 70;
  if (nativeLanguage(member.country) === language) return 100;
  return language === 'en' ? Math.min(100, englishBase(member.country) + 15) : 60;
}

/** Coesão da call de um time da cena: −1 de força quando um terço ou mais não se comunica bem (fluência < 60). */
export function npcLanguagePenalty(roster: Array<Pick<SceneRosterMember, 'country'>>): number {
  const known = roster.filter((member) => member.country);
  if (known.length < 3) return 0;
  const language = teamLanguage(roster);
  const weak = known.filter((member) => npcFluency(member, language) < 60).length;
  return weak / known.length >= 1 / 3 ? 1 : 0;
}

export interface LanguageState { country: string; languages?: Partial<Record<Language, number>> }

/** A sua fluência num idioma (0-100). */
export function myFluency(state: LanguageState, language: Language): number {
  if (nativeLanguage(state.country) === language) return 100;
  return state.languages?.[language] ?? (language === 'en' ? englishBase(state.country) : 0);
}

/** Quanto a call trava: 0 (fluente, 70+), 1 (básico, 40+), 2 (não fala). Tira sinergia dos parceiros em quadra. */
export const languagePenalty = (fluency: number): number => (fluency >= 70 ? 0 : fluency >= 40 ? 1 : 2);

export const fluencyLabel = (fluency: number): string =>
  fluency >= 100 ? 'nativo' : fluency >= 70 ? 'fluente' : fluency >= 40 ? 'básico' : fluency > 0 ? 'iniciante' : 'não fala';

/** Aprende: soma fluência (até 100) no idioma. */
export function learn(state: LanguageState, language: Language, amount: number): Partial<Record<Language, number>> {
  if (nativeLanguage(state.country) === language) return state.languages ?? {};
  return { ...(state.languages ?? {}), [language]: Math.min(100, myFluency(state, language) + amount) };
}
