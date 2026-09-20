/**
 * AJUSTE DO EQUILÍBRIO DO ONLINE — é aqui que se mexe.
 *
 * Todo número que decide "quem ganha de quem" mora neste arquivo. Nada aqui é sagrado: a ideia é justamente que
 * mude conforme o pessoal joga. Mexeu num número, rode `npx vitest run tests/balanceTargets.test.ts` e o teste diz,
 * em porcentagem de séries ganhas, o que aquilo fez — as faixas combinadas com o dono estão lá dentro.
 *
 * Três coisas para ter em mente antes de mexer:
 *
 * 1. Tudo aqui é medido em NÍVEIS: a escala de `courtPower.ts`, que vai até 99 e é a que aparece na tela.
 *    Um nível custa o mesmo para um time de GOATs e para um de Comuns; uma porcentagem custaria quase nada no
 *    topo e muito embaixo.
 * 2. O motor é sensível, mas em unidades legíveis: numa série melhor de três, 18 níveis são ~67/33 e 36 são ~82/18.
 *    Mexa de 1 em 1, não de 10 em 10.
 * 3. A escala inteira (escada dos bots, piso do jogador, o que falta ao time) é proporcional: multiplicar TODOS os
 *    números daqui e o `COURT_WIN_DIVISOR` pelo mesmo fator não muda um resultado sequer, só o tamanho dos números.
 *
 * Nada disto vale para a Dinastia ou o sandbox: eles usam o motor antigo e não passam por aqui.
 */

// ---------------------------------------------------------------------------------------------------------------
// A escala: como o poder cru do motor vira o nível que aparece na tela
// ---------------------------------------------------------------------------------------------------------------

/** Até aqui, cada ponto de poder cru conta inteiro. */
export const COURT_KNEE = 100;
/**
 * Acima do joelho, quanto de cada ponto extra de poder cru conta. Menor = elenco pesa menos e montagem pesa mais.
 *
 * É a ÚNICA compressão de qualidade de carta no jogo. Já houve outra dentro do motor, e as duas multiplicadas
 * (0,1 × 0,085 = 0,0085) faziam trocar uma carta de 86 por uma de 99 não mudar nada: o jogo deixava de ser orgânico.
 * Se um dia precisar comprimir mais, mexa aqui, nunca em dois lugares.
 */
export const COURT_SLOPE = 0.05;
/**
 * Quantos níveis de tela vale um ponto de poder cru efetivo (já passado pela compressão acima).
 *
 * É só o tamanho da régua: com a sensibilidade do motor (`COURT_WIN_DIVISOR`) andando junto, mudar isto não muda
 * NENHUM resultado — muda só quanto a evolução do time aparece na tela. Em 1 o jogo inteiro cabia entre 95 e 98 e
 * sair de cinco Comuns para uma line de GOATs mexia 1,3 ponto: ninguém via que estava evoluindo. Em 9 o mesmo
 * caminho vai de ~79 a ~97 e cada carta trocada tem um número.
 */
export const COURT_SPREAD = 9;
/** Poder cru da melhor line montável hoje (Vitality 2025 com XTQZZZ), medido em 2026-09-20. `tests/powerRating.test.ts` re-mede e falha se mudar. */
export const RAW_TOP = 152.68;
/** Onde o topo da escala aparece na tela. Abaixo de 100 de propósito: 100 seria a perfeição, e ela não existe. */
export const COURT_TOP = 99;
/**
 * A sensibilidade do motor, na escala de níveis: `getWinProbability` usa 1/(1+e^(−diferença/divisor)).
 *
 * Anda SEMPRE junto com `COURT_SPREAD` (era 16 quando a régua valia 1). Dividir um sem o outro muda todo o
 * equilíbrio do jogo; multiplicar os dois juntos não muda nada.
 */
export const COURT_WIN_DIVISOR = 16 * COURT_SPREAD;

// ---------------------------------------------------------------------------------------------------------------
// O que falta ao time: peça que não está lá custa níveis
// ---------------------------------------------------------------------------------------------------------------

/** Time sem capitão. Mais negativo = montar sem IGL dói mais. */
export const MISSING_IGL_COURT = -5;
/** Time sem AWPer. */
export const MISSING_AWPER_COURT = -5;
/** Time sem suporte. */
export const MISSING_SUPPORT_COURT = -3;

/**
 * O NÚCLEO: IGL, AWPer e suporte, os três presentes. É a espinha de um time de CS, e é o que separa um time
 * montado de cinco cartas boas jogadas juntas. Vale em níveis, igual para Comuns e para GOATs.
 */
export const CORE_COMPLETE_COURT = 2;
/**
 * A mais, por cada peça do núcleo jogada por uma carta que é DAQUELA função (o IGL que é IGL de ofício, não um
 * rifler improvisado de capitão). Com os três de ofício o núcleo inteiro vale CORE_COMPLETE_COURT + 3 × isto.
 */
export const CORE_NATURAL_COURT = 1;

/**
 * Teto da sinergia temática (mesmo time, país, ano), em % de poder. É tempero, não decisão: no topo, o tema cheio
 * vale ~2 níveis, menos que ter capitão. Misturar dois jogadores de outro país custa uma fração disso.
 */
export const THEME_TOTAL_CAP = 4;

// ---------------------------------------------------------------------------------------------------------------
// Os bots: a escada de progressão do campeonato
// ---------------------------------------------------------------------------------------------------------------

/**
 * Quanto cada tipo de bot fica ABAIXO do topo da escala, em níveis. Número menor = bot mais forte.
 * É a progressão do chaveamento: o time sem história é o degrau de entrada e o campeão é a parede final.
 *
 * Medido (time caprichado × bot): sem história 83%, top 8 74%, semifinal 76%, vice 66%, campeão 64%.
 * Contra um time mal montado o bot sem história já ganha ~35% — dá pra tomar susto na primeira fase.
 *
 * Um bot nunca fica mais fraco do que já era: se o poder próprio dele for maior, vale o próprio.
 */
export const BOT_GAP_FROM_TOP: Readonly<Record<'champion' | 'finalist' | 'semifinal' | 'top8' | 'none', number>> = {
  champion: 8.1,
  finalist: 9.9,
  semifinal: 12.6,
  top8: 16.2,
  none: 27
};

/** Nenhum bot chega mais perto do topo do que isto: os melhores times da história empatam com uma line perfeita, nunca são favoritos. */
export const BOT_MIN_GAP_FROM_TOP = 5.85;

// ---------------------------------------------------------------------------------------------------------------
// O piso do jogador
// ---------------------------------------------------------------------------------------------------------------

/**
 * Nenhum time de JOGADOR entra em quadra mais do que isto abaixo do topo. É o que dá chance a quem está começando:
 * com ele, cinco Comuns ganham ~30% de um campeão de Major em vez de ~11%.
 *
 * Não vale para bots, de propósito: é isso que mantém o degrau de entrada do chaveamento vencível para quem chega.
 * Aumentar = mais acolhedor com quem começa e carta importa menos; diminuir = o contrário.
 *
 * É por causa dele que o nível na tela começa em ~79 e não em 1: quem tem cinco Comuns joga como 79 de verdade.
 */
export const PLAYER_GAP_FROM_TOP = 19.8;

// ---------------------------------------------------------------------------------------------------------------
// O solo contra bots: a parede cede conforme você sobe de nível
// ---------------------------------------------------------------------------------------------------------------

/**
 * A DIFICULDADE DO SOLO, por nível do seu time. É aqui que se mexe quando "está impossível" ou "virou farm".
 *
 * O problema que isto veio resolver: no "Major dos Campeões" os quinze bots são campeões de Major, todos no mesmo
 * degrau (nível ~91). Um time quase perfeito (97) entrava como favorito de cada série e ainda assim precisava
 * ganhar seis seguidas — dava 3% de título, e quase metade das runs morria na fase suíça. Um campeonato inteiro
 * decidido por moeda não é dificuldade, é ruído.
 *
 * Agora o campo cede conforme você sobe: cada par é (nível do seu time → quantos níveis o campo inteiro desce).
 * Entre um par e outro a conta interpola, então a progressão é contínua, não em degraus. Fora da tabela, vale a
 * ponta mais próxima. Vale SÓ no solo contra bots: o online entre jogadores não tem handicap nenhum.
 *
 * O combinado com o dono, em títulos do Major dos Campeões: nível 85 ~1 em 15, nível 90 de 3 a 5 em 10, entre 90
 * e 95 de 4 a 6 em 10, e de 95 para cima 6 a 8 em 10 (a dinastia no auge).
 *
 * Medido em 2026-09-20 com esta tabela (100 Majors por linha): nível 79 → 1%, 86 → 11%, 90 → 35%, 95 → 71–75%;
 * o time do topo cai na fase suíça em 0–2% das runs (eram 45%). O Major normal usa a mesma tabela e é mais
 * fácil pelo campo. `tests/soloDifficulty.test.ts` re-mede e falha se a curva sair da faixa.
 */
export const SOLO_FIELD_RELIEF: readonly (readonly [level: number, relief: number])[] = [
  [79, 4],
  [85, 7],
  [90, 30],
  [93, 40],
  [95, 48],
  [99, 56]
];

/** Multiplicador do alívio no "Major normal" (campo sorteado). Em 1 os dois modos usam a mesma tabela; o normal já é mais fácil pelo campo. */
export const SOLO_RANDOM_RELIEF_FACTOR = 1;
