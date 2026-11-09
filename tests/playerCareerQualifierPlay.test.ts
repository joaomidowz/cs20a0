// tests/playerCareerQualifierPlay.test.ts
// A qualificatória jogada no motor (plano 04): quartas em MD1, passou ou não; não é título, nem MVP, nem média.
import { afterEach, describe, expect, it } from 'vitest';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, recentRating, recordEventResult, startSeason, trophyCase, type CalendarEntry, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { simulateSceneEvent } from '../src/lib/game/playerCareer/live';
import { clearWorldCache } from '../src/lib/game/playerCareer/circuit';
import { entryKind } from '../src/lib/game/playerCareer/qualifiers';

function seasonAt(seed: string, find: (org: (typeof sceneOrgs)[number]) => boolean): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find(find)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
}

const qualifiersOf = (state: PlayerCareerState) => (state.calendar ?? []).filter((entry) => entryKind(entry) === 'qualifier');

/** Marca como folga tudo o que vem antes da entrada: ela vira a próxima do calendário. */
function nextIs(state: PlayerCareerState, index: number): PlayerCareerState {
  const folga = (entry: CalendarEntry): TournamentResult => ({ name: entry.name, placement: 'Folga', rating: 0, seriesWins: 0, seriesLosses: 0, skipped: true });
  return { ...state, calendar: state.calendar!.map((entry) => (entry.index < index ? { ...entry, status: 'PLAYED' as const, result: folga(entry) } : entry)) };
}

afterEach(() => clearWorldCache());

describe('a qualificatória jogada', () => {
  it('passou ou não; não é título, nem MVP, nem média; a chave fica', () => {
    const base = seasonAt('qual-engine', (org) => org.level === 2 && org.region === 'eu');
    const entry = qualifiersOf(base)[0];
    const state = nextIs(base, entry.index);
    const { result } = simulateSceneEvent(state, entry.index);
    expect(['Classificado', 'Eliminado']).toContain(result.placement);
    expect(result.skipped).toBe(true);
    expect(result.mvp).toBeUndefined();
    expect(result.plays).toBeUndefined();
    expect(result.highlights).toBeUndefined();
    expect(result.placements).toHaveLength(8);
    const recorded = recordEventResult(state, entry.index, { ...result, placement: result.placement });
    expect(trophyCase(recorded).total).toBe(0);
    expect(recentRating(recorded)).toBeNull();
  });
});
