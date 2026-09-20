/**
 * AJUSTE DO EQUILÍBRIO DO ONLINE — é aqui que se mexe.
 *
 * Todo número que decide "quem ganha de quem" mora neste arquivo. Nada aqui é sagrado: a ideia é justamente que
 * mude conforme o pessoal joga. Mexeu num número, rode `npx vitest run tests/balanceTargets.test.ts` e o teste diz,
 * em porcentagem de séries ganhas, o que aquilo fez — as faixas combinadas com o dono estão lá dentro.
 *
 * Duas coisas para ter em mente antes de mexer:
 *
 * 1. O motor é MUITO sensível. Numa série melhor de três, 2 pontos de quadra já são ~67/33 e 4 pontos são ~82/18.
 *    Mexa de 0,1 em 0,1, não de 1 em 1.
 * 2. Tudo é medido em PONTOS DE QUADRA (a escala de `courtPower.ts`, que vai até ~98 e é a que aparece na tela),
 *    nunca em porcentagem de poder. Um ponto de quadra custa o mesmo para um time de GOATs e para um de Comuns;
 *    uma porcentagem custaria quase nada no topo e muito embaixo.
 *
 * Nada disto vale para o modo solo, a Dinastia ou o sandbox: eles usam o motor antigo e não passam por aqui.
 */

// ---------------------------------------------------------------------------------------------------------------
// A escala: como o poder cru do motor vira o poder de quadra
// ---------------------------------------------------------------------------------------------------------------

/** Até aqui, cada ponto de poder cru conta inteiro. */
export const COURT_KNEE = 100;
/** Acima do joelho, quanto de cada ponto extra chega à quadra. Menor = elenco pesa menos e montagem pesa mais. */
export const COURT_SLOPE = 0.085;
/** Poder cru da melhor line montável hoje (Astralis 2018 com zonic), medido em 2026-09-20. `tests/powerRating.test.ts` re-mede e falha se mudar. */
export const RAW_TOP = 121.1;
/** Onde o topo da escala aparece na tela. Abaixo de 100 de propósito: 100 seria a perfeição, e ela não existe. */
export const COURT_TOP = 98;
/** Deslocamento que põe o topo em COURT_TOP. Sai da conta, não se ajusta à mão. Não muda nenhum resultado (só a diferença entre dois times conta). */
export const COURT_SHIFT = COURT_KNEE + (RAW_TOP - COURT_KNEE) * COURT_SLOPE - COURT_TOP;

// ---------------------------------------------------------------------------------------------------------------
// O que falta ao time: peça que não está lá custa pontos de quadra
// ---------------------------------------------------------------------------------------------------------------

/** Time sem capitão. Mais negativo = montar sem IGL dói mais. Em −0,35 a mesma line sem capitão ganha ~47% dela mesma com capitão. */
export const MISSING_IGL_COURT = -0.35;
/** Time sem AWPer. */
export const MISSING_AWPER_COURT = -0.35;
/** Time sem suporte. */
export const MISSING_SUPPORT_COURT = -0.2;

// ---------------------------------------------------------------------------------------------------------------
// Os bots: a escada de progressão do campeonato
// ---------------------------------------------------------------------------------------------------------------

/**
 * Quanto cada tipo de bot fica ABAIXO do topo da escala, em pontos de quadra. Número menor = bot mais forte.
 * É a progressão do chaveamento: o time sem história é o degrau de entrada e o campeão é a parede final.
 *
 * Medido (time caprichado × bot): sem história 83%, top 8 74%, semifinal 76%, vice 66%, campeão 64%.
 * Contra um time mal montado o bot sem história já ganha ~35% — dá pra tomar susto na primeira fase.
 *
 * Um bot nunca fica mais fraco do que já era: se o poder próprio dele for maior, vale o próprio.
 */
export const BOT_GAP_FROM_TOP: Readonly<Record<'champion' | 'finalist' | 'semifinal' | 'top8' | 'none', number>> = {
  champion: 0.9,
  finalist: 1.1,
  semifinal: 1.4,
  top8: 1.8,
  none: 3.0
};

/** Nenhum bot chega mais perto do topo do que isto: os melhores times da história empatam com uma line perfeita, nunca são favoritos. */
export const BOT_MIN_GAP_FROM_TOP = 0.65;

// ---------------------------------------------------------------------------------------------------------------
// O piso do jogador
// ---------------------------------------------------------------------------------------------------------------

/**
 * Nenhum time de JOGADOR entra em quadra mais do que isto abaixo do topo. É o que dá chance a quem está começando:
 * com ele, cinco Comuns ganham ~37% de um campeão de Major em vez de ~11%.
 *
 * Não vale para bots, de propósito: é isso que mantém o degrau de entrada do chaveamento vencível para quem chega.
 * Aumentar = mais acolhedor com quem começa e carta importa menos; diminuir = o contrário.
 */
export const PLAYER_GAP_FROM_TOP = 2.2;
