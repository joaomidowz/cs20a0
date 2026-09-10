import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { ONLINE_DATA_HASH } from '../src/lib/game/online/dataset';
import { autocompleteDraft, drawDraftTeam, emptyDraftState } from '../src/lib/game/online/draft';
import {
  SECRET_ALIASES,
  SECRET_ORGANIZATION_PICKS,
  buildSecretPlayers,
  findSecretAlias,
  isSecretOrganization,
  isSecretPlayerId,
  pickSecretPlayer,
  secretPicksLeftFor,
  secretPlayerId,
  withSecretPlayers
} from '../src/lib/game/online/secret-players';
import { topPlayersByRole } from '../src/lib/game/playerRankings';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import type { HistoricalTeam, Player } from '../src/lib/game/types';

const players = playersJson as Player[];
const teams = teamsJson as HistoricalTeam[];
const secretPlayers = buildSecretPlayers(players);
const byId = new Map([...players, ...secretPlayers].map((player) => [player.id, player]));
const lookup = (id: string) => byId.get(id);
const aliasOf = (name: string) => findSecretAlias(name)!;

describe('secret players', () => {
  it('clones the N-th best player of each role from the rankings order, keeping team and attributes', () => {
    expect(secretPlayers).toHaveLength(SECRET_ALIASES.length);
    for (const entry of SECRET_ALIASES) {
      const source = topPlayersByRole(players, entry.role, entry.rank)[entry.rank - 1];
      const clone = secretPlayers.find((player) => player.id === secretPlayerId(entry))!;
      expect(clone).toMatchObject({ nickname: entry.alias, teamId: source.teamId, overall: entry.overall, year: source.year, baseId: clone.id });
      expect(clone.overall).toBe(entry.alias === 'Vargas' ? 99 : clone.overall);
      expect([97, 98, 99]).toContain(clone.overall);
      expect(isSecretPlayerId(clone.id)).toBe(true);
    }
    // Every alias plays one position only, except Vargas (IGL and AWPer).
    for (const entry of SECRET_ALIASES) {
      const clone = secretPlayers.find((player) => player.id === secretPlayerId(entry))!;
      expect(getEligibleSlotRoles(clone)).toEqual(entry.alias === 'Vargas' ? ['igl', 'awper'] : [entry.role]);
    }
    // Midowz and Gveds clone the same lurker but stay two different players.
    expect(secretPlayerId(aliasOf('Midowz'))).not.toBe(secretPlayerId(aliasOf('Gveds')));
    // The dataset itself (and therefore the online data hash) is untouched.
    expect(players.some((player) => isSecretPlayerId(player.id))).toBe(false);
    expect(ONLINE_DATA_HASH).toHaveLength(16);
  });

  it('matches names without accents, case or punctuation', () => {
    expect(isSecretOrganization('vargao academy')).toBe(true);
    expect(isSecretOrganization('VARGÃO ACADEMY')).toBe(true);
    expect(isSecretOrganization('Vargão Academy FC')).toBe(false);
    expect(findSecretAlias('RAF4MOON')?.alias).toBe('Raf4Moon');
    expect(findSecretAlias('th4natos')?.role).toBe('awper');
    expect(findSecretAlias('Random Org')).toBeNull();
  });

  it('pre-fills the alias player from the player name or the organization name only in the Resenha queues', () => {
    const byPlayer = withSecretPlayers(emptyDraftState(), 'fun', 'Midowz', 'My Org', lookup);
    expect(byPlayer.lineup).toEqual([{ playerId: 'secret-midowz', selectedSlotRole: 'lurker' }]);
    const byOrganization = withSecretPlayers(emptyDraftState(), 'max_fun', 'Someone', 'Raf4Moon', lookup);
    expect(byOrganization.lineup.map((pick) => pick.playerId)).toEqual(['secret-raf4moon']);
    expect(withSecretPlayers(emptyDraftState(), 'premier', 'Midowz', 'Midowz', lookup).lineup).toEqual([]);
    expect(withSecretPlayers(emptyDraftState(), 'fun', 'Midowz', 'Vargão Academy', lookup).lineup).toEqual([]);
    expect(withSecretPlayers(emptyDraftState(), 'fun', 'Nobody', 'Nothing', lookup).lineup).toEqual([]);
  });

  it('lets Vargão Academy pick up to three aliases and refuses everybody else', () => {
    let draft = emptyDraftState();
    expect(secretPicksLeftFor('fun', 'Vargão Academy', draft)).toBe(SECRET_ORGANIZATION_PICKS);
    expect(secretPicksLeftFor('fun', 'Other', draft)).toBe(0);
    for (const name of ['Vargas', 'Raf4Moon', 'H1ro']) {
      const alias = aliasOf(name);
      draft = pickSecretPlayer(draft, 'fun', 'Vargão Academy', alias, lookup(secretPlayerId(alias))!, alias.role, lookup);
    }
    expect(draft.lineup).toHaveLength(3);
    expect(secretPicksLeftFor('fun', 'Vargão Academy', draft)).toBe(0);
    const fourth = aliasOf('Gveds');
    expect(() => pickSecretPlayer(draft, 'fun', 'Vargão Academy', fourth, lookup(secretPlayerId(fourth))!, 'lurker', lookup)).toThrow(/No secret pick left/);
    const again = aliasOf('Vargas');
    expect(() => pickSecretPlayer(emptyDraftState(), 'fun', 'Other org', again, lookup(secretPlayerId(again))!, 'igl', lookup)).toThrow(/Vargão Academy/);
    expect(() => pickSecretPlayer(emptyDraftState(), 'premier', 'Vargão Academy', again, lookup(secretPlayerId(again))!, 'igl', lookup)).toThrow(/Resenha/);
    // The same alias twice is a duplicate pick.
    const one = pickSecretPlayer(emptyDraftState(), 'fun', 'Vargão Academy', again, lookup(secretPlayerId(again))!, 'igl', lookup);
    expect(() => pickSecretPlayer(one, 'fun', 'Vargão Academy', again, lookup(secretPlayerId(again))!, 'igl', lookup)).toThrow();
  });

  it('keeps a pre-filled alias through the deterministic offers and the autocomplete', () => {
    const draft = withSecretPlayers(emptyDraftState(), 'fun', 'Caiozera', 'Org', lookup);
    const first = drawDraftTeam('room', 'p1', 'fun', { ...draft, style: 'balanced' }, teams, players);
    const second = drawDraftTeam('room', 'p1', 'fun', { ...draft, style: 'balanced' }, teams, players);
    expect(second.rolledTeamId).toBe(first.rolledTeamId);
    expect(first.rolledTeamId).not.toBe(drawDraftTeam('room', 'p1', 'fun', { ...emptyDraftState(), style: 'balanced' }, teams, players).rolledTeamId);
    const completed = autocompleteDraft('room', 'p1', 'fun', draft, teams, players, lookup);
    expect(completed.lineup).toHaveLength(5);
    expect(completed.lineup[0].playerId).toBe('secret-caiozera');
    expect(new Set(completed.lineup.map((pick) => pick.playerId)).size).toBe(5);
  });
});
