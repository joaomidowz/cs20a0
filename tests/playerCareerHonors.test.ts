// tests/playerCareerHonors.test.ts
// Símbolos das cartas (honors.ts): títulos, MVPs e Majors de cada jogador, somando os seus campeonatos e o circuito do
// mundo que já aconteceu, sem spoiler, sem contar duas vezes, e com o título preso ao nick (quem troca de time leva).
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, orgOf, recordEventResult, startSeason, trophyCase, type CalendarEntry, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { memberNick, rosterBySlot, sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { SLOTS } from '../src/lib/game/playerCareer/live';
import { matesOf } from '../src/lib/game/playerCareer/squad';
import { orgIn, sceneWorld } from '../src/lib/game/playerCareer/world';
import { honorsIndex, honorsLabel, playerHonors } from '../src/lib/game/playerCareer/honors';
import type { WorldSource } from '../src/lib/game/playerCareer/worldView';
import type { WorldEvent, WorldEventResult } from '../src/lib/game/playerCareer/circuit';

const SEED = 'honors-1';
const TIER_C = sceneOrgs.find((org) => org.level === 3)!.id;
const lineup = (season: number, orgId: string) => rosterBySlot(orgIn(SEED, season, orgId)!, SLOTS).flatMap((member) => (member ? [memberNick(member)] : []));
const lower = (nicks: string[]) => nicks.map((nick) => nick.toLowerCase());

function seasonAt(orgId: string): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed: SEED });
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken: [] });
}

const entryAt = (index: number, month: number, status: CalendarEntry['status']): CalendarEntry =>
  ({ index, name: `Etapa teste ${index}`, status, month, tier: 'C', format: 'bracket8' });

const event = (season: number, index: number, month: number, tier: WorldEvent['tier'] = 'S'): WorldEvent =>
  ({ key: `${season}:${index}`, season, index, name: `Mundo Teste ${season}-${index}`, tier, format: 'bracket8', month, invites: 8, qualifierSlots: 0 });

const result = (base: WorldEvent, champion: string, runnerUp: string, mvp: string | null = null): WorldEventResult => ({
  key: base.key,
  season: base.season,
  name: base.name,
  tier: base.tier,
  month: base.month,
  field: [{ orgId: champion, via: 'invite' }, { orgId: runnerUp, via: 'invite' }],
  placements: [{ orgId: champion, place: 1 }, { orgId: runnerUp, place: 2 }],
  champion,
  runnerUp,
  mvp: mvp ? { nick: mvp, orgId: champion, rating: 1.31 } : null,
  topPlayers: mvp ? [{ nick: mvp, orgId: champion, rating: 1.31 }] : [],
  userPlayed: false
});

function sourceOf(pairs: Array<[WorldEvent, WorldEventResult | null]>): WorldSource & { read: string[] } {
  const read: string[] = [];
  return {
    read,
    events: (season) => pairs.filter(([item]) => item.season === season).map(([item]) => item),
    result: (item) => {
      read.push(item.key);
      return pairs.find(([candidate]) => candidate.key === item.key)?.[1] ?? null;
    }
  };
}

const won = (entry: CalendarEntry, champion: string, extra: Partial<TournamentResult> = {}): TournamentResult =>
  ({ name: entry.name, placement: 'Campeão', rating: 1.1, seriesWins: 3, seriesLosses: 0, tier: entry.tier, champion, ...extra });

describe('honras dos seus campeonatos', () => {
  it('você, os parceiros e o time campeão ganham título; MVP e Major contam; você bate com a sala de troféus', () => {
    let state = seasonAt('vitality-2026');
    const myName = orgOf(state.orgId).name;
    const navi = sceneOrgById.get('natus-vincere-2026')!;
    const naviFive = lineup(1, navi.id);
    for (const entry of state.calendar!) {
      const mine = entry.index % 2 === 0;
      const mvp = entry.index === 0 ? { nick: 'tester', team: myName, rating: 1.4, you: true } : entry.index === 1 ? { nick: naviFive[0], team: navi.name, rating: 1.35 } : undefined;
      state = recordEventResult(state, entry.index, won(entry, mine ? myName : navi.name, { placement: mine ? 'Campeão' : 'Semis', ...(mvp ? { mvp } : {}) }));
    }
    const trophies = trophyCase(state);
    const naviEvents = state.calendar!.filter((entry) => entry.index % 2 === 1);
    expect(trophies.mvps).toBe(1);
    expect(playerHonors(state, 'TESTER')).toEqual({ titles: trophies.total, mvps: trophies.mvps, majors: trophies.byTier.Major });
    const mate = matesOf(state)[0].player.nickname!;
    expect(playerHonors(state, mate)).toEqual({ titles: trophies.total, mvps: 0, majors: trophies.byTier.Major });
    expect(playerHonors(state, naviFive[0])).toEqual({ titles: naviEvents.length, mvps: 1, majors: naviEvents.filter((entry) => entry.tier === 'Major').length });
    expect(playerHonors(state, naviFive[4]).titles).toBe(naviEvents.length);
    expect(playerHonors(state, 'ninguém')).toEqual({ titles: 0, mvps: 0, majors: 0 });
  });

  it('o seu campeonato não conta duas vezes quando o mundo também guardou o resultado', () => {
    let state = seasonAt('vitality-2026');
    const entry = state.calendar![0];
    state = recordEventResult(state, entry.index, won(entry, orgOf(state.orgId).name));
    const same: WorldEvent = { ...event(1, 0, entry.month ?? 1), name: entry.name };
    const source = sourceOf([[same, { ...result(same, state.orgId, 'spirit-2026'), userPlayed: true }]]);
    expect(honorsIndex(state, source).get('tester')).toEqual({ titles: 1, mvps: 0, majors: entry.tier === 'Major' ? 1 : 0 });
    expect(source.read).not.toContain(same.key);
  });
});

describe('honras do circuito do mundo', () => {
  it('título do mundo vale para os 5 do campeão; MVP e Major contam', () => {
    const base = seasonAt(TIER_C);
    const state: PlayerCareerState = { ...base, calendar: base.calendar!.map((entry) => ({ ...entry, status: 'PLAYED' as const })) };
    const mouzFive = lineup(1, 'mouz-2026');
    const tierS = event(1, 0, 2);
    const major = event(1, 1, 6, 'Major');
    const index = honorsIndex(state, sourceOf([
      [tierS, result(tierS, 'mouz-2026', 'spirit-2026', mouzFive[1])],
      [major, result(major, 'mouz-2026', 'vitality-2026', mouzFive[1])]
    ]));
    for (const nick of lower(mouzFive)) expect(index.get(nick)).toMatchObject({ titles: 2, majors: 1 });
    expect(index.get(mouzFive[1].toLowerCase())?.mvps).toBe(2);
    expect(index.get(mouzFive[0].toLowerCase())?.mvps).toBe(0);
    expect(index.get(lineup(1, 'spirit-2026')[0].toLowerCase())).toBeUndefined();
  });

  it('sem spoiler: o campeonato de um mês que você ainda não alcançou não conta e nem é lido', () => {
    const state: PlayerCareerState = { ...seasonAt(TIER_C), calendar: [entryAt(0, 2, 'PLAYED'), entryAt(1, 6, 'UPCOMING'), entryAt(2, 9, 'UPCOMING')] };
    const past = event(1, 0, 4);
    const future = event(1, 1, 8);
    const source = sourceOf([[past, result(past, 'mouz-2026', 'spirit-2026')], [future, result(future, 'spirit-2026', 'mouz-2026')]]);
    const index = honorsIndex(state, source);
    expect(index.get(lineup(1, 'mouz-2026')[0].toLowerCase())?.titles).toBe(1);
    expect(index.get(lineup(1, 'spirit-2026')[0].toLowerCase())).toBeUndefined();
    expect(source.read).not.toContain(future.key);
  });

  it('quem trocou de time leva os títulos junto', () => {
    const move = sceneWorld(SEED, 2).transfers.find((transfer) => lower(lineup(1, transfer.fromId)).includes(transfer.nick.toLowerCase()));
    expect(move).toBeDefined();
    const first = event(1, 0, 3);
    const state: PlayerCareerState = { ...seasonAt(TIER_C), seasonNumber: 2, year: 2027, calendar: null };
    const index = honorsIndex(state, sourceOf([[first, result(first, move!.fromId, move!.toId)]]));
    expect(index.get(move!.nick.toLowerCase())?.titles).toBe(1);
    expect(lower(lineup(2, move!.fromId))).not.toContain(move!.nick.toLowerCase());
  });
});

describe('índice e rótulo', () => {
  it('o índice é montado uma vez por estado do mundo', () => {
    const state = seasonAt('vitality-2026');
    const source = sourceOf([]);
    const first = honorsIndex(state, source);
    expect(honorsIndex(state, source)).toBe(first);
    const entry = state.calendar![0];
    const next = recordEventResult(state, entry.index, won(entry, orgOf(state.orgId).name));
    const second = honorsIndex(next, source);
    expect(second).not.toBe(first);
    expect(second.get('tester')?.titles).toBe(1);
  });

  it('rótulo acessível dos símbolos', () => {
    expect(honorsLabel({ titles: 3, mvps: 1, majors: 0 })).toBe('3 títulos, 1 MVP');
    expect(honorsLabel({ titles: 1, mvps: 0, majors: 1 })).toBe('1 título (1 Major)');
    expect(honorsLabel({ titles: 2, mvps: 2, majors: 2 })).toBe('2 títulos (2 Majors), 2 MVPs');
    expect(honorsLabel({ titles: 0, mvps: 0, majors: 0 })).toBe('');
  });
});
