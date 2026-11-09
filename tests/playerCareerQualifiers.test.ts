// tests/playerCareerQualifiers.test.ts
// Qualificatórias no calendário (plano 04): abaixo do tier do campeonato do mundo, a qualificatória da sua região entra
// no calendário; passou, o campeonato entra na temporada; convidado pelo ranking, ela se resolve sozinha.
import { afterEach, describe, expect, it } from 'vitest';
import { EVENT_RANGE } from '../src/lib/game/playerCareer/calendar';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { acceptMove, addExtraEvent, createPlayerCareer, recordEventResult, startSeason, type CalendarEntry, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { trainingWindowOf } from '../src/lib/game/playerCareer/squad';
import { clearWorldCache, worldEventByKey, worldFieldOf, worldInvites } from '../src/lib/game/playerCareer/circuit';
import {
  EXTRA_QUALIFIERS, applyQualifierResult, entryKind, needsQualifierFor, qualifierEntriesFor, qualifierField, qualifierRegions,
  resolveInvitedQualifier, userQualifierRegion
} from '../src/lib/game/playerCareer/qualifiers';

function seasonAt(seed: string, find: (org: (typeof sceneOrgs)[number]) => boolean): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find(find)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
}

const qualifiersOf = (state: PlayerCareerState) => (state.calendar ?? []).filter((entry) => entryKind(entry) === 'qualifier');
const mainOf = (state: PlayerCareerState, entry: CalendarEntry) => worldEventByKey(state, entry.qualifiesFor!)!;

/** Marca como folga tudo o que vem antes da entrada: ela vira a próxima do calendário. */
function nextIs(state: PlayerCareerState, index: number): PlayerCareerState {
  const folga = (entry: CalendarEntry): TournamentResult => ({ name: entry.name, placement: 'Folga', rating: 0, seriesWins: 0, seriesLosses: 0, skipped: true });
  return { ...state, calendar: state.calendar!.map((entry) => (entry.index < index ? { ...entry, status: 'PLAYED' as const, result: folga(entry) } : entry)) };
}

/** Resultado da sua qualificatória com a chave dela: você no `place`, os 7 rivais da região depois. */
function qualifierResult(state: PlayerCareerState, entry: CalendarEntry, place: number, placement: 'Classificado' | 'Eliminado'): TournamentResult {
  const event = mainOf(state, entry);
  const rivals = qualifierField(state, event, userQualifierRegion(state), true).filter((orgId) => orgId !== state.orgId);
  const places = [1, 2, 3, 3, 5, 5, 5, 5];
  const order = [...rivals.slice(0, place - 1), state.orgId, ...rivals.slice(place - 1)];
  return {
    name: entry.name, placement, rating: 1.05, seriesWins: 1, seriesLosses: 1, skipped: true, tier: entry.tier, orgId: state.orgId, month: entry.month,
    placements: order.map((orgId, position) => ({ orgId, place: places[position] }))
  };
}

afterEach(() => clearWorldCache());

describe('qualificatórias no calendário', () => {
  it('Tier A (nível 2) ganha qualificatória de um Tier S e de Major do mundo, na região dele, no mês do campeonato', () => {
    const state = seasonAt('qual-tier-b', (org) => org.level === 2 && org.region === 'sa');
    const qualifiers = qualifiersOf(state);
    expect(qualifiers.length).toBeGreaterThanOrEqual(2);
    expect(qualifiers.some((entry) => mainOf(state, entry).tier === 'S')).toBe(true);
    expect(qualifiers.some((entry) => mainOf(state, entry).tier === 'Major')).toBe(true);
    for (const entry of qualifiers) {
      expect(entry.name).toContain('qualificatória América do Sul');
      expect(entry.month).toBe(mainOf(state, entry).month);
      expect(entry.format).toBe('bracket8');
      expect(qualifierRegions(mainOf(state, entry)).sa).toBeGreaterThan(0);
    }
    expect(state.calendar!.map((entry) => entry.index)).toEqual(state.calendar!.map((_, index) => index));
    const months = state.calendar!.map((entry) => entry.month ?? 0);
    expect(months).toEqual([...months].sort((a, b) => a - b));
    expect(state.calendar!.some((entry) => entryKind(entry) === 'event' && entry.format === 'major')).toBe(false);
  });

  it('Nível 1 (Tier S sem o selo Elite): Tier S e Major do calendário com vaga para a região viram qualificatória, sem mudar a quantidade', () => {
    const state = seasonAt('qual-tier-a', (org) => org.level === 1 && org.region === 'eu');
    const [min, max] = EVENT_RANGE[1];
    expect(state.calendar!.length).toBeGreaterThanOrEqual(min);
    expect(state.calendar!.length).toBeLessThanOrEqual(max);
    expect(qualifiersOf(state).length).toBeGreaterThan(0);
    expect(qualifiersOf(state).every((entry) => ['S', 'Major'].includes(mainOf(state, entry).tier))).toBe(true);
    expect(state.calendar!.filter((entry) => entryKind(entry) === 'event').some((entry) => needsQualifierFor(state, entry))).toBe(false);
  });

  it('Tier S Elite (nível 0) não ganha qualificatória; as a mais respeitam o teto do nível', () => {
    expect(qualifiersOf(seasonAt('qual-tier-s', (org) => org.level === 0))).toHaveLength(0);
    for (const level of [2, 3, 4]) {
      const state = seasonAt(`qual-extra-${level}`, (org) => org.level === level);
      const [, max] = EVENT_RANGE[level];
      expect(state.calendar!.length).toBeLessThanOrEqual(max + EXTRA_QUALIFIERS[level]);
    }
    expect(qualifierEntriesFor({ ...createPlayerCareer({ nick: 'x', country: 'Brazil', role: 'igl', seed: 'qual-lan' }), calendar: [] }, 1)).toEqual([]);
  });

  it('a qualificatória divide a semana com o campeonato seguinte', () => {
    const base = seasonAt('qual-week', (org) => org.level === 2 && org.region === 'eu');
    const entry = qualifiersOf(base)[0];
    const state = nextIs(base, entry.index);
    const following = state.calendar!.find((candidate) => candidate.index > entry.index && entryKind(candidate) === 'event');
    expect(trainingWindowOf(state)).toBe(`1:${following?.index ?? entry.index}`);
  });
});

describe('passar ou não passar', () => {
  it('passou: o campeonato entra logo depois e, no mundo, você entra pela qualificatória', () => {
    const state = seasonAt('qual-pass', (org) => org.level === 2 && org.region === 'eu');
    const entry = qualifiersOf(state)[0];
    const played = recordEventResult(state, entry.index, qualifierResult(state, entry, 1, 'Classificado'));
    const after = applyQualifierResult(played, entry.index);
    const event = mainOf(state, entry);
    const inserted = after.calendar![entry.index + 1];
    expect(inserted.name).toBe(`${event.name} 2026`);
    expect(inserted).toMatchObject({ status: 'UPCOMING', kind: 'event', tier: event.tier, format: event.format });
    expect(after.calendar).toHaveLength(state.calendar!.length + 1);
    expect(after.calendar!.map((item) => item.index)).toEqual(after.calendar!.map((_, index) => index));
    expect(worldFieldOf(after, event).find((slot) => slot.orgId === state.orgId)?.via).toBe('qualifier');
    expect(applyQualifierResult(after, entry.index)).toBe(after);
  });

  it('não passou: o calendário fica como estava e o mundo não te chama', () => {
    const state = seasonAt('qual-fail', (org) => org.level === 2 && org.region === 'eu');
    const entry = qualifiersOf(state)[0];
    const played = recordEventResult(state, entry.index, qualifierResult(state, entry, 5, 'Eliminado'));
    expect(applyQualifierResult(played, entry.index)).toBe(played);
    expect(played.calendar!.map((item) => item.name)).toEqual(state.calendar!.map((item) => item.name));
    expect(worldFieldOf(played, mainOf(state, entry)).some((slot) => slot.orgId === state.orgId)).toBe(false);
  });

  it('convidado pelo ranking do mês anterior: a qualificatória se resolve sozinha', () => {
    const base = seasonAt('qual-invited', (org) => org.name === 'Aurora');
    const entry = qualifiersOf(base).find((candidate) => mainOf(base, candidate).format === 'swiss16')!;
    const state = nextIs(base, entry.index);
    expect(worldInvites(state, mainOf(state, entry), true).invited).toContain(state.orgId);
    const resolved = resolveInvitedQualifier(state);
    expect(resolved.calendar![entry.index]).toMatchObject({ status: 'PLAYED', result: { placement: 'Convidado', skipped: true } });
    expect(resolved.calendar![entry.index + 1].name).toBe(`${mainOf(state, entry).name} 2026`);
    expect(resolveInvitedQualifier(resolved)).toBe(resolved);
  });
});

describe('save e trocas', () => {
  it('ida e volta pelo JSON do save: kind e qualifiesFor ficam, e passar ainda insere o campeonato', () => {
    const state = seasonAt('qual-save', (org) => org.level === 2 && org.region === 'eu');
    const loaded = JSON.parse(JSON.stringify(state)) as PlayerCareerState;
    expect(loaded.calendar).toEqual(state.calendar);
    const entry = qualifiersOf(loaded)[0];
    const after = applyQualifierResult(recordEventResult(loaded, entry.index, qualifierResult(loaded, entry, 1, 'Classificado')), entry.index);
    expect(after.calendar![entry.index + 1].kind).toBe('event');
  });

  it('save antigo sem kind: tudo é campeonato', () => {
    const state = seasonAt('qual-old', (org) => org.level === 0);
    const old: PlayerCareerState = { ...state, calendar: state.calendar!.map(({ kind: _kind, qualifiesFor: _for, ...entry }) => entry) };
    expect(old.calendar!.every((entry) => entryKind(entry) === 'event')).toBe(true);
    expect(trainingWindowOf(old)).toBe('1:0');
    expect(qualifiersOf(old)).toHaveLength(0);
  });

  it('troca no meio da temporada: as qualificatórias do time novo só nos meses que faltam', () => {
    const base = seasonAt('qual-move', (org) => org.level === 0);
    const played = { ...base, calendar: base.calendar!.map((entry) => (entry.index < 3 ? { ...entry, status: 'PLAYED' as const, result: { name: entry.name, placement: 'Quartas', rating: 1, seriesWins: 1, seriesLosses: 1, orgId: base.orgId, month: entry.month } } : entry)) };
    const lastMonth = Math.max(...played.calendar!.slice(0, 3).map((entry) => entry.month ?? 0));
    const target = sceneOrgs.find((org) => org.level === 2 && org.region === 'eu')!;
    const moved = acceptMove({ ...played, pendingMove: { kind: 'poach', average: 1.2, reason: 'teste', offers: [{ orgId: target.id, orgName: target.name, orgLevel: 2, salaryUsd: 1000 }] } }, target.id);
    expect(moved.orgId).toBe(target.id);
    expect(moved.calendar!.slice(0, 3)).toEqual(played.calendar!.slice(0, 3));
    expect(qualifiersOf(moved).every((entry) => (entry.month ?? 0) > lastMonth)).toBe(true);
    expect(moved.calendar!.map((entry) => entry.index)).toEqual(moved.calendar!.map((_, index) => index));
  });

  it('"aceitar todos os eventos" nunca põe direto um campeonato que pede qualificatória', () => {
    let state = seasonAt('qual-extra-event', (org) => org.level === 1 && org.region === 'eu');
    for (let tries = 0; tries < 4; tries += 1) {
      const next = addExtraEvent(state);
      if (!next.name) break;
      expect(needsQualifierFor(next.state, next.state.calendar!.at(-1)!)).toBe(false);
      state = next.state;
    }
  });
});
