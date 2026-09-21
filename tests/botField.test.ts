// tests/botField.test.ts
// Campo de bots do online: buff por colocação em Major, campeões garantidos e as zebras da run.
import { COURT_SPREAD, COURT_TOP, courtPower } from '../src/lib/game/courtPower';
import { describe, expect, it } from 'vitest';
import { teams, players } from '../server/data';
import { BOT_GAP_FROM_TOP, BOT_MIN_GAP_FROM_TOP, GUARANTEED_CHAMPIONS, ZEBRAS_MAX, ZEBRAS_MIN, ZEBRA_BOOST, ZEBRA_POWER_CAP, botFieldPower, botPlacementOf, isUnderdogAverage, isZebraCandidate, planBotField, rosterAverageOverall } from '../src/lib/game/online/bot-field';
import { createSeededRng } from '../src/lib/game/simulation';
import type { HistoricalTeam } from '../src/lib/game/types';

const playerById = new Map(players.map((player) => [player.id, player]));
const shuffle = (seed: string) => [...teams].sort((left, right) => createSeededRng(`${seed}:bot:${left.id}`)() - createSeededRng(`${seed}:bot:${right.id}`)() || left.id.localeCompare(right.id));
const team = (summary: HistoricalTeam['majorSummary']): HistoricalTeam => ({ id: 't', majorSummary: summary });

describe('escada de progressão dos bots', () => {
  it('vale a melhor colocação do time em Major', () => {
    expect(botPlacementOf(team({ titles: 1, finals: 2, semifinals: 3, top8: 4 }))).toBe('champion');
    expect(botPlacementOf(team({ titles: 0, finals: 1, top8: 3 }))).toBe('finalist');
    expect(botPlacementOf(team({ semifinals: 1 }))).toBe('semifinal');
    expect(botPlacementOf(team({ top8: 2 }))).toBe('top8');
    expect(botPlacementOf(team({ stage3Runs: 4 }))).toBe('none');
    expect(botPlacementOf(team(null))).toBe('none');
  });

  it('cada degrau do chaveamento é mais duro que o anterior', () => {
    const { champion, finalist, semifinal, top8, none } = BOT_GAP_FROM_TOP;
    // Distância até o topo: quanto menor, mais forte o bot.
    expect(champion).toBeLessThan(finalist);
    expect(finalist).toBeLessThan(semifinal);
    expect(semifinal).toBeLessThan(top8);
    expect(top8).toBeLessThan(none);
    expect(champion).toBeGreaterThanOrEqual(BOT_MIN_GAP_FROM_TOP);
  });

  it('sobe o bot fraco até o degrau dele, e deixa quem já é forte como está', () => {
    for (const [summary, placement] of [[{ titles: 1 }, 'champion'], [{ finals: 1 }, 'finalist'], [null, 'none']] as const) {
      const alvo = COURT_TOP - BOT_GAP_FROM_TOP[placement];
      // Time fraco para o degrau: sobe até ele, venha de onde vier o poder próprio.
      for (const power of [80, 90]) expect(courtPower(botFieldPower(power, team(summary), false))).toBeCloseTo(alvo, 9);
    }
    // Poder próprio já acima do degrau: fica com o próprio. A escada só levanta, nunca enfraquece.
    expect(botFieldPower(106, team(null), false)).toBeCloseTo(106, 9);
  });

  it('a escada nunca passa do nível de uma line perfeita', () => {
    for (const summary of [{ titles: 1 }, { finals: 1 }, { semifinals: 1 }]) {
      expect(courtPower(botFieldPower(70, team(summary), false))).toBeLessThanOrEqual(COURT_TOP - BOT_MIN_GAP_FROM_TOP + 1e-9);
    }
    expect(botFieldPower(90, team(null), false)).toBeGreaterThan(90);
  });

  it('o time sem história é o degrau de entrada: vencível, mas não de graça', () => {
    const entrada = courtPower(botFieldPower(82, team(null), false));
    const campeao = courtPower(botFieldPower(82, team({ titles: 1 }), false));
    // As margens acompanham a régua (`COURT_SPREAD`): o campeão fica bem acima do degrau de entrada, e o degrau
    // de entrada não fica fora de alcance de quem chega.
    expect(campeao - entrada).toBeGreaterThan(1.4 * COURT_SPREAD);
    expect(COURT_TOP - entrada).toBeLessThan(4 * COURT_SPREAD);
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

  it('o gás é de 20%, travado: perigosa, não monstro, e nunca enfraquece o time', () => {
    const underdog = team(null);
    expect(botFieldPower(80, underdog, true)).toBeCloseTo(80 * (1 + ZEBRA_BOOST), 10);
    expect(botFieldPower(ZEBRA_POWER_CAP - 2, underdog, true)).toBe(ZEBRA_POWER_CAP);
    expect(botFieldPower(ZEBRA_POWER_CAP + 3, underdog, true)).toBe(ZEBRA_POWER_CAP + 3);
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
    expect([...counts].sort()).toEqual([1, 2, 3]);
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
