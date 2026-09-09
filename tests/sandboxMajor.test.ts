import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTeamPlayers, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { advanceSandboxMajor, createSandboxMajor } from '../src/lib/game/sandbox/major';
import { chooseSandboxSlotRole, createRandomSandboxLineup, previewSandboxLineupPower, previewSandboxSwapDelta, validateSandboxLineup } from '../src/lib/game/sandbox/lineup';
import { getSandboxCampaignSummary, getSandboxDecidedMaps, getSandboxPhaseOverview, getSandboxTeamName, getSandboxUserProgress } from '../src/lib/game/sandbox/presentation';
import { players } from '../src/lib/game/data';
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

  it('creates a deterministic first round without precomputing human results with named maps, scores and duplicate-free vetoes', () => {
    const first = createSandboxMajor(selection, 'sandbox-history');
    const second = createSandboxMajor(selection, 'sandbox-history');
    expect(second).toEqual(first);
    expect(first.matches).toHaveLength(8);
    expect(first.championId).toBeNull();
    expect(first.matches.find(match => match.userMatch)?.maps).toEqual([]);
    expect(first.matches.flatMap((match) => match.maps).every((map) => map.mapId && map.scoreA >= 0 && map.scoreB >= 0)).toBe(true);
    expect(first.matches.flatMap((match) => match.maps).every((map) => map.details.length === map.rounds.length)).toBe(true);
    expect(first.matches.every((match) => new Set(match.veto?.map((step) => step.mapId)).size === match.veto?.length)).toBe(true);
  });

  it('presents only picks and deciders while preserving an unplayed third BO3 map', () => {
    const major = createSandboxMajor(selection, 'sandbox-history');
    const twoZero = major.matches.find((match) => match.bestOf === 3 && match.maps.length === 2);
    expect(twoZero).toBeDefined();

    const decidedMaps = getSandboxDecidedMaps(twoZero!);
    expect(decidedMaps).toHaveLength(3);
    expect(decidedMaps.map((map) => map.action)).toEqual(['pick', 'pick', 'decider']);
    expect(decidedMaps.every((map) => map.action !== ('ban' as never))).toBe(true);
    expect(decidedMaps.slice(0, 2).every((map) => map.result !== null)).toBe(true);
    expect(decidedMaps[2].result).toBeNull();
  });

  it('keeps the Sandbox route free of replay, radar and Canvas dependencies', () => {
    const source = readFileSync(new URL('../src/routes/sandbox/+page.svelte', import.meta.url), 'utf8');
    const seriesViewer = readFileSync(new URL('../src/lib/components/SandboxSeriesViewer.svelte', import.meta.url), 'utf8');
    expect(`${source}\n${seriesViewer}`).not.toMatch(/Replay|Canvas|radar|game\/replay/i);
    expect(source).toContain('mapPreferences');
    expect(source).toContain('SandboxPlayerPicker');
    expect(source).toContain('Jogo atual');
    expect(source).toContain('Todos os jogos');
    expect(source).toContain("{ value: 'insta', label: 'Insta' }");
    expect(seriesViewer).toContain('getSandboxDecidedMaps(match)');
    expect(seriesViewer).toContain('Pular mapa atual');
    expect(seriesViewer).toContain('kill-feed');
    expect(seriesViewer).not.toContain('step.action === \'ban\'');
  });

  it('previews team power live for partial and complete lineups, flagging missing core roles and off-role picks', () => {
    const empty = previewSandboxLineupPower([], 'balanced', organization.id);
    expect(empty.power).toBe(0);
    expect(empty.missing).toHaveLength(5);

    const full = previewSandboxLineupPower(selection.players, selection.style, organization.id);
    expect(full.power).toBeGreaterThan(45);
    expect(full.averageOverall).toBeGreaterThan(0);
    expect(full.eras).toContain(organization.year);

    const allAwpers = selection.players.map((pick) => ({ ...pick, selectedSlotRole: 'awper' as const }));
    const forced = previewSandboxLineupPower(allAwpers, selection.style, organization.id);
    expect(forced.roles.awper).toBe(5);
    expect(forced.missing).toEqual(['igl', 'entry', 'lurker', 'support']);
    expect(forced.offRoleCount).toBeGreaterThan(0);
  });

  it('keeps the slot role when a candidate is eligible for it and reports a swap delta', () => {
    const candidate = players.find((player) => getEligibleSlotRoles(player).includes('awper'))!;
    expect(chooseSandboxSlotRole(candidate, 'awper')).toBe('awper');
    expect(getEligibleSlotRoles(candidate)).toContain(chooseSandboxSlotRole(candidate, null));
    const delta = previewSandboxSwapDelta(selection.players, 0, candidate, 'awper', selection.style, organization.id);
    expect(Number.isFinite(delta)).toBe(true);
    expect(previewSandboxSwapDelta(selection.players, 0, roster[0], selection.players[0].selectedSlotRole, selection.style, organization.id)).toBe(0);
  });

  it('draws a deterministic random lineup of five distinct players covering core roles when possible', () => {
    const first = createRandomSandboxLineup('draw-1');
    const second = createRandomSandboxLineup('draw-1');
    expect(second).toEqual(first);
    expect(first).toHaveLength(5);
    expect(new Set(first.map((pick) => pick.playerId)).size).toBe(5);
    expect(createRandomSandboxLineup('draw-2')).not.toEqual(first);
    expect(validateSandboxLineup({ ...selection, players: first, mapPreferences: selection.mapPreferences }).errors).not.toHaveProperty('players');
  });

  it('names the champion, groups matches by phase without leaking pending results, and summarises the campaign', () => {
    let major = createSandboxMajor(selection, 'sandbox-history');
    expect(getSandboxTeamName(major, major.userTeam.id)).toBe(major.userTeam.name);
    expect(getSandboxTeamName(major, major.championId)).not.toBe(major.championId);

    const overview = getSandboxPhaseOverview(major);
    expect(overview[0].phase).toBe('stage3');
    expect(overview[0].status).toBe('active');
    expect(overview.flatMap((group) => group.matches).filter((entry) => entry.status === 'live')).toHaveLength(1);
    expect(major.matches.find(match => match.userMatch)?.winnerId).toBe('');
    expect(major.tournament.rounds).toHaveLength(1);
    expect(getSandboxUserProgress(major)).toEqual({ played: 0, current: 1 });

    while (!major.finished) major = advanceSandboxMajor(major);
    const summary = getSandboxCampaignSummary(major);
    expect(summary.wins + summary.losses).toBe(major.matches.filter((match) => match.userMatch).length);
    expect(summary.mapsWon + summary.mapsLost).toBeGreaterThan(0);
    expect(summary.placement).not.toBe('—');
    expect(summary.champion).toBe(major.championId === major.userTeam.id);
    expect(getSandboxPhaseOverview(major).every((group) => group.status === 'completed')).toBe(true);
    expect(getSandboxUserProgress(major).current).toBeNull();
  });
});
