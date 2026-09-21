// tests/botField.test.ts
// Campo de bots do online: escada por pedigree fino (combinada com o dono em 2026-09-21, ver
// docs/reports/2026-09-21-taxonomia-pedigree.md), campeões garantidos e as zebras da run.
import { COURT_TOP, courtPower } from '../src/lib/game/courtPower';
import { PEDIGREE_LEVEL_BAND, PLAYER_GAP_FROM_TOP, ZEBRA_LEVEL_CAP, ZEBRA_LIFT_COURT } from '../src/lib/game/balance';
import { describe, expect, it } from 'vitest';
import { teams, players } from '../server/data';
import { GUARANTEED_CHAMPIONS, PEDIGREE_ORDER, ZEBRAS_MAX, ZEBRAS_MIN, botFieldPower, botPlacementOf, isUnderdogAverage, isZebraCandidate, pedigreeOf, planBotField, rosterAverageOverall } from '../src/lib/game/online/bot-field';
import { createSeededRng } from '../src/lib/game/simulation';
import type { BotPedigree } from '../src/lib/game/balance';
import type { HistoricalTeam } from '../src/lib/game/types';

const playerById = new Map(players.map((player) => [player.id, player]));
const shuffle = (seed: string) => [...teams].sort((left, right) => createSeededRng(`${seed}:bot:${left.id}`)() - createSeededRng(`${seed}:bot:${right.id}`)() || left.id.localeCompare(right.id));
const team = (summary: HistoricalTeam['majorSummary'], extra: Partial<HistoricalTeam> = {}): HistoricalTeam => ({ id: 't', majorSummary: summary, ...extra });

describe('o pedigree fino', () => {
  const byId = (id: string) => teams.find((teamItem) => teamItem.id === id) as HistoricalTeam;

  it('cada categoria tem um nome, e as conhecidas do dataset caem na combinada com o dono', () => {
    expect(pedigreeOf(byId('astralis-2019'), playerById)).toBe('dinastia');
    expect(pedigreeOf(byId('vitality-2025'), playerById)).toBe('dinastia');
    expect(pedigreeOf(byId('astralis-2018'), playerById)).toBe('campeaoForte');
    expect(pedigreeOf(byId('falcons-2026'), playerById)).toBe('campeaoForte');
    expect(pedigreeOf(byId('cloud9-2018'), playerById)).toBe('campeaoUnderdog');
    expect(pedigreeOf(byId('gambit-2017'), playerById)).toBe('campeaoUnderdog');
    // O rank 2 do dataset conflita com a zebra histórica do Rio: o dono classificou à mão.
    expect(pedigreeOf(byId('outsiders-2022'), playerById)).toBe('campeaoUnderdog');
    expect(pedigreeOf(byId('faze-2024'), playerById)).toBe('viceMerecedor');
    expect(pedigreeOf(byId('heroic-2022'), playerById)).toBe('viceMerecedor');
    expect(pedigreeOf(byId('avangar-2019'), playerById)).toBe('viceUnderdog');
    expect(pedigreeOf(byId('g2-2024'), playerById)).toBe('semifinalista');
    expect(pedigreeOf(byId('liquid-2023'), playerById)).toBe('top8');
    // 2020 não teve Major: a elite do ano fica no potencial, e a Astralis pós-títulos só volta aí.
    expect(pedigreeOf(byId('astralis-2020'), playerById)).toBe('nonePotencial');
    expect(pedigreeOf(byId('faze-2017'), playerById)).toBe('nonePotencial');
    expect(pedigreeOf(byId('astralis-2021'), playerById)).toBe('noneFiller');
    expect(pedigreeOf(byId('astralis-2025'), playerById)).toBe('noneFiller');
  });

  it('a taxonomia cobre o dataset inteiro sem sobrar categoria', () => {
    const counts = new Map<string, number>();
    for (const item of teams) {
      const pedigree = pedigreeOf(item, playerById);
      expect(PEDIGREE_ORDER).toContain(pedigree);
      counts.set(pedigree, (counts.get(pedigree) ?? 0) + 1);
    }
    expect([...counts.values()].reduce((sum, value) => sum + value, 0)).toBe(teams.length);
    // A forma combinada: 2 dinastias, 13 campeões, 17 vices — e o potencial não engole o filler.
    expect(counts.get('dinastia')).toBe(2);
    expect(counts.get('campeaoForte')).toBe(10);
    expect(counts.get('campeaoUnderdog')).toBe(3);
    expect(counts.get('viceMerecedor')).toBe(10);
    expect(counts.get('viceUnderdog')).toBe(7);
    expect(counts.get('nonePotencial')!).toBeLessThan(counts.get('noneFiller')!);
  });

  it('cada degrau do chaveamento é mais duro que o anterior, do filler à dinastia', () => {
    for (let index = 1; index < PEDIGREE_ORDER.length; index += 1) {
      const acima = PEDIGREE_LEVEL_BAND[PEDIGREE_ORDER[index] as BotPedigree];
      const abaixo = PEDIGREE_LEVEL_BAND[PEDIGREE_ORDER[index - 1] as BotPedigree];
      expect(acima[0], `${PEDIGREE_ORDER[index]} abre acima de ${PEDIGREE_ORDER[index - 1]}`).toBeGreaterThanOrEqual(abaixo[0]);
      expect(acima[1], `${PEDIGREE_ORDER[index]} fecha acima de ${PEDIGREE_ORDER[index - 1]}`).toBeGreaterThan(abaixo[1]);
    }
    // Nenhuma faixa alcança o topo da escala: bot nunca é favorito contra uma line perfeita.
    expect(PEDIGREE_LEVEL_BAND.dinastia[1]).toBeLessThan(COURT_TOP);
  });

  it('dentro da faixa, quem manda é o elenco: dois times do mesmo pedigree não jogam igual', () => {
    const fraco = courtPower(botFieldPower(75, team(null), false, 0, playerById));
    const forte = courtPower(botFieldPower(100, team(null), false, 0, playerById));
    expect(forte).toBeGreaterThan(fraco);
    for (const nivel of [fraco, forte]) {
      expect(nivel).toBeGreaterThanOrEqual(PEDIGREE_LEVEL_BAND.noneFiller[0] - 1e-9);
      expect(nivel).toBeLessThanOrEqual(PEDIGREE_LEVEL_BAND.noneFiller[1] + 1e-9);
    }
  });

  it('um campeão underdog com elenco fraco ainda é parede, e nenhum bot passa da própria faixa', () => {
    const campeaoFraco = courtPower(botFieldPower(70, team({ titles: 1 }), false, 0, playerById));
    expect(campeaoFraco).toBeGreaterThanOrEqual(PEDIGREE_LEVEL_BAND.campeaoUnderdog[0] - 1e-9);
    const semHistoriaForte = courtPower(botFieldPower(106, team(null), false, 0, playerById));
    expect(semHistoriaForte).toBeLessThanOrEqual(PEDIGREE_LEVEL_BAND.noneFiller[1] + 1e-9);
  });

  it('o time sem história é o degrau de entrada: vencível, mas não de graça', () => {
    const entrada = courtPower(botFieldPower(82, team(null), false, 0, playerById));
    const campeao = courtPower(botFieldPower(82, team({ titles: 1 }), false, 0, playerById));
    expect(campeao - entrada).toBeGreaterThan(8);
    // E o degrau de entrada fica abaixo do piso do jogador: quem acabou de criar a conta entra como favorito nele.
    expect(entrada).toBeLessThan(COURT_TOP - PLAYER_GAP_FROM_TOP);
  });

  it('vale a melhor colocação do time em Major (base da zebra)', () => {
    expect(botPlacementOf(team({ titles: 1, finals: 2, semifinals: 3, top8: 4 }))).toBe('champion');
    expect(botPlacementOf(team({ titles: 0, finals: 1, top8: 3 }))).toBe('finalist');
    expect(botPlacementOf(team({ semifinals: 1 }))).toBe('semifinal');
    expect(botPlacementOf(team({ top8: 2 }))).toBe('top8');
    expect(botPlacementOf(team({ stage3Runs: 4 }))).toBe('none');
    expect(botPlacementOf(team(null))).toBe('none');
  });
});

describe('zebra', () => {
  it('underdog é elenco de overall médio entre 80 e 89', () => {
    expect([79.9, 80, 85, 89.9, 90].map(isUnderdogAverage)).toEqual([false, true, true, true, false]);
    expect(rosterAverageOverall({ players: [] }, playerById)).toBe(0);
  });

  it('só vira zebra quem é underdog e nunca chegou a uma semifinal de Major', () => {
    const candidates = teams.filter((item) => isZebraCandidate(item, playerById));
    expect(candidates.length).toBeGreaterThan(40);
    for (const item of candidates) {
      expect(isUnderdogAverage(rosterAverageOverall(item, playerById))).toBe(true);
      expect(['none', 'top8']).toContain(botPlacementOf(item));
    }
  });

  it('o gás da zebra soma em níveis e nunca enfraquece o time', () => {
    const underdog = team(null);
    // Em cima da faixa do pedigree dela, some — nunca subtrai (a conta em % de poder cru já derrubou bot fraco).
    for (const power of [75, 90, 106]) {
      const normal = courtPower(botFieldPower(power, underdog, false, 0, playerById));
      const zebra = courtPower(botFieldPower(power, underdog, true, 0, playerById));
      expect(zebra).toBeGreaterThan(normal);
      expect(zebra - normal).toBeCloseTo(Math.min(ZEBRA_LIFT_COURT, ZEBRA_LEVEL_CAP - normal), 9);
    }
    // E o teto vale: nem a zebra mais embalada passa dele.
    expect(courtPower(botFieldPower(106, team({ titles: 1 }), true, 0, playerById))).toBeLessThanOrEqual(ZEBRA_LEVEL_CAP + 1e-9);
  });
});

describe('campo da run', () => {
  it('campo cheio tem sempre os campeões garantidos e de uma a três zebras', () => {
    const counts = new Set<number>();
    for (let index = 0; index < 300; index += 1) {
      const seed = `run-${index}`;
      const plan = planBotField({ shuffled: shuffle(seed), playerById, seed, slots: 15 });
      const opening = plan.order.slice(0, 15);
      expect(opening.filter((item) => botPlacementOf(item) === 'champion').length).toBeGreaterThanOrEqual(GUARANTEED_CHAMPIONS);
      expect(plan.zebraIds.size).toBeGreaterThanOrEqual(ZEBRAS_MIN);
      expect(plan.zebraIds.size).toBeLessThanOrEqual(ZEBRAS_MAX);
      for (const id of plan.zebraIds) expect(opening.some((item) => item.id === id)).toBe(true);
      counts.add(plan.zebraIds.size);
    }
    // A seed varia a quantidade: não é sempre o mesmo número de zebras.
    expect([...counts].sort()).toEqual([ZEBRAS_MIN, ZEBRAS_MAX]);
  });

  it('é determinístico, não perde nem repete time, e o resto segue a ordem sorteada', () => {
    const shuffled = shuffle('fixa');
    const first = planBotField({ shuffled, playerById, seed: 'fixa', slots: 15 });
    const again = planBotField({ shuffled, playerById, seed: 'fixa', slots: 15 });
    expect(first.order.map((item) => item.id)).toEqual(again.order.map((item) => item.id));
    expect([...first.zebraIds]).toEqual([...again.zebraIds]);
    expect(first.order).toHaveLength(teams.length);
    expect(new Set(first.order.map((item) => item.id)).size).toBe(teams.length);
    const position = new Map(shuffled.map((item, index) => [item.id, index]));
    const tail = first.order.slice(15).map((item) => position.get(item.id)!);
    expect(tail).toEqual([...tail].sort((a, b) => a - b));
  });

  it('campo pequeno divide as vagas: no máximo um quarto para cada garantia', () => {
    for (const slots of [0, 1, 2, 3, 4, 7]) {
      const plan = planBotField({ shuffled: shuffle(`p${slots}`), playerById, seed: `p${slots}`, slots });
      expect(plan.zebraIds.size).toBeLessThanOrEqual(Math.floor(slots / 4));
      expect(plan.order).toHaveLength(teams.length);
    }
    expect(planBotField({ shuffled: shuffle('q'), playerById, seed: 'q', slots: 3 }).zebraIds.size).toBe(0);
    expect(planBotField({ shuffled: shuffle('q'), playerById, seed: 'q', slots: 4 }).zebraIds.size).toBe(1);
  });
});
