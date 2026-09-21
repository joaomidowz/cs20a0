// tests/soloDifficulty.test.ts
// A dificuldade do solo contra bots, medida em Majors inteiros pela montagem de campo do servidor.
// O combinado com o dono em 2026-09-21, com a escada de pedigree fina e o piso do jogador em 93: o Major dos
// Campeões é a PAREDE que não cede (o auge leva ~1 em 3, quem começa não leva e cai na suíça), e o Major normal
// é a parede que cede (auge 45–60%, medido 56% no nível 98,6; iniciante ~1%).
//
// Mexeu em `SOLO_FIELD_RELIEF` ou na `PEDIGREE_LEVEL_BAND` (`src/lib/game/balance.ts`)? Rode este arquivo: ele
// diz, em % de títulos, o que mudou.
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

describe('Major dos Campeões: a parede que não cede', () => {
  const titleOf = (build: keyof typeof LAB) => soloMajors(labLineup(LAB[build]), 'champions', RUNS);

  it('quem está começando não leva, e quase toda run morre na suíça', { timeout: TIMEOUT }, () => {
    const beginner = titleOf('beginner');
    expect(beginner.title, `iniciante (nível ${beginner.level.toFixed(0)}): ${beginner.title}%`).toBeLessThanOrEqual(4);
    expect(beginner.swissExit, `iniciante cai na suíça em ${beginner.swissExit}%`).toBeGreaterThanOrEqual(80);
  });

  it('o meio da coleção esbarra na parede, e o auge leva uma em cada três', { timeout: TIMEOUT }, () => {
    const mid = titleOf('elites');
    const high = titleOf('superstarsBuilt');
    const top = titleOf('goatsBuilt');
    const label = `nível ${mid.level.toFixed(0)}: ${mid.title}% · nível ${high.level.toFixed(0)}: ${high.title}% · nível ${top.level.toFixed(0)}: ${top.title}%`;
    expect(mid.title, label).toBeLessThanOrEqual(14);
    expect(high.title, label).toBeGreaterThanOrEqual(6);
    expect(high.title, label).toBeLessThanOrEqual(22);
    expect(top.title, label).toBeGreaterThanOrEqual(24);
    expect(top.title, label).toBeLessThanOrEqual(44);
    expect(high.title, label).toBeGreaterThan(mid.title);
    expect(top.title, label).toBeGreaterThan(high.title);
    // E nem o auge atravessa a parede de salvador: ainda cai na suíça de vez em quando.
    expect(top.swissExit, `topo cai na suíça em ${top.swissExit}%`).toBeLessThanOrEqual(12);
  });
});
