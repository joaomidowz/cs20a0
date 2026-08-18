import { describe, expect, it } from 'vitest';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import {
  MAP_POOL,
  MAP_POOL_VERSION,
  getDefaultMapSelection,
  getFallbackMapPreferences,
  getLineupMapContributors,
  getMapAffinity,
  getSelectedMapPowerBonus,
  getTeamMapProfile,
  isValidMapSelection
} from '../src/lib/game/maps';
import type { HistoricalTeam, Player } from '../src/lib/game/types';

describe('map profiles and selection', () => {
  it('defines the seven-map initial pool', () => {
    expect(MAP_POOL).toEqual(['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke']);
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
      { id: 'team-a', mapProfile: { poolVersion: MAP_POOL_VERSION, records: [], preferences: [{ mapId: 'ancient', source: 'fallback' }, { mapId: 'mirage', source: 'fallback' }, { mapId: 'nuke', source: 'fallback' }] } },
      { id: 'team-b', mapProfile: { poolVersion: MAP_POOL_VERSION, records: [], preferences: [{ mapId: 'ancient', source: 'fallback' }, { mapId: 'inferno', source: 'fallback' }, { mapId: 'mirage', source: 'fallback' }] } }
    ];
    const players: Player[] = [
      { id: 'a-1', teamId: 'team-a', nickname: 'A1' },
      { id: 'a-2', teamId: 'team-a', nickname: 'A2' },
      { id: 'b-1', teamId: 'team-b', nickname: 'B1' }
    ];

    const contributors = getLineupMapContributors(players, teams);
    expect(contributors.ancient.map((player) => player.id)).toEqual(['a-1', 'a-2', 'b-1']);
    expect(getMapAffinity(contributors.ancient.length)).toBe('++');
    expect(getMapAffinity(contributors.inferno.length)).toBe('+');
    expect(getMapAffinity(contributors.cache.length)).toBe('EVEN');
    expect(getMapAffinity(2)).toBe('+');
    expect(getMapAffinity(5)).toBe('++');
    expect(getDefaultMapSelection(players, teams)).toEqual(['ancient', 'mirage', 'nuke']);
  });

  it('accepts exactly three unique pool maps', () => {
    expect(isValidMapSelection(['ancient', 'mirage', 'nuke'])).toBe(true);
    expect(isValidMapSelection(['ancient', 'ancient', 'nuke'])).toBe(false);
    expect(isValidMapSelection(['ancient', 'mirage'])).toBe(false);
    expect(isValidMapSelection(['ancient', 'mirage', 'train'])).toBe(false);
  });

  it('applies light bonuses to Normal and strong bonuses to Ranked and PRO', () => {
    expect(getSelectedMapPowerBonus('premier', 'EVEN')).toBe(0);
    expect(getSelectedMapPowerBonus('premier', '+')).toBe(0.5);
    expect(getSelectedMapPowerBonus('premier', '++')).toBe(1);
    expect(getSelectedMapPowerBonus('faceit', '+')).toBe(1.5);
    expect(getSelectedMapPowerBonus('faceit', '++')).toBe(3);
    expect(getSelectedMapPowerBonus('pro', '++')).toBe(3);
  });
});
