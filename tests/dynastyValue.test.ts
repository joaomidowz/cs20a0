// tests/dynastyValue.test.ts
import { describe, expect, it } from 'vitest';
import { players } from '../src/lib/game/data';
import { resolveDynastyPlayer } from '../src/lib/game/dynasty/resolve';
import { coachMarketValue, playerMarketValue, roundToStep } from '../src/lib/game/dynasty/value';
import type { Player } from '../src/lib/game/types';

const player = (overall: number, rarity: string, role: string, badges: string[] = []) =>
  ({ id: 'x-2020', overall, rarity, role, badges }) as Player;

describe('valor de mercado', () => {
  it('arredonda a 5.000', () => {
    expect(roundToStep(112_499)).toBe(110_000);
    expect(roundToStep(112_500)).toBe(115_000);
  });

  it('segue a fórmula da spec com raridade, função e títulos', () => {
    expect(playerMarketValue(player(70, 'common', 'rifler'))).toBe(120_000);
    expect(playerMarketValue(player(90, 'goat', 'awper', ['major-champion']))).toBe(1_195_000);
    expect(playerMarketValue(player(80, 'rare', 'igl'))).toBe(325_000);
    expect(playerMarketValue(player(85, 'elite', 'awper-igl'))).toBe(555_000);
    expect(playerMarketValue(player(55, 'common', 'entry'))).toBe(50_000);
    expect(playerMarketValue(player(99, 'goat', 'awper', ['major-champion', 'major-champion']))).toBe(2_500_000);
  });

  it('cresce com o overall', () => {
    const values = Array.from({ length: 40 }, (_, index) => playerMarketValue(player(60 + index, 'common', 'rifler')));
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
  });

  it('todo jogador do dataset tem valor inteiro, múltiplo de 5.000 e dentro de piso e teto', () => {
    const problems = players.map((item) => [item.id, playerMarketValue(item)] as const)
      .filter(([, value]) => !Number.isInteger(value) || value % 5_000 !== 0 || value < 30_000 || value > 2_500_000);
    expect(problems).toEqual([]);
  });

  it('valor do coach com piso de 20.000', () => {
    expect(coachMarketValue({ overall: 60 })).toBe(20_000);
    expect(coachMarketValue({ overall: 85 })).toBe(135_000);
    expect(coachMarketValue({ overall: 99 })).toBe(400_000);
    expect(coachMarketValue({ overall: 50 })).toBe(20_000);
  });
});

describe('jogador resolvido', () => {
  const base = { id: 'r-2020', overall: 50, firepower: 98, clutch: 80, experience: 93, igl: 40 } as Player;

  it('sem override devolve o mesmo objeto', () => {
    expect(resolveDynastyPlayer(base, undefined)).toBe(base);
    expect(resolveDynastyPlayer(base, null)).toBe(base);
  });

  it('aplica a deriva com limites 1..99 e não altera o original', () => {
    const resolved = resolveDynastyPlayer(base, { drift: { firepower: 4, overall: -60, experience: 1 }, driftTotal: 0, versionsSince: [] });
    expect(resolved.firepower).toBe(99);
    expect(resolved.overall).toBe(1);
    expect(resolved.experience).toBe(94);
    expect(resolved.igl).toBe(40);
    expect(resolved.clutch).toBe(80);
    expect(base.firepower).toBe(98);
  });
});
