import { describe, expect, it } from 'vitest';
import { applyTraining, suggestTraining, trainingGrowth } from '../src/lib/game/dynasty/training';
import { resolveDynastyPlayer } from '../src/lib/game/dynasty/resolve';
import type { Player } from '../src/lib/game/types';

const player = (patch: Partial<Player> = {}): Player => ({ id: 'p', baseId: 'p', nickname: 'P', role: 'rifler', overall: 80, firepower: 80, clutch: 80, entry: 80, awp: 50, support: 80, igl: 40, experience: 80, consistency: 80, mental: 80, ...patch } as Player);

describe('treino da Dinastia', () => {
  it.each([
    ['aim', { firepower: 82, consistency: 81 }],
    ['utility', { support: 82, igl: 42 }],
    ['clutch', { clutch: 83, mental: 81 }],
    ['opening', { entry: 83, firepower: 81 }],
    ['recovery', { mental: 82, consistency: 82 }]
  ] as const)('aplica %s temporariamente com teto 99', (focus, expected) => {
    const trained = applyTraining(player(), focus);
    expect(trained).toMatchObject(expected);
    expect(applyTraining(player({ firepower: 99, consistency: 99 }), 'aim')).toMatchObject({ firepower: 99, consistency: 99 });
  });

  it('sugere o foco associado à média mais fraca', () => {
    expect(suggestTraining([player({ support: 30 })])).toBe('utility');
    expect(suggestTraining([player({ entry: 20 })])).toBe('opening');
  });

  it('expõe apenas o ganho permanente previsto', () => {
    expect(trainingGrowth('aim', 'firepower')).toBe(1);
    expect(trainingGrowth('aim', 'consistency')).toBe(0);
    expect(trainingGrowth('utility', 'support')).toBe(1);
    expect(trainingGrowth('recovery', 'mental')).toBe(0);
  });

  it('resolve treino permanente depois da deriva, sem alterar o dataset', () => {
    const base = player({ firepower: 90 });
    expect(resolveDynastyPlayer(base, { drift: { firepower: 2 }, training: { firepower: 3 }, driftTotal: 2, versionsSince: [] }).firepower).toBe(95);
    expect(base.firepower).toBe(90);
  });
});
