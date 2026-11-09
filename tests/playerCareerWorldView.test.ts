// tests/playerCareerWorldView.test.ts
// Tela Mundo em dados puros (worldView.ts): o relógio da temporada, os resultados do mundo sem spoiler, os
// campeonatos, o ranking de times, as trocas e o top de jogadores parcial.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, orgOf, startSeason, type CalendarEntry, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { careerClock, careerResults, eventKey, fieldLabel, orgIdOfName, seenWorldResults, worldEventsView, type WorldSource } from '../src/lib/game/playerCareer/worldView';
import type { WorldEvent, WorldEventResult } from '../src/lib/game/playerCareer/circuit';

const SEED = 'mundo-1';
const TIER_C = sceneOrgs.find((org) => org.level === 3)!.id;

function seasonAt(orgId: string, seed = SEED): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed });
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken: [] });
}

const entryAt = (index: number, month: number, status: CalendarEntry['status'], extra: Partial<CalendarEntry> = {}): CalendarEntry =>
  ({ index, name: `Etapa teste ${index}`, status, month, tier: 'C', format: 'bracket8', ...extra });

const event = (season: number, index: number, month: number, tier: WorldEvent['tier'] = 'S'): WorldEvent =>
  ({ key: `${season}:${index}`, season, index, name: `Mundo Teste ${season}-${index}`, tier, format: 'bracket8', month, invites: 6, qualifierSlots: 2 });

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

/** Cache falso do circuito: anota cada leitura de resultado (o que não chegou no calendário não pode ser lido). */
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

describe('relógio da temporada', () => {
  it('sem calendário é pré-temporada; tudo jogado é dezembro', () => {
    expect(careerClock({ seasonNumber: 3, calendar: null, history: [] })).toEqual({ season: 3, month: 0 });
    expect(careerClock({ seasonNumber: 3, calendar: [entryAt(0, 2, 'PLAYED'), entryAt(1, 7, 'PLAYED')], history: [] })).toEqual({ season: 3, month: 12 });
  });

  it('o mês anterior ao próximo campeonato (o relógio do circuito): o mundo do mês do seu próximo ainda não aconteceu', () => {
    expect(careerClock({ seasonNumber: 1, calendar: [entryAt(0, 1, 'PLAYED'), entryAt(1, 3, 'PLAYED'), entryAt(2, 6, 'UPCOMING'), entryAt(3, 9, 'UPCOMING')], history: [] }).month).toBe(5);
    expect(careerClock({ seasonNumber: 1, calendar: [entryAt(0, 2, 'UPCOMING'), entryAt(1, 5, 'UPCOMING')], history: [] }).month).toBe(1);
    expect(careerClock({ seasonNumber: 1, calendar: [entryAt(0, 4, 'PLAYED'), entryAt(1, 4, 'UPCOMING')], history: [] }).month).toBe(3);
  });
});

describe('resultados do mundo sem spoiler', () => {
  it('a temporada passada inteira, a atual só até o mês, e o que não chegou nem é lido', () => {
    const state: PlayerCareerState = { ...seasonAt(TIER_C), seasonNumber: 2, year: 2027, calendar: [entryAt(0, 3, 'PLAYED'), entryAt(1, 7, 'UPCOMING')] };
    const past = event(1, 0, 11);
    const early = event(2, 0, 2);
    const now = event(2, 1, 6);
    const later = event(2, 2, 8);
    const pending = event(2, 3, 5);
    const source = sourceOf([
      [past, result(past, 'mouz-2026', 'spirit-2026')],
      [early, result(early, 'spirit-2026', 'mouz-2026')],
      [now, result(now, 'mouz-2026', 'spirit-2026')],
      [later, result(later, 'spirit-2026', 'mouz-2026')],
      [pending, null]
    ]);
    expect(careerClock(state)).toEqual({ season: 2, month: 6 });
    expect(seenWorldResults(state, source).map((item) => item.key)).toEqual(['1:0', '2:0', '2:1']);
    expect(source.read).not.toContain('2:2');
  });

  it('campeonato seu com campeão fica com o seu resultado; o que você não jogou (fora) volta a contar', () => {
    const mine: TournamentResult = { name: 'Mundo Teste 1-0', placement: 'Semis', rating: 1, seriesWins: 2, seriesLosses: 1, tier: 'S', champion: 'MOUZ' };
    const out: TournamentResult = { name: 'Mundo Teste 1-2', placement: 'Não classificado', rating: 0, seriesWins: 0, seriesLosses: 0, tier: 'S', skipped: true };
    const state: PlayerCareerState = { ...seasonAt(TIER_C), calendar: [entryAt(0, 3, 'PLAYED', { result: mine }), entryAt(1, 3, 'PLAYED', { result: out }), entryAt(2, 9, 'UPCOMING')] };
    const covered = event(1, 0, 3);
    const other = event(1, 1, 2);
    const skipped = event(1, 2, 3);
    const source = sourceOf([
      [covered, { ...result(covered, 'mouz-2026', 'spirit-2026'), userPlayed: true }],
      [other, result(other, 'spirit-2026', 'mouz-2026')],
      [skipped, result(skipped, 'spirit-2026', 'mouz-2026')]
    ]);
    expect(seenWorldResults(state, source).map((item) => item.key)).toEqual(['1:1', '1:2']);
    expect(source.read).not.toContain('1:0');
  });
});

describe('apoio da tela', () => {
  it('nome do time vira id e os seus resultados saem com temporada e time', () => {
    expect(orgIdOfName('Natus Vincere')).toBe('natus-vincere-2026');
    expect(orgIdOfName('natus vincere')).toBe('natus-vincere-2026');
    expect(orgIdOfName('Time que não existe')).toBeNull();
    const played: TournamentResult = { name: 'Etapa teste 0', placement: 'Campeão', rating: 1.1, seriesWins: 3, seriesLosses: 0, tier: 'C' };
    const state: PlayerCareerState = { ...seasonAt(TIER_C), calendar: [entryAt(0, 2, 'PLAYED', { result: played }), entryAt(1, 5, 'UPCOMING')] };
    expect(careerResults(state)).toEqual([{ season: 1, orgId: TIER_C, result: played }]);
    // O calendário guarda o nome com o ano; o circuito do mundo, sem: a chave é a mesma.
    expect(eventKey(1, 'IEM Cologne Major 2026')).toBe(eventKey(1, 'IEM Cologne Major'));
    expect(eventKey(2, 'IEM Cologne Major 2026')).not.toBe(eventKey(2, 'IEM Cologne Major'));
  });
});

describe('campeonatos do mundo', () => {
  it('já jogados com pódio, calculando sem travar e próximos sem resultado; só Major, Tier S e Tier A', () => {
    const state: PlayerCareerState = { ...seasonAt(TIER_C), calendar: [entryAt(0, 4, 'PLAYED'), entryAt(1, 9, 'UPCOMING')] };
    const mouz = sceneOrgById.get('mouz-2026')!;
    const spirit = sceneOrgById.get('spirit-2026')!;
    const tierS = event(1, 0, 2, 'S');
    const tierA = event(1, 1, 6, 'A');
    const major = event(1, 2, 10, 'Major');
    const tierB = event(1, 3, 3, 'B');
    const source = sourceOf([
      [tierS, result(tierS, mouz.id, spirit.id, 'jL')],
      [tierA, null],
      [major, result(major, spirit.id, mouz.id, 'donk')],
      [tierB, result(tierB, spirit.id, mouz.id)]
    ]);
    const view = worldEventsView(state, source);
    expect(view).toMatchObject({ season: 1, year: 2026, month: 8, computing: 1 });
    expect(view.done.map((row) => [row.key, row.status])).toEqual([['1:1', 'computing'], ['1:0', 'done']]);
    expect(view.done[1]).toMatchObject({
      tierLabel: 'Tier S',
      monthLabel: 'Fev',
      mine: null,
      champion: { orgId: mouz.id, name: mouz.name, mine: false },
      runnerUp: { orgId: spirit.id, name: spirit.name },
      mvp: { nick: 'jL', team: mouz.name, rating: 1.31, you: false }
    });
    expect(view.upcoming).toHaveLength(1);
    expect(view.upcoming[0]).toMatchObject({ key: '1:2', tierLabel: 'Major', status: 'upcoming', champion: null, runnerUp: null, mvp: null, field: '8 times: 6 convidados pelo ranking e 2 da qualificatória' });
    expect(source.read).not.toContain('1:2');
    expect(source.read).not.toContain('1:3');
  });

  it('os seus campeonatos aparecem marcados; o que você ainda vai jogar fica em Próximos', () => {
    const base = seasonAt(TIER_C);
    const myName = orgOf(TIER_C).name;
    const mouz = sceneOrgById.get('mouz-2026')!.name;
    const played: TournamentResult = {
      name: 'Mundo Teste 1-0', placement: 'Vice', rating: 1.05, seriesWins: 3, seriesLosses: 1, tier: 'S', champion: mouz,
      mvp: { nick: 'jL', team: mouz, rating: 1.28 },
      bracket: [{ phase: 'final', a: mouz, b: myName, scoreA: 2, scoreB: 1, aWon: true, you: 'b' }]
    };
    const state: PlayerCareerState = {
      ...base,
      calendar: [
        entryAt(0, 2, 'PLAYED', { name: 'Mundo Teste 1-0', tier: 'S', result: played }),
        entryAt(1, 2, 'UPCOMING', { name: 'Mundo Teste 1-1', tier: 'A' }),
        entryAt(2, 5, 'UPCOMING', { name: 'Qualificatória teste', kind: 'qualifier', qualifiesFor: '1:2' })
      ]
    };
    const source = sourceOf([[event(1, 0, 2, 'S'), null], [event(1, 1, 2, 'A'), null], [event(1, 2, 7, 'S'), null]]);
    const view = worldEventsView(state, source);
    expect(view.month).toBe(1); // relógio do circuito: o mês anterior ao seu próximo campeonato; o seu jogado aparece mesmo assim
    expect(view.done).toHaveLength(1);
    expect(view.done[0]).toMatchObject({
      key: '1:0', status: 'done', mine: 'event', myPlacement: 'Vice',
      champion: { orgId: 'mouz-2026', mine: false },
      runnerUp: { orgId: TIER_C, name: myName, mine: true },
      mvp: { nick: 'jL', you: false }
    });
    expect(view.upcoming.map((row) => [row.key, row.mine])).toEqual([['1:1', 'event'], ['1:2', 'qualifier']]);
    expect(source.read).toEqual(['1:0']);
  });

  it('a frase da chave diz convidados e vagas de qualificatória', () => {
    expect(fieldLabel({ invites: 6, qualifierSlots: 2 })).toBe('8 times: 6 convidados pelo ranking e 2 da qualificatória');
    expect(fieldLabel({ invites: 8, qualifierSlots: 0 })).toBe('8 times convidados pelo ranking');
  });
});
