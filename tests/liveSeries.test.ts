import { COURT_SPREAD, COURT_TOP } from '../src/lib/game/courtPower';
import { describe, expect, it } from 'vitest';
import { MAP_POOL } from '../src/lib/game/maps';
import type { MapStrategy } from '../src/lib/game/map-veto';
import {
  LiveSeriesError,
  applySeriesDecision,
  autoDecide,
  createLiveSeries,
  retuneSeriesTeam,
  pendingSeriesDecision,
  requestSeriesTimeout,
  runSeriesToEnd,
  stepSeries,
  toSeriesResult,
  type LiveSeriesConfig
} from '../src/lib/game/online/live-series';
import type { CombatTeam, MapAffinity, MapId } from '../src/lib/game/types';

const team = (id: string, power: number, style: CombatTeam['style'] = 'balanced'): CombatTeam => ({ id, name: id, power, mental: 85, clutch: 85, experience: 85, consistency: 85, style });

const strategy = (teamId: string, selectedMaps: [MapId, MapId, MapId], bot = false): MapStrategy => {
  const affinities = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, 'EVEN'])) as Record<MapId, MapAffinity>;
  const pool: MapId[] = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke'];
  const familiarity = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, pool.includes(mapId) ? 60 : 0])) as Record<MapId, number>;
  selectedMaps.forEach((mapId, index) => { affinities[mapId] = index === 0 ? '+++' : '+'; });
  return { teamId, selectedMaps, affinities, familiarity, bot };
};

const config = (overrides: Partial<LiveSeriesConfig> = {}): LiveSeriesConfig => ({
  id: 'swiss-r1-m1-a-b',
  phase: 'stage3',
  bestOf: 3,
  teamA: team('a', 91),
  teamB: team('b', 89),
  seed: 'live-series',
  mode: 'premier',
  strategies: { a: strategy('a', ['ancient', 'mirage', 'nuke']), b: strategy('b', ['anubis', 'cache', 'inferno'], true) },
  controllers: { a: 'human', b: 'human' },
  interactiveVeto: true,
  ...overrides
});

const drive = (state: ReturnType<typeof createLiveSeries>, decide: (pending: NonNullable<ReturnType<typeof pendingSeriesDecision>>) => void) => {
  while (state.phase !== 'finished') {
    const pending = pendingSeriesDecision(state);
    if (pending) decide(pending);
    else stepSeries(state);
  }
};

describe('live series', () => {
  it('walks the BO3 veto in order, validating turn and map', () => {
    const state = createLiveSeries(config());
    expect(state.phase).toBe('veto');
    const actions: string[] = [];
    while (state.phase === 'veto') {
      const pending = pendingSeriesDecision(state)!;
      expect(pending.kind).toBe('veto');
      if (pending.kind !== 'veto') throw new Error('unreachable');
      actions.push(`${pending.action}:${pending.teamId}`);
      const wrongTeam = pending.teamId === 'a' ? 'b' : 'a';
      expect(() => applySeriesDecision(state, { kind: 'veto', teamId: wrongTeam, action: pending.action, mapId: pending.available[0] })).toThrow(LiveSeriesError);
      expect(() => applySeriesDecision(state, { kind: 'veto', teamId: pending.teamId, action: pending.action, mapId: 'vertigo' })).toThrowError(/not available/);
      applySeriesDecision(state, { kind: 'veto', teamId: pending.teamId, action: pending.action, mapId: pending.available[0] });
    }
    expect(actions).toEqual(['ban:a', 'ban:b', 'pick:a', 'pick:b', 'ban:a', 'ban:b']);
    expect(state.veto!.steps.map((step) => step.action)).toEqual(['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider']);
    expect(state.playedMaps.map((played) => played.pickedBy)).toEqual(['a', 'b', null]);
    expect(state.phase).toBe('intermission');
    expect(toSeriesResult(state).maps).toHaveLength(0);
    expect(toSeriesResult(state).decisions).toHaveLength(6);
  });

  it('asks the non-picker for the side, then the pistol loser for the eco call, and pauses until they answer', () => {
    const state = createLiveSeries(config({ interactiveVeto: false }));
    expect(state.phase).toBe('intermission');
    expect(stepSeries(state)).toBe('map-start');
    const side = pendingSeriesDecision(state);
    expect(side).toMatchObject({ kind: 'side', teamId: 'b', mapIndex: 0, mapId: state.playedMaps[0].mapId });
    expect(stepSeries(state)).toBe('decision');
    expect(() => applySeriesDecision(state, { kind: 'side', teamId: 'a', side: 'ct' })).toThrow(LiveSeriesError);
    applySeriesDecision(state, { kind: 'side', teamId: 'b', side: 't' });
    expect(state.phase).toBe('live');
    expect(stepSeries(state)).toBe('round');
    const partial = toSeriesResult(state);
    expect(partial.maps).toHaveLength(1);
    expect(partial.maps[0].winnerId).toBe('');
    expect(partial.maps[0].rounds).toHaveLength(1);
    expect(partial.maps[0].aStartsCt).toBe(true);
    const eco = pendingSeriesDecision(state);
    const loser = partial.maps[0].details![0].winner === 'a' ? 'b' : 'a';
    expect(eco).toMatchObject({ kind: 'eco-call', teamId: loser, roundNumber: 2 });
    const before = partial.maps[0].rounds.length;
    expect(stepSeries(state)).toBe('decision');
    expect(toSeriesResult(state).maps[0].rounds).toHaveLength(before);
    applySeriesDecision(state, { kind: 'eco-call', teamId: loser, call: 'force' });
    expect(stepSeries(state)).toBe('round');
    expect(toSeriesResult(state).maps[0].details![1].economy[loser].buy).toBe('force');
  });

  it('never asks a bot anything and lets human vs bot vetoes resolve on their own', () => {
    const state = createLiveSeries(config({ controllers: { a: 'human', b: 'bot' }, interactiveVeto: false }));
    expect(state.veto!.steps).toHaveLength(7);
    drive(state, (pending) => {
      expect(pending.teamId).toBe('a');
      autoDecide(state);
    });
    const result = toSeriesResult(state);
    expect(result.winnerId).toMatch(/^[ab]$/);
    expect(result.maps.length).toBeGreaterThanOrEqual(2);
    expect(result.decisions!.filter((decision) => decision.teamId === 'b' && decision.kind === 'side').every((decision) => decision.auto)).toBe(true);
  });

  it('grants one tactical timeout per half and rejects the second one', () => {
    const state = createLiveSeries(config({ interactiveVeto: false, controllers: { a: 'human', b: 'bot' } }));
    stepSeries(state);
    autoDecide(state);
    for (let index = 0; index < 3; index += 1) {
      if (pendingSeriesDecision(state)) autoDecide(state);
      stepSeries(state);
    }
    expect(() => requestSeriesTimeout(state, 'zzz')).toThrow(LiveSeriesError);
    requestSeriesTimeout(state, 'a');
    expect(() => requestSeriesTimeout(state, 'a')).toThrowError(/timeout/i);
    if (pendingSeriesDecision(state)) autoDecide(state);
    stepSeries(state);
    const details = toSeriesResult(state).maps[0].details!;
    expect(details.at(-1)?.timeout).toBe('a');
    expect(details.at(-1)?.timeoutTiming).toMatch(/^(window|early|late)$/);
  });

  it('carries the queue into every map so Resenha pauses weigh more', () => {
    const state = createLiveSeries(config({ mode: 'fun', interactiveVeto: false, controllers: { a: 'human', b: 'bot' } }));
    stepSeries(state);
    expect(state.current?.state.mode).toBe('fun');
  });

  it('is deterministic for the same seed and decisions, and replays a decision log to the same result', () => {
    const play = () => {
      const state = createLiveSeries(config());
      drive(state, (pending) => {
        if (pending.kind === 'veto') applySeriesDecision(state, { kind: 'veto', teamId: pending.teamId, action: pending.action, mapId: pending.available[pending.available.length - 1] });
        else if (pending.kind === 'side') applySeriesDecision(state, { kind: 'side', teamId: pending.teamId, side: 'ct' });
        else applySeriesDecision(state, { kind: 'eco-call', teamId: pending.teamId, call: 'eco' });
      });
      return toSeriesResult(state);
    };
    const first = play();
    const second = play();
    expect(second).toEqual(first);
    expect(first.winnerId).toBeTruthy();
    expect(first.veto).toHaveLength(7);
    expect(first.maps.every((map) => map.mapId && map.details?.length === map.rounds.length)).toBe(true);

    const automatic = createLiveSeries(config());
    runSeriesToEnd(automatic);
    expect(toSeriesResult(automatic).maps.map((map) => map.rounds)).not.toEqual(first.maps.map((map) => map.rounds));
  });

  it('opens a BO5 veto on exactly seven maps even when both lineups know the whole pool', () => {
    const wide = (teamId: string, selected: [MapId, MapId, MapId]) => {
      const base = strategy(teamId, selected);
      for (const mapId of MAP_POOL) base.familiarity[mapId] = 60;
      return base;
    };
    const state = createLiveSeries(config({ bestOf: 5, phase: 'final', strategies: { a: wide('a', ['ancient', 'mirage', 'nuke']), b: wide('b', ['anubis', 'cache', 'inferno']) } }));
    expect(state.veto?.available).toHaveLength(7);
    expect(state.veto?.plan.map((step) => `${step.action}:${step.actor}`)).toEqual(['ban:a', 'ban:b', 'pick:a', 'pick:b', 'pick:a', 'pick:b']);
  });

  it('plays numbered maps without a veto when no strategies exist', () => {
    const state = createLiveSeries(config({ strategies: null, controllers: { a: 'bot', b: 'bot' } }));
    expect(state.phase).toBe('intermission');
    runSeriesToEnd(state);
    const result = toSeriesResult(state);
    expect(result.veto).toBeUndefined();
    expect(result.maps.every((map) => map.mapId === undefined)).toBe(true);
    expect(result.maps.length).toBeLessThanOrEqual(3);
  });

  it('retunes a team before the first veto action with the same matchday seed', () => {
    const original = createLiveSeries(config());
    const retuned = createLiveSeries(config());
    retuneSeriesTeam(retuned, 'a', { ...team('a', 93), mental: 91 });
    expect(retuned.config.teamA.power).toBe(93);
    expect(retuned.adjustedB).toEqual(original.adjustedB);
    expect(retuned.adjustedA.power).not.toBe(original.adjustedA.power);
    applySeriesDecision(retuned, { kind: 'veto', teamId: pendingSeriesDecision(retuned)!.teamId, action: 'ban', mapId: (pendingSeriesDecision(retuned) as Extract<ReturnType<typeof pendingSeriesDecision>, { kind: 'veto' }>).available[0] });
    expect(() => retuneSeriesTeam(retuned, 'a', team('a', 90))).toThrow(/veto/);
  });

  it('retunes a team after the bot opponent already vetoed', () => {
    const state = createLiveSeries(config());
    const pending = pendingSeriesDecision(state) as Extract<ReturnType<typeof pendingSeriesDecision>, { kind: 'veto' }>;
    const other = pending.teamId === state.config.teamA.id ? 'b' : 'a';
    const own = other === 'a' ? 'b' : 'a';
    applySeriesDecision(state, { kind: 'veto', teamId: pending.teamId, action: 'ban', mapId: pending.available[0] });
    expect(() => retuneSeriesTeam(state, other, team(other, 91))).not.toThrow();
    expect(() => retuneSeriesTeam(state, own, team(own, 91))).toThrow(/veto/);
  });
});

describe('escala de poder do dia de jogo', () => {
  const bots = (a: number, b: number, scale?: 'classic' | 'court') =>
    createLiveSeries(config({ teamA: team('a', a), teamB: team('b', b), strategies: null, controllers: { a: 'bot', b: 'bot' }, ...(scale ? { powerScale: scale } : {}) }));

  it('sem pedir nada, o corte clássico em 110 continua valendo (offline, Dinastia e sandbox dependem dele)', () => {
    const series = bots(112, 134);
    expect(series.adjustedA.power).toBeCloseTo(series.adjustedB.power, 10);
    expect(bots(112, 134, 'classic').adjustedA.power).toBe(series.adjustedA.power);
  });

  it("em 'court' nada é cortado: times acima de 110 deixam de jogar idênticos, e ninguém chega a 100", () => {
    const series = bots(112, 134, 'court');
    // 112 e 134 jogavam idênticos com o corte antigo em 110. Acima do joelho cada ponto de carta vale COURT_SLOPE,
    // então 22 pontos de poder cru valem ~1,1 na régua de hoje: a margem acompanha a régua.
    expect(series.adjustedB.power).toBeGreaterThan(series.adjustedA.power + 0.5 * COURT_SPREAD);
    // 121 é a melhor line montável; nem ela, nem num dia bom, nem com a pressão de uma final, passa muito de 100.
    const best = bots(106, 121, 'court');
    expect(best.adjustedB.power).toBeLessThan(COURT_TOP + 1.5 * COURT_SPREAD);
  });

  it('abaixo do joelho a escala nova não muda nenhuma série: só renomeia os números', () => {
    for (let index = 0; index < 25; index += 1) {
      const seed = `abaixo-${index}`;
      const classic = createLiveSeries(config({ seed, teamA: team('a', 93), teamB: team('b', 90), strategies: null, controllers: { a: 'bot', b: 'bot' } }));
      const court = createLiveSeries(config({ seed, teamA: team('a', 93), teamB: team('b', 90), strategies: null, controllers: { a: 'bot', b: 'bot' }, powerScale: 'court' }));
      // A régua de níveis é COURT_SPREAD vezes mais larga, e a sensibilidade do motor anda junto: os placares não mudam.
      expect(court.adjustedA.power - court.adjustedB.power).toBeCloseTo((classic.adjustedA.power - classic.adjustedB.power) * COURT_SPREAD, 8);
      runSeriesToEnd(classic);
      runSeriesToEnd(court);
      expect(toSeriesResult(court).maps.map((map) => [map.scoreA, map.scoreB])).toEqual(toSeriesResult(classic).maps.map((map) => [map.scoreA, map.scoreB]));
    }
  });

  it('trocar um time antes do veto respeita a escala da série', () => {
    const state = createLiveSeries(config({ powerScale: 'court', teamA: team('a', 112), teamB: team('b', 134) }));
    retuneSeriesTeam(state, 'a', team('a', 139));
    expect(state.adjustedA.power).toBeGreaterThan(state.adjustedB.power);
  });
});
