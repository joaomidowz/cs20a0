// tests/dynastyEvolution.test.ts
import { describe, expect, it } from 'vitest';
import { driftDelta, evolveLineup, nextVersionOf } from '../src/lib/game/dynasty/evolution';
import type { Coach, Player, PlayerRunStats, SelectedPlayer } from '../src/lib/game/types';

const make = (id: string, baseId: string, year: number, overall: number, experience = 80): Player =>
  ({ id, baseId, nickname: baseId, year, overall, experience, firepower: 80, clutch: 80, entry: 80, awp: 60, support: 60, consistency: 80, mental: 80, igl: 30, role: 'rifler' }) as Player;
const stat = (playerId: string, runRating: number) => ({ playerId, runRating }) as PlayerRunStats;

describe('delta de deriva', () => {
  it('segue rating, coach e veterano', () => {
    const cases: Array<[number, number | null, number, number]> = [
      [1.3, 70, 80, 4], [0.7, 70, 80, -4], [1.5, 70, 80, 4], [1.3, 90, 80, 4], [1.1, 90, 80, 2],
      [1.0, 55, 80, -1], [1.3, 70, 95, 1], [0.5, 70, 95, -5], [1.04, 70, 80, 0], [0.96, null, 80, 0]
    ];
    for (const [rating, development, experience, expected] of cases) expect(driftDelta(rating, development, experience)).toBe(expected);
  });
});

describe('versão do ano seguinte', () => {
  it('escolhe a versão de maior overall do ano seguinte', () => {
    const catalog = [make('v-2020', 'v', 2020, 80), make('v-a-2021', 'v', 2021, 84), make('v-b-2021', 'v', 2021, 86), make('v-2022', 'v', 2022, 90)];
    expect(nextVersionOf(catalog[0], catalog)?.id).toBe('v-b-2021');
    expect(nextVersionOf(catalog[3], catalog)).toBeNull();
  });
});

describe('evolução do elenco', () => {
  const version = make('v-2020', 'v', 2020, 80);
  const next = make('v-2021', 'v', 2021, 86);
  const star = make('s-2020', 's', 2020, 90);
  const capped = make('c-2020', 'c', 2020, 70);
  const quiet = make('q-2020', 'q', 2020, 75);
  const catalog = [version, next, star, capped, quiet];
  const playerById = new Map(catalog.map((player) => [player.id, player]));
  const lineup: SelectedPlayer[] = [
    { playerId: 'v-2020', selectedSlotRole: 'rifler' },
    { playerId: 's-2020', selectedSlotRole: 'awper' },
    { playerId: 'c-2020', selectedSlotRole: 'entry' },
    { playerId: 'q-2020', selectedSlotRole: 'support' }
  ];
  const coach = { development: 90 } as Coach;
  const result = evolveLineup({
    lineup,
    overrides: {
      'v-2020': { drift: { overall: 2 }, driftTotal: 2, versionsSince: ['v-2019'] },
      'c-2020': { drift: { overall: 10, firepower: 10 }, driftTotal: 10, versionsSince: [] }
    },
    stats: [stat('v-2020', 1.5), stat('s-2020', 1.1), stat('c-2020', 1.3)],
    coach,
    catalog,
    playerById
  });

  it('troca pela versão seguinte e zera a deriva', () => {
    expect(result.lineup[0]).toEqual({ playerId: 'v-2021', selectedSlotRole: 'rifler' });
    expect(result.overrides['v-2021']).toEqual({ drift: {}, driftTotal: 0, versionsSince: ['v-2019', 'v-2020'] });
    expect(result.overrides['v-2020']).toBeUndefined();
    expect(result.evolution[0]).toEqual({ fromPlayerId: 'v-2020', toPlayerId: 'v-2021', kind: 'version', overallBefore: 82, overallAfter: 86 });
  });

  it('deriva com bônus de coach e soma experiência', () => {
    expect(result.overrides['s-2020']).toEqual({
      drift: { firepower: 2, clutch: 2, entry: 2, awp: 2, support: 2, consistency: 2, mental: 2, overall: 2, experience: 1 },
      driftTotal: 2,
      versionsSince: []
    });
    expect(result.evolution[1]).toEqual({ fromPlayerId: 's-2020', toPlayerId: 's-2020', kind: 'drift', overallBefore: 90, overallAfter: 92 });
  });

  it('respeita o limite acumulado de 12', () => {
    expect(result.overrides['c-2020'].driftTotal).toBe(12);
    expect(result.overrides['c-2020'].drift.overall).toBe(12);
    expect(result.overrides['c-2020'].drift.firepower).toBe(12);
    expect(result.evolution[2]).toMatchObject({ kind: 'drift', overallBefore: 80, overallAfter: 82 });
  });

  it('sem stats usa rating 1,00: com coach de desenvolvimento 90 ainda deriva +1', () => {
    expect(result.overrides['q-2020'].driftTotal).toBe(1);
    expect(result.overrides['q-2020'].drift.experience).toBe(1);
    expect(result.evolution[3]).toMatchObject({ kind: 'drift', overallBefore: 75, overallAfter: 76 });
  });

  it('sem coach e com rating 1,00 fica estável e ganha só experiência', () => {
    const calm = evolveLineup({ lineup: [{ playerId: 'q-2020', selectedSlotRole: 'support' }], overrides: {}, stats: [], coach: null, catalog, playerById });
    expect(calm.overrides['q-2020']).toEqual({ drift: { experience: 1 }, driftTotal: 0, versionsSince: [] });
    expect(calm.evolution[0]).toEqual({ fromPlayerId: 'q-2020', toPlayerId: 'q-2020', kind: 'stable', overallBefore: 75, overallAfter: 75 });
  });

  it('não altera o dataset', () => {
    expect(star.overall).toBe(90);
    expect(capped.firepower).toBe(80);
  });
});
