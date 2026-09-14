import { describe, expect, it } from 'vitest';
import { dynastySwissBestOf } from '../src/lib/game/dynasty/format';

const standing = (wins: number, losses: number) => ({ wins, losses });

describe('formato suíço da Dinastia v2', () => {
  it('usa MD1 nas rodadas comuns dos Stages 1 e 2', () => {
    expect(dynastySwissBestOf({ stage: 'stage1', roundNumber: 1, left: standing(0, 0), right: standing(0, 0) })).toBe(1);
    expect(dynastySwissBestOf({ stage: 'stage2', roundNumber: 3, left: standing(1, 1), right: standing(1, 1) })).toBe(1);
  });

  it('usa MD3 em classificação, eliminação e em todo o Stage 3', () => {
    expect(dynastySwissBestOf({ stage: 'stage1', roundNumber: 3, left: standing(2, 0), right: standing(2, 0) })).toBe(3);
    expect(dynastySwissBestOf({ stage: 'stage2', roundNumber: 5, left: standing(2, 2), right: standing(2, 2) })).toBe(3);
    expect(dynastySwissBestOf({ stage: 'stage3', roundNumber: 1, left: standing(0, 0), right: standing(0, 0) })).toBe(3);
  });
});
