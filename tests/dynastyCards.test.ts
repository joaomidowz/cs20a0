import { describe, expect, it } from 'vitest';
import { coachMajorHistory, playerMajorHistory } from '../src/lib/game/dynasty/cards';
import type { DynastyMajorSummary, Player, PlayerRunStats } from '../src/lib/game/types';

const makePlayer = (id: string, baseId: string, year: number): Player => ({ id, baseId, nickname: baseId, year, role: 'rifler', overall: 80 } as Player);
const ace2020 = makePlayer('cartaace-2020', 'cartaace', 2020);
const ace2021 = makePlayer('cartaace-2021', 'cartaace', 2021);
const bob = makePlayer('cartabob-2020', 'cartabob', 2020);
const playerById = new Map([ace2020, ace2021, bob].map((player) => [player.id, player]));

const summary = (majorNumber: number, acePlayerId: string, extra: Partial<DynastyMajorSummary> = {}): DynastyMajorSummary => ({
  majorNumber, seed: `s${majorNumber}`, entryStage: 'stage1', placement: majorNumber === 1 ? 'placementStage2' : 'placementChampion',
  prize: 0, awardsBonus: 0, movesMade: 0, coachId: majorNumber === 1 ? 'coach-a' : 'coach-b',
  lineup: [{ playerId: acePlayerId, selectedSlotRole: 'rifler' }, { playerId: bob.id, selectedSlotRole: 'igl' }],
  stats: [{ playerId: acePlayerId, runRating: 1.12, mapsPlayed: 9 } as PlayerRunStats, { playerId: bob.id, runRating: 0.9, mapsPlayed: 7 } as PlayerRunStats],
  ...extra
});

describe('histórico das cartas da Dinastia', () => {
  const history = [
    summary(1, ace2020.id, { rules: 2, overalls: { [ace2020.id]: 81 }, training: 'aim', evolution: [{ fromPlayerId: ace2020.id, toPlayerId: ace2021.id, kind: 'version', overallBefore: 81, overallAfter: 86 }] }),
    summary(2, ace2021.id)
  ];

  it('segue a linhagem do jogador entre versões de ano', () => {
    const entries = playerMajorHistory(history, ace2021, playerById);
    expect(entries.map((entry) => [entry.majorNumber, entry.playerId, entry.placement])).toEqual([
      [1, ace2020.id, 'placementStage2'],
      [2, ace2021.id, 'placementChampion']
    ]);
    expect(entries[0]).toMatchObject({ role: 'rifler', rating: 1.12, mapsPlayed: 9, overall: 81, training: 'aim' });
    expect(entries[0].evolution).toMatchObject({ kind: 'version', overallAfter: 86 });
  });

  it('summary antigo sem overall, treino ou evolução devolve null nesses campos', () => {
    const [, legacy] = playerMajorHistory(history, ace2020, playerById);
    expect(legacy).toMatchObject({ overall: null, training: null, evolution: null, rating: 1.12 });
    expect(playerMajorHistory(history, makePlayer('outro-2020', 'outro', 2020), playerById)).toEqual([]);
  });

  it('histórico do coach traz os Majors dele com o rating médio do elenco', () => {
    expect(coachMajorHistory(history, 'coach-a')).toEqual([{ majorNumber: 1, placement: 'placementStage2', averageRating: 1.01 }]);
    expect(coachMajorHistory(history, 'coach-x')).toEqual([]);
  });
});
