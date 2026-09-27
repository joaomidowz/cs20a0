/**
 * Nível: a escala real dos modos online. É o número na tela e o número que joga, e ele nunca chega a 100
 * (um time de jogador para em 99,9, o teto macio de `withPlayerBand`).
 *
 * O motor cortava todo time em MAX_TEAM_POWER + 4 (110) no dia do jogo, enquanto a sinergia da coleção leva o poder
 * cru a ~140: lines de 112, 125 e 134 jogavam exatamente igual, e montar bem não valia nada depois que as cartas
 * eram boas. Aqui nada é cortado. Até o joelho cada ponto conta; acima dele cada ponto extra ainda conta, só menos.
 *
 * Duas conversões, nesta ordem:
 *   1. COMPRESSÃO (`COURT_SLOPE`): quanto de cada ponto de carta acima do joelho realmente chega à quadra.
 *   2. RÉGUA (`COURT_SPREAD`): quantos níveis de tela vale um ponto já comprimido. Só o tamanho dos números — anda
 *      junto com `COURT_WIN_DIVISOR` e por isso não muda resultado nenhum.
 *
 * Dentro da partida, `rounds.ts` lê o poder pela DIFERENÇA entre os dois times, então somar a mesma constante aos
 * dois não muda nada: o topo em 99 é só onde a régua foi pregada.
 */

import { COURT_KNEE, COURT_SLOPE, COURT_SPREAD, COURT_TOP, COURT_WIN_DIVISOR, DAY_SWING_COURT, PLAYER_CEILING_COURT, PLAYER_SOFT_KNEE, PLAYER_SOFT_TOP_COURT, RAW_TOP } from './balance';

export { COURT_KNEE, COURT_SLOPE, COURT_SPREAD, COURT_TOP, COURT_WIN_DIVISOR };

/** Poder cru nunca fica abaixo disto antes da curva (o piso que `getMatchDayPower` sempre teve). */
export const COURT_RAW_FLOOR = 45;

/** Poder cru depois da compressão de carta, antes da régua. Escala interna: não aparece em lugar nenhum. */
const compressed = (raw: number): number => (raw <= COURT_KNEE ? raw : COURT_KNEE + (raw - COURT_KNEE) * COURT_SLOPE);

/** O poder cru comprimido da melhor line montável hoje: é nele que o topo da escala (99) fica pregado. */
const COMPRESSED_TOP = compressed(RAW_TOP);

/** Poder cru do motor para o nível da tela. */
export function courtPower(raw: number): number {
  return COURT_TOP - (COMPRESSED_TOP - compressed(raw)) * COURT_SPREAD;
}

/** O inverso exato de `courtPower`. */
export function rawFromCourt(court: number): number {
  const compressedValue = COMPRESSED_TOP - (COURT_TOP - court) / COURT_SPREAD;
  return compressedValue <= COURT_KNEE ? compressedValue : COURT_KNEE + (compressedValue - COURT_KNEE) / COURT_SLOPE;
}

/**
 * Poder cru depois de somar `points` níveis. Estrutura (time sem IGL, a história de Major de um bot) é cobrada
 * assim, e não em porcentagem: sob uma curva que comprime, 1% vale cerca de um nível perto do topo e quase nada
 * acima dele, então uma porcentagem que arranha uma line de GOATs apagaria a de um iniciante. Nível dói igual
 * para todo mundo.
 */
export const addCourtPoints = (raw: number, points: number): number => rawFromCourt(courtPower(raw) + points);

/** Poder do dia a partir do poder do time e do multiplicador do dia; o padrão do motor mantém o corte antigo em 110. */
export type MatchDayCurve = (power: number, multiplier: number) => number;

/**
 * O dia de jogo em NÍVEIS: o time entra no nível dele mais o que o dia deu, e o dia vale o mesmo para todos.
 *
 * Era `courtPower(poder × multiplicador)`, uma porcentagem sobre o poder CRU — e aí o mesmo dia bom valia 3 níveis
 * para um bot (que vive em cima do joelho da curva) e 0,3 para uma line de GOATs. Ver `DAY_SWING_COURT`.
 */
export const courtMatchDay: MatchDayCurve = (power, multiplier) =>
  courtPower(Math.max(COURT_RAW_FLOOR, power)) + (multiplier - 1) * DAY_SWING_COURT;

/**
 * O TETO MACIO de um time de jogador (`balance.ts`, 2026-09-27). Até `PLAYER_SOFT_KNEE` o nível é o da régua; acima
 * dele cada nível vale `PLAYER_SOFT_SLOPE`, e `PLAYER_SOFT_TOP_COURT` (a melhor line montável) cai exatamente em
 * `PLAYER_CEILING_COURT` (99,9). Não há piso: quem começa entra no nível que as cartas dão. Bots nunca passam por
 * aqui. O número que sai daqui é o que a tela mostra e o que joga.
 */
export const PLAYER_SOFT_SLOPE = (PLAYER_CEILING_COURT - PLAYER_SOFT_KNEE) / (PLAYER_SOFT_TOP_COURT - PLAYER_SOFT_KNEE);

/** Nível na régua → nível em quadra de um time de jogador. */
export function playerCourtLevel(court: number): number {
  if (court <= PLAYER_SOFT_KNEE) return court;
  return Math.min(PLAYER_CEILING_COURT, PLAYER_SOFT_KNEE + (court - PLAYER_SOFT_KNEE) * PLAYER_SOFT_SLOPE);
}

/** Poder cru de um time de jogador com o teto macio aplicado: o que entra em quadra (servidor, Boost e montador). */
export const withPlayerBand = (raw: number): number => rawFromCourt(playerCourtLevel(courtPower(raw)));
