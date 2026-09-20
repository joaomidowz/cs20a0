// tests/balanceTargets.test.ts
// As faixas de justiça combinadas com o dono, medidas no motor real (MD3 de verdade, pela cadeia do servidor).
// O objetivo do jogo: justo e estudado, não pay-to-win. Se uma mudança futura fizer carta cara ganhar sozinha, ou
// fizer montar bem deixar de valer, é aqui que ela falha. Os números de referência são os de 2026-09-20.
import { describe, expect, it } from 'vitest';
import { LAB, LAB_CHAMPION_BOT, labBot, labLineup, winRate } from './helpers/balanceLab';

const TIMEOUT = 300_000;
const SERIES = 300;
/** Win rate of `a` against `b` on the court scale, within `tolerance` points of `target`. */
const band = (name: string, a: () => ReturnType<typeof labLineup>, b: () => ReturnType<typeof labLineup>, target: number, tolerance = 8) =>
  it(`${name}: ~${target}%`, { timeout: TIMEOUT }, () => {
    const rate = winRate(a(), b(), 'court', SERIES);
    expect(rate, `${name}: ${rate}% (faixa ${target - tolerance}-${target + tolerance})`).toBeGreaterThanOrEqual(target - tolerance);
    expect(rate, `${name}: ${rate}% (faixa ${target - tolerance}-${target + tolerance})`).toBeLessThanOrEqual(target + tolerance);
  });

describe('o corte clássico em 110, que a escala de quadra veio consertar', () => {
  it('com o corte, montar bem não vale nada para quem tem carta forte: tudo empata', { timeout: TIMEOUT }, () => {
    const lazy = labLineup(LAB.goatsLazy);
    expect(labLineup(LAB.goatsBuilt).team.power).toBeGreaterThan(lazy.team.power + 5);
    // Dois times de poder bem diferente, os dois acima de 110, jogavam idênticos.
    const inflate = (side: ReturnType<typeof labLineup>, power: number) => ({ ...side, team: { ...side.team, power } });
    expect(Math.abs(winRate(inflate(labLineup(LAB.goatsBuilt), 134), inflate(lazy, 112), 'classic', SERIES) - 50)).toBeLessThanOrEqual(8);
  });
});

describe('justo e estudado (escala de quadra)', () => {
  band('montar bem vale: mesmas cartas, bem montado × preguiçoso', () => labLineup(LAB.goatsBuilt), () => labLineup(LAB.goatsLazy), 67);
  band('estudo ganha de dinheiro: Superstars bem montados × GOATs preguiçosos', () => labLineup(LAB.superstarsBuilt), () => labLineup(LAB.goatsLazy), 62);
  band('carta ajuda, não decide: GOATs bem montados × Superstars bem montados', () => labLineup(LAB.goatsBuilt), () => labLineup(LAB.superstarsBuilt), 61);
  band('montar bem com carta barata: Superstars bem montados × jogados', () => labLineup(LAB.superstarsBuilt), () => labLineup(LAB.superstarsThrown), 74);
  band('jogar sem capitão custa caro, inclusive para quem tem GOATs', () => labLineup(LAB.goatsLazyNoIgl), () => labLineup(LAB.goatsLazy), 33);
  band('quatro 99 sem IGL nem suporte perdem de um time histórico bem montado', () => labLineup(LAB.ownerSk), () => labLineup(LAB.goatsNoIgl), 84);
  band('time histórico bem montado fica pau a pau com GOATs bem montados', () => labLineup(LAB.ownerSk), () => labLineup(LAB.goatsBuilt), 47);
});

describe('contra os bots: nem farm, nem muro', () => {
  band('time bem montado vence o campeão médio cerca de quatro vezes em cinco', () => labLineup(LAB.goatsBuilt), () => labBot(LAB_CHAMPION_BOT), 80);
  band('time médio jogado de qualquer jeito é cara ou coroa contra o campeão', () => labLineup(LAB.superstarsThrown), () => labBot(LAB_CHAMPION_BOT), 48);
  band('iniciante ainda não bate campeão de Major', () => labLineup(LAB.beginner), () => labBot(LAB_CHAMPION_BOT), 4, 6);
  band('iniciante disputa de igual com um vice', () => labLineup(LAB.beginner), () => labBot('furia-2026'), 62);
});
