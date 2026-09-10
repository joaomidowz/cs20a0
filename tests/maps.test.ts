import { describe, expect, it } from 'vitest';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import {
  ACTIVE_DUTY_MAPS,
  ACTIVE_DUTY_POOLS_BY_YEAR,
  MAP_POOL,
  MAP_POOL_VERSION,
  getDefaultMapSelection,
  getActiveDutyMapsForYear,
  getFallbackMapPreferences,
  getLineupMapContributors,
  getMapAffinity,
  getSelectedMapPowerBonus,
  getTeamMapProfile,
  isValidMapSelection
} from '../src/lib/game/maps';
import type { HistoricalTeam, Player } from '../src/lib/game/types';

describe('map profiles and selection', () => {
  it('defines all eleven historical Active Duty maps and the pools from 2016 through 2026', () => {
    expect(ACTIVE_DUTY_MAPS).toEqual([
      'ancient', 'anubis', 'cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'
    ]);
    expect(Object.keys(ACTIVE_DUTY_POOLS_BY_YEAR).map(Number)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(getActiveDutyMapsForYear(2016)).toEqual(['cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train']);
    expect(getActiveDutyMapsForYear(2023)).toEqual(['ancient', 'anubis', 'inferno', 'mirage', 'nuke', 'overpass', 'vertigo']);
    expect(getActiveDutyMapsForYear(2026)).toEqual(['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train']);
  });

  it('creates three stable fallback preferences without inventing percentages', () => {
    const first = getTeamMapProfile({ id: 'fallback-team', mapProfile: null });
    const second = getTeamMapProfile({ id: 'fallback-team', mapProfile: null });

    expect(second).toEqual(first);
    expect(first.poolVersion).toBe(MAP_POOL_VERSION);
    expect(first.records).toEqual([]);
    expect(first.preferences).toHaveLength(3);
    expect(new Set(first.preferences.map((preference) => preference.mapId)).size).toBe(3);
    expect(first.preferences.every((preference) => preference.source === 'fallback')).toBe(true);
  });

  it('gives every exported historical team three valid runtime preferences', () => {
    const profiles = (teamsJson as HistoricalTeam[]).map(getTeamMapProfile);
    expect(profiles.length).toBeGreaterThanOrEqual(286);
    expect(profiles.every((profile) => profile.preferences.length === 3)).toBe(true);
    expect(profiles.every((profile) => new Set(profile.preferences.map((preference) => preference.mapId)).size === 3)).toBe(true);
    expect(profiles.flatMap((profile) => profile.preferences).every((preference) => MAP_POOL.includes(preference.mapId))).toBe(true);
  });

  it('uses only samples of five matches and orders them by win rate, matches, then map id', () => {
    const profile = getTeamMapProfile({
      id: 'observed-team',
      mapProfile: {
        poolVersion: MAP_POOL_VERSION,
        records: [
          { mapId: 'nuke', matches: 4, wins: 4, draws: 0, losses: 0, winRate: 1, source: 'fixture', confidence: 'high' },
          { mapId: 'mirage', matches: 8, wins: 5, draws: 0, losses: 3, winRate: 0.625, source: 'fixture', confidence: 'high' },
          { mapId: 'inferno', matches: 12, wins: 7, draws: 0, losses: 5, winRate: 0.625, source: 'fixture', confidence: 'medium' }
        ],
        preferences: getFallbackMapPreferences('ignored')
      }
    });

    expect(profile.records.map((record) => record.mapId)).toEqual(['inferno', 'mirage']);
    expect(profile.preferences.slice(0, 2)).toEqual([
      { mapId: 'inferno', source: 'observed' },
      { mapId: 'mirage', source: 'observed' }
    ]);
    expect(profile.preferences[2].source).toBe('fallback');
  });

  it('counts which drafted players contribute to each map and auto-selects the strongest three', () => {
    const teams: HistoricalTeam[] = [
      { id: 'team-a', year: 2016 },
      { id: 'team-b', year: 2023 }
    ];
    const players: Player[] = [
      { id: 'a-1', teamId: 'team-a', nickname: 'A1', overall: 80 },
      { id: 'a-2', teamId: 'team-a', nickname: 'A2', overall: 90 },
      { id: 'b-1', teamId: 'team-b', nickname: 'B1', overall: 99 }
    ];

    const contributors = getLineupMapContributors(players, teams);
    expect(contributors.ancient.map((player) => player.id)).toEqual(['b-1']);
    expect(contributors.inferno.map((player) => player.id)).toEqual(['a-1', 'a-2', 'b-1']);
    expect(contributors.cobblestone.map((player) => player.id)).toEqual(['a-1', 'a-2']);
    expect(getMapAffinity(0)).toBe('EVEN');
    expect(getMapAffinity(1)).toBe('EVEN');
    expect(getMapAffinity(2)).toBe('+');
    expect(getMapAffinity(3)).toBe('++');
    expect(getMapAffinity(4)).toBe('+++');
    expect(getMapAffinity(5)).toBe('+++');
    expect(getDefaultMapSelection(players, teams)).toHaveLength(3);
  });

  it('breaks equal familiarity by the strongest contributing player and then deterministically', () => {
    const teams: HistoricalTeam[] = [{ id: 'old', year: 2016 }, { id: 'new', year: 2023 }];
    const players: Player[] = [
      { id: 'old-star', teamId: 'old', overall: 100 },
      { id: 'new-player', teamId: 'new', overall: 70 }
    ];
    const first = getDefaultMapSelection(players, teams);
    const second = getDefaultMapSelection(players, teams);
    expect(second).toEqual(first);
    expect(first.every((mapId) => getActiveDutyMapsForYear(2016).includes(mapId))).toBe(true);
  });

  it('accepts exactly three unique pool maps', () => {
    expect(isValidMapSelection(['ancient', 'mirage', 'nuke'])).toBe(true);
    expect(isValidMapSelection(['ancient', 'ancient', 'nuke'])).toBe(false);
    expect(isValidMapSelection(['ancient', 'mirage'])).toBe(false);
    expect(isValidMapSelection(['ancient', 'mirage', 'train'])).toBe(true);
    expect(isValidMapSelection(['ancient', 'mirage', 'office'])).toBe(false);
  });

  it('applies light bonuses to Normal and strong bonuses to Ranked and PRO', () => {
    expect(getSelectedMapPowerBonus('premier', 'EVEN')).toBe(0);
    expect(getSelectedMapPowerBonus('premier', '+')).toBe(0.5);
    expect(getSelectedMapPowerBonus('premier', '++')).toBe(1);
    expect(getSelectedMapPowerBonus('faceit', '+')).toBe(1.5);
    expect(getSelectedMapPowerBonus('faceit', '++')).toBe(3);
    expect(getSelectedMapPowerBonus('pro', '++')).toBe(3);
    expect(getSelectedMapPowerBonus('pro', '+++')).toBe(4.5);
    // The Resenha queues use the light Normal bonus.
    expect(getSelectedMapPowerBonus('fun', '+')).toBe(0.5);
    expect(getSelectedMapPowerBonus('max_fun', '++')).toBe(1);
  });
});
