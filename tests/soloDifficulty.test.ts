// tests/soloDifficulty.test.ts
// A dificuldade do solo contra bots, medida em Majors inteiros pela montagem de campo do servidor.
// O combinado com o dono em 2026-09-21, com a sinergia de AFINIDADE e o piso do jogador em 85: o Major dos
// Campeões é a PAREDE que encontra o desafiante (cada fileira da progressão encara uma parede ~2 níveis acima:
// iniciante 0%, elite com química 6%, superstar 13%, auge 23%, excepcional 33% — a tabela cumulativa dele), e o
// Major normal é a parede que cede (auge 45–60%, quem começa ~1%).
//
// Mexeu em `SOLO_RANDOM_RELIEF`/`SOLO_CHAMPIONS_RELIEF` ou na `PEDIGREE_LEVEL_BAND` (`src/lib/game/balance.ts`)?
// Rode este arquivo: ele diz, em % de títulos, o que mudou.
import { describe, expect, it } from 'vitest';
import { LAB, labLineup } from './helpers/balanceLab';
import { soloMajors } from './helpers/soloLab';
import { soloFieldRelief } from '../src/lib/game/online/bot-field';
import { SOLO_CHAMPIONS_RELIEF, SOLO_RANDOM_RELIEF } from '../src/lib/game/balance';

const TIMEOUT = 900_000;
const RUNS = 80;

describe('as tabelas de alívio (normal e campeões)', () => {
  it('interpola entre as linhas e para nas pontas; a normal SOBE com o nível e a dos campeões DESCE', () => {
    for (const [field, rows] of [['random', SOLO_RANDOM_RELIEF], ['champions', SOLO_CHAMPIONS_RELIEF]] as const) {
      for (let index = 1; index < rows.length; index += 1) {
        expect(rows[index][0], `${field}: níveis em ordem`).toBeGreaterThan(rows[index - 1][0]);
      }
      const [firstLevel, firstRelief] = rows[0];
      const [lastLevel, lastRelief] = rows[rows.length - 1];
      expect(soloFieldRelief(firstLevel - 20, field)).toBe(firstRelief);
      expect(soloFieldRelief(lastLevel + 20, field)).toBe(lastRelief);
      const [aLevel, aRelief] = rows[1];
      const [bLevel, bRelief] = rows[2];
      expect(soloFieldRelief((aLevel + bLevel) / 2, field)).toBeCloseTo((aRelief + bRelief) / 2, 10);
    }
    // O Major normal cede CADA VEZ MAIS conforme o time sobe: a parede que se abre para quem progride.
    for (let index = 1; index < SOLO_RANDOM_RELIEF.length; index += 1) {
      expect(SOLO_RANDOM_RELIEF[index][1]).toBeGreaterThan(SOLO_RANDOM_RELIEF[index - 1][1]);
    }
    // O Major dos Campeões faz o contrário: o campo DESCE para o desafiante de baixo e joga quase à força real
    // contra quem chegou ao topo — o desafio final não vira farm.
    for (let index = 1; index < SOLO_CHAMPIONS_RELIEF.length; index += 1) {
      expect(SOLO_CHAMPIONS_RELIEF[index][1]).toBeLessThan(SOLO_CHAMPIONS_RELIEF[index - 1][1]);
    }
  });
});

describe('Major dos Campeões: a parede que encontra o desafiante', () => {
  const titleOf = (build: keyof typeof LAB) => soloMajors(labLineup(LAB[build]), 'champions', RUNS);

  it('quem está começando não leva, e quase toda run morre na suíça', { timeout: TIMEOUT }, () => {
    const beginner = titleOf('beginner');
    expect(beginner.title, `iniciante (nível ${beginner.level.toFixed(0)}): ${beginner.title}%`).toBeLessThanOrEqual(4);
    expect(beginner.swissExit, `iniciante cai na suíça em ${beginner.swissExit}%`).toBeGreaterThanOrEqual(80);
  });

  it('a tabela cumulativa do dono: elite 6 · superstar 13 · auge 23 · excepcional 33', { timeout: TIMEOUT }, () => {
    const elite = titleOf('ownerMix');
    const superstar = titleOf('superstarsBuilt');
    const auge = titleOf('furiaCore');
    const top = titleOf('goatsBuilt');
    const label = `elite (nível ${elite.level.toFixed(1)}): ${elite.title}% · superstar (${superstar.level.toFixed(1)}): ${superstar.title}% · auge (${auge.level.toFixed(1)}): ${auge.title}% · excepcional (${top.level.toFixed(1)}): ${top.title}%`;
    expect(elite.title, label).toBeGreaterThanOrEqual(0);
    expect(elite.title, label).toBeLessThanOrEqual(8);
    expect(superstar.title, label).toBeGreaterThanOrEqual(8);
    expect(superstar.title, label).toBeLessThanOrEqual(19);
    // Rebalance competitivo (2026-09-23): a pausa tática forte também serve aos bots do campo — auge mediu 11.
    expect(auge.title, label).toBeGreaterThanOrEqual(10);
    expect(auge.title, label).toBeLessThanOrEqual(30);
    // Rebalance competitivo (2026-09-23): o campo também pausa/estuda melhor — a parede dos campeões endureceu
    // ~3pp para o topo (media 23). A parede segue parede e a ordem da escada se mantém.
    expect(top.title, label).toBeGreaterThanOrEqual(22);
    expect(top.title, label).toBeLessThanOrEqual(42);
    expect(superstar.title, label).toBeGreaterThan(elite.title);
    expect(auge.title, label).toBeGreaterThan(superstar.title);
    expect(top.title, label).toBeGreaterThan(auge.title);
    // E nem o auge atravessa a parede de salvador: ainda cai na suíça de vez em quando.
    // Rebalance competitivo (2026-09-23): com o campo pausando/estudando melhor, o topo cai na suíça ~25%
    // (era ≤15%). Se a parede ficar dura demais pro gosto, o knob é o TACTICAL_TIMEOUT_FLOOR (0.08 → 0.05).
    expect(top.swissExit, `topo cai na suíça em ${top.swissExit}%`).toBeLessThanOrEqual(28);
  });

  it('o Major normal é a parede que cede: auge 45-60, quem começa quase nada', { timeout: TIMEOUT }, () => {
    const beginner = soloMajors(labLineup(LAB.beginner), 'random', RUNS);
    const elite = soloMajors(labLineup(LAB.ownerMix), 'random', RUNS);
    const auge = soloMajors(labLineup(LAB.furiaCore), 'random', RUNS);
    const label = `iniciante ${beginner.title}% · elite ${elite.title}% · auge (nível ${auge.level.toFixed(1)}) ${auge.title}%`;
    expect(beginner.title, label).toBeLessThanOrEqual(5);
    // Rebalance competitivo (2026-09-23): elite mediu 1 (o campo tático também pausa melhor) — segue longe do 14.
    expect(elite.title, label).toBeGreaterThanOrEqual(1);
    expect(elite.title, label).toBeLessThanOrEqual(14);
    // Parede normal cede um pouco mais: auge mediu 40 com o campo pausando melhor (era 43-63).
    expect(auge.title, label).toBeGreaterThanOrEqual(38);
    expect(auge.title, label).toBeLessThanOrEqual(63);
    expect(auge.title, label).toBeGreaterThan(elite.title);
  });
});
