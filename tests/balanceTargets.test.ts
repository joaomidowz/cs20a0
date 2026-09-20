// tests/balanceTargets.test.ts
// As faixas de equilíbrio combinadas com o dono, medidas no motor real (MD3 de verdade, pela cadeia do servidor).
// O objetivo: justo e estudado, não pay-to-win, e com progressão — cada degrau do chaveamento mais duro que o anterior.
//
// Mexeu num número de `src/lib/game/balance.ts`? Rode este arquivo: ele diz, em porcentagem de séries ganhas, o que
// aquilo fez. Se uma mudança futura fizer carta cara ganhar sozinha, ou fizer montar bem deixar de valer, falha aqui.
import { describe, expect, it } from 'vitest';
import { LAB, LAB_BOTS, labBot, labLineup, winRate } from './helpers/balanceLab';
import { COURT_TOP, courtPower } from '../src/lib/game/courtPower';

const TIMEOUT = 300_000;
const SERIES = 300;
const TOL = 9;
const band = (name: string, a: () => ReturnType<typeof labLineup>, b: () => ReturnType<typeof labLineup>, target: number, tolerance = TOL) =>
  it(`${name}: ~${target}%`, { timeout: TIMEOUT }, () => {
    const rate = winRate(a(), b(), 'court', SERIES);
    expect(rate, `${name}: ${rate}% (faixa ${target - tolerance}-${target + tolerance})`).toBeGreaterThanOrEqual(target - tolerance);
    expect(rate, `${name}: ${rate}% (faixa ${target - tolerance}-${target + tolerance})`).toBeLessThanOrEqual(target + tolerance);
  });

describe('a escala: nada é cortado e o topo fica abaixo de 100', () => {
  it('cada line de referência tem o seu próprio número, e nenhuma chega a 100', () => {
    const teams = Object.values(LAB).map((build) => courtPower(labLineup(build).team.power));
    for (const power of teams) expect(power).toBeLessThan(100);
    expect(Math.max(...teams)).toBeGreaterThan(COURT_TOP - 1);
    // O bug que a escala veio consertar: as mesmas cartas montadas de jeitos diferentes jogavam idênticas, todas
    // cortadas em 110. Agora cada nível de capricho tem o seu número.
    const nivel = (key: keyof typeof LAB) => courtPower(labLineup(LAB[key]).team.power);
    expect(nivel('goatsBuilt')).toBeGreaterThan(nivel('goatsLazy'));
    expect(nivel('goatsLazy')).toBeGreaterThan(nivel('goatsLazyNoIgl'));
    expect(nivel('goatsLazyNoIgl')).toBeGreaterThan(nivel('goatsNoIgl'));
    expect(nivel('superstarsBuilt')).toBeGreaterThan(nivel('superstarsThrown'));
    // E um time histórico bem montado alcança a melhor line de GOATs: capricho compensa carta.
    expect(Math.abs(nivel('ownerSk') - nivel('goatsBuilt'))).toBeLessThan(0.3);
  });

  it('a escada dos bots sobe degrau a degrau até o campeão', () => {
    const degraus = (['semHistoria', 'top8', 'semifinal', 'vice', 'campeao'] as const).map((tier) => courtPower(labBot(LAB_BOTS[tier]).team.power));
    for (let index = 1; index < degraus.length; index += 1) expect(degraus[index]).toBeGreaterThanOrEqual(degraus[index - 1]);
    expect(degraus.at(-1)!).toBeLessThan(COURT_TOP);
  });
});

describe('justo e estudado', () => {
  band('montar bem vale: mesmas cartas, caprichado × preguiçoso', () => labLineup(LAB.goatsBuilt), () => labLineup(LAB.goatsLazy), 59);
  band('estudo ganha de dinheiro: Superstars caprichados × GOATs preguiçosos', () => labLineup(LAB.superstarsBuilt), () => labLineup(LAB.goatsLazy), 55);
  band('carta ajuda, não decide: GOATs × Superstars, os dois caprichados', () => labLineup(LAB.goatsBuilt), () => labLineup(LAB.superstarsBuilt), 52);
  band('montar bem com carta barata: Superstars caprichados × jogados', () => labLineup(LAB.superstarsBuilt), () => labLineup(LAB.superstarsThrown), 65);
  band('jogar sem capitão custa, mas não sentencia', () => labLineup(LAB.goatsLazyNoIgl), () => labLineup(LAB.goatsLazy), 44);
  band('time histórico bem montado × quatro 99 sem IGL', () => labLineup(LAB.ownerSk), () => labLineup(LAB.goatsNoIgl), 66);
  band('dois times caprichados de níveis diferentes ficam pau a pau', () => labLineup(LAB.ownerSk), () => labLineup(LAB.goatsBuilt), 51);

  it('nenhum confronto entre times competitivos vira atropelo', { timeout: TIMEOUT }, () => {
    const serios = ['goatsBuilt', 'goatsLazy', 'superstarsBuilt', 'superstarsThrown', 'ownerSk', 'goatsNoIgl'] as const;
    for (let i = 0; i < serios.length; i += 1) for (let j = i + 1; j < serios.length; j += 1) {
      const rate = winRate(labLineup(LAB[serios[i]]), labLineup(LAB[serios[j]]), 'court', 200);
      expect(rate, `${serios[i]} × ${serios[j]}: ${rate}%`).toBeGreaterThanOrEqual(25);
      expect(rate, `${serios[i]} × ${serios[j]}: ${rate}%`).toBeLessThanOrEqual(75);
    }
  });
});

describe('progressão: cada fase do chaveamento é um degrau', () => {
  band('o degrau de entrada é vencível para um time caprichado', () => labLineup(LAB.goatsBuilt), () => labBot(LAB_BOTS.semHistoria), 81);
  band('...e dá susto em quem montou mal', () => labLineup(LAB.goatsNoIgl), () => labBot(LAB_BOTS.semHistoria), 64);
  band('o campeão é a parede final, mesmo para a melhor line', () => labLineup(LAB.goatsBuilt), () => labBot(LAB_BOTS.campeao), 58);
  band('quem monta mal é azarão contra o campeão', () => labLineup(LAB.goatsNoIgl), () => labBot(LAB_BOTS.campeao), 38);

  it('quem está começando tem onde jogar: perde do campeão, ganha do degrau de entrada', { timeout: TIMEOUT }, () => {
    const beginner = labLineup(LAB.beginner);
    const entrada = winRate(beginner, labBot(LAB_BOTS.semHistoria), 'court', SERIES);
    const campeao = winRate(beginner, labBot(LAB_BOTS.campeao), 'court', SERIES);
    expect(entrada, `iniciante × degrau de entrada: ${entrada}%`).toBeGreaterThan(50);
    // O piso do jogador: começar é desvantagem, não sentença.
    expect(campeao, `iniciante × campeão: ${campeao}%`).toBeGreaterThan(18);
    expect(campeao, `iniciante × campeão: ${campeao}%`).toBeLessThan(entrada);
  });
});
