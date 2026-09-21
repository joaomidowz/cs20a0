// tests/balanceTargets.test.ts
// As faixas de equilíbrio combinadas com o dono, medidas no motor real (MD3 de verdade, pela cadeia do servidor).
// O objetivo: justo e estudado, não pay-to-win, e com progressão — cada degrau do chaveamento mais duro que o
// anterior. Desde 2026-09-21 a escada dos bots é a de PEDIGREE fino (9 categorias, ver `pedigreeOf` em
// `bot-field.ts` e `docs/reports/2026-09-21-taxonomia-pedigree.md`). No mesmo dia a sinergia virou AFINIDADE (núcleo/país/ano em níveis) e a faixa do jogador ficou 85–99: quem começa
// briga no degrau de entrada, e a ascensão até o campeão é a própria coleção (carta + química).
//
// Mexeu num número de `src/lib/game/balance.ts`? Rode este arquivo: ele diz, em porcentagem de séries ganhas, o que
// aquilo fez. Se uma mudança futura fizer carta cara ganhar sozinha, ou fizer montar bem deixar de valer, falha aqui.
import { describe, expect, it } from 'vitest';
import { LAB, LAB_BOTS, labBot, labLineup, partyFinalRate, winRate } from './helpers/balanceLab';
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
    // No teto (99) capricho e preguiça leem o mesmo número — o que separa lá em cima é o elenco nos rounds.
    expect(nivel('goatsBuilt')).toBeGreaterThanOrEqual(nivel('goatsLazy'));
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
  // Alvos medidos em 2026-09-21 na régua da SINERGIA DE AFINIDADE (400 séries cada): no topo todos os times
  // caprichados encostam no teto 99, então o que separa é o ELENCO nos rounds — e a química, um degrau abaixo.
  band('montar bem no topo: caprichado × preguiçoso (os dois no teto)', () => labLineup(LAB.goatsBuilt), () => labLineup(LAB.goatsLazy), 53);
  band('montar bem com carta de superstrella: caprichado × jogado fora', () => labLineup(LAB.superstarsBuilt), () => labLineup(LAB.superstarsThrown), 82);
  // Carta manda entre fileiras: superstrellas caprichadas NÃO encostam num time de GOATs (a química é o caminho delas).
  band('carta ajuda: GOATs × Superstars, os dois caprichados', () => labLineup(LAB.goatsBuilt), () => labLineup(LAB.superstarsBuilt), 82);
  band('núcleo real de campeão × quatro 99 sem IGL nem suporte', () => labLineup(LAB.furiaCore), () => labLineup(LAB.goatsNoIgl), 77);
  band('jogar sem capitão e sem química custa caro — e não sentencia', () => labLineup(LAB.goatsLazyNoIgl), () => labLineup(LAB.goatsLazy), 28);
  band('time histórico bem montado × quatro 99 sem IGL nem suporte', () => labLineup(LAB.ownerSk), () => labLineup(LAB.goatsNoIgl), 93);
  band('no teto, núcleo histórico e melhor line montável ficam pau a pau', () => labLineup(LAB.ownerSk), () => labLineup(LAB.goatsBuilt), 51);

  it('nenhum confronto entre times do MESMO patamar vira atropelo', { timeout: TIMEOUT }, () => {
    // No topo todos jogam no teto 99: os confrontos são pau a pau por natureza.
    const topo = ['goatsBuilt', 'goatsLazy', 'ownerSk'] as const;
    // No meio, times do mesmo patamar (o bicho de 4×99 sem IGL agora mora aqui, 93) também. O time do dono
    // (89,9, um GOAT e peças médias) ficou 3 níveis abaixo dele — patamar outro, azarão de 1 em 5.
    const meio = ['goatsNoIgl', 'superstarsThrown'] as const;
    const grupos = [topo, meio];
    for (const grupo of grupos) for (let i = 0; i < grupo.length; i += 1) for (let j = i + 1; j < grupo.length; j += 1) {
      const rate = winRate(labLineup(LAB[grupo[i]]), labLineup(LAB[grupo[j]]), 'court', 200);
      expect(rate, `${grupo[i]} × ${grupo[j]}: ${rate}%`).toBeGreaterThanOrEqual(25);
      expect(rate, `${grupo[i]} × ${grupo[j]}: ${rate}%`).toBeLessThanOrEqual(75);
    }
  });
});

describe('planos de situação (2026): tempo, reativo e resiliente', () => {
  // Medido em 2026-09-21 (400 séries) contra o GÊMEO EQUILIBRADO — as mesmas cartas e papéis, só o plano muda —
  // para isolar a identidade. Nenhum plano de situação pode passar de ~60 contra o neutro: identidade dá o empurrão,
  // carta e química continuam mandando (o pedido do dono: a lineup importa mais que o nome do estilo).
  band('tempo × equilibrado, as mesmas cartas (pistol e momentum valem um empurrão)', () => labLineup(LAB.tempoBuilt), () => labLineup({ ...LAB.tempoBuilt, name: 'tempo-gemeo-equilibrado', style: 'balanced' }), 54);
  band('reativo × equilibrado, as mesmas cartas (pune o round quebrado)', () => labLineup(LAB.reativoBuilt), () => labLineup({ ...LAB.reativoBuilt, name: 'reativo-gemeo-equilibrado', style: 'balanced' }), 59);
  band('resiliente × equilibrado, as mesmas cartas (cabeça fria)', () => labLineup(LAB.resilienteBuilt), () => labLineup({ ...LAB.resilienteBuilt, name: 'resiliente-gemeo-equilibrado', style: 'balanced' }), 59);

  it('identidades se cruzam pela situação, nunca em atropelo', { timeout: TIMEOUT }, () => {
    const cruzamentos: Array<[string, keyof typeof LAB, keyof typeof LAB]> = [
      ['reativo × tempo', 'reativoBuilt', 'tempoBuilt'],
      ['tempo × resiliente', 'tempoBuilt', 'resilienteBuilt'],
      ['resiliente × reativo', 'resilienteBuilt', 'reativoBuilt']
    ];
    for (const [name, a, b] of cruzamentos) {
      const rate = winRate(labLineup(LAB[a]), labLineup(LAB[b]), 'court', 300);
      expect(rate, `${name}: ${rate}%`).toBeGreaterThanOrEqual(25);
      expect(rate, `${name}: ${rate}%`).toBeLessThanOrEqual(75);
    }
  });
});

describe('a festa: 2+ humanos, menos underdog nas séries com jogador', () => {
  // Medido em 2026-09-21 (200 torneios, campo de pedigree completo com o alívio de festa de sempre):
  //   melhor line montável (99): campeão 68→73%, final 83→85% com a variância achatada;
  //   time do dono (~90): semi+ 26→30%. A variância a 0,5 ajuda o FAVORITO a converter — o que é o pedido:
  //   skill aparece mais. O alívio de festa segue na METADE do solo (decisão do dono de 2026-09-21, intocada).
  it('o favorito de nível máximo chega à final da festa na maioria esmagadora das runs', { timeout: 600_000 }, () => {
    const rate = partyFinalRate(LAB.goatsBuilt, 120);
    expect(rate, `melhor line em festa 2+ humanos: final+ em ${rate}%`).toBeGreaterThanOrEqual(72);
  });
});

describe('progressão: cada fase do chaveamento é um degrau', () => {
  band('o degrau de entrada é formalidade para um time montado', () => labLineup(LAB.goatsBuilt), () => labBot(LAB_BOTS.semHistoria), 99, 4);
  band('...e também para quem montou mal: o susto agora vem dos degraus de cima', () => labLineup(LAB.goatsNoIgl), () => labBot(LAB_BOTS.semHistoria), 99, 5);
  band('o campeão é a parede final, mesmo para a melhor line', () => labLineup(LAB.goatsBuilt), () => labBot(LAB_BOTS.campeao), 66);
  band('quem monta mal é azarão pesado do campeão — cartas não salvam bagunça', () => labLineup(LAB.goatsNoIgl), () => labBot(LAB_BOTS.campeao), 16);

  it('quem está começando tem onde jogar: briga no degrau de entrada e não existe contra o campeão', { timeout: TIMEOUT }, () => {
    const beginner = labLineup(LAB.beginner);
    const entrada = winRate(beginner, labBot(LAB_BOTS.semHistoria), 'court', SERIES);
    const campeao = winRate(beginner, labBot(LAB_BOTS.campeao), 'court', SERIES);
    expect(entrada, `iniciante × degrau de entrada: ${entrada}%`).toBeGreaterThan(40);
    // O piso em 85 (combinado 2026-09-21, sinergia de afinidade): quem começa briga de igual no degrau de
    // entrada — a ascensão é a própria coleção — e o campeão de Major é parede inexistente para cartas comuns.
    expect(campeao, `iniciante × campeão: ${campeao}%`).toBeLessThanOrEqual(6);
    expect(campeao, `iniciante × campeão: ${campeao}%`).toBeLessThan(entrada);
  });
});
