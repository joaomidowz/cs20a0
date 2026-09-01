import { describe, expect, it } from 'vitest';
import { buildSandboxCombatTeam, validateSandboxLineup } from '../src/lib/game/sandbox/lineup';
import type { SandboxLineupSelection } from '../src/lib/game/sandbox/types';

const validSelection = (): SandboxLineupSelection => ({
  organizationId: 'astralis-2016',
  style: 'balanced',
  players: [
    { playerId: 'fallen-2016', selectedSlotRole: 'igl' },
    { playerId: 's1mple-2018', selectedSlotRole: 'awper' },
    { playerId: 'donk-2024', selectedSlotRole: 'entry' },
    { playerId: 'ropz-2017', selectedSlotRole: 'lurker' },
    { playerId: 'perfecto-2021', selectedSlotRole: 'support' }
  ]
});

describe('Sandbox lineup', () => {
  it('accepts five arbitrary players with distinct base identities without mutating the selection', () => {
    const selection = validSelection();
    const before = structuredClone(selection);

    const result = validateSandboxLineup(selection);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.players.map((player) => player.id)).toEqual(selection.players.map((player) => player.playerId));
    expect(selection).toEqual(before);
  });

  it('reports missing organization and incomplete lineup at addressable fields', () => {
    const selection = validSelection();
    selection.organizationId = '';
    selection.players = selection.players.slice(0, 4);

    const result = validateSandboxLineup(selection);

    expect(result.valid).toBe(false);
    expect(result.errors.organizationId).toBeTruthy();
    expect(result.errors.players).toBeTruthy();
  });

  it('rejects duplicate base identities even when different player eras are selected', () => {
    const selection = validSelection();
    selection.players[1] = { playerId: 'fallen-2017', selectedSlotRole: 'awper' };

    const result = validateSandboxLineup(selection);

    expect(result.valid).toBe(false);
    expect(result.errors['players.1.playerId']).toBeTruthy();
  });

  it('rejects a role that is not eligible for the selected player', () => {
    const selection = validSelection();
    selection.players[2] = { playerId: 'donk-2024', selectedSlotRole: 'awper' };

    const result = validateSandboxLineup(selection);

    expect(result.valid).toBe(false);
    expect(result.errors['players.2.selectedSlotRole']).toBeTruthy();
  });

  it('builds the selected organization as the user combat team while keeping the arbitrary lineup', () => {
    const selection = validSelection();
    const team = buildSandboxCombatTeam(selection, 'A');

    expect(team.id).toBe('sandbox-a');
    expect(team.organizationId).toBe('astralis-2016');
    expect(team.name).toContain('Astralis');
    expect(team.style).toBe('balanced');
    expect(team.isUser).toBe(true);
    expect(team.lineup).toEqual(selection.players);
  });
});
