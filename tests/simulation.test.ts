import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { buildMajorRun, createSeededRng, simulateMap, simulateSeries } from '../src/lib/game/simulation';
import type { CombatTeam, HistoricalTeam, Player } from '../src/lib/game/types';

const team = (id: string, power: number): CombatTeam => ({
  id,
  name: id,
  power,
  mental: power,
  clutch: power,
  experience: power
});

describe('simulation', () => {
  it('is deterministic for the same seed', () => {
    const first = simulateSeries(team('a', 88), team('b', 86), 3, createSeededRng('same'));
    const second = simulateSeries(team('a', 88), team('b', 86), 3, createSeededRng('same'));
    expect(second.maps).toEqual(first.maps);
  });

  it('produces a valid MR12 map result', () => {
    const map = simulateMap(team('a', 90), team('b', 90), createSeededRng('overtime-candidate'));
    expect(Math.max(map.scoreA, map.scoreB)).toBeGreaterThanOrEqual(13);
    expect(map.scoreA).not.toBe(map.scoreB);
    expect(map.rounds.at(-1)).toMatchObject({ a: map.scoreA, b: map.scoreB });
  });

  it('builds the same complete Major run from the same choices and seed', () => {
    const players = playersJson as Player[];
    const teams = teamsJson as HistoricalTeam[];
    const picked = teams.slice(0, 5).map((item) => players.find((player) => player.teamId === item.id)!).filter(Boolean);
    const first = buildMajorRun(picked, 'balanced', teams, players, 'major-seed');
    const second = buildMajorRun(picked, 'balanced', teams, players, 'major-seed');
    expect(second).toEqual(first);
    expect(first.stage3.matches.length).toBeLessThanOrEqual(5);
    expect(first.matches.every((match) => match.maps.length <= match.bestOf)).toBe(true);
  });
});
