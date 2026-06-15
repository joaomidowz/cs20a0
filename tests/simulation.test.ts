import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { buildMajorRun, calculateUserTeamPower, createSeededRng, getMatchDayPower, getWinProbability, simulateMap, simulateSeries } from '../src/lib/game/simulation';
import { createRunStats } from '../src/lib/game/runStats';
import { getPlayerPlaystyle } from '../src/lib/game/playstyle';
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
  it('loads the annual top five pool through the June 2026 snapshot', () => {
    const teams = teamsJson as HistoricalTeam[];
    const players = playersJson as Player[];
    const teams2026 = teams.filter((team) => team.year === 2026);

    expect(teams).toHaveLength(55);
    expect(players).toHaveLength(275);
    expect(teams2026.map((team) => team.name)).toEqual([
      'Vitality',
      'Natus Vincere',
      'Spirit',
      'Falcons',
      'FURIA'
    ]);
  });

  it('keeps rank four and five players competitive without flattening stars', () => {
    const players = playersJson as Player[];
    const byId = new Map(players.map((player) => [player.id, player]));

    expect(byId.get('tarik-2019')?.overall).toBeGreaterThanOrEqual(81);
    expect(byId.get('brehze-2019')?.overall).toBeGreaterThanOrEqual(87);
    expect(byId.get('donk-2026')?.overall).toBeGreaterThanOrEqual(90);
    expect(byId.get('niko-2026')?.overall).toBeGreaterThanOrEqual(89);
  });

  it('assigns the core NRG 2018 roles', () => {
    const players = playersJson as Player[];
    const byId = new Map(players.map((player) => [player.id, player]));

    expect(byId.get('daps-2018')?.role).toBe('igl');
    expect(byId.get('cerq-2018')?.role).toBe('awper');
    expect(byId.get('fugly-2018')?.role).toBe('support');
  });

  it('uses tactical playstyle overrides for ropz and ZywOo across eras', () => {
    const players = playersJson as Player[];
    const overridden = players.filter((player) => ['ropz', 'ZywOo'].includes(player.nickname ?? ''));
    expect(overridden.length).toBeGreaterThan(2);
    expect(overridden.every((player) => getPlayerPlaystyle(player) === 'tactical')).toBe(true);
  });

  it('uses the configured round ticker intervals', () => {
    expect(SPEEDS).toEqual({ normal: 2400, fast: 1200, ultra: 200 });
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

  it('buffs tactical by 10% without a fixed aggressive penalty', () => {
    const players = (playersJson as Player[]).filter((player) => player.teamId === 'astralis-2018').slice(0, 5);
    const lineup: SelectedPlayer[] = players.map((player, index) => ({
      playerId: player.id,
      selectedSlotRole: (['igl', 'support', 'awper', 'entry', 'rifler'] as const)[index]
    }));
    const balanced = calculateUserTeamPower(players, 'balanced', lineup, 'style-hotfix');
    const tactical = calculateUserTeamPower(players, 'tactical', lineup, 'style-hotfix');
    const aggressive = calculateUserTeamPower(players, 'aggressive', lineup, 'style-hotfix');

    expect(tactical.power).toBeGreaterThan(balanced.power);
    expect(aggressive.power).toBeGreaterThanOrEqual(balanced.power - 2);
    expect(tactical.studyPercentage).toBeGreaterThanOrEqual(60);
    expect(tactical.studyPercentage).toBeLessThanOrEqual(100);
    expect(calculateUserTeamPower(players, 'tactical', lineup, 'style-hotfix').studyPercentage).toBe(tactical.studyPercentage);
  });

  it('gives aggressive teams a deterministic high-upside match day', () => {
    const aggressive: CombatTeam = {
      ...team('aggressive', 94),
      style: 'aggressive',
      aggressionPercentage: 99
    };
    const goodDayRng = createSeededRng('aggressive-good-day');
    let peak = 0;
    for (let match = 0; match < 40; match += 1) peak = Math.max(peak, getMatchDayPower(aggressive, goodDayRng));

    expect(peak).toBeGreaterThan(98);
    const first = getMatchDayPower(aggressive, createSeededRng('same-match'));
    const second = getMatchDayPower(aggressive, createSeededRng('same-match'));
    expect(first).toBe(second);
  });

  it('raises the ceiling of a lineup with three 99-overall players', () => {
    const basePlayers = (playersJson as Player[]).slice(0, 5).map((player) => ({ ...player }));
    basePlayers.slice(0, 3).forEach((player) => {
      player.overall = 99;
      player.firepower = 99;
      player.entry = 99;
    });
    const lineup: SelectedPlayer[] = basePlayers.map((player, index) => ({
      playerId: player.id,
      selectedSlotRole: (['igl', 'support', 'awper', 'entry', 'rifler'] as const)[index]
    }));

    const power = calculateUserTeamPower(basePlayers, 'aggressive', lineup, 'elite-core').power;
    expect(power).toBeGreaterThanOrEqual(94);
  });

  it('turns superior tactical study into extra win probability', () => {
    const baseline = team('baseline', 86);
    const tactical: CombatTeam = {
      ...team('tactical', 86),
      style: 'tactical',
      studyPercentage: 92,
      aggressionPercentage: 77
    };
    expect(getWinProbability(tactical, baseline)).toBeGreaterThan(0.5);
    expect(getWinProbability(baseline, tactical)).toBeLessThan(0.5);
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
