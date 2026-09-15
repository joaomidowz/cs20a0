// tests/dynastyCircuit.test.ts
import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { CIRCUIT_PRIZES, CIRCUIT_TEAMS, REAL_CIRCUIT_EVENTS, drawCircuitYear, circuitPlacementFrom, createCircuit, finishCircuit, isEventAvailable, isEventDone, settleCircuitEvent, skipCircuitEvent } from '../src/lib/game/dynasty/circuit';
import { circuitResultFrom, circuitRounds, circuitStatsFrom, createCircuitCampaign, stepCircuitCampaign } from '../src/lib/game/dynasty/circuitLive';
import { stageOfTier } from '../src/lib/game/dynasty/field';
import { createDynastyState, ensureDynastyState } from '../src/lib/game/dynasty/state';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import type { DynastyMajorSummary, DynastyState } from '../src/lib/game/types';

const tierOf = new Map(teams.map((team) => [team.id, team.tier ?? null]));
const summary = (placement: string, majorNumber = 1): DynastyMajorSummary => ({
  majorNumber, seed: 's', entryStage: 'stage1', placement, prize: 0, awardsBonus: 0, lineup: [], coachId: null, movesMade: 0, stats: []
});
const settled = (placement: string): DynastyState => ({ ...createDynastyState(), prizeCreditedFor: 1, history: [summary(placement)] });

describe('convites do circuito', () => {
  it('Legend recebe dois Elite por convite', () => {
    const circuit = createCircuit({ dynasty: settled('placement5to8'), teams, seed: 'c1' });
    expect(circuit.events.map((event) => [event.tier, event.access, event.index])).toEqual([['elite', 'invite', 1], ['elite', 'invite', 2]]);
    expect(circuit).toMatchObject({ majorNumber: 1, results: [], skipped: [], brackets: {}, finished: false });
  });

  it('eliminado no Stage 3 recebe um Elite e um Aberto', () => {
    const circuit = createCircuit({ dynasty: settled('placementStage3'), teams, seed: 'c2' });
    expect(circuit.events.map((event) => [event.tier, event.access])).toEqual([['elite', 'invite'], ['open', 'signup']]);
  });

  it('Challenger recebe um Aberto e o segundo só abre com final no primeiro', () => {
    const circuit = createCircuit({ dynasty: settled('placementStage1'), teams, seed: 'c3' });
    const [first, second] = circuit.events;
    expect([first.tier, second.tier]).toEqual(['open', 'open']);
    expect(second.unlockedBy).toBe(first.id);
    expect(isEventAvailable(circuit, first)).toBe(true);
    expect(isEventAvailable(circuit, second)).toBe(false);
    const semi = { ...circuit, results: [{ eventId: first.id, tier: 'open' as const, placement: 'semi' as const, prize: 4_000 }] };
    expect(isEventAvailable(semi, second)).toBe(false);
    const final = { ...circuit, results: [{ eventId: first.id, tier: 'open' as const, placement: 'runnerUp' as const, prize: 8_000 }] };
    expect(isEventAvailable(final, second)).toBe(true);
  });

  it('sorteia 7 adversários sem repetir, nos pools do tier e de forma determinística', () => {
    for (let index = 0; index < 20; index += 1) {
      const circuit = createCircuit({ dynasty: settled(index % 2 ? 'placementChampion' : 'placementStage2'), teams, seed: `pool-${index}` });
      for (const event of circuit.events) {
        expect(event.teamIds).toHaveLength(CIRCUIT_TEAMS);
        expect(new Set(event.teamIds).size).toBe(CIRCUIT_TEAMS);
        const allowed = event.tier === 'elite' ? ['stage2', 'stage3'] : ['stage1', 'stage2'];
        expect(event.teamIds.every((id) => allowed.includes(stageOfTier(tierOf.get(id))))).toBe(true);
      }
    }
    const ids = (seed: string) => createCircuit({ dynasty: settled('placementStage3'), teams, seed }).events.map((event) => event.teamIds);
    expect(ids('igual')).toEqual(ids('igual'));
    expect(ids('igual')).not.toEqual(ids('outra'));
  });
});

describe('campeonatos reais do circuito', () => {
  const realById = new Map(REAL_CIRCUIT_EVENTS.map((real) => [real.id, real]));

  it('mesma seed sorteia o mesmo ano e os mesmos campeonatos', () => {
    const make = () => createCircuit({ dynasty: settled('placementStage3'), teams, seed: 'ano-real' });
    const first = make();
    expect(first.year).toBe(drawCircuitYear('ano-real', 1));
    expect(first.year).toBeGreaterThanOrEqual(2016);
    expect(first.year).toBeLessThanOrEqual(2026);
    expect(make()).toEqual(first);
  });

  it('cada evento usa um campeonato do ano e do mesmo tier, sem repetir', () => {
    for (let index = 0; index < 30; index += 1) {
      const circuit = createCircuit({ dynasty: settled(['placementChampion', 'placementStage3', 'placementStage1'][index % 3]), teams, seed: `real-${index}` });
      const sources = circuit.events.map((event) => event.sourceId);
      expect(new Set(sources).size).toBe(sources.length);
      for (const event of circuit.events) {
        const real = realById.get(event.sourceId!)!;
        expect(real).toBeTruthy();
        expect(real.tier).toBe(event.tier);
        expect(real.year).toBe(circuit.year);
        expect(event).toMatchObject({ name: real.name, year: real.year, realPrizePool: real.prizePool, location: real.location, organizer: real.organizer });
      }
    }
  });

  it('save antigo sem ano nem sourceId continua válido', () => {
    const circuit = createCircuit({ dynasty: settled('placement5to8'), teams, seed: 'antigo' });
    const legacy = {
      majorNumber: circuit.majorNumber,
      events: circuit.events.map(({ id, tier, access, index, teamIds }) => ({ id, tier, access, index, teamIds })),
      results: [], skipped: [], brackets: {}, finished: false
    };
    const loaded = ensureDynastyState({ ...settled('placement5to8'), circuit: legacy });
    expect(loaded.circuit).toEqual(legacy);
  });
});

describe('prêmios e crédito', () => {
  it('prêmios são inteiros e seguem a tabela', () => {
    expect(CIRCUIT_PRIZES).toEqual({
      elite: { champion: 60_000, runnerUp: 25_000, semi: 12_000, quarter: 5_000 },
      open: { champion: 20_000, runnerUp: 8_000, semi: 4_000, quarter: 1_500 }
    });
    for (const tier of Object.values(CIRCUIT_PRIZES)) for (const value of Object.values(tier)) expect(Number.isInteger(value)).toBe(true);
    expect(circuitPlacementFrom('placementChampion')).toBe('champion');
    expect(circuitPlacementFrom('placementRunnerUp')).toBe('runnerUp');
    expect(circuitPlacementFrom('placement3to4')).toBe('semi');
    expect(circuitPlacementFrom('placement5to8')).toBe('quarter');
  });

  it('credita uma vez só por evento, pula e encerra gravando no histórico', () => {
    const dynasty = { ...settled('placement5to8'), cash: 100_000 };
    const circuit = createCircuit({ dynasty, teams, seed: 'credito' });
    const withCircuit: DynastyState = { ...dynasty, circuit };
    const [first, second] = circuit.events;
    const result = { eventId: first.id, tier: first.tier, placement: 'champion' as const, prize: 60_000 };
    const once = settleCircuitEvent(withCircuit, result, []);
    expect(once.cash).toBe(160_000);
    expect(isEventDone(once.circuit!, first.id)).toBe(true);
    expect(settleCircuitEvent(once, result, [])).toBe(once);
    const skipped = skipCircuitEvent(once, second.id);
    expect(skipped.circuit!.skipped).toEqual([second.id]);
    expect(isEventDone(skipped.circuit!, second.id)).toBe(true);
    expect(skipCircuitEvent(skipped, second.id)).toBe(skipped);
    const finished = finishCircuit(skipped);
    expect(finished.circuit!.finished).toBe(true);
    expect(finished.history.at(-1)!.circuit).toEqual([result]);
    expect(finished.cash).toBe(160_000);
  });
});

describe('evento do circuito ao vivo', () => {
  const roster = getTeamPlayers(teams[0]).slice(0, 5);
  const lineup = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' as const }));
  const circuit = createCircuit({ dynasty: settled('placementStage3'), teams, seed: 'circuito' });
  const start = (event = circuit.events[0]) => createCircuitCampaign({ event, players: roster, lineup, teams, allPlayers: players, seed: 'circuito', selectedMaps: getDefaultMapSelection(roster, teams), coach: null, plan: { style: 'balanced', tactic: 'standard', study: false } });
  const runToEnd = (state: ReturnType<typeof start>) => {
    let next = state;
    for (let guard = 0; guard < 20_000 && !next.finished; guard += 1) next = stepCircuitCampaign(next);
    return next;
  };

  it('joga 8 times em MD3 até a final e paga pela colocação do usuário', () => {
    const finished = runToEnd(start());
    expect(finished.finished).toBe(true);
    const rounds = circuitRounds(finished);
    expect(rounds.map((round) => round.phase)).toEqual(['quarterfinal', 'semifinal', 'final']);
    expect(rounds.every((round) => round.series.every((series) => series.bestOf === 3))).toBe(true);
    expect(rounds.flatMap((round) => round.series).every((series) => series.maps.every((map) => !map.details))).toBe(true);
    const result = circuitResultFrom(finished, circuit.events[0]);
    expect(result.eventId).toBe(circuit.events[0].id);
    expect(result.prize).toBe(CIRCUIT_PRIZES[result.tier][result.placement]);
  });

  it('guarda séries do usuário sem detalhes e stats Rating 3.0 com KAST', () => {
    const finished = runToEnd(start());
    const stats = circuitStatsFrom(finished, { event: circuit.events[0], players: roster, lineup, seed: 'circuito' });
    expect(stats.series.length).toBeGreaterThan(0);
    expect(stats.series.every((series) => series.teamA.id === 'user' || series.teamB.id === 'user')).toBe(true);
    expect(stats.series.every((series) => series.maps.every((map) => !map.details))).toBe(true);
    expect(stats.players.map((player) => player.playerId).sort()).toEqual(roster.map((player) => player.id).sort());
    expect(stats.players.every((player) => typeof player.kast === 'number')).toBe(true);

    const dynasty: DynastyState = { ...settled('placementStage3'), cash: 0, circuit };
    const result = circuitResultFrom(finished, circuit.events[0]);
    expect(result).toMatchObject({ name: circuit.events[0].name, year: circuit.events[0].year });
    const once = settleCircuitEvent(dynasty, result, circuitRounds(finished), stats);
    expect(once.circuit!.stats![circuit.events[0].id]).toEqual(stats);
    expect(settleCircuitEvent(once, result, circuitRounds(finished), stats)).toBe(once);
    expect(once.cash).toBe(result.prize);
    expect(finishCircuit(once).history.at(-1)!.circuit![0]).toMatchObject({ name: result.name, year: result.year, placement: result.placement });
    const reloaded = ensureDynastyState(JSON.parse(JSON.stringify(once)));
    expect(reloaded.circuit!.stats![circuit.events[0].id].players[0].kast).toBeTypeOf('number');
  });

  it('circuito antigo sem stats carrega', () => {
    const { stats: _stats, ...legacy } = { ...circuit, stats: undefined };
    expect(ensureDynastyState({ ...settled('placementStage3'), circuit: legacy }).circuit).toEqual(legacy);
  });

  it('é determinístico pela seed', () => {
    expect(circuitResultFrom(runToEnd(start()), circuit.events[0])).toEqual(circuitResultFrom(runToEnd(start()), circuit.events[0]));
  });

  it('expõe a série do usuário no bracket desde as quartas', () => {
    let state = start();
    for (let guard = 0; guard < 50; guard += 1) state = stepCircuitCampaign(state);
    const quarter = circuitRounds(state).find((round) => round.phase === 'quarterfinal');
    expect(quarter).toBeTruthy();
    expect(quarter!.series).toHaveLength(4);
    expect(quarter!.series.some((series) => series.teamA.id === 'user' || series.teamB.id === 'user')).toBe(true);
  });
});
