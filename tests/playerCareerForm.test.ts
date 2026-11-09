// tests/playerCareerForm.test.ts
// O arco da carreira (form.ts): blocos de 3 a 4 campeonatos, a fase do time numa cadeia com persistência, o estudo dos
// rivais depois de uma fase dominante, as cartas da semana contra o estudo, o arco congelado no campeonato em andamento
// e o save de ida e volta.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, recordEventResult, startSeason, type CalendarEntry, type PlayerCareerState, type SeasonLog, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { ARC_TUNING, FORM_PHASES, blockRange, blockSizes, formBlockOf, formPhaseOf, formTransition, type FormPhase } from '../src/lib/game/playerCareer/form';

const orgNamed = (name: string) => sceneOrgs.find((candidate) => candidate.name === name)!;
const result = (placement: string): TournamentResult => ({ name: 'Etapa', placement, rating: 1.1, seriesWins: 2, seriesLosses: 1, tier: 'S' });

/** A carreira no time pedido, com a temporada aberta. */
function careerAt(orgId: string, seed: string): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'arco', country: 'Brazil', role: 'rifler', seed });
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken: [], overall: 90, truePotential: 90, age: 24 });
}

/** Troca o calendário por `count` campeonatos de Tier S em mata-mata de 8, todos por jogar. */
function withCalendar(state: PlayerCareerState, count: number): PlayerCareerState {
  const calendar: CalendarEntry[] = Array.from({ length: count }, (_, index) => ({
    index, name: `Etapa ${index + 1}`, status: 'UPCOMING', month: 1 + Math.floor((index * 10) / count), tier: 'S', format: 'bracket8', finalBestOf: 3
  }));
  return { ...state, calendar };
}

/** Fecha a temporada atual com estes resultados e abre a próxima (mesmo time, mesmo overall). */
function withLastSeason(state: PlayerCareerState, placements: string[]): PlayerCareerState {
  const log: SeasonLog = {
    seasonNumber: state.seasonNumber, year: state.year, orgId: state.orgId, orgName: 'time', orgLevel: 0, tournaments: placements.map(result),
    seasonRating: 1.1, overallBefore: state.overall, overallAfter: state.overall, titles: placements.filter((placement) => placement === 'Campeão').length, injury: null, agingNote: null
  };
  return startSeason({ ...state, history: [...state.history, log], seasonNumber: state.seasonNumber + 1, year: state.year + 1, calendar: null });
}

/** Grava resultados a partir de um campeonato. */
function play(state: PlayerCareerState, placements: string[], from = 0): PlayerCareerState {
  return placements.reduce((next, placement, offset) => recordEventResult(next, from + offset, result(placement)), state);
}

const VITALITY = orgNamed('Vitality').id;
const NEUTRAL_YEAR = ['Semis', 'Quartas', 'Vice', 'Semis', 'Quartas', 'Semis'];

describe('blocos da temporada', () => {
  it('de 6 a 16 campeonatos, blocos de 3 ou 4 cobrem o calendário em ordem; calendário curto vira um bloco (ou 3 e 2)', () => {
    for (let count = 1; count <= 16; count += 1) {
      for (const seed of ['a', 'b', 'c']) {
        const sizes = blockSizes(count, seed);
        expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(count);
        if (count >= 6) for (const size of sizes) expect([3, 4]).toContain(size);
        else if (count === 5) expect([...sizes].sort()).toEqual([2, 3]);
        else expect(sizes).toEqual([count]);
      }
    }
    const state = withCalendar(careerAt(VITALITY, 'blocks'), 11);
    const blocks = state.calendar!.map((entry) => formBlockOf(state, entry.index));
    expect(blocks[0]).toBe(0);
    for (let index = 1; index < blocks.length; index += 1) expect(blocks[index] - blocks[index - 1]).toBeGreaterThanOrEqual(0);
    expect(new Set(blocks).size).toBe(3);
    for (let block = 0; block < 3; block += 1) {
      const [start, end] = blockRange(state, block);
      expect(blocks.slice(start, end).every((value) => value === block)).toBe(true);
    }
  });
});

describe('fase do time', () => {
  it('é a mesma para o mesmo save, não muda dentro do bloco e o primeiro bloco da carreira é normal', () => {
    const fresh = withCalendar(careerAt(VITALITY, 'phase-det'), 12);
    expect(formPhaseOf(fresh, 0)).toBe('normal');
    const next = withCalendar(withLastSeason(fresh, NEUTRAL_YEAR), 12);
    const phases = next.calendar!.map((entry) => formPhaseOf(next, entry.index));
    expect(next.calendar!.map((entry) => formPhaseOf(structuredClone(next), entry.index))).toEqual(phases);
    for (const entry of next.calendar!) expect(formPhaseOf(next, entry.index)).toBe(formPhaseOf(next, blockRange(next, formBlockOf(next, entry.index))[0]));
    const seen = new Set<FormPhase>();
    for (let index = 0; index < 60; index += 1) {
      const other = withCalendar(withLastSeason(careerAt(VITALITY, `phase-seed-${index}`), NEUTRAL_YEAR), 12);
      seen.add(formPhaseOf(other, 11));
    }
    expect([...seen].sort()).toEqual([...FORM_PHASES].sort());
  });

  it('a fase tende a continuar no bloco seguinte, como a cadeia manda', () => {
    const chain = formTransition(ARC_TUNING.stay);
    const pairs: Array<[FormPhase, FormPhase]> = [];
    for (let index = 0; index < 400; index += 1) {
      // Sem resultado no calendário: só a cadeia decide (bloco sem jogo não inclina).
      const state = withCalendar(withLastSeason(careerAt(VITALITY, `persist-${index}`), NEUTRAL_YEAR), 12);
      const byBlock = [0, 1, 2].map((block) => formPhaseOf(state, blockRange(state, block)[0]));
      pairs.push([byBlock[0], byBlock[1]], [byBlock[1], byBlock[2]]);
    }
    const same = pairs.filter(([before, after]) => before === after).length / pairs.length;
    const expected = pairs.reduce((sum, [before]) => sum + chain[before][before], 0) / pairs.length;
    expect(Math.abs(same - expected)).toBeLessThan(0.05);
    const altaAfter = (before: FormPhase) => {
      const list = pairs.filter(([phase]) => phase === before);
      return list.filter(([, after]) => after === 'alta').length / Math.max(1, list.length);
    };
    expect(altaAfter('alta')).toBeGreaterThan(altaAfter('normal'));
  });

  it('bloco dominante deixa a fase alta mais provável no bloco seguinte; bloco sem final, a baixa', () => {
    let altaGood = 0;
    let altaPlain = 0;
    let baixaBad = 0;
    let baixaPlain = 0;
    for (let index = 0; index < 300; index += 1) {
      const base = withCalendar(withLastSeason(careerAt(VITALITY, `tilt-${index}`), NEUTRAL_YEAR), 12);
      const [, end] = blockRange(base, 0);
      const good = play(base, Array.from({ length: end }, () => 'Campeão'));
      const bad = play(base, Array.from({ length: end }, () => 'Quartas'));
      if (formPhaseOf(good, end) === 'alta') altaGood += 1;
      if (formPhaseOf(base, end) === 'alta') altaPlain += 1;
      if (formPhaseOf(bad, end) === 'baixa') baixaBad += 1;
      if (formPhaseOf(base, end) === 'baixa') baixaPlain += 1;
    }
    expect(altaGood).toBeGreaterThan(altaPlain);
    expect(baixaBad).toBeGreaterThan(baixaPlain);
  });
});
