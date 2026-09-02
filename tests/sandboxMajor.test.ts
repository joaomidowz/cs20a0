import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTeamPlayers, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { createSandboxMajor } from '../src/lib/game/sandbox/major';
import { validateSandboxLineup } from '../src/lib/game/sandbox/lineup';
import type { SandboxLineupSelection } from '../src/lib/game/sandbox/types';

const organization = teams[0];
const roster = getTeamPlayers(organization).slice(0, 5);
const selection: SandboxLineupSelection = {
  organizationId: organization.id,
  style: 'balanced',
  players: roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' })),
  mapPreferences: getDefaultMapSelection(roster, teams)
};

describe('Sandbox Major without visual replay', () => {
  it('validates a free historical lineup and its three familiar map preferences', () => {
    expect(validateSandboxLineup(selection)).toMatchObject({ valid: true, errors: {} });
    expect(validateSandboxLineup({ ...selection, mapPreferences: [selection.mapPreferences[0], selection.mapPreferences[0], selection.mapPreferences[1]] }).errors).toHaveProperty('mapPreferences');
  });

  it('allows unrestricted compositions, including the same player and role in all five slots', () => {
    const repeated = Array.from({ length: 5 }, () => roster[0]);
    const unrestricted: SandboxLineupSelection = {
      ...selection,
      players: repeated.map((player) => ({ playerId: player.id, selectedSlotRole: 'awper' })),
      mapPreferences: getDefaultMapSelection(repeated, teams)
    };
    expect(validateSandboxLineup(unrestricted)).toMatchObject({ valid: true, errors: {} });
  });

  it('creates a deterministic complete Major with named maps, scores and duplicate-free vetoes', () => {
    const first = createSandboxMajor(selection, 'sandbox-history');
    const second = createSandboxMajor(selection, 'sandbox-history');
    expect(second).toEqual(first);
    expect(first.matches.length).toBeGreaterThan(10);
    expect(first.matches.flatMap((match) => match.maps).every((map) => map.mapId && map.scoreA >= 0 && map.scoreB >= 0)).toBe(true);
    expect(first.matches.every((match) => new Set(match.veto?.map((step) => step.mapId)).size === match.veto?.length)).toBe(true);
  });

  it('keeps the Sandbox route free of replay, radar and Canvas dependencies', () => {
    const source = readFileSync(new URL('../src/routes/sandbox/+page.svelte', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Replay|Canvas|radar|game\/replay/i);
    expect(source).toContain('mapPreferences');
    expect(source).toContain('scoreA');
    expect(source).toContain('SandboxPlayerPicker');
  });
});
