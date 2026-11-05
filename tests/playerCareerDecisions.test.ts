// tests/playerCareerDecisions.test.ts
// Contrato da matriz de decisões do CS2 (45 situações por função + 60 gerais, 3 alternativas cada): textos verbatim, perfis de
// consequência, sorteio determinístico sem repetição, edge com RNG seeded e o efeito real do edge no round do motor.
import { describe, expect, it } from 'vitest';
import { armClutchCall, MAX_CLUTCH_EDGE, createMapState, isMapFinished, playNextRound } from '../src/lib/game/rounds';
import { createSeededRng } from '../src/lib/game/simulation';
import type { CombatTeam, TeamSide } from '../src/lib/game/types';
import { DECISION_MATRIX, SHARED_SITUATIONS, drawClutchSituation, readOf, resolveClutchEdge, situationsFor, type ClutchProfile, type RoundContext } from '../src/lib/game/playerCareer/decisions';
import { clutchGate, playClutchRound, roundCriticality, startSceneEvent, stepSceneEvent, type SceneClutchContext } from '../src/lib/game/playerCareer/live';
import { chooseStartingOrg, createPlayerCareer, startSeason } from '../src/lib/game/playerCareer/engine';

const ROLES = ['awper', 'rifler', 'entry', 'support', 'lurker', 'igl'] as const;

describe('matriz de decisões (6 funções × 45 + 60 gerais)', () => {
  it('cada função tem 45 próprias e sorteia de mais de 100; ids únicos, 3 alternativas e os 4 perfis', () => {
    expect(Object.keys(DECISION_MATRIX).sort()).toEqual([...ROLES].sort());
    const allIds = new Set<string>();
    const profiles: ClutchProfile[] = ['solid', 'read', 'gamble', 'team'];
    const check = (situation: (typeof SHARED_SITUATIONS)[number]) => {
      expect(situation.text.length).toBeGreaterThan(3);
      expect(situation.text).not.toMatch(/—|\|/);
      expect(allIds.has(situation.id)).toBe(false);
      allIds.add(situation.id);
      expect(situation.alternatives).toHaveLength(3);
      for (const alternative of situation.alternatives) {
        expect(alternative.text.length).toBeGreaterThan(2);
        expect(alternative.text).not.toMatch(/—|:/);
        expect(profiles).toContain(alternative.profile);
      }
    };
    for (const role of ROLES) {
      const situations = DECISION_MATRIX[role];
      expect(situations).toHaveLength(45);
      expect(situations[0].id).toBe(`${role}-1`);
      for (const situation of situations) {
        expect(situation.role).toBe(role);
        check(situation);
      }
      const pool = situationsFor(role);
      expect(pool.length).toBeGreaterThanOrEqual(100);
      expect(new Set(pool.flatMap((situation) => situation.alternatives.map((alternative) => alternative.profile))).size).toBe(4);
    }
    expect(SHARED_SITUATIONS).toHaveLength(60);
    for (const situation of SHARED_SITUATIONS) check(situation);
    expect(allIds.size).toBe(6 * 45 + 60);
  });

  it('o sorteio é determinístico e não repete situação até esgotar a função', () => {
    const first = drawClutchSituation('igl', 'seed-matriz');
    expect(drawClutchSituation('igl', 'seed-matriz').id).toBe(first.id);
    const used: string[] = [];
    const seen = new Set<string>();
    for (let draw = 0; draw < 10; draw += 1) {
      const situation = drawClutchSituation('igl', `sorteio:${draw}`, used);
      expect(seen.has(situation.id)).toBe(false);
      seen.add(situation.id);
      used.push(situation.id);
    }
    expect(used).toHaveLength(10); // 10 sorteios do IGL, sem repetir
    for (const situation of used.map((id) => situationsFor('igl').find((candidate) => candidate.id === id)!)) expect(situation).toBeTruthy();
  });

  it('cada call tem uma leitura certa (+0.09 a +0.12), uma razoável e uma errada (−0.06 a −0.08), sempre no teto', () => {
    for (const situation of [...DECISION_MATRIX.awper, ...SHARED_SITUATIONS].slice(0, 60)) {
      const base = { situation, seed: 'edge-seed', opponentOverall: 92, matesOverall: 86, playerOverall: 88, chemistry: 70 };
      const results = ([0, 1, 2] as const).map((choice) => resolveClutchEdge({ ...base, choice }));
      expect(new Set(results.map((result) => result.quality))).toEqual(new Set(['good', 'ok', 'bad']));
      for (const result of results) {
        expect(Math.abs(result.edge)).toBeLessThanOrEqual(MAX_CLUTCH_EDGE);
        expect(result.reason.length).toBeGreaterThan(10);
        expect(result.reason).not.toMatch(/—/);
        if (result.profile === 'gamble') continue; // a aposta ainda vira moeda
        if (result.quality === 'good') expect(result.edge).toBeGreaterThanOrEqual(0.09);
        if (result.quality === 'bad') expect(result.edge).toBeLessThanOrEqual(-0.06);
      }
      expect(results[results[0].best].quality).toBe('good');
    }
  });

  it('a leitura segue o momento: atrás e sem dinheiro a aposta acerta mais; na frente, o seguro', () => {
    const withBoth = [...DECISION_MATRIX.awper, ...DECISION_MATRIX.entry, ...SHARED_SITUATIONS]
      .filter((situation) => situation.alternatives.some((alt) => alt.profile === 'gamble') && situation.alternatives.some((alt) => alt.profile === 'solid'));
    const bestProfile = (round: RoundContext) => withBoth.map((situation) => {
      const read = readOf({ situation, seed: 's', opponentOverall: 92, matesOverall: 86, playerOverall: 88, chemistry: 60, round });
      return situation.alternatives[read.best].profile;
    });
    const trailing = bestProfile({ round: 20, us: 8, them: 11, winStreak: 0, lossStreak: 3, lastWon: false, money: 1500, theirMoney: 6000 });
    const leading = bestProfile({ round: 20, us: 11, them: 8, winStreak: 3, lossStreak: 0, lastWon: true, money: 6000, theirMoney: 1500 });
    const share = (list: string[], profile: string) => list.filter((value) => value === profile).length / list.length;
    expect(share(trailing, 'gamble')).toBeGreaterThan(share(leading, 'gamble') + 0.2);
    expect(share(leading, 'solid')).toBeGreaterThan(share(trailing, 'solid') + 0.2);
  });

  it('craque lê melhor e time forte joga melhor junto; a aposta vira dos dois lados', () => {
    const situation = DECISION_MATRIX.awper[0];
    const readChoice = situation.alternatives.findIndex((alt) => alt.profile === 'read') as 0 | 1 | 2;
    const star = resolveClutchEdge({ situation, choice: readChoice, seed: 'r', opponentOverall: 92, matesOverall: 86, playerOverall: 99 });
    const weak = resolveClutchEdge({ situation, choice: readChoice, seed: 'r', opponentOverall: 92, matesOverall: 86, playerOverall: 70 });
    expect(star.edge).toBeGreaterThanOrEqual(weak.edge);
    const teamSituation = DECISION_MATRIX.awper.find((candidate) => candidate.alternatives.some((alt) => alt.profile === 'team'))!;
    const teamChoice = teamSituation.alternatives.findIndex((alt) => alt.profile === 'team') as 0 | 1 | 2;
    const strong = resolveClutchEdge({ situation: teamSituation, choice: teamChoice, seed: 't', opponentOverall: 92, matesOverall: 97, playerOverall: 88, chemistry: 95 });
    const loose = resolveClutchEdge({ situation: teamSituation, choice: teamChoice, seed: 't', opponentOverall: 92, matesOverall: 75, playerOverall: 88, chemistry: 30 });
    expect(strong.edge).toBeGreaterThanOrEqual(loose.edge);
    const gambleSituation = DECISION_MATRIX.awper.find((candidate) => candidate.alternatives.some((alt) => alt.profile === 'gamble'))!;
    const gambleChoice = gambleSituation.alternatives.findIndex((alt) => alt.profile === 'gamble') as 0 | 1 | 2;
    const coins = new Set(Array.from({ length: 40 }, (_, roll) => resolveClutchEdge({ situation: gambleSituation, choice: gambleChoice, seed: `g:${roll}`, opponentOverall: 92, matesOverall: 86, playerOverall: 88 }).coin));
    expect(coins).toEqual(new Set(['heads', 'tails']));
  });
});

describe('round crítico (close, virada, sequência)', () => {
  /** Série fake a partir da sequência de vencedores: rounds acumulados como o motor guarda. */
  const live = (winners: Array<'a' | 'b'>, pending = false) => {
    let a = 0;
    let b = 0;
    const rounds = winners.map((winner) => {
      if (winner === 'a') a += 1; else b += 1;
      return { a, b };
    });
    return { phase: 'live', current: { index: 0, state: { scoreA: a, scoreB: b, rounds, pendingClutchCall: pending ? { side: 'a', edge: 0.1 } : null } } } as never;
  };

  it('match point vale 3; sequência de 3+ vale 2 (virada em andamento); mapa faca no fim vale 1; comum vale 0', () => {
    expect(roundCriticality(live(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']))).toBe(0); // 6-6 com 12 rounds: ainda é começo de mapa
    expect(roundCriticality(live(Array.from({ length: 18 }, (_, index) => (index % 2 ? 'b' : 'a') as 'a' | 'b')))).toBe(1); // 9-9 alternado: mapa faca
    expect(roundCriticality(live(['a', 'a', 'b', 'a', 'a', 'b', 'a', 'b', 'a']))).toBe(0); // 6-3 sem sequência: comum
    expect(roundCriticality(live([...Array(7).fill('b'), ...Array(3).fill('a')]))).toBe(2); // 3-7 com A em sequência de 3
    expect(roundCriticality(live([...Array(12).fill('a'), ...Array(5).fill('b')]))).toBe(3); // 12-5: match point
    expect(roundCriticality(live([...Array(4).fill('a')], true))).toBe(0); // este round já tem call armada
  });

  it('portão: máximo 2 por mapa na regulagem (sequência/faca só como primeira); OT afrouxa o teto', () => {
    expect(clutchGate(0, 0, false)).toBe(false);
    expect(clutchGate(3, 0, false)).toBe(true); // match point sempre para
    expect(clutchGate(3, 2, false)).toBe(false); // teto de 2 na regulagem
    expect(clutchGate(2, 0, false)).toBe(true); // sequência como primeira
    expect(clutchGate(2, 1, false)).toBe(false); // já gastou uma: só match point
    expect(clutchGate(1, 0, false)).toBe(true);
    expect(clutchGate(1, 1, false)).toBe(false);
    expect(clutchGate(3, 5, true)).toBe(true); // OT: o close do bloco sempre para
    expect(clutchGate(2, 5, true)).toBe(true); // OT: sequência também
    expect(clutchGate(1, 0, true)).toBe(false); // OT não para em qualquer round apertado
  });
});

describe('o edge decide no motor (RNG do round)', () => {
  const team = (id: string, power: number): CombatTeam => ({ id, name: id.toUpperCase(), power, mental: 80, clutch: 80, experience: 80, consistency: 80 });

  it('armado todo round pro lado A, o edge vira a soma de margens de vários mapas com o MESMO seed', () => {
    const margin = (edge: number, mapSeed: string): number => {
      const state = createMapState(team('a', 82), team('b', 82), { rng: createSeededRng(mapSeed), mode: 'dynasty' });
      while (!isMapFinished(state)) {
        if (edge) armClutchCall(state, 'a' as TeamSide, edge);
        playNextRound(state);
      }
      return state.scoreA - state.scoreB;
    };
    const seeds = Array.from({ length: 10 }, (_, index) => `clutch-map-${index}`);
    const sum = (edge: number) => seeds.reduce((total, mapSeed) => total + margin(edge, mapSeed), 0);
    expect(sum(MAX_CLUTCH_EDGE)).toBeGreaterThan(sum(0)); // um mapa pode pirar em OT; dez não
    expect(sum(-MAX_CLUTCH_EDGE)).toBeLessThan(sum(0));
  });
});

describe('a pausa no evento (série do usuário)', () => {
  const ctxOf = (role: (typeof ROLES)[number], used: string[] = []): SceneClutchContext => ({ role, seed: 'ctx-seed', usedSituationIds: used });

  function careerAtRealOrg(seed: string) {
    const career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed });
    const option = career.pendingDraw!.find((candidate) => candidate.kind === 'real')!;
    return startSeason(chooseStartingOrg(career, option.orgId));
  }

  it('num evento inteiro, o close aparece: pausas trazem situação da SUA função e o RNG resolve o round', () => {
    const career = careerAtRealOrg('clutch-matriz');
    let campaign = startSceneEvent(career, 0).campaign;
    const ctx = ctxOf('awper');
    let clutches = 0;
    for (let guard = 0; guard < 800 && !campaign.finished; guard += 1) {
      const step = stepSceneEvent(campaign, ctx);
      campaign = step.campaign;
      if (!step.clutch) continue;
      clutches += 1;
      expect(step.clutch.situation.role).toBe('awper');
      expect(step.clutch.situation.alternatives).toHaveLength(3);
      const outcome = playClutchRound(campaign, step.clutch, { choice: 0, playerOverall: 78, matesOverall: 72, opponentOverall: 70 });
      campaign = outcome.campaign;
      ctx.usedSituationIds.push(step.clutch.situation.id);
    }
    expect(campaign.finished).toBe(true);
    expect(clutches).toBeGreaterThanOrEqual(1); // com 7+ mapas BO3 na chave, o close existe
  });
});
