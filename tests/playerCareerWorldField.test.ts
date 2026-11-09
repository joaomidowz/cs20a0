// tests/playerCareerWorldField.test.ts
// Os seus campeonatos de Tier S, Tier A e o Major são os do circuito do mundo (plano 03): a chave sai do ranking do mês
// anterior e fica congelada enquanto você joga.
import { afterEach, describe, expect, it } from 'vitest';
import * as live from '../src/lib/game/playerCareer/live';
import { eventTeams, majorEntryStage, sceneEventField, sceneEventOpponents } from '../src/lib/game/playerCareer/live';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, skipEvent, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { circuitClock, clearWorldCache, storeWorldResult, userEntryOf, worldEventOfEntry, worldEventsOf, worldFieldOf, type WorldEvent, type WorldEventResult } from '../src/lib/game/playerCareer/circuit';
import { freezeRanking, teamRankOf } from '../src/lib/game/playerCareer/ranking';

function career(seed: string, level: number): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === level)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
}

function fakeResult(event: WorldEvent, placements: Array<{ orgId: string; place: number }>): WorldEventResult {
  return {
    key: event.key, season: event.season, name: event.name, tier: event.tier, month: event.month,
    field: placements.map((entry) => ({ orgId: entry.orgId, via: 'invite' as const })), placements,
    champion: placements[0]?.orgId ?? '', runnerUp: '', mvp: null, topPlayers: [], userPlayed: false
  };
}

afterEach(() => clearWorldCache());

describe('o seu campeonato do mundo usa a chave do circuito', () => {
  it('Tier S: os rivais são a chave do mundo sem você, na ordem do ranking', () => {
    const state = career('field-world', 0);
    const index = state.calendar!.findIndex((entry) => entry.format !== 'major');
    const event = worldEventOfEntry(state, state.calendar![index])!;
    const expected = worldFieldOf(state, event).map((slot) => slot.orgId).filter((orgId) => orgId !== state.orgId);
    expect(sceneEventOpponents(state, index).picked.map((org) => org.id)).toEqual(expected);
    expect(sceneEventField(state, index)).toHaveLength(event.invites + event.qualifierSlots);
  });

  it('Major pela chave do mundo: Tier S no Stage 3, Challenger sem vaga; a tela põe você no seu stage', () => {
    expect(majorEntryStage(career('field-major-c', 3))).toBeNull();
    const tierS = career('field-major-s', 0);
    const index = tierS.calendar!.findIndex((entry) => entry.format === 'major');
    const stage = majorEntryStage(tierS, index);
    expect(stage).toBe('stage3');
    const groups = eventTeams(tierS, index);
    expect(groups.map((group) => group.teams.length)).toEqual([8, 8, 16]);
    const mine = groups.findIndex((group) => group.teams.some((team) => team.isUser));
    expect(['stage3', 'stage2', 'stage1'][mine]).toBe(stage);
  });

  it('a chave congelada não muda quando chega resultado novo do circuito', () => {
    let state = career('field-frozen', 0);
    for (const entry of state.calendar!.filter((candidate) => (candidate.month ?? 0) < 4 && candidate.format !== 'major')) state = skipEvent(state, entry.index).state;
    const index = state.calendar!.findIndex((entry) => entry.status === 'UPCOMING');
    const clock = circuitClock(state);
    expect(clock.month).toBeGreaterThanOrEqual(3);
    const frozen = freezeRanking(state, index);
    const before = sceneEventOpponents(frozen, index).picked.map((org) => org.id);
    const outsider = sceneOrgs.find((org) => org.level === 3)!.id;
    for (const event of worldEventsOf(state, 1).filter((candidate) => candidate.month <= clock.month && !userEntryOf(state, candidate))) {
      storeWorldResult(state.seed, fakeResult(event, [{ orgId: outsider, place: 1 }]));
    }
    expect(teamRankOf(state, outsider)).toBeLessThanOrEqual(16);
    expect(sceneEventOpponents(frozen, index).picked.map((org) => org.id)).toEqual(before);
  });

  it('os três rankings antigos saíram: sem worldRankOf', () => {
    expect('worldRankOf' in live).toBe(false);
  });
});
