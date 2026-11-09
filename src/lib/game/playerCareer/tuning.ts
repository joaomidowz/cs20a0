// src/lib/game/playerCareer/tuning.ts
// TABELA DE AJUSTE do embalo das calls e do arco da Carreira (plano 07). Todos os números que mudam o equilíbrio desses
// dois sistemas ficam aqui, num lugar só, para ajustar depois de jogar em produção. Este arquivo não importa nada: o
// motor de rounds (rounds.ts) e o arco (form.ts) leem daqui e reexportam com os mesmos nomes.
//
// Estado: valores de partida do protótipo do plano 07 (passaram nos critérios C1 a C8 lá, sobre 67fa6bf). A calibração
// com o jogo final (Task 10 do plano) ainda não rodou. Primeira troca medida: studySeason de 6 para 8 (a temporada
// depois do auge dava 38% a 40% de títulos, o alvo é 25% a 35%). Para medir uma troca sem mexer no jogo:
//   CAREER_ARC=1 npx vitest run tests/playerCareerArcCalibration.test.ts -t "temporadas seguidas"
//   CAREER_UNDERDOG=1 npx vitest run tests/playerCareerArcCalibration.test.ts -t "rival 3 a 6"
// (o arco aceita números de teste por CAREER_ARC_TUNING='{"seasonFloor":0.4}'; o embalo só trocando o valor aqui).
//
// ┌──────────────────────────────┬────────┬──────────────────────────────────────────────────────────────────────────┐
// │ Número                       │ Valor  │ O que faz                                                                │
// ├──────────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────┤
// │ EMBALO DAS CALLS (rounds.ts, vale só para a call da Carreira)                                                     │
// │ CLUTCH_CARRY_STEP            │ 0.02   │ embalo de quem ganha o round da call sendo favorito ou no jogo parelho   │
// │ CLUTCH_CARRY_UNDERDOG_STEP   │ 0.1    │ embalo do azarão cheio (rival bem mais forte); no meio, proporcional     │
// │ CLUTCH_CARRY_RIVAL_SHARE     │ 0.7    │ fração do passo que o rival leva quando a sua call falha                 │
// │ MAX_CLUTCH_CARRY             │ 0.15   │ teto do embalo acumulado num mapa (chance de round)                      │
// │ CLUTCH_CARRY_SERIES_SHARE    │ 0.5    │ fração do embalo do mapa que passa para o mapa seguinte da série         │
// ├──────────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────┤
// │ ARCO DA CARREIRA (ARC_TUNING, form.ts: fase do time por bloco e estudo dos rivais)                                │
// │ phasePower                   │ 1.5    │ força que a fase alta soma (e a baixa tira) do seu time no campeonato    │
// │ stay                         │ 0.5    │ chance de a fase alta (ou baixa) continuar no bloco seguinte             │
// │ tilt                         │ 0.1    │ quanto um bloco dominante puxa para a alta (sem final, para a baixa)     │
// │ studyMax                     │ 3      │ teto do estudo dos rivais, em pontos de força contra o seu time          │
// │ studyBlock                   │ 4      │ peso do domínio do bloco anterior (acima de blockFloor) no estudo        │
// │ blockFloor                   │ 0.5    │ domínio do bloco a partir do qual o estudo começa a contar               │
// │ studySeason                  │ 8      │ peso do domínio dos últimos 12 campeonatos (acima de seasonFloor)        │
// │ seasonFloor                  │ 0.4    │ domínio do ano a partir do qual o estudo começa a contar                 │
// └──────────────────────────────┴────────┴──────────────────────────────────────────────────────────────────────────┘
// Domínio = (títulos + 0,4 × finais perdidas) / campeonatos jogados. As cartas da semana cortam o estudo do bloco:
// Mudar o playbook 60% e Estudar as demos deles 35% (agenda.ts, efeito `study`).

// ── Embalo das calls ────────────────────────────────────────────────────────────────────────────────────────────────
/** Embalo de quem ganha o round da call sendo favorito ou no confronto parelho: um empurrão discreto. */
export const CLUTCH_CARRY_STEP = 0.02;
/** Embalo do azarão: quanto mais forte o adversário, mais o round da call compra a virada (até este passo). */
export const CLUTCH_CARRY_UNDERDOG_STEP = 0.1;
/** Quanto do passo o rival leva quando a sua call falha: ele leu você, mas o round não era dele. */
export const CLUTCH_CARRY_RIVAL_SHARE = 0.7;
/** Teto do embalo acumulado num mapa. */
export const MAX_CLUTCH_CARRY = 0.15;
/** Quanto do embalo atravessa o intervalo: quem leu certo chega aquecido no mapa seguinte da série. */
export const CLUTCH_CARRY_SERIES_SHARE = 0.5;

// ── Arco da carreira ────────────────────────────────────────────────────────────────────────────────────────────────
/** Os números do arco, num lugar só: a calibração (calibration.ts) mede variações deles sem mexer no jogo. */
export interface ArcTuning {
  /** Força que a fase alta soma (e a baixa tira) do seu time em cada campeonato. */
  phasePower: number;
  /** Chance de a fase alta (ou a baixa) continuar no bloco seguinte, sem contar o resultado. */
  stay: number;
  /** Probabilidade que um bloco dominante leva para a fase alta (e um bloco sem final, para a baixa). */
  tilt: number;
  /** Teto do estudo dos rivais, em pontos de força contra o seu time. */
  studyMax: number;
  /** Quanto o domínio do bloco anterior acima do piso vira estudo. */
  studyBlock: number;
  /** Domínio do bloco anterior a partir do qual o estudo começa a contar. */
  blockFloor: number;
  /** Quanto o domínio dos últimos campeonatos (o ano dominante) acima do piso vira estudo. */
  studySeason: number;
  /** Domínio do ano a partir do qual o estudo começa a contar. */
  seasonFloor: number;
}

/** Valores de partida do protótipo do plano 07 (C1 a C8 passaram lá), com studySeason 8; ainda sem a calibração completa. */
export const ARC_TUNING: ArcTuning = {
  phasePower: 1.5,
  stay: 0.5,
  tilt: 0.1,
  studyMax: 3,
  studyBlock: 4,
  blockFloor: 0.5,
  studySeason: 8,
  seasonFloor: 0.4
};
