/**
 * Nível: a escala real dos modos online. É o número na tela e o número que joga, e ele nunca chega a 100.
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

import { COURT_KNEE, COURT_SLOPE, COURT_SPREAD, COURT_TOP, COURT_WIN_DIVISOR, PLAYER_GAP_FROM_TOP, RAW_TOP } from './balance';

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

/** A curva passa por poder × multiplicador, onde ficava o corte antigo: um bom dia ainda ajuda, só ajuda menos no topo. */
export const courtMatchDay: MatchDayCurve = (power, multiplier) => courtPower(Math.max(COURT_RAW_FLOOR, power * multiplier));

/** O mais baixo que um time de JOGADOR entra em quadra (`PLAYER_GAP_FROM_TOP`); bots mantêm o nível deles. */
export const COURT_PLAYER_FLOOR = COURT_TOP - PLAYER_GAP_FROM_TOP;

/** Poder cru de um time de jogador com o piso aplicado: o que quem está começando leva para a quadra. */
export const withPlayerFloor = (raw: number): number => Math.max(raw, rawFromCourt(COURT_PLAYER_FLOOR));

/** Curva do dia de um time de jogador: o piso vale no dia ruim também. */
export const courtMatchDayPlayer: MatchDayCurve = (power, multiplier) => Math.max(courtMatchDay(power, multiplier), COURT_PLAYER_FLOOR);
