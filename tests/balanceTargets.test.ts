// tests/balanceTargets.test.ts
// As faixas de equilíbrio combinadas com o dono, medidas no motor real (MD3 de verdade, pela cadeia do servidor).
// O objetivo: justo e estudado, não pay-to-win, e com progressão — cada degrau do chaveamento mais duro que o
// anterior. Desde 2026-09-21 a escada dos bots é a de PEDIGREE fino (9 categorias, ver `pedigreeOf` em
// `bot-field.ts` e `docs/reports/2026-09-21-taxonomia-pedigree.md`), e o piso do jogador ficou em 93: quem começa
// vence o degrau de entrada com folga e é azarão claro dos campeões.
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
    // A melhor line de referência fica a poucos níveis do topo (o topo é a melhor line MONTÁVEL, `RAW_TOP`).
    expect(Math.max(...teams)).toBeGreaterThan(COURT_TOP - 5);
    // O bug que a escala veio consertar: as mesmas cartas montadas de jeitos diferentes jogavam idênticas, todas
    // cortadas em 110. Agora cada nível de capricho tem o seu número.
    const nivel = (key: keyof typeof LAB) => courtPower(labLineup(LAB[key]).team.power);
    expect(nivel('goatsBuilt')).toBeGreaterThan(nivel('goatsLazy'));
    expect(nivel('goatsLazy')).toBeGreaterThan(nivel('goatsLazyNoIgl'));
    expect(nivel('goatsLazyNoIgl')).toBeGreaterThan(nivel('goatsNoIgl'));
    expect(nivel('superstarsBuilt')).toBeGreaterThan(nivel('superstarsThrown'));
    // E um time histórico bem montado alcança a melhor line de GOATs: capricho compensa carta.
    expect(Math.abs(nivel('ownerSk') - nivel('goatsBuilt'))).toBeLessThan(2.7);
  });

  it('a escada dos bots sobe degrau a degrau até o campeão', () => {
    const degraus = (['semHistoria', 'top8', 'semifinal', 'vice', 'campeao'] as const).map((tier) => courtPower(labBot(LAB_BOTS[tier]).team.power));
    for (let index = 1; index < degraus.length; index += 1) expect(degraus[index]).toBeGreaterThanOrEqual(degraus[index - 1]);
    expect(degraus.at(-1)!).toBeLessThan(COURT_TOP);
  });
});

describe('justo e estudado', () => {
  band('montar bem vale: mesmas cartas, caprichado × preguiçoso', () => labLineup(LAB.goatsBuilt), () => labLineup(LAB.goatsLazy), 59);
  // Os GOATs "preguiçosos" têm o núcleo inteiro (IGL, AWPer e suporte de ofício): só falta star, coach e plano. É um
  // time organizado de cartas melhores, então leva um pouco mais da metade — mas o estudo tira quase toda a diferença de carta.
  band('estudo encosta no dinheiro: Superstars caprichados × GOATs preguiçosos', () => labLineup(LAB.superstarsBuilt), () => labLineup(LAB.goatsLazy), 46);
  band('carta ajuda, não decide: GOATs × Superstars, os dois caprichados', () => labLineup(LAB.goatsBuilt), () => labLineup(LAB.superstarsBuilt), 60);
  band('estudo ganha de carta jogada: Elites caprichados × quatro 99 sem IGL', () => labLineup(LAB.elites), () => labLineup(LAB.goatsNoIgl), 58);
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
  band('o degrau de entrada é formalidade para um time montado', () => labLineup(LAB.goatsBuilt), () => labBot(LAB_BOTS.semHistoria), 99, 4);
  band('...e também para quem montou mal: o susto agora vem dos degraus de cima', () => labLineup(LAB.goatsNoIgl), () => labBot(LAB_BOTS.semHistoria), 99, 5);
  band('o campeão é a parede final, mesmo para a melhor line', () => labLineup(LAB.goatsBuilt), () => labBot(LAB_BOTS.campeao), 66);
  band('quem monta mal é azarão contra o campeão', () => labLineup(LAB.goatsNoIgl), () => labBot(LAB_BOTS.campeao), 43);

  it('quem está começando tem onde jogar: atropela o degrau de entrada e é azarão claro do campeão', { timeout: TIMEOUT }, () => {
    const beginner = labLineup(LAB.beginner);
    const entrada = winRate(beginner, labBot(LAB_BOTS.semHistoria), 'court', SERIES);
    const campeao = winRate(beginner, labBot(LAB_BOTS.campeao), 'court', SERIES);
    expect(entrada, `iniciante × degrau de entrada: ${entrada}%`).toBeGreaterThan(50);
    // O piso do jogador em 93 (combinado 2026-09-21): os fracos são fracos de verdade para quem começa, e o
    // campeão de Major é parede — azarão claro, não coin flip.
    expect(campeao, `iniciante × campeão: ${campeao}%`).toBeGreaterThanOrEqual(8);
    expect(campeao, `iniciante × campeão: ${campeao}%`).toBeLessThanOrEqual(20);
    expect(campeao, `iniciante × campeão: ${campeao}%`).toBeLessThan(entrada);
  });
});
