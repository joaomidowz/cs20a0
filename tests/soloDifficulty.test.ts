// tests/soloDifficulty.test.ts
// A dificuldade do solo contra bots, medida em Majors inteiros pela montagem de campo do servidor.
// O combinado com o dono: o "Major dos Campeões" é uma parede que CEDE conforme o time sobe de nível — quase
// impossível para quem está começando e cada vez mais vencível conforme o time sobe. Em 2026-09-20 o dono pediu
// duas vezes para facilitar ("joguei 5, perdi todas"): hoje o nível 86 leva ~metade, o 90 três de quatro e o 95+ quase sempre.
// Antes disto um time quase perfeito levava o título em 3% das runs e caía na fase suíça em 45%.
//
// Mexeu em `SOLO_FIELD_RELIEF` (`src/lib/game/balance.ts`)? Rode este arquivo: ele diz, em % de títulos, o que mudou.
import { describe, expect, it } from 'vitest';
import { LAB, labLineup } from './helpers/balanceLab';
import { soloMajors } from './helpers/soloLab';
import { soloFieldRelief } from '../src/lib/game/online/bot-field';
import { SOLO_FIELD_RELIEF } from '../src/lib/game/balance';

const TIMEOUT = 900_000;
const RUNS = 80;

describe('a tabela de alívio', () => {
  it('sobe com o nível, interpola entre as linhas e para nas pontas', () => {
    for (let index = 1; index < SOLO_FIELD_RELIEF.length; index += 1) {
      expect(SOLO_FIELD_RELIEF[index][0]).toBeGreaterThan(SOLO_FIELD_RELIEF[index - 1][0]);
      expect(SOLO_FIELD_RELIEF[index][1]).toBeGreaterThanOrEqual(SOLO_FIELD_RELIEF[index - 1][1]);
    }
    const [firstLevel, firstRelief] = SOLO_FIELD_RELIEF[0];
    const [lastLevel, lastRelief] = SOLO_FIELD_RELIEF[SOLO_FIELD_RELIEF.length - 1];
    expect(soloFieldRelief(firstLevel - 20)).toBe(firstRelief);
    expect(soloFieldRelief(lastLevel + 20)).toBe(lastRelief);
    const [aLevel, aRelief] = SOLO_FIELD_RELIEF[1];
    const [bLevel, bRelief] = SOLO_FIELD_RELIEF[2];
    expect(soloFieldRelief((aLevel + bLevel) / 2)).toBeCloseTo((aRelief + bRelief) / 2, 10);
  });
});

describe('Major dos Campeões: a parede cede conforme o time sobe de nível', () => {
  const titleOf = (build: keyof typeof LAB) => soloMajors(labLineup(LAB[build]), 'champions', RUNS);

  it('quem está começando quase nunca leva, mas não é zero para sempre', { timeout: TIMEOUT }, () => {
    const beginner = titleOf('beginner');
    expect(beginner.title, `iniciante (nível ${beginner.level.toFixed(0)}): ${beginner.title}%`).toBeLessThanOrEqual(25);
  });

  it('a partir do nível ~85 o título é possível, e sobe a cada degrau até o topo', { timeout: TIMEOUT }, () => {
    const mid = titleOf('superstarsBuilt');
    const high = titleOf('goatsLazy');
    const top = titleOf('goatsBuilt');
    const label = `nível ${mid.level.toFixed(0)}: ${mid.title}% · nível ${high.level.toFixed(0)}: ${high.title}% · nível ${top.level.toFixed(0)}: ${top.title}%`;
    // Nível ~86: perto de metade. Nível ~90: três de cada quatro.
    expect(mid.title, label).toBeGreaterThanOrEqual(10);
    expect(mid.title, label).toBeLessThanOrEqual(42);
    expect(high.title, label).toBeGreaterThanOrEqual(36);
    expect(high.title, label).toBeLessThanOrEqual(70);
    // O topo (95+): quase sempre, e ainda assim não é garantido.
    expect(top.title, label).toBeGreaterThanOrEqual(52);
    expect(top.title, label).toBeLessThanOrEqual(88);
    expect(high.title, label).toBeGreaterThan(mid.title);
    expect(top.title, label).toBeGreaterThan(high.title);
    // E o time do topo não morre mais na fase suíça (eram 45% das runs).
    expect(top.swissExit, `topo cai na suíça em ${top.swissExit}%`).toBeLessThanOrEqual(15);
  });
});
