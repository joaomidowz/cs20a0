// tests/playerCareerDecisions.test.ts
// Contrato da matriz de decisões do CS2 (45 situações por função + 60 gerais, 3 alternativas cada): textos verbatim, perfis de
// consequência, sorteio determinístico sem repetição, edge com RNG seeded e o efeito real do edge no round do motor.
import { describe, expect, it } from 'vitest';
import {
  armClutchCall,
  CLUTCH_CARRY_MISS_STEP,
  CLUTCH_CARRY_SERIES_SHARE,
  CLUTCH_CARRY_STEP,
  CLUTCH_CARRY_UNDERDOG_STEP,
  MAX_CAREER_LIFT,
  MAX_CLUTCH_CARRY,
  MAX_CLUTCH_EDGE,
  MIN_CLUTCH_CARRY,
  SAVED_WEAPON_MONEY,
  STAR_CARRY_CAP_BONUS,
  STAR_CARRY_STEP_BONUS,
  UNDERDOG_CARRY_CAP_BONUS,
  createMapState,
  isMapFinished,
  playNextRound,
  setCareerLift
} from '../src/lib/game/rounds';
import { createSeededRng } from '../src/lib/game/simulation';
import type { ClutchIntent, CombatTeam, RoundDetail, TeamSide } from '../src/lib/game/types';
import { getTeamPlayers, teams } from '../src/lib/game/data';
import { DECISION_MATRIX, SHARED_SITUATIONS, drawClutchSituation, readOf, resolveClutchEdge, situationSide, situationsFor, starFactor, type ClutchProfile, type RoundContext } from '../src/lib/game/playerCareer/decisions';
import { intentTableIds } from '../src/lib/game/playerCareer/intents';
import { COMEBACK_LIFT_MAP, COMEBACK_LIFT_SERIES, MAX_COMEBACK_LIFT } from '../src/lib/game/playerCareer/tuning';
import { CALL_CARRY_GOOD, clutchGate, comebackLiftFor, playClutchRound, roundContextOf, roundCriticality, startSceneEvent, stepSceneEvent, type SceneClutchContext } from '../src/lib/game/playerCareer/live';
import { currentCampaignSeries } from '../src/lib/game/campaign-major';
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

  it('o medidor das calls: leitura certa que ganhou soma (o azarão soma mais), errada que perdeu tira o dobro, o resto não mexe', () => {
    const callRound = (powerA: number, powerB: number, edge: number, quality: 'good' | 'ok' | 'bad', mapSeed: string) => {
      const state = createMapState(team('a', powerA), team('b', powerB), { rng: createSeededRng(mapSeed), mode: 'dynasty' });
      armClutchCall(state, 'a', edge, { quality });
      const detail = playNextRound(state);
      return { won: detail.winner === 'a', carry: state.clutchCarry!.a, rival: state.clutchCarry!.b, verdict: detail.call?.verdict };
    };
    const seeds = Array.from({ length: 40 }, (_, index) => `carry-${index}`);
    const underdog = seeds.map((mapSeed) => callRound(70, 84, 0.1, 'good', mapSeed));
    const favorite = seeds.map((mapSeed) => callRound(84, 70, 0.1, 'good', mapSeed));
    for (const rounds of [underdog, favorite]) {
      expect(rounds.some((round) => round.won)).toBe(true);
      expect(rounds.some((round) => !round.won)).toBe(true);
    }
    const wonBy = (rounds: typeof underdog) => rounds.find((round) => round.won)!;
    const lostBy = (rounds: typeof underdog) => rounds.find((round) => !round.won)!;
    expect(wonBy(underdog).carry).toBeCloseTo(CLUTCH_CARRY_UNDERDOG_STEP, 5); // 70 x 84: azarão cheio
    expect(wonBy(favorite).carry).toBeCloseTo(CLUTCH_CARRY_STEP, 5); // favorito: só o passo mínimo
    // Leitura certa que perdeu no detalhe: ninguém embala (antes, o rival levava a virada de graça).
    for (const round of [...underdog, ...favorite].filter((entry) => !entry.won)) expect(round).toMatchObject({ carry: 0, rival: 0, verdict: 0 });
    // Leitura errada: com sorte, nada; perdida, tira o mesmo passo de qualquer um (vira embalo do rival).
    const badCall = seeds.map((mapSeed) => callRound(70, 84, -0.07, 'bad', mapSeed));
    expect(badCall.filter((round) => round.won).every((round) => round.carry === 0 && round.rival === 0)).toBe(true);
    expect(lostBy(badCall).rival).toBeCloseTo(CLUTCH_CARRY_MISS_STEP, 5);
    expect(lostBy(seeds.map((mapSeed) => callRound(84, 70, -0.07, 'bad', mapSeed))).rival).toBeCloseTo(CLUTCH_CARRY_MISS_STEP, 5);
    expect(CLUTCH_CARRY_MISS_STEP).toBe(CLUTCH_CARRY_STEP * 2); // errar dói o dobro de acertar
    // Leitura razoável não é acerto nem erro.
    expect(seeds.map((mapSeed) => callRound(80, 80, 0.015, 'ok', mapSeed)).every((round) => round.carry === 0 && round.rival === 0)).toBe(true);

    // Acertos e erros andam no mesmo medidor: para em +5% em cima e −8% embaixo, nos dois sentidos.
    const meter = (edge: number, quality: 'good' | 'bad', mapSeed: string, star = 0, powers: [number, number] = [70, 84]) => {
      const state = createMapState(team('a', powers[0]), team('b', powers[1]), { rng: createSeededRng(mapSeed), mode: 'dynasty' });
      const readings: number[] = [];
      for (let round = 0; round < 24 && !isMapFinished(state); round += 1) {
        armClutchCall(state, 'a', edge, { quality, star });
        playNextRound(state);
        expect(Math.min(state.clutchCarry!.a, state.clutchCarry!.b)).toBe(0); // um lado só: é um medidor, não dois
        readings.push(state.clutchCarry!.a - state.clutchCarry!.b);
      }
      return readings;
    };
    // O azarão cheio (70 x 84) que acerta chega mais alto que o favorito: é o embalo dele que vira a série.
    expect(Math.max(...meter(MAX_CLUTCH_EDGE, 'good', 'carry-stack'))).toBeCloseTo(MAX_CLUTCH_CARRY + UNDERDOG_CARRY_CAP_BONUS, 5);
    expect(Math.max(...meter(MAX_CLUTCH_EDGE, 'good', 'carry-stack-fav', 0, [84, 70]))).toBeCloseTo(MAX_CLUTCH_CARRY, 5);
    expect(Math.min(...meter(-MAX_CLUTCH_EDGE, 'bad', 'carry-stack-wrong'))).toBeCloseTo(MIN_CLUTCH_CARRY, 5);
    // O craque (fator 1) que acerta soma o bônus de craque por cima (desligado na tabela: 0).
    expect(Math.max(...meter(MAX_CLUTCH_EDGE, 'good', 'carry-stack', 1))).toBeCloseTo(MAX_CLUTCH_CARRY + UNDERDOG_CARRY_CAP_BONUS + STAR_CARRY_CAP_BONUS, 5);
    expect(wonBy(seeds.map((mapSeed) => {
      const state = createMapState(team('a', 84), team('b', 70), { rng: createSeededRng(mapSeed), mode: 'dynasty' });
      armClutchCall(state, 'a', 0.1, { quality: 'good', star: 1 });
      const detail = playNextRound(state);
      return { won: detail.winner === 'a', carry: state.clutchCarry!.a, rival: state.clutchCarry!.b, verdict: detail.call?.verdict };
    })).carry).toBeCloseTo(CLUTCH_CARRY_STEP * (1 + STAR_CARRY_STEP_BONUS), 5);
  });

  it('o embalo herdado do mapa anterior entra no mapa novo e pesa nos rounds dele', () => {
    const fresh = createMapState(team('a', 76), team('b', 82), { rng: createSeededRng('carry-next'), mode: 'dynasty', clutchCarry: { a: 0.05, b: 0 } });
    expect(fresh.clutchCarry).toEqual({ a: 0.05, b: 0 });
    const margin = (carry: number, mapSeed: string) => {
      const state = createMapState(team('a', 76), team('b', 82), { rng: createSeededRng(mapSeed), mode: 'dynasty', clutchCarry: { a: carry, b: 0 } });
      while (!isMapFinished(state)) playNextRound(state);
      return state.scoreA - state.scoreB;
    };
    const seeds = Array.from({ length: 40 }, (_, index) => `carry-map-${index}`);
    const sum = (carry: number) => seeds.reduce((total, mapSeed) => total + margin(carry, mapSeed), 0);
    expect(sum(MAX_CLUTCH_CARRY * CLUTCH_CARRY_SERIES_SHARE)).toBeGreaterThan(sum(0));
  });

  it('o empurrão da leitura certa no round seguinte não é call: não gera embalo para ninguém', () => {
    for (const mapSeed of Array.from({ length: 20 }, (_, index) => `follow-${index}`)) {
      const state = createMapState(team('a', 70), team('b', 84), { rng: createSeededRng(mapSeed), mode: 'dynasty' });
      state.pendingClutchCall = { side: 'a', edge: 0.05, followUp: true };
      playNextRound(state);
      expect(state.clutchCarry).toEqual({ a: 0, b: 0 });
      expect(state.pendingClutchCall).toBeNull();
    }
  });
});

describe('o fôlego de quem está atrás (carreira)', () => {
  const team = (id: string, power: number): CombatTeam => ({ id, name: id.toUpperCase(), power, mental: 80, clutch: 80, experience: 80, consistency: 80 });

  it('só existe atrás no placar, cresce com o buraco e respeita o teto', () => {
    const lift = (mapA: number, mapB: number, seriesA = 0, seriesB = 0) =>
      comebackLiftFor({ current: { index: 0, state: { scoreA: mapA, scoreB: mapB } }, scoreA: seriesA, scoreB: seriesB } as never, 'a');
    expect(lift(5, 5)).toBe(0);
    expect(lift(8, 3)).toBe(0); // na frente: nada
    expect(lift(3, 5)).toBe(0); // 2 atrás ainda é jogo normal
    expect(lift(2, 5)).toBe(COMEBACK_LIFT_MAP[3]);
    expect(lift(2, 8)).toBe(COMEBACK_LIFT_MAP[6]);
    expect(lift(5, 5, 0, 1)).toBe(COMEBACK_LIFT_SERIES);
    expect(lift(2, 8, 0, 1)).toBe(MAX_COMEBACK_LIFT); // 2,5% + 1% para no teto de 3%
  });

  it('inclina o round de quem está atrás e o motor corta no teto', () => {
    const margin = (edge: number, mapSeed: string) => {
      const state = createMapState(team('a', 80), team('b', 80), { rng: createSeededRng(mapSeed), mode: 'dynasty' });
      while (!isMapFinished(state)) {
        setCareerLift(state, 'a', edge);
        playNextRound(state);
      }
      return state.scoreA - state.scoreB;
    };
    const seeds = Array.from({ length: 20 }, (_, index) => `lift-${index}`);
    const sum = (edge: number) => seeds.reduce((total, mapSeed) => total + margin(edge, mapSeed), 0);
    expect(sum(MAX_COMEBACK_LIFT)).toBeGreaterThan(sum(0));
    const capped = createMapState(team('a', 80), team('b', 80), { rng: createSeededRng('lift-cap'), mode: 'dynasty' });
    setCareerLift(capped, 'a', 0.5);
    expect(capped.careerLift).toEqual({ side: 'a', edge: MAX_CAREER_LIFT });
    setCareerLift(capped, 'a', 0);
    expect(capped.careerLift).toBeNull();
  });
});

describe('o round obedece a call (matar, salvar, plantar, defusar, apoiar)', () => {
  const [homeTeam, awayTeam] = teams;
  const home = getTeamPlayers(homeTeam);
  const away = getTeamPlayers(awayTeam);
  const me = home[0].id;
  const team = (id: string): CombatTeam => ({ id, name: id, power: 80, mental: 80, clutch: 80, experience: 80, consistency: 80 });

  /** O primeiro round de um mapa com elencos de verdade, com a sua call armada; `ct` decide o seu lado. */
  const scripted = (intent: ClutchIntent, seed: string, options: { ct?: boolean; kills?: number; edge?: number } = {}) => {
    const state = createMapState(team('home'), team('away'), { rng: createSeededRng(seed), mode: 'dynasty', rosterA: { players: home }, rosterB: { players: away } });
    state.aStartsCt = options.ct ?? true;
    armClutchCall(state, 'a', options.edge ?? 0.05, { script: { playerId: me, intent, ...(options.kills ? { kills: options.kills } : {}) } });
    const detail = playNextRound(state);
    return { detail, state, won: detail.winner === 'a', died: detail.kills.some((kill) => kill.victimId === me) };
  };
  const seeds = Array.from({ length: 40 }, (_, index) => `roteiro-${index}`);
  const myKills = (detail: RoundDetail) => detail.kills.filter((kill) => kill.killerId === me);

  it('matar: as kills que a call pede saem das suas mãos, antes de você morrer', () => {
    for (const kills of [1, 2]) {
      for (const seed of seeds) {
        const { detail } = scripted('kill', seed, { kills });
        const mine = myKills(detail);
        expect(mine.length).toBeGreaterThanOrEqual(kills);
        const death = detail.kills.find((kill) => kill.victimId === me);
        if (death) expect(mine[kills - 1].second).toBeLessThanOrEqual(death.second);
        expect(detail.call).toMatchObject({ side: 'a', intent: 'kill', playerId: me });
      }
    }
  });

  it('salvar: você sobrevive, o time não é eliminado e a arma guardada vira dinheiro', () => {
    let lost = 0;
    for (const seed of seeds) {
      const { detail, died, won } = scripted('save', seed);
      expect(died).toBe(false);
      if (!won) {
        lost += 1;
        expect(detail.ending).toBe('bomb'); // você é CT e não foi eliminado: sem retake, a bomba explode
      }
    }
    expect(lost).toBeGreaterThan(0);
    const seed = seeds.find((candidate) => !scripted('save', candidate).won)!;
    const saved = scripted('save', seed);
    const plain = scripted('hold', seed);
    if (!plain.won) expect(saved.state.teams.a.money).toBeGreaterThanOrEqual(plain.state.teams.a.money + SAVED_WEAPON_MONEY - 400);
  });

  it('plantar (TR): a bomba é sua; se o time perde, um CT vivo desarma', () => {
    for (const seed of seeds) {
      const { detail, won } = scripted('plant', seed, { ct: false });
      expect(detail.bomb?.plantedById).toBe(me);
      if (won) expect(['bomb', 'elimination']).toContain(detail.ending);
      else {
        expect(detail.ending).toBe('defuse');
        expect(away.some((player) => player.id === detail.bomb?.defusedById)).toBe(true);
      }
      const death = detail.kills.find((kill) => kill.victimId === me);
      if (death) expect(detail.bomb!.plantSecond!).toBeLessThan(death.second); // ninguém planta morto
    }
    // Plantar no CT não existe: vira segurar, sem bomba inventada.
    const wrongSide = scripted('plant', 'roteiro-ct', { ct: true });
    expect(wrongSide.detail.bomb).toBeUndefined();
    expect(wrongSide.detail.call?.intent).toBe('hold');
  });

  it('defusar (CT): ganhou, foi você que desarmou e está vivo; perdeu, a bomba explodiu ou o CT caiu', () => {
    let defused = 0;
    for (const seed of seeds) {
      const { detail, won, died } = scripted('defuse', seed, { ct: true });
      expect(away.some((player) => player.id === detail.bomb?.plantedById)).toBe(true);
      if (won) {
        defused += 1;
        expect(detail.ending).toBe('defuse');
        expect(detail.bomb?.defusedById).toBe(me);
        expect(died).toBe(false);
        expect(detail.bomb!.defuseSecond!).toBeGreaterThan(detail.bomb!.plantSecond!);
      } else {
        expect(['bomb', 'elimination']).toContain(detail.ending);
        expect(detail.bomb?.defusedById).toBeUndefined();
      }
    }
    expect(defused).toBeGreaterThan(0);
  });

  it('apoiar: o seu utilitário aparece na kill do parceiro enquanto você está vivo', () => {
    let assisted = 0;
    for (const seed of seeds) {
      const { detail } = scripted('support', seed);
      const death = detail.kills.find((kill) => kill.victimId === me)?.second ?? Infinity;
      const mateKill = detail.kills.find((kill) => kill.killerSide === 'a' && kill.killerId !== me && kill.second <= death);
      if (mateKill) {
        expect(mateKill.flashAssistId).toBe(me);
        assisted += 1;
      }
    }
    expect(assisted).toBeGreaterThan(0);
  });

  it('o empurrão do round seguinte não carrega roteiro: só a call obriga', () => {
    const state = createMapState(team('home'), team('away'), { rng: createSeededRng('follow-script'), mode: 'dynasty', rosterA: { players: home }, rosterB: { players: away } });
    state.aStartsCt = false;
    state.pendingClutchCall = { side: 'a', edge: 0.05, followUp: true, script: { playerId: me, intent: 'plant' } };
    const detail = playNextRound(state);
    expect(detail.bomb).toBeUndefined();
    expect(detail.call).toBeUndefined();
  });
});

describe('situações com lado, intenção e o craque', () => {
  it('a tabela de intenções cobre a matriz inteira e cada alternativa tem o que fazer', () => {
    const all = [...Object.values(DECISION_MATRIX).flat(), ...SHARED_SITUATIONS];
    expect(new Set(intentTableIds())).toEqual(new Set(all.map((situation) => situation.id)));
    for (const situation of all) {
      expect(['t', 'ct', 'any']).toContain(situation.side);
      for (const alternative of situation.alternatives) {
        expect(['kill', 'save', 'plant', 'defuse', 'support', 'hold']).toContain(alternative.intent);
        if (alternative.intent === 'plant') expect(situation.side).toBe('t');
        if (alternative.intent === 'defuse') expect(situation.side).toBe('ct');
      }
    }
  });

  it('o sorteio respeita o seu lado no round pelas duas fontes (texto e tabela)', () => {
    for (const role of ROLES) {
      for (let index = 0; index < 60; index += 1) {
        const ct = drawClutchSituation(role, `lado-${role}-${index}`, [], 'ct');
        expect(ct.side).not.toBe('t');
        expect(situationSide(ct)).not.toBe('t');
        const t = drawClutchSituation(role, `lado-${role}-${index}`, [], 't');
        expect(t.side).not.toBe('ct');
        expect(situationSide(t)).not.toBe('ct');
      }
    }
  });

  it('fator craque: 0 no nível dos parceiros, 1 com 12+ acima, e a call devolve a intenção da alternativa', () => {
    expect(starFactor(80, 80)).toBe(0);
    expect(starFactor(84, 80)).toBe(0);
    expect(starFactor(88, 80)).toBeCloseTo(0.5, 5);
    expect(starFactor(95, 78)).toBe(1);
    const situation = DECISION_MATRIX.rifler[0];
    const resolved = resolveClutchEdge({ situation, choice: 0, playerOverall: 92, matesOverall: 78, opponentOverall: 88, seed: 'star' });
    expect(resolved.star).toBe(1);
    expect(resolved.intent).toBe(situation.alternatives[0].intent);
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
      const outcome = playClutchRound(campaign, step.clutch, { choice: 0, playerOverall: 78, matesOverall: 72, opponentOverall: 70, playerId: `${career.seed}:me` });
      campaign = outcome.campaign;
      ctx.usedSituationIds.push(step.clutch.situation.id);
      // O que a call mandou fazer aconteceu com o SEU jogador no round.
      if (outcome.intent === 'kill') expect(outcome.kills).toBeGreaterThanOrEqual(1);
      if (outcome.intent === 'save') expect(outcome.survived).toBe(true);
      if (outcome.intent === 'plant') expect(outcome.planted).toBe(true);
      if (outcome.intent === 'defuse' && outcome.won) expect(outcome.defused).toBe(true);
    }
    expect(campaign.finished).toBe(true);
    expect(clutches).toBeGreaterThanOrEqual(1); // com 7+ mapas BO3 na chave, o close existe
  });

  it('a leitura certa empurra só o round seguinte, e esse empurrão não é uma call nova', () => {
    const career = careerAtRealOrg('clutch-follow');
    let campaign = startSceneEvent(career, 0).campaign;
    const ctx = ctxOf('awper');
    let checked = 0;
    for (let guard = 0; guard < 2000 && !campaign.finished && checked < 3; guard += 1) {
      const step = stepSceneEvent(campaign, ctx);
      campaign = step.campaign;
      if (!step.clutch) continue;
      ctx.usedSituationIds.push(step.clutch.situation.id);
      const play = { playerOverall: 78, matesOverall: 72, opponentOverall: 70 };
      const best = readOf({ ...play, situation: step.clutch.situation, seed: step.clutch.drawSeed, round: roundContextOf(campaign, step.clutch.series) }).best;
      const outcome = playClutchRound(campaign, step.clutch, { ...play, choice: best });
      campaign = outcome.campaign;
      const map = currentCampaignSeries(campaign)?.current;
      if (outcome.quality !== 'good' || !map || map.index !== step.clutch.mapIndex || map.state.finished) continue;
      expect(map.state.pendingClutchCall).toMatchObject({ edge: CALL_CARRY_GOOD, followUp: true });
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
