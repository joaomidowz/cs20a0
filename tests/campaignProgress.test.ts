import { describe, expect, it } from 'vitest';
import { advanceCursor, currentUserSeries, stageRecord } from '../src/lib/game/campaignProgress';
import type { SeriesResult } from '../src/lib/game/types';

const series = (id: string, phase: SeriesResult['phase'], winnerId: string | null = 'user') => ({
  id, phase, winnerId, userMatch: true, bestOf: 1, scoreA: winnerId === 'user' ? 1 : 0, scoreB: winnerId === 'user' ? 0 : 1,
  teamA: { id: 'user', name: 'User', power: 80, mental: 80, clutch: 80, experience: 80, isUser: true },
  teamB: { id: `bot-${id}`, name: 'Bot', power: 80, mental: 80, clutch: 80, experience: 80 }, maps: []
}) as SeriesResult;

describe('progresso visual da campanha', () => {
  const matches = [series('a', 'stage1'), series('b', 'stage1', 'bot-b'), series('c', 'stage2', null)];

  it('localiza a série atual pelo id confirmado, não pelo índice salvo', () => {
    expect(currentUserSeries(matches, ['a'])?.id).toBe('b');
    expect(currentUserSeries(matches, ['b', 'a'])?.id).toBe('c');
  });

  it('calcula o record apenas com séries confirmadas do estágio', () => {
    expect(stageRecord(matches, 'stage1', ['a', 'b'], 'user')).toEqual({ wins: 1, losses: 1 });
    expect(stageRecord(matches, 'stage2', ['a', 'b'], 'user')).toEqual({ wins: 0, losses: 0 });
  });

  it('só avança para resultado quando a campanha terminou', () => {
    expect(advanceCursor(matches, ['a', 'b'], false)).toEqual({ completedSeries: 2, phase: 'stage3' });
    expect(advanceCursor(matches.slice(0, 2), ['a', 'b'], true)).toEqual({ completedSeries: 2, phase: 'result' });
    expect(advanceCursor(matches.slice(0, 2), ['a'], false)).toEqual({ completedSeries: 1, phase: 'stage3' });
  });
});
