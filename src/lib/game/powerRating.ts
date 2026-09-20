/**
 * Player-facing power rating, 0 to 99.
 *
 * NOTA IMPORTANTE — isto é só exibição.
 *
 * O poder que o motor calcula é uma escala aberta: um time histórico (bot) trava em 106, enquanto uma line
 * temática de GOATs chega a ~139, porque a sinergia multiplica depois do teto de `MAX_TEAM_POWER`. O número cru
 * não diz nada sozinho — 134 parece perto do máximo e está, mas ninguém sabe disso olhando.
 *
 * Então as telas mostram este rating no lugar. NENHUM código de simulação lê esta função: a partida, a chance de
 * vitória (`getWinProbability`), a variação do dia e todas as regras continuam usando o poder cru. Mexer nas
 * âncoras daqui não muda quem ganha uma partida — só o que aparece escrito.
 *
 * A consequência de ser só visual: existem dois números para a mesma coisa (o cru nos logs e nos testes, o rating
 * na tela). Ao investigar algo, converta antes de comparar.
 *
 * Se um dia o teto de `MAX_TEAM_POWER` (106) sair do motor, `RATING_CEILING` precisa ser medido de novo:
 * `tests/powerRating.test.ts` trava isso e falha se a melhor line possível passar do teto.
 */

/** Raw power that keeps its own number: the weakest historical team of the pool. Below it the rating just follows. */
export const RATING_FLOOR = 74;
/** Raw power of the strongest lineup buildable today (Astralis 2018 reunited, with the coach), measured 2026-09-20. */
export const RATING_CEILING = 139.1;
/** The rating never goes above this, however strong a future lineup gets. */
export const RATING_MAX = 99;
/** The rating never goes below this. */
export const RATING_MIN = 1;

/** How much one point of raw power is worth in rating points. */
export const RATING_SCALE = (RATING_MAX - RATING_FLOOR) / (RATING_CEILING - RATING_FLOOR);

/** The 0-99 rating of a raw engine power. Display only. */
export function powerRating(power: number): number {
  const scaled = RATING_FLOOR + (power - RATING_FLOOR) * RATING_SCALE;
  return Math.max(RATING_MIN, Math.min(RATING_MAX, scaled));
}

/** A difference between two raw powers, in rating points (a +5 of raw power is a smaller move on the rating). */
export const powerRatingDelta = (delta: number): number => delta * RATING_SCALE;

/** The rating as it is written on screen. */
export const formatRating = (power: number, digits = 1): string => powerRating(power).toFixed(digits);
