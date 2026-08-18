import { describe, expect, it } from 'vitest';
import { translate } from '../src/lib/game/i18n';
import { translateOnline } from '../src/lib/game/online/i18n';
import { getVisibleMapScore, isSeriesVisuallyStarted } from '../src/lib/game/seriesPresentation';
import type { MapResult, RoundScore } from '../src/lib/game/types';

const map: MapResult = {
  map: 1,
  scoreA: 13,
  scoreB: 9,
  winnerId: 'team-a',
  rounds: [],
  overtime: false
};

describe('series presentation', () => {
  it('shows the automatic series as live from its first render', () => {
    expect(isSeriesVisuallyStarted({
      controlled: false,
      controlledStarted: false,
      started: false,
      auto: true,
      finished: false
    })).toBe(true);
  });

  it('keeps a manual series pending until it starts and stops automatic live state after finishing', () => {
    expect(isSeriesVisuallyStarted({
      controlled: false,
      controlledStarted: false,
      started: false,
      auto: false,
      finished: false
    })).toBe(false);
    expect(isSeriesVisuallyStarted({
      controlled: false,
      controlledStarted: false,
      started: false,
      auto: true,
      finished: true
    })).toBe(false);
  });

  it('keeps the server-controlled live state authoritative', () => {
    expect(isSeriesVisuallyStarted({
      controlled: true,
      controlledStarted: false,
      started: true,
      auto: true,
      finished: false
    })).toBe(false);
    expect(isSeriesVisuallyStarted({
      controlled: true,
      controlledStarted: true,
      started: false,
      auto: false,
      finished: false
    })).toBe(true);
  });

  it('keeps a map pending before the series starts', () => {
    expect(getVisibleMapScore(map, null, { isComplete: false, isLive: false })).toBeNull();
  });

  it('starts a live map at zero to zero', () => {
    expect(getVisibleMapScore(map, null, { isComplete: false, isLive: true })).toEqual({ a: 0, b: 0 });
  });

  it('shows the latest visible round during the map', () => {
    const round: RoundScore = { a: 7, b: 6, overtime: false };
    expect(getVisibleMapScore(map, round, { isComplete: false, isLive: true })).toEqual({ a: 7, b: 6 });
  });

  it('uses the final map score after completion', () => {
    expect(getVisibleMapScore(map, null, { isComplete: true, isLive: false })).toEqual({ a: 13, b: 9 });
  });

  it('localizes the live indicator in both game modes', () => {
    expect([translate('pt-BR', 'live'), translate('en', 'live'), translate('es', 'live')])
      .toEqual(['Ao vivo', 'Live', 'En vivo']);
    expect([translateOnline('pt-BR', 'live'), translateOnline('en', 'live'), translateOnline('es', 'live')])
      .toEqual(['Ao vivo', 'Live', 'En vivo']);
  });
});
