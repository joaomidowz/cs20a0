import type { Language, MajorAwards } from '../types';

/** Major prize money by placement key, in whole dollars (proportional to a real Major prize pool). */
export const PRIZE_BY_PLACEMENT: Readonly<Record<string, number>> = {
  placementChampion: 500_000,
  placementRunnerUp: 170_000,
  placement3to4: 80_000,
  placement5to8: 45_000,
  placementStage3: 20_000,
  placementStage2: 10_000,
  placementStage1: 5_000
};

export const MVP_BONUS = 50_000;
export const INDIVIDUAL_AWARD_BONUS = 15_000;

export const prizeForPlacement = (placement: string): number => PRIZE_BY_PLACEMENT[placement] ?? 0;

/** Bonus for the user's players: the Major MVP and every other individual award (clutch king, highlight reel). */
export function awardsBonus(awards: MajorAwards | null | undefined, lineupPlayerIds: readonly string[]): number {
  if (!awards) return 0;
  const mine = new Set(lineupPlayerIds);
  let bonus = 0;
  if (awards.mvp && mine.has(awards.mvp.playerId)) bonus += MVP_BONUS;
  for (const award of [awards.clutchKing, awards.highlightReel]) {
    if (award && mine.has(award.playerId)) bonus += INDIVIDUAL_AWARD_BONUS;
  }
  return bonus;
}

const LOCALES: Readonly<Record<Language, string>> = { 'pt-BR': 'pt-BR', es: 'es-ES', en: 'en-US' };

/** Whole-dollar currency label; the value is always an integer, so no decimals ever show. */
export const formatUsd = (value: number, language: Language = 'pt-BR'): string =>
  new Intl.NumberFormat(LOCALES[language], { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(value));
