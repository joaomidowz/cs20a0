import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { autocompleteDraft, drawDraftTeam, emptyDraftState, findBestProAssignments, getRerollLimit } from '../src/lib/game/online/draft';
import { validateProAssignments } from '../src/lib/game/proMode';
import type { HistoricalTeam, Player } from '../src/lib/game/types';

const players = playersJson as Player[];
const teams = teamsJson as HistoricalTeam[];

describe('online draft domain', () => {
  it('namespaces offers by participant and keeps each sequence deterministic', () => {
    const first = drawDraftTeam('room', 'participant-a', 'premier', emptyDraftState(), teams);
    const again = drawDraftTeam('room', 'participant-a', 'premier', emptyDraftState(), teams);
    const other = drawDraftTeam('room', 'participant-b', 'premier', emptyDraftState(), teams);
    expect(again).toEqual(first);
    expect(other.rolledTeamId).not.toBe(first.rolledTeamId);
  });

  it('enforces reroll limits for all modes', () => {
    expect(getRerollLimit('premier')).toBe(3);
    expect(getRerollLimit('faceit')).toBe(1);
    expect(getRerollLimit('pro')).toBe(1);
  });

  it.each(['premier', 'faceit'] as const)('autocompletes a valid five-player %s lineup', (mode) => {
    const state = autocompleteDraft('room-seed', `participant-${mode}`, mode, emptyDraftState(), teams, players);
    expect(state.lineup).toHaveLength(5);
    expect(new Set(state.usedTeamIds).size).toBe(5);
  });

  it('autocompletes PRO with balanced style and five unique fitted roles', () => {
    const state = autocompleteDraft('room-seed', 'participant-pro', 'pro', emptyDraftState(), teams, players);
    expect(state.style).toBe('balanced');
    expect(state.proPickedPlayerIds).toHaveLength(5);
    expect(state.lineup).toHaveLength(5);
    expect(validateProAssignments(state.proRoleAssignments, state.proPickedPlayerIds).complete).toBe(true);
    expect(new Set(Object.values(state.proRoleAssignments))).toHaveLength(5);
  });

  it('finds a deterministic unique PRO assignment', () => {
    const selected = players.slice(0, 5);
    expect(findBestProAssignments(selected)).toEqual(findBestProAssignments(selected));
  });
});
