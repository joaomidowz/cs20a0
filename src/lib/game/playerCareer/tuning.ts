// src/lib/game/playerCareer/tuning.ts
// TABELA DE AJUSTE do embalo das calls e do arco da Carreira (plano 07). Todos os números que mudam o equilíbrio desses
// dois sistemas ficam aqui, num lugar só, para ajustar depois de jogar em produção. Este arquivo não importa nada: o
// motor de rounds (rounds.ts) e o arco (form.ts) leem daqui e reexportam com os mesmos nomes.
//
// Estado: valores de partida do protótipo do plano 07 (passaram nos critérios C1 a C8 lá, sobre 67fa6bf). A calibração
// com o jogo final (Task 10 do plano) ainda não rodou. Primeira troca medida: studySeason de 6 para 8 (a temporada
// depois do auge dava 38% a 40% de títulos, o alvo é 25% a 35%).
// Recalibrado em 2026-11-12 (medidor novo: leitura certa que perde não dá mais virada ao rival; erro tira o dobro), com
// 24 seeds × 5 temporadas no arco e 20 × 2 no azarão. Antes → depois: auge 91 best 53 → 57 (C1 ✓), auge 95 best 61 → 66
// (C2 ✓), pós-auge 34 → 36 (C3, 1 ponto acima: ruído aceito pelo plano), seca 19 → 16 (C4 ✓), voltas 0 → 7 (C5: passou a
// valer), auge seguido máx 2/3 → 3/3 (C6 ✓), random 34 → 39 contra best 57 (C7 ✓), azarão best 47 → 49 e com 2+ calls
// ganhas 58 → 57 (C8 ✓). Para medir uma troca sem mexer no jogo:
//   CAREER_ARC=1 npx vitest run tests/playerCareerArcCalibration.test.ts -t "temporadas seguidas"
//   CAREER_UNDERDOG=1 npx vitest run tests/playerCareerArcCalibration.test.ts -t "rival 3 a 6"
// (o arco aceita números de teste por CAREER_ARC_TUNING='{"seasonFloor":0.4}'; o embalo só trocando o valor aqui).
//
// ┌──────────────────────────────┬────────┬──────────────────────────────────────────────────────────────────────────┐
// │ Número                       │ Valor  │ O que faz                                                                │
// ├──────────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────┤
// │ EMBALO DAS CALLS (rounds.ts, vale só para a call da Carreira): um medidor só, do ponto de vista de quem chama      │
// │ CLUTCH_CARRY_STEP            │ 0.015  │ acerto (leitura certa que ganhou o round) do favorito ou no jogo parelho │
// │ CLUTCH_CARRY_UNDERDOG_STEP   │ 0.08   │ acerto do azarão cheio (rival bem mais forte); no meio, proporcional     │
// │ CLUTCH_CARRY_MISS_STEP       │ 0.03   │ erro (leitura errada que perdeu o round): tira o dobro do acerto         │
// │ MAX_CLUTCH_CARRY             │ 0.03   │ teto do medidor do favorito ou no jogo parelho (chance de round)         │
// │ MIN_CLUTCH_CARRY             │ -0.08  │ piso do medidor: errar tudo custa até 8% por round                       │
// │ UNDERDOG_CARRY_CAP_BONUS     │ 0.1    │ azarão cheio: o teto sobe até 13% (é ele que vira a série, C8)           │
// │ STAR_CARRY_STEP_BONUS        │ 0      │ craque (fator 1): desligado; ligado, o 95 da elite dominava (C2, C6)     │
// │ STAR_CARRY_CAP_BONUS         │ 0      │ craque (fator 1): desligado; o embalo do azarão já carrega o time menor  │
// │ CLUTCH_CARRY_SERIES_SHARE    │ 0.5    │ fração do medidor do mapa que passa para o mapa seguinte da série        │
// │ Leitura certa que perdeu no detalhe e leitura errada que deu sorte não mexem no medidor: o rival não ganha virada  │
// │ de graça quando você decidiu certo.                                                                              │
// ├──────────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────┤
// │ FÔLEGO DE QUEM ESTÁ ATRÁS (live.ts, só o seu time e só ao vivo)                                                   │
// │ COMEBACK_LIFT_MAP            │ .015/.025 │ 3+ rounds atrás no mapa empurra 1,5%; 6+ atrás, 2,5%                  │
// │ COMEBACK_LIFT_SERIES         │ 0.01   │ atrás no placar de mapas soma 1%                                         │
// │ MAX_COMEBACK_LIFT            │ 0.03   │ teto do fôlego: dá pra buscar, a virada não vem de presente              │
// ├──────────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────┤
// │ ARCO DA CARREIRA (ARC_TUNING, form.ts: fase do time por bloco e estudo dos rivais)                                │
// │ phasePower                   │ 1.5    │ força que a fase alta soma (e a baixa tira) do seu time no campeonato    │
// │ stay                         │ 0.5    │ chance de a fase alta (ou baixa) continuar no bloco seguinte             │
// │ tilt                         │ 0.1    │ quanto um bloco dominante puxa para a alta (sem final, para a baixa)     │
// │ studyMax                     │ 4      │ teto do estudo dos rivais, em pontos de força contra o seu time          │
// │ studyBlock                   │ 4      │ peso do domínio do bloco anterior (acima de blockFloor) no estudo        │
// │ blockFloor                   │ 0.5    │ domínio do bloco a partir do qual o estudo começa a contar               │
// │ studySeason                  │ 10     │ peso do domínio dos últimos 12 campeonatos (acima de seasonFloor)        │
// │ seasonFloor                  │ 0.4    │ domínio do ano a partir do qual o estudo começa a contar                 │
// └──────────────────────────────┴────────┴──────────────────────────────────────────────────────────────────────────┘
// Domínio = (títulos + 0,4 × finais perdidas) / campeonatos jogados. As cartas da semana cortam o estudo do bloco:
// Mudar o playbook 60% e Estudar as demos deles 35% (agenda.ts, efeito `study`).
// Fora desta tabela: a progressão do overall do seu jogador tem os números no topo de growth.ts (faixas do rating no
// fechamento RATING_MINUS_2_BELOW 0,75 · RATING_MINUS_1_BELOW 0,90 · RATING_PLUS_1/2/3_ABOVE 1,00/1,10/1,20; +1 de jovem
// YOUTH_BONUS até YOUTH_BONUS_MAX_AGE 21 com rating acima de YOUTH_BONUS_RATING 1,10; VETERAN_HOLD_RATING 1,09 depois
// dos 34; CEILING_BONUS_CAP 4; semanas de treino por +1 em sessionsPerOverall).

// ── Embalo das calls ────────────────────────────────────────────────────────────────────────────────────────────────
/** Acerto na call (favorito ou confronto parelho): o medidor sobe este passo. */
export const CLUTCH_CARRY_STEP = 0.015;
/** Acerto do azarão: quanto mais forte o adversário, mais a call certa vale (até este passo). É o que deixa o azarão
 *  que lê bem virar a série (C8 do plano 07) sem dar ao rival a virada de graça. */
export const CLUTCH_CARRY_UNDERDOG_STEP = 0.08;
/** Erro na call (leitura errada que perdeu o round): o medidor desce o dobro do acerto. Confiança cai mais rápido do que sobe. */
export const CLUTCH_CARRY_MISS_STEP = 0.03;
/** Teto do medidor das calls do favorito (ou no jogo parelho): acertar tudo vale no máximo +3% por round. Com 5% o 95 da
 *  elite passava de 68% de títulos no auge (C2) sem a virada de graça do rival que antes o segurava. */
export const MAX_CLUTCH_CARRY = 0.03;
/** Piso do medidor das calls: errar tudo custa até −8% por round. */
export const MIN_CLUTCH_CARRY = -0.08;
/** Azarão cheio acertando: o teto do medidor sobe este tanto (proporcional ao quanto ele é azarão). */
export const UNDERDOG_CARRY_CAP_BONUS = 0.1;
/** Craque acertando (fator craque 1): cada acerto soma este tanto a mais, proporcional. Desligado (0): medido, o 95 da elite
 *  passava de 68% de títulos no auge e dominava 5 anos seguidos (C2 e C6); o craque de time menor já é azarão e leva o
 *  embalo do azarão. Fica na tabela para ligar de novo se a medição pedir. */
export const STAR_CARRY_STEP_BONUS = 0;
/** Craque acertando (fator craque 1): quanto o teto do medidor sobe. Desligado (0), pelo mesmo motivo. */
export const STAR_CARRY_CAP_BONUS = 0;
/** Quanto do medidor atravessa o intervalo: quem leu certo chega aquecido no mapa seguinte da série. */
export const CLUTCH_CARRY_SERIES_SHARE = 0.5;

// ── Fôlego de quem está atrás ───────────────────────────────────────────────────────────────────────────────────────
/** Fôlego no mapa: 3+ rounds atrás empurra o round em 1,5%; 6+ atrás, 2,5%. */
export const COMEBACK_LIFT_MAP = { 3: 0.015, 6: 0.025 } as const;
/** Fôlego na série: atrás no placar de mapas soma 1%. */
export const COMEBACK_LIFT_SERIES = 0.01;
/** Teto do fôlego: o bastante para sentir que dá pra buscar, nunca a virada de presente. */
export const MAX_COMEBACK_LIFT = 0.03;

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

/** Valores do plano 07 recalibrados em 2026-11-12 com o medidor novo das calls (sem a virada de graça do rival, o favorito
 *  dominava mais): studyMax 3 → 4 e studySeason 8 → 10. Medição C1 a C8 no fim do plano. */
export const ARC_TUNING: ArcTuning = {
  phasePower: 1.5,
  stay: 0.5,
  tilt: 0.1,
  studyMax: 4,
  studyBlock: 4,
  blockFloor: 0.5,
  studySeason: 10,
  seasonFloor: 0.4
};
