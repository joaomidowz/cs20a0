// tests/balanceTargets.test.ts
// As faixas de justiça combinadas com o dono, medidas no motor real. Se uma mudança futura fizer carta cara ganhar
// sozinha, ou fizer montar bem deixar de valer, é aqui que ela falha.
import { describe, expect, it } from 'vitest';
import { LAB, LAB_CHAMPION_BOT, labBot, labLineup, winRate } from './helpers/balanceLab';

const TIMEOUT = 240_000;

describe('retrato do corte clássico em 110 (o que a escala de quadra veio consertar)', () => {
  it('as lines de referência têm o poder que medimos: o laboratório reproduz o servidor', () => {
    expect(labLineup(LAB.goatsThrown).team.power).toBeGreaterThan(110);
    expect(labLineup(LAB.goatsBuilt).team.power).toBeGreaterThan(125);
    expect(labLineup(LAB.superstarsBuilt).team.power).toBeGreaterThan(115);
    expect(labLineup(LAB.superstarsThrown).team.power).toBeLessThan(110);
    expect(labLineup(LAB.beginner).team.power).toBeLessThan(104);
    expect(labBot(LAB_CHAMPION_BOT).team.power).toBeGreaterThan(104);
  });

  it('com o corte, montar bem não vale nada para quem tem carta forte: tudo empata', { timeout: TIMEOUT }, () => {
    const thrown = labLineup(LAB.goatsThrown);
    expect(Math.abs(winRate(labLineup(LAB.goatsBuilt), thrown, 'classic') - 50)).toBeLessThanOrEqual(7);
    expect(Math.abs(winRate(labLineup(LAB.superstarsBuilt), thrown, 'classic') - 50)).toBeLessThanOrEqual(7);
  });
});
