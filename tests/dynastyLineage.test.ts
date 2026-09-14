import { describe, expect, it } from 'vitest';
import { buildDynastyLineage } from '../src/lib/game/runCard';
import type { DynastyMajorSummary, Player } from '../src/lib/game/types';

const summary = (majorNumber: number, placement: string, ids: string[]) =>
  ({ majorNumber, seed: 's', entryStage: 'stage1', placement, prize: 0, awardsBonus: 0, lineup: ids.map((playerId) => ({ playerId, selectedSlotRole: 'rifler' })), coachId: null, movesMade: 0, stats: [] }) as DynastyMajorSummary;

describe('linhagem da dinastia', () => {
  it('lista cada Major com colocação, título e nicks do elenco', () => {
    const playerById = new Map<string, Player>([['a-2020', { id: 'a-2020', nickname: 'alpha' } as Player]]);
    expect(buildDynastyLineage([summary(1, 'placementStage2', ['a-2020', 'sumido']), summary(2, 'placementChampion', ['a-2020'])], playerById)).toEqual([
      { majorNumber: 1, placement: 'placementStage2', champion: false, lineup: ['alpha', 'sumido'] },
      { majorNumber: 2, placement: 'placementChampion', champion: true, lineup: ['alpha'] }
    ]);
    expect(buildDynastyLineage([], playerById)).toEqual([]);
  });
});
