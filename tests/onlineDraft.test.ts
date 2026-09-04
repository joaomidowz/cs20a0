import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { autocompleteDraft, chooseDraftPlayer, drawDraftTeam, emptyDraftState, findBestProAssignments, getRerollLimit, hasFreeRoles } from '../src/lib/game/online/draft';
import { DraftPoolExhaustedError, getEligibleDraftTeams, getHistoricalTeamOverall, pickDraftTeam } from '../src/lib/game/online/draft-pool';
import type { HistoricalTeam, Player } from '../src/lib/game/types';

const players = playersJson as Player[];
const teams = teamsJson as HistoricalTeam[];

const historicalLine = (id: string, overalls: number[]) => {
  const roster: Player[] = overalls.map((overall, index) => ({ id: `${id}-p${index}`, teamId: id, overall }));
  const team: HistoricalTeam = { id, players: roster.map((player) => player.id) };
  return { team, roster };
};

describe('online draft domain', () => {
  const lookup = (id: string) => players.find((player) => player.id === id);
  const awpers = players.filter((player) => (player.role ?? '').toLowerCase() === 'awper' && player.teamId);
  const offer = (playerToOffer: Player, lineup = emptyDraftState().lineup) => ({ ...emptyDraftState(), style: 'balanced' as const, rolledTeamId: playerToOffer.teamId!, lineup });

  it('drafts with free roles in every mode except PRO', () => {
    expect(hasFreeRoles('premier')).toBe(true);
    expect(hasFreeRoles('faceit')).toBe(true);
    expect(hasFreeRoles('fun')).toBe(true);
    expect(hasFreeRoles('max_fun')).toBe(true);
    expect(hasFreeRoles('pro')).toBe(false);
  });

  it('allows five AWPers in a free-roles lineup while still blocking the same player twice', () => {
    const distinct: Player[] = [];
    for (const player of awpers) {
      const base = player.id.replace(/-\d{4}$/, '');
      if (!distinct.some((picked) => picked.id.replace(/-\d{4}$/, '') === base || picked.teamId === player.teamId)) distinct.push(player);
      if (distinct.length === 5) break;
    }
    expect(distinct).toHaveLength(5);
    let state = emptyDraftState();
    for (const player of distinct) {
      state = chooseDraftPlayer('fun', offer(player, state.lineup), player, 'awper', lookup);
    }
    expect(state.lineup.map((pick) => pick.selectedSlotRole)).toEqual(['awper', 'awper', 'awper', 'awper', 'awper']);
    const sameAgain = players.find((player) => player.id !== distinct[0].id && player.id.replace(/-\d{4}$/, '') === distinct[0].id.replace(/-\d{4}$/, '') && player.teamId);
    if (sameAgain) expect(() => chooseDraftPlayer('fun', offer(sameAgain, state.lineup), sameAgain, 'awper', lookup)).toThrow();
  });

  it('stores a dual position when both roles are eligible and rejects invalid ones', () => {
    const fallen = players.find((player) => player.id === 'fallen-2016') ?? players.find((player) => /fallen/i.test(player.id) && player.teamId)!;
    const picked = chooseDraftPlayer('premier', offer(fallen), fallen, 'awper', lookup, 'igl');
    expect(picked.lineup[0]).toEqual({ playerId: fallen.id, selectedSlotRole: 'awper', secondarySlotRole: 'igl' });
    expect(() => chooseDraftPlayer('premier', offer(fallen), fallen, 'awper', lookup, 'awper')).toThrow();
    expect(() => chooseDraftPlayer('premier', offer(fallen), fallen, 'awper', lookup, 'entry')).toThrow();
    const single = chooseDraftPlayer('premier', offer(fallen), fallen, 'awper', lookup);
    expect(single.lineup[0]).not.toHaveProperty('secondarySlotRole');
  });

  it('namespaces offers by participant and keeps each sequence deterministic', () => {
    const first = drawDraftTeam('room', 'participant-a', 'premier', emptyDraftState(), teams, players);
    const again = drawDraftTeam('room', 'participant-a', 'premier', emptyDraftState(), teams, players);
    const other = drawDraftTeam('room', 'participant-b', 'premier', emptyDraftState(), teams, players);
    expect(again).toEqual(first);
    expect(other.rolledTeamId).not.toBe(first.rolledTeamId);
  });

  it.each(['premier', 'faceit', 'pro'] as const)('preserves the existing first %s offer sequence', (mode) => {
    const state = drawDraftTeam('legacy-seed', 'legacy-player', mode, emptyDraftState(), teams, players);
    expect(state.rolledTeamId).toBe('9z-2026');
  });

  it('enforces reroll limits for all modes', () => {
    expect(getRerollLimit('premier')).toBe(3);
    expect(getRerollLimit('faceit')).toBe(1);
    expect(getRerollLimit('pro')).toBe(1);
    expect(getRerollLimit('fun')).toBe(1);
    expect(getRerollLimit('max_fun')).toBe(1);
  });

  it.each(['premier', 'faceit', 'fun', 'max_fun'] as const)('autocompletes a valid five-player %s lineup', (mode) => {
    const state = autocompleteDraft('room-seed', `participant-${mode}`, mode, emptyDraftState(), teams, players);
    expect(state.lineup).toHaveLength(5);
    expect(new Set(state.usedTeamIds).size).toBe(5);
    if (mode === 'fun') expect(state.usedTeamIds.every((id) => getHistoricalTeamOverall(teams.find((team) => team.id === id)!, players)! >= 82)).toBe(true);
    if (mode === 'max_fun') expect(state.usedTeamIds.every((id) => {
      const average = getHistoricalTeamOverall(teams.find((team) => team.id === id)!, players)!;
      return average >= 90 || average <= 80;
    })).toBe(true);
  });

  it('uses raw inclusive average boundaries and rejects incomplete historical lines', () => {
    const fixtures = [
      historicalLine('exact-82', [82, 82, 82, 82, 82]),
      historicalLine('below-82', [82, 82, 82, 82, 81.995]),
      historicalLine('exact-90', [90, 90, 90, 90, 90]),
      historicalLine('below-90', [90, 90, 90, 90, 89.995]),
      historicalLine('exact-80', [80, 80, 80, 80, 80]),
      historicalLine('above-80', [80, 80, 80, 80, 80.005]),
      historicalLine('incomplete', [99, 99, 99, 99])
    ];
    const fixtureTeams = fixtures.map((fixture) => fixture.team);
    const fixturePlayers = fixtures.flatMap((fixture) => fixture.roster);

    expect(getHistoricalTeamOverall(fixtures[0].team, fixturePlayers)).toBe(82);
    expect(getHistoricalTeamOverall(fixtures[6].team, fixturePlayers)).toBeNull();
    expect(getEligibleDraftTeams('fun', fixtureTeams, fixturePlayers).map((team) => team.id)).toEqual(['exact-82', 'exact-90', 'below-90']);
    expect(getEligibleDraftTeams('max_fun', fixtureTeams, fixturePlayers).map((team) => team.id)).toEqual(['exact-90', 'exact-80']);
  });

  it('chooses Maximum Banter groups 50/50 and falls back to the other non-empty group', () => {
    const high = historicalLine('high', [90, 90, 90, 90, 90]);
    const low = historicalLine('low', [80, 80, 80, 80, 80]);
    const fixtureTeams = [high.team, low.team];
    const fixturePlayers = [...high.roster, ...low.roster];
    const highRng = [0.499, 0][Symbol.iterator]();
    const lowRng = [0.5, 0][Symbol.iterator]();

    expect(pickDraftTeam('max_fun', fixtureTeams, fixturePlayers, () => highRng.next().value ?? 0).id).toBe('high');
    expect(pickDraftTeam('max_fun', fixtureTeams, fixturePlayers, () => lowRng.next().value ?? 0).id).toBe('low');
    expect(pickDraftTeam('max_fun', fixtureTeams, fixturePlayers, () => 0, ['high']).id).toBe('low');
    expect(pickDraftTeam('max_fun', fixtureTeams, fixturePlayers, () => 0.75, ['low']).id).toBe('high');
  });

  it('returns a typed exhaustion error without changing the draft', () => {
    const middle = historicalLine('middle', [85, 85, 85, 85, 85]);
    const state = emptyDraftState();
    const before = structuredClone(state);
    expect(() => drawDraftTeam('room', 'participant', 'max_fun', state, [middle.team], middle.roster)).toThrow(DraftPoolExhaustedError);
    expect(state).toEqual(before);
  });

  it('allows one fun reroll and excludes both used and currently offered teams', () => {
    const first = drawDraftTeam('room', 'participant-fun', 'fun', emptyDraftState(), teams, players);
    expect(() => drawDraftTeam('room', 'participant-fun', 'fun', first, teams, players)).toThrow('A draft offer is already active');
    const rerolled = drawDraftTeam('room', 'participant-fun', 'fun', first, teams, players, true);
    expect(rerolled.rolledTeamId).not.toBe(first.rolledTeamId);
    expect(rerolled.rerollsUsed).toBe(1);
    expect(() => drawDraftTeam('room', 'participant-fun', 'fun', rerolled, teams, players, true)).toThrow('Reroll is not available');
  });

  it('autocompletes only missing PRO players and preserves manual configuration', () => {
    const state = autocompleteDraft('room-seed', 'participant-pro', 'pro', emptyDraftState(), teams, players);
    expect(state.style).toBeNull();
    expect(state.proPickedPlayerIds).toHaveLength(5);
    expect(state.lineup).toHaveLength(0);
    expect(state.proRoleAssignments).toEqual(Object.fromEntries(state.proPickedPlayerIds.map((id) => [id, null])));
    expect(state.mapPreferences).toEqual([]);
  });

  it('finds a deterministic unique PRO assignment', () => {
    const selected = players.slice(0, 5);
    expect(findBestProAssignments(selected)).toEqual(findBestProAssignments(selected));
  });
});
