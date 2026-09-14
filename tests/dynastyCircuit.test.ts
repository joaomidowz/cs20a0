// tests/dynastyCircuit.test.ts
import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { CIRCUIT_PRIZES, CIRCUIT_TEAMS, circuitPlacementFrom, createCircuit, finishCircuit, isEventAvailable, isEventDone, settleCircuitEvent, skipCircuitEvent } from '../src/lib/game/dynasty/circuit';
import { playCircuitEvent } from '../src/lib/game/dynasty/circuitPlay';
import { stageOfTier } from '../src/lib/game/dynasty/field';
import { buildDynastyUserTeam } from '../src/lib/game/dynasty/seriesPlan';
import { createDynastyState } from '../src/lib/game/dynasty/state';
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

describe('simulação de um evento do circuito', () => {
  const roster = getTeamPlayers(teams[0]).slice(0, 5);
  const lineup = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' as const }));
  const userTeam = buildDynastyUserTeam({ players: roster, lineup, seed: 'circuito', coach: null, teams, plan: { style: 'balanced', tactic: 'standard', study: false } });
  const circuit = createCircuit({ dynasty: settled('placementStage3'), teams, seed: 'circuito' });
  const input = (event = circuit.events[0]) => ({ event, userTeam, players: roster, lineup, teams, allPlayers: players, seed: 'circuito', selectedMaps: getDefaultMapSelection(roster, teams) });

  it('joga 8 times em MD3 até a final e paga pela colocação do usuário', () => {
    const started = performance.now();
    const { result, rounds } = playCircuitEvent(input());
    const elapsed = performance.now() - started;
    console.info(`circuit event simulated in ${elapsed.toFixed(0)} ms`);
    expect(rounds.map((round) => round.phase)).toEqual(['quarterfinal', 'semifinal', 'final']);
    expect(rounds.every((round) => round.series.every((series) => series.bestOf === 3))).toBe(true);
    expect(rounds.flatMap((round) => round.series).every((series) => series.maps.every((map) => !map.details))).toBe(true);
    expect(result.eventId).toBe(circuit.events[0].id);
    expect(result.prize).toBe(CIRCUIT_PRIZES[result.tier][result.placement]);
  });

  it('é determinístico pela seed', () => {
    expect(playCircuitEvent(input()).result).toEqual(playCircuitEvent(input()).result);
  });
});
