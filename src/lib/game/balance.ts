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

/** Time sem capitão. Mais negativo = montar sem IGL dói mais. Sem quem chama o jogo não existe time de CS:
 *  cinco estrelas sem capitão NÃO são um time — é o anti-pay-to-win na raiz (combinado com o dono, 2026-09-21). */
export const MISSING_IGL_COURT = -2.5;
/** Time sem AWPer. Sem a AWP dominante a equipe joga com uma arma a menos em todo mapa. */
export const MISSING_AWPER_COURT = -1.5;
/** Time sem suporte. A peça mais barata de ter e a que mais falta quando não está (era -0,8; dono, 2026-09-27:
 *  cinco atacantes sem quem segure o bomb não podem ficar a menos de um nível de um time montado). */
export const MISSING_SUPPORT_COURT = -1.5;
/**
 * Dois AWPers na mesma line (dono, 2026-09-27). Pagava +1% quando os dois eram bons; agora custa nível — "não é
 * B.O., mas é um debuffzinho": duas AWPs competem pelo mesmo dinheiro e pelo mesmo ângulo. Dois AWPers fracos
 * custam mais.
 */
export const DOUBLE_AWP_STRONG_COURT = -1;
export const DOUBLE_AWP_WEAK_COURT = -1.5;
/**
 * O ELENCO conta no topo (dono, 2026-09-27). Acima do joelho da curva só 5% de cada ponto de overall chega à
 * quadra, e a Vitality 2025 (média 95,8) perdia da SK 2016 (média 92,8) por encaixe de bônus. Esta linha devolve
 * o elenco: cada ponto de overall acima de `ELITE_ROSTER_FROM_OVERALL`, em cada carta, vale
 * `ELITE_ROSTER_PER_POINT` nível, com teto `ELITE_ROSTER_CAP`. Só conta com IGL na line: cinco GOATs sem capitão
 * seguem em ~92, e a mensagem "carta não substitui montagem" continua de pé.
 */
export const ELITE_ROSTER_FROM_OVERALL = 92;
export const ELITE_ROSTER_PER_POINT = 0.3;
export const ELITE_ROSTER_CAP = 8;

/**
 * CINCO ESTRANHOS: nenhum vínculo de trio no elenco (nem núcleo/org, nem país, nem ano — dois que jogaram juntos
 * não são química). Na vida real, cinco estrelas de épocas, regiões e línguas diferentes não viram time por
 * decreto — então aqui também não: o elenco paga em NÍVEIS, igual para comum e para GOAT. Quem monta por carta,
 * sem conceito, joga ABAIXO do que as cartas prometem; quem monta com identidade (núcleo real, país, era) sobe.
 */
export const NO_CHEMISTRY_COURT = -2;

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
 * Teto da sinergia temática (mesmo time/núcleo histórico, país/região, ano). A afinidade é a MATERIA-PRIMA da
 * sinergia da coleção: um núcleo que existiu de verdade (Astralis da era) é o maior bônus do jogo — maior que
 * qualquer bônus de estrutura — e um conceito coerente (cinco CIS) também paga. No teto, a lineup histórica
 * perfeita soma ~30% → +7,5 níveis, o suficiente para encostar no teto do jogador.
 */
export const THEME_TOTAL_CAP = 30;

/**
 * Conversão das linhas de composição (% → níveis de quadra). As linhas nascem em "%" por legado da época em que
 * a sinergia multiplicava o poder cru — e abaixo do joelho da curva cada ponto cru valia um nível inteiro, então
 * o mesmo bônus rendia +14 níveis para um time fraco e +1,5 para um time de GOATs (times médios viravam
 * "dinastia" e o builder prometia +4 entregando +10). Aqui a % é só a moeda das linhas: entra na quadra como
 * níveis, o mesmo para todo mundo, e o que a tela soma é o que joga.
 */
export const SYNERGY_POWER_TO_COURT = 0.25;

/**
 * O TETO MACIO de um time de JOGADOR (dono, 2026-09-27). Até `PLAYER_SOFT_KNEE` a régua é a de sempre; acima
 * dele cada nível de montagem passa a valer só uma fração, e `PLAYER_CEILING_COURT` (99,9) é onde a MELHOR line
 * montável chega. Antes era um corte seco em 99: as cinco vagas do dono (104–106 na régua), a line russa (103) e
 * cinco GOATs com star (99,5) entravam em quadra com 99 idêntico e jogavam igual — o corte jogava fora de 3 a 7
 * níveis de montagem. Agora a diferença aparece na tela (uma casa decimal) e vale em quadra.
 *
 * `PLAYER_SOFT_TOP_COURT` é o nível na régua (antes do teto) da melhor line montável, medido pelo laboratório
 * (`tests/helpers/balanceLab.ts`) com a Vitality 2025 completa (coach XTQZZZ, ZywOo de star, plano tático) e as
 * cartas ajustadas pelo dono no Studio em 2026-09-27 (flameZ 97, mezii 95, dupreeh-2019 96, device-2019 98): mediu
 * 115,87. É uma CONSTANTE DE ESCALA, pregada de propósito: quando o
 * conteúdo mudar, `tests/powerCeiling.test.ts` re-mede e avisa. Com ela: SK 2016 completa 99,7, seleções de país
 * 99,1–99,8, vagas do dono 99,1–99,5, cinco GOATs sem pensar 98,5, campeões azarões (Gambit 2017) ~98.
 */
export const PLAYER_SOFT_KNEE = 97.5;
export const PLAYER_SOFT_TOP_COURT = 115.9;
export const PLAYER_CEILING_COURT = 99.9;

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
 * A FAIXA DE NÍVEL DE CADA BOT, pelo PEDIGREE fino. É a progressão do chaveamento: quem completava o Major é o
 * degrau de entrada, a dinastia é a parede final — e entre os dois existem campeões que dominaram, campeões que a
 * zebra coroou, vices que mereciam o título e azarões sem colocação mas com elenco para ameaçar.
 *
 * A classificação de cada time-ano (as regras em `pedigreeOf`, `bot-field.ts`) foi combinada com o dono em
 * 2026-09-21 e está documentada por completo em `docs/reports/2026-09-21-taxonomia-pedigree.md`. Dentro da faixa,
 * quem posiciona é o elenco (`BOT_NATURAL_RANGE`): o pior encosta no mínimo, o melhor no máximo.
 */
/** O pedigree fino de um time-ano, da dinastia ao que completava o chaveamento. As regras moram em `pedigreeOf`. */
export type BotPedigree =
  | 'dinastia'
  | 'campeaoForte'
  | 'campeaoUnderdog'
  | 'viceMerecedor'
  | 'viceUnderdog'
  | 'semifinalista'
  | 'top8'
  | 'nonePotencial'
  | 'noneFiller';

export const PEDIGREE_LEVEL_BAND: Readonly<Record<BotPedigree, readonly [min: number, max: number]>> = {
  // 2026-09-27: com o teto do jogador em 99,9 a dinastia sobe junto (era 98,2), para a melhor line ser favorita
  // por um nível e pouco, não por dois — o topo do solo continua parede, não passeio. Medido em 98,8 a parede
  // ficou dura demais para o 'excepcional' do lab (21% de título); em 98,5 mediu 26%.
  dinastia: [97.2, 98.5],
  campeaoForte: [96.2, 97.2],
  campeaoUnderdog: [95.2, 96.2],
  viceMerecedor: [94.4, 95.4],
  viceUnderdog: [93.4, 94.4],
  semifinalista: [92.2, 94],
  top8: [89.5, 91.8],
  nonePotencial: [87.5, 90],
  // 2026-09-27: sem o piso do jogador (85) o degrau de entrada desce junto (era 84), para quem começa (~83)
  // continuar brigando de igual nele — a promessa de 2026-09-21, agora sem handicap de nascimento.
  noneFiller: [82, 88.2]
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
export const ZEBRA_LIFT_COURT = 1;
/** E nenhuma zebra passa disto, por mais embalada que esteja. */
export const ZEBRA_LEVEL_CAP = 94.5;

/**
 * A VARIÂNCIA DA FESTA: quando a sala tem 2+ JOGADORES, as séries que envolvem time de jogador jogam com menos
 * sorte — swing de mapa, ruído por round e o achatamento da pistola são multiplicados por esta escala (bot-vs-bot
 * segue em 1, e o SOLO nunca é tocado). Não toca em NÍVEL de ninguém: o favorito converte mais porque o dado vicia
 * menos, não porque o rival ficou pior. Humano contra humano segue sem qualquer handicap (a variância é simétrica).
 * Medido em `docs/reports/2026-09-21-variancia-party.md`.
 */
export const PARTY_VARIANCE_SCALE = 0.5;
/** E o vento da ZEBRA cai pela metade na festa: com humanos se destacando, o azarão embalado embala menos. */
export const PARTY_ZEBRA_LIFT = 0.5;

// ---------------------------------------------------------------------------------------------------------------
// O piso do jogador
// ---------------------------------------------------------------------------------------------------------------

/**
 * O PISO do jogador (85) foi removido em 2026-09-27 (dono): um iniciante entra em quadra no nível que as cartas
 * dão (~83) e a progressão aparece desde o primeiro pacote — antes Iniciante e cinco Elites mostravam o mesmo 85.
 * O alívio do solo abaixo de 85 segue o da primeira linha da tabela (`soloFieldRelief`), então o campo de abertura
 * continua vencível. Bots nunca tiveram piso.
 */

// ---------------------------------------------------------------------------------------------------------------
// O solo contra bots: a parede cede conforme você sobe de nível
// ---------------------------------------------------------------------------------------------------------------

/**
 * A DIFICULDADE DO SOLO, por nível do seu time, em DUAS tabelas: uma para o "Major normal" (campo sorteado) e
 * outra, mais dura, para o "Major dos Campeões" (o desafio endgame). É aqui que se mexe quando "está impossível"
 * ou "virou farm".
 *
 * O problema que o alívio veio resolver: sozinho contra um campo de bots fortes, um time quase perfeito entrava
 * como favorito de cada série e ainda assim precisava ganhar seis seguidas — dava 3% de título, e quase metade
 * das runs morria na fase suíça. Um campeonato inteiro decidido por moeda não é dificuldade, é ruído.
 *
 * O campo cede conforme você sobe: cada par é (nível do seu time → quantos níveis o campo inteiro desce). Entre
 * um par e outro a conta interpola, então a progressão é contínua, não em degraus. Fora da tabela, vale a ponta
 * mais próxima. Vale SÓ no solo contra bots: o online entre jogadores não tem handicap nenhum.
 *
 * O combinado com o dono em 2026-09-21 (refeito no mesmo dia com a sinergia de AFINIDADE e o piso em 85): o Major
 * NORMAL é a parede que cede — título de ~1% para quem começa, ~30% para o meio da coleção (elite com química, o
 * próprio time do dono), 45–60% para o auge (núcleo real de superstrellas, tipo FURIA 2025). O MAJOR DOS CAMPEÕES
 * tem tabela própria (abaixo) e é o desafio final.
 * `tests/soloDifficulty.test.ts` re-mede as duas e falha se a curva sair da faixa.
 */
export const SOLO_RANDOM_RELIEF: readonly (readonly [level: number, relief: number])[] = [
  [85, 0.9],
  [89, 1.0],
  [92, 1.75],
  [95, 2.15],
  [97, 2.35],
  [99, 2.5]
];

/**
 * O alívio PRÓPRIO do "Major dos Campeões", o desafio endgame. Aqui a tabela SOBE ao contrário: quanto mais perto
 * da parede, MENOS o campo desce — o desafio final joga cada vez mais à força real dos campeões.
 *
 * Por que o alívio é grande embaixo: os campeões são 96,5–98,2 e um time de 92 (elite com química) não existe
 * para eles — sem campo ajustado, o Major dos Campeões é conteúdo morto até o fim da coleção. A tabela faz o
 * campo ENCONTRAR o desafiante: cada fileira da progressão enfrenta uma parede ~2 níveis acima dela, do início ao
 * fim. A parede continua parede — iniciante segue a 0% —, mas quem sobe de fileira sente o desafio crescer junto.
 *
 * Calibrada em 2026-09-21 contra a tabela cumulativa combinada com o dono (colunas cumulativas: campeão, final,
 * semi, quartas, eliminado no suíço — médias de Majors sorteados, cada torneio segue variado):
 *   iniciante (nível 85)  0/0/0/1/99 · elite (92, o time do dono) 6/12/22/40/60 · superstar (95) 13/24/43/66/34 ·
 *   auge (96,5, núcleo FURIA 2025) 23/38/64/84/16 · excepcional (99, teto do jogador) 33/55/82/94/6.
 * O que ficar acima da meta nas semis dos topos é o preço pedido da variação: com o swing de mapa de ±2 níveis
 * (que produz os 2-1, viradas e OTs combinados), um favorito de 2 níveis não converte 8 de cada 10 quartas.
 */
export const SOLO_CHAMPIONS_RELIEF: readonly (readonly [level: number, relief: number])[] = [
  [85, 4.3],
  [90, 3.9],
  [94, 3.4],
  [96, 2.7],
  [97.5, 1.3],
  [98.7, 0.45],
  [99, 0.25]
];
