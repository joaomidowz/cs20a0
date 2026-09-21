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
 * 2. O motor é MUITO sensível: numa série melhor de três, 2 pontos já são ~67/33 e 4 são ~82/18.
 *    Mexa de 0,1 em 0,1, não de 1 em 1.
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
 * NENHUM resultado — muda só o tamanho dos números na tela.
 *
 * Em 2026-09-20 chegou a valer 9, para a evolução do time aparecer (a coleção inteira cabia em 1,3 ponto), e o dono
 * pediu a régua de sempre de volta: o jogo inteiro mora entre ~96,8 e 99, e trocar uma carta mexe centésimos.
 * O que a régua larga revelou — o time entrando em quadra sem o coach — virou conserto de verdade
 * (`RoomManager.refreshPreparedLineup`), e por isso não volta junto com ela.
 */
export const COURT_SPREAD = 1;
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
export const MISSING_IGL_COURT = -0.5556;
/** Time sem AWPer. */
export const MISSING_AWPER_COURT = -0.5556;
/** Time sem suporte. */
export const MISSING_SUPPORT_COURT = -0.3333;

/**
 * O NÚCLEO: IGL, AWPer e suporte, os três presentes. É a espinha de um time de CS, e é o que separa um time
 * montado de cinco cartas boas jogadas juntas. Vale em níveis, igual para Comuns e para GOATs.
 */
export const CORE_COMPLETE_COURT = 0.2222;
/**
 * A mais, por cada peça do núcleo jogada por uma carta que é DAQUELA função (o IGL que é IGL de ofício, não um
 * rifler improvisado de capitão). Com os três de ofício o núcleo inteiro vale CORE_COMPLETE_COURT + 3 × isto.
 */
export const CORE_NATURAL_COURT = 0.1111;

/**
 * Teto da sinergia temática (mesmo time, país, ano), em % de poder. É tempero, não decisão: no topo, o tema cheio
 * vale ~2 níveis, menos que ter capitão. Misturar dois jogadores de outro país custa uma fração disso.
 */
export const THEME_TOTAL_CAP = 4;

/**
 * O DIA DE JOGO, em níveis. Quantos níveis vale cada 1% de "dia" que o motor sorteia (`getMatchDayPower`).
 *
 * O motor sorteia o dia como uma PORCENTAGEM do poder cru, e isso era um desastre nesta escala: abaixo do joelho
 * (100 de poder cru) um ponto de poder cru vale um nível inteiro, e acima dele vale um vinte avos. Os bots moram em
 * 98–104 de poder cru e os times de jogador em 110–150, então os mesmos ±1,5% mexiam 3,1 níveis num bot sem
 * história e 0,7 no melhor time de jogador: o bot mais fraco do jogo, num dia bom, encostava no campeão de Major, e
 * um time 98 perdia para 9z 2022 sem entender por quê.
 *
 * Aqui o dia é convertido para níveis antes de ser somado, então ele custa o mesmo para todo mundo: dia normal
 * mexe ~±0,2 nível e um dia excepcional (o +8,5% de um time agressivo) vale ~+1,1, seja de quem for.
 */
export const DAY_SWING_COURT = 13;

// ---------------------------------------------------------------------------------------------------------------
// Os bots: a escada de progressão do campeonato
// ---------------------------------------------------------------------------------------------------------------

/**
 * A FAIXA DE NÍVEL DE CADA BOT, por história de Major. É a progressão do chaveamento: o time sem história é o
 * degrau de entrada e o campeão é a parede final.
 *
 * Era um degrau único por pedigree, e isso achatava o campo: TODO time sem história entrava no mesmo nível, então
 * 9z 2022 (elenco 76 de overall) jogava igual a OG 2023 (81) e o elenco não dizia nada. Pior, o degrau vivia colado
 * no topo (94,9 para o mais fraco do jogo) e o dono perdia para times que não deveriam ameaçar ninguém.
 *
 * Agora cada bot cai DENTRO da faixa do pedigree dele, pelo elenco: o pior elenco do dataset encosta no mínimo da
 * faixa e o melhor no máximo (`BOT_NATURAL_RANGE`). Um campeão de Major segue sendo parede; um time sem história
 * fica entre 85 e 90, que é onde um time de jogador já montado tem que passar por cima.
 */
export const BOT_LEVEL_BAND: Readonly<Record<'champion' | 'finalist' | 'semifinal' | 'top8' | 'none', readonly [min: number, max: number]>> = {
  champion: [94, 96.5],
  finalist: [92, 95.5],
  semifinal: [90.5, 94.5],
  top8: [88.5, 93],
  none: [85, 90]
};

/**
 * De onde a faixa lê o elenco: o nível natural do pior e do melhor time-ano do dataset (medido, sem degrau nenhum:
 * 70,4 e 96,7). Um bot no fundo dessa régua entra no mínimo da faixa dele, um no topo entra no máximo.
 */
export const BOT_NATURAL_RANGE: readonly [min: number, max: number] = [70, 97];

/**
 * A ZEBRA: o azarão que entra embalado. Quantos NÍVEIS ela ganha em cima da faixa do pedigree dela.
 *
 * Já foi uma porcentagem sobre o poder cru (+20%), e aquilo quebrou: um elenco fraco virava zebra e ficava MAIS
 * fraco do que era. Em níveis o impulso sempre soma.
 */
export const ZEBRA_LIFT_COURT = 0.5;
/** E nenhuma zebra passa disto, por mais embalada que esteja. */
export const ZEBRA_LEVEL_CAP = 94;

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
export const PLAYER_GAP_FROM_TOP = 2.2;

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
 * Medido em 2026-09-21, com as faixas de bot novas (o alívio encolheu junto, porque o campo já é bem mais fraco):
 * nível 96,8 → 14% de título, 97,6 → 24%, 98,0 → 53%, 98,6 → 65–74%; o time do topo não cai mais na fase suíça.
 * O Major normal usa a mesma tabela e é mais fácil pelo campo.
 * `tests/soloDifficulty.test.ts` re-mede e falha se a curva sair da faixa.
 */
export const SOLO_FIELD_RELIEF: readonly (readonly [level: number, relief: number])[] = [
  [96.78, 0.5],
  [97.44, 1],
  [98, 1.6],
  [98.33, 2],
  [98.56, 2.2],
  [99, 2.5]
];

/** Multiplicador do alívio no "Major normal" (campo sorteado). Em 1 os dois modos usam a mesma tabela; o normal já é mais fácil pelo campo. */
export const SOLO_RANDOM_RELIEF_FACTOR = 1;
