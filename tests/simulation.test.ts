import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { buildMajorRun, createSeededRng, simulateMap, simulateSeries } from '../src/lib/game/simulation';
import { createRunStats } from '../src/lib/game/runStats';
import { SPEEDS, type CombatTeam, type HistoricalTeam, type MajorRun, type Player, type SelectedPlayer } from '../src/lib/game/types';

const team = (id: string, power: number): CombatTeam => ({
  id,
  name: id,
  power,
  mental: power,
  clutch: power,
  experience: power
});

describe('simulation', () => {
  it('uses the configured round ticker intervals', () => {
    expect(SPEEDS).toEqual({ normal: 3000, fast: 1500, ultra: 1000 });
  });

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

  it('keeps heavy-loss ratings and K/D distributions realistic', () => {
    const players = (playersJson as Player[]).slice(0, 5);
    const lineup: SelectedPlayer[] = players.map((player, index) => ({
      playerId: player.id,
      selectedSlotRole: (['support', 'entry', 'igl', 'awper', 'rifler'] as const)[index]
    }));
    const user = team('user', 85);
    const opponent = team('opponent', 91);
    const heavyLoss: MajorRun = {
      stage3: { wins: 0, losses: 1, qualified: false, matches: [] },
      champion: false,
      placement: 'Eliminado no Stage 3',
      matches: [{
        id: 'heavy-loss',
        phase: 'stage3',
        bestOf: 3,
        teamA: user,
        teamB: opponent,
        scoreA: 0,
        scoreB: 2,
        winnerId: opponent.id,
        userMatch: true,
        maps: [
          { map: 1, scoreA: 5, scoreB: 13, winnerId: opponent.id, overtime: false, rounds: [] },
          { map: 2, scoreA: 7, scoreB: 13, winnerId: opponent.id, overtime: false, rounds: [] }
        ]
      }]
    };

    const first = createRunStats(players, heavyLoss, 'heavy-loss-seed', lineup);
    const second = createRunStats(players, heavyLoss, 'heavy-loss-seed', lineup);
    expect(second).toEqual(first);
    expect(first.filter((stat) => stat.runRating > 1.05).length).toBeLessThanOrEqual(1);
    expect(first.some((stat) => stat.runRating <= 0.7)).toBe(true);
    expect(first.filter((stat) => stat.runRating < 0.9).every((stat) => stat.kills < stat.deaths)).toBe(true);
  });
});
