// tests/playerCareerForm.test.ts
// O arco da carreira (form.ts): blocos de 3 a 4 campeonatos, a fase do time numa cadeia com persistência, o estudo dos
// rivais depois de uma fase dominante, as cartas da semana contra o estudo, o arco congelado no campeonato em andamento
// e o save de ida e volta.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, ensureCircuitFrom, ensureDraw, recordEventResult, startSeason, type CalendarEntry, type PlayerCareerState, type SeasonLog, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import {
  ARC_TUNING, FORM_PHASES, blockKeyOf, blockRange, blockSizes, eventArcOf, formBlockOf, formPhaseOf, formTransition, rivalStudyOf, studyCardOpen, type FormPhase
} from '../src/lib/game/playerCareer/form';
import { ensureSquad } from '../src/lib/game/playerCareer/squad';
import { AGENDA_BY_ID, agendaAvailable, applyAgenda, blocksLeft, drawAgenda } from '../src/lib/game/playerCareer/agenda';
import { serializeSceneEvent, startSceneEvent, stepSceneEvent } from '../src/lib/game/playerCareer/live';

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

describe('estudo dos rivais', () => {
  it('sobe depois de um bloco dominante, cai quando o time para de ganhar e não existe abaixo do Tier S', () => {
    const base = withCalendar(careerAt(VITALITY, 'study'), 12);
    expect(rivalStudyOf(base, 0)).toBe(0);
    const [, end0] = blockRange(base, 0);
    const [, end1] = blockRange(base, 1);
    const dominant = play(base, Array.from({ length: end0 }, () => 'Campeão'));
    const studied = rivalStudyOf(dominant, end0);
    expect(studied).toBeGreaterThan(0);
    expect(studied).toBeLessThanOrEqual(ARC_TUNING.studyMax);
    const cooled = play(dominant, Array.from({ length: end1 - end0 }, () => 'Quartas'), end0);
    expect(rivalStudyOf(cooled, end1)).toBeLessThan(studied);
    const quiet = withCalendar(withLastSeason(cooled, Array.from({ length: 10 }, () => 'Quartas')), 12);
    expect(rivalStudyOf(quiet, 0)).toBe(0);
    const dynasty = withCalendar(withLastSeason(base, ['Campeão', 'Campeão', 'Vice', 'Campeão', 'Semis', 'Campeão', 'Campeão', 'Vice', 'Campeão', 'Campeão']), 12);
    expect(rivalStudyOf(dynasty, 0)).toBeGreaterThan(0);
    const cct = sceneOrgs.find((candidate) => candidate.level === 4)!;
    const small = withCalendar(careerAt(cct.id, 'study-cct'), 12);
    expect(rivalStudyOf(play(small, Array.from({ length: end0 }, () => 'Campeão')), end0)).toBe(0);
  });

  it('o corte do playbook vale só no bloco dele, e o arco do evento soma a fase e tira o estudo', () => {
    const base = withCalendar(careerAt(VITALITY, 'study-cut'), 12);
    const [, end0] = blockRange(base, 0);
    const studied = play(base, Array.from({ length: end0 }, () => 'Campeão'));
    const raw = rivalStudyOf(studied, end0);
    const cut: PlayerCareerState = { ...studied, studyCut: { key: blockKeyOf(studied, end0), factor: 0.4, cards: ['mudar-playbook'] } };
    expect(rivalStudyOf(cut, end0)).toBe(Math.round(raw * 0.4 * 10) / 10);
    const stale: PlayerCareerState = { ...studied, studyCut: { key: `${studied.seasonNumber - 1}:0`, factor: 0.4, cards: ['mudar-playbook'] } };
    expect(rivalStudyOf(stale, end0)).toBe(raw);
    const arc = eventArcOf(cut, end0);
    expect(arc.study).toBe(rivalStudyOf(cut, end0));
    expect(arc.phase).toBe(formPhaseOf(cut, end0));
    expect(arc.phasePower).toBe(arc.phase === 'alta' ? ARC_TUNING.phasePower : arc.phase === 'baixa' ? -ARC_TUNING.phasePower : 0);
  });
});

describe('save', () => {
  it('ida e volta pelo JSON mantém fase, estudo, corte e o arco do evento; save antigo sem os campos carrega', () => {
    const base = withCalendar(withLastSeason(careerAt(VITALITY, 'save'), NEUTRAL_YEAR), 12);
    const [, end0] = blockRange(base, 0);
    const played = play(base, Array.from({ length: end0 }, () => 'Campeão'));
    const studied: PlayerCareerState = { ...played, studyCut: { key: blockKeyOf(played, end0), factor: 0.4, cards: ['mudar-playbook'] } };
    const arc = eventArcOf(studied, end0);
    const state: PlayerCareerState = { ...studied, liveEvent: { eventIndex: end0, played: {}, arc } };
    // O mesmo caminho do onMount da página ao carregar o save.
    const restored = ensureCircuitFrom(ensureSquad(ensureDraw(JSON.parse(JSON.stringify(state)) as PlayerCareerState)));
    expect(restored.studyCut).toEqual(state.studyCut);
    expect(restored.liveEvent?.arc).toEqual(arc);
    for (const entry of state.calendar!) {
      expect(formPhaseOf(restored, entry.index)).toBe(formPhaseOf(state, entry.index));
      expect(rivalStudyOf(restored, entry.index)).toBe(rivalStudyOf(state, entry.index));
    }
    const { studyCut: _cut, ...withoutCut } = restored;
    const old: PlayerCareerState = { ...withoutCut, liveEvent: { eventIndex: end0, played: {} } };
    expect(rivalStudyOf(old, end0)).toBeGreaterThan(rivalStudyOf(restored, end0));
    expect(eventArcOf(old, end0).phase).toBe(arc.phase);
  });
});

describe('arco congelado no campeonato em andamento', () => {
  it('o campeonato refeito das séries salvas usa o arco do começo, mesmo que o save mude no meio', () => {
    const base = withCalendar(careerAt(VITALITY, 'frozen'), 12);
    const [, end0] = blockRange(base, 0);
    const state = play(base, Array.from({ length: end0 }, () => 'Campeão'));
    const arc = eventArcOf(state, end0);
    expect(arc.study).toBeGreaterThan(0);
    const userPower = (campaign: ReturnType<typeof startSceneEvent>['campaign']) => campaign.engine.byId.get(campaign.userTeamId)!.team.power;
    const plain = startSceneEvent(state, end0, undefined, null, { phase: 'normal', phasePower: 0, study: 0 }).campaign;
    let campaign = startSceneEvent(state, end0, undefined, null, arc).campaign;
    const atStart = userPower(campaign);
    expect(atStart).toBeCloseTo(userPower(plain) + arc.phasePower - arc.study, 6);
    for (let guard = 0; guard < 6000 && Object.keys(serializeSceneEvent(campaign)).length < 1; guard += 1) campaign = stepSceneEvent(campaign).campaign;
    const played = serializeSceneEvent(campaign);
    expect(Object.keys(played).length).toBeGreaterThan(0);
    const changed: PlayerCareerState = { ...state, studyCut: { key: blockKeyOf(state, end0), factor: 0.2, cards: ['mudar-playbook'] } };
    expect(eventArcOf(changed, end0)).not.toEqual(arc);
    const rebuilt = startSceneEvent(changed, end0, played, null, arc).campaign;
    expect(userPower(rebuilt)).toBe(atStart);
    const scores = (series: Record<string, unknown>) => Object.values(series as Record<string, { id: string; winnerId: string; scoreA: number; scoreB: number }>).map((item) => [item.id, item.winnerId, item.scoreA, item.scoreB]);
    expect(scores(serializeSceneEvent(rebuilt))).toEqual(scores(played));
    expect(userPower(startSceneEvent(changed, end0, played).campaign)).not.toBe(atStart);
  }, 30000);
});

describe('cartas da semana contra o estudo', () => {
  it('só aparecem com estudo, vêm na mesa, cortam o estudo do bloco, custam blocos e cansaço e não repetem no bloco', () => {
    const base = withCalendar(careerAt(VITALITY, 'cards'), 12);
    expect(agendaAvailable(base, AGENDA_BY_ID.get('mudar-playbook')!)).toBe(false);
    expect(agendaAvailable(base, AGENDA_BY_ID.get('demos-rivais')!)).toBe(false);
    const [, end0] = blockRange(base, 0);
    const studied = play(base, Array.from({ length: end0 }, () => 'Campeão'));
    const before = rivalStudyOf(studied, end0);
    expect(before).toBeGreaterThan(0);
    expect(drawAgenda(studied).some((card) => card.id === 'mudar-playbook' || card.id === 'demos-rivais')).toBe(true);
    const playbook = applyAgenda(studied, 'mudar-playbook');
    expect(playbook.chips.some((chip) => chip.label === 'Estudo dos rivais' && chip.value < 0)).toBe(true);
    const after = rivalStudyOf(playbook.state, end0);
    expect(after).toBeCloseTo(Math.round(before * 0.4 * 10) / 10, 5);
    expect(blocksLeft(playbook.state)).toBe(blocksLeft(studied) - 2);
    expect(playbook.state.fatigue ?? 0).toBeGreaterThan(studied.fatigue ?? 0);
    expect(studyCardOpen(playbook.state, 'mudar-playbook')).toBe(false);
    expect(studyCardOpen(playbook.state, 'demos-rivais')).toBe(true);
    const both = applyAgenda(playbook.state, 'demos-rivais');
    expect(rivalStudyOf(both.state, end0)).toBeLessThan(after);
    // O corte é do bloco do próximo campeonato.
    expect(both.state.studyCut?.key).toBe(blockKeyOf(studied, end0));
  });
});
