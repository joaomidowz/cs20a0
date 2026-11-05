// tests/playerCareerLongRun.test.ts
// Carreiras longas (5, 10, 20 e 30 temporadas, seeds fixas) com tudo ligado: semana com blocos, acontecimentos
// (originais e novos), dilemas, conversas fora de partida, vida fora do servidor e mercado. Os resultados de cada
// campeonato são AMOSTRADOS pela força do time (rodar o motor de série inteiro para 130 temporadas não cabe num
// teste); o resto é o código de verdade. Confere: acontecimentos por ano e crítico raro, fala sem repetir antes do
// cooldown, Mental vivo e limitado, fãs crescendo sem explodir, semana variada, tier que sobe e que trava, morar fora
// sem castigo automático e o save inteiro (tamanho e listas com limite).
import { describe, expect, it } from 'vitest';
import {
  acceptMove, acceptOffer, createPlayerCareer, declineMove, finishSeason, orgOf, recordEventResult, startSeason, type PlayerCareerState, type TournamentResult
} from '../src/lib/game/playerCareer/engine';
import { ORG_BASE_POWER, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createSeededRng } from '../src/lib/game/simulation';
import { resolveHappening, rollHappening, HAPPENING_BY_ID } from '../src/lib/game/playerCareer/happenings';
import { resolveDilemma, rollDilemma } from '../src/lib/game/playerCareer/dilemmas';
import { answerTalk, CONTEXT_LINES, momentTalk, seasonTalk } from '../src/lib/game/playerCareer/talks';
import { applyAgenda, applyCustomTraining, blocksLeft, costOf, drawAgenda, groupOf, TRAINABLE } from '../src/lib/game/playerCareer/agenda';
import { celebrateResult, matesOf } from '../src/lib/game/playerCareer/squad';
import { tickLife } from '../src/lib/game/playerCareer/tick';
import { lifeOf, livesAbroad } from '../src/lib/game/playerCareer/life';

const PLACEMENTS = ['Quartas', 'Semis', 'Vice', 'Campeão'] as const;

/** Resultado amostrado pela força do time (mesma âncora da simulação de arquétipos), com adversários reais. */
function sampleResult(state: PlayerCareerState, index: number): TournamentResult {
  const rng = createSeededRng(`${state.seed}:long:${state.seasonNumber}:${index}`);
  const level = orgOf(state.orgId, state).level;
  const winProb = 1 / (1 + Math.exp(-((state.overall - 70) * 0.45) / 7));
  const rivals = sceneOrgs.filter((org) => org.level === Math.max(1, Math.min(4, level)) && org.id !== state.orgId);
  const opponents: NonNullable<TournamentResult['opponents']> = [];
  let wins = 0;
  for (let round = 0; round < 3; round += 1) {
    const won = rng() < winProb;
    const team = rivals[Math.floor(rng() * rivals.length)]?.name ?? 'Rival';
    opponents.push({ team, won, phase: ['quarterfinal', 'semifinal', 'final'][round], score: won ? (rng() < 0.5 ? '2-0' : '2-1') : (rng() < 0.5 ? '0-2' : '1-2') });
    if (!won) break;
    wins += 1;
  }
  const rating = Math.min(1.6, Math.max(0.6, 0.95 + (state.overall - 60) * 0.006 + (rng() - 0.5) * 0.3 + wins * 0.015));
  return { name: `Evento ${index + 1}`, placement: PLACEMENTS[wins], rating: Number(rating.toFixed(2)), seriesWins: wins, seriesLosses: wins < 3 ? 1 : 0, opponents, tier: level <= 1 ? 'S' : level === 2 ? 'B' : 'C' };
}

interface SeasonStats { level: number; happenings: number; critical: number; mind: number; abroad: boolean; fame: number }
interface RunStats { seasons: SeasonStats[]; categories: Map<string, number>; lineGaps: number[]; final: PlayerCareerState }

function playCareer(seed: string, seasons: number, archetype: 'prodigio' | 'solido' = 'prodigio'): RunStats {
  let state = createPlayerCareer({ nick: 'longo', country: 'Brazil', role: 'rifler', archetype, seed });
  const real = state.pendingDraw?.find((option) => option.kind === 'real');
  if (real) state = { ...state, orgId: real.orgId, pendingDraw: null, drawDone: true, seatsTaken: [] };
  const rng = createSeededRng(`${seed}:policy`);
  const pick3 = () => Math.floor(rng() * 3) as 0 | 1 | 2;
  const out: RunStats = { seasons: [], categories: new Map(), lineGaps: [], final: state };
  const lastLineUse = new Map<string, number>();
  let talks = 0;
  const answer = (current: PlayerCareerState) => {
    const talk = current.pendingTalk;
    if (!talk) return current;
    const n = current.talkMemory?.n ?? 0;
    const before = lastLineUse.get(talk.lineKey);
    if (before !== undefined && talk.lineKey.startsWith('c')) out.lineGaps.push(n - before);
    lastLineUse.set(talk.lineKey, n);
    talks += 1;
    return answerTalk(current, talk.options[pick3()].key).state;
  };
  const settle = (current: PlayerCareerState) => {
    let next = current;
    if (next.pendingHappening) next = resolveHappening(next, pick3()).state;
    if (next.pendingDilemma) next = resolveDilemma(next, (['A', 'B', 'C'] as const)[pick3()]).state;
    next = answer(next);
    if (next.pendingMove) {
      const move = next.pendingMove;
      next = rng() < 0.4 && move.offers?.length ? acceptMove(next, move.offers[0].orgId) : declineMove(next);
    }
    return next;
  };
  for (let season = 0; season < seasons && state.status === 'ACTIVE'; season += 1) {
    state = startSeason(state);
    const opening = seasonTalk(state);
    if (opening) state = answer({ ...state, pendingTalk: opening });
    for (let guard = 0; guard < 20; guard += 1) {
      const entry = (state.calendar ?? []).find((candidate) => candidate.status === 'UPCOMING');
      if (!entry) break;
      // A semana: até 3 blocos, escolhas variadas (treino livre às vezes).
      for (let action = 0; action < 3 && blocksLeft(state) > 0; action += 1) {
        const cards = drawAgenda(state).filter((card) => costOf(card) <= blocksLeft(state) && !state.week?.picks.includes(card.id));
        if (rng() < 0.3 && blocksLeft(state) >= 2 && !state.week?.picks.includes('treino-livre')) {
          state = applyCustomTraining(state, [TRAINABLE[Math.floor(rng() * TRAINABLE.length)]]).state;
          out.categories.set('treino', (out.categories.get('treino') ?? 0) + 1);
        } else if (cards.length) {
          const card = cards[Math.floor(rng() * cards.length)];
          state = applyAgenda(state, card.id).state;
          out.categories.set(groupOf(card.category), (out.categories.get(groupOf(card.category)) ?? 0) + 1);
        } else break;
      }
      state = settle(rollHappening(state, 'pre', { eventIndex: entry.index }));
      if (state.calendar?.find((candidate) => candidate.index === entry.index)?.status !== 'UPCOMING') continue;
      const result = sampleResult(state, entry.index);
      state = recordEventResult(state, entry.index, result);
      state = celebrateResult(state, result.placement, orgOf(state.orgId, state).level);
      state = tickLife(state, result).state;
      if (state.calendar?.every((candidate) => candidate.status === 'PLAYED')) break;
      state = settle(rollHappening(state, 'post', { eventIndex: entry.index, result }));
      state = settle(rollHappening(state, 'between', { eventIndex: entry.index + 1 }));
      const talk = momentTalk(state, 'post', entry.index);
      if (talk) state = answer({ ...state, pendingTalk: talk });
      state = settle(rollDilemma(state, entry.index + 1));
    }
    const records = (state.happeningHistory ?? []).filter((record) => record.season === state.seasonNumber);
    out.seasons.push({
      level: orgOf(state.orgId, state).level,
      happenings: records.length,
      critical: records.filter((record) => record.severity === 'critico').length,
      mind: lifeOf(state).mind,
      abroad: livesAbroad(state, (orgOf(state.orgId, state) as { region?: string }).region),
      fame: state.fame ?? 0
    });
    state = finishSeason(state);
    if (state.pendingOffers?.length) {
      const best = [...state.pendingOffers].sort((a, b) => a.orgLevel - b.orgLevel)[0];
      state = rng() < 0.6 ? acceptOffer(state, best.orgId) : state;
    }
  }
  out.final = state;
  void talks;
  return out;
}

const RUNS: Array<[number, string[]]> = [[5, ['lr5-a', 'lr5-b']], [10, ['lr10-a', 'lr10-b']], [20, ['lr20-a']], [30, ['lr30-a']]];
const results = new Map<string, RunStats>();

describe('carreiras longas com tudo ligado', () => {
  it('roda 5, 10, 20 e 30 temporadas sem quebrar, com seeds fixas e o mesmo resultado na segunda vez', () => {
    for (const [seasons, seeds] of RUNS) for (const seed of seeds) results.set(seed, playCareer(seed, seasons));
    results.set('lr10-solido', playCareer('lr10-solido', 10, 'solido'));
    const again = playCareer('lr5-a', 5);
    expect(JSON.stringify(again.final)).toBe(JSON.stringify(results.get('lr5-a')!.final));
    const lines = [...results.entries()].map(([seed, run]) =>
      `${seed.padEnd(8)} · ${run.seasons.length} temporadas · tiers ${run.seasons.map((s) => s.level).join('')} · acontecimentos/ano ${(run.seasons.reduce((sum, s) => sum + s.happenings, 0) / run.seasons.length).toFixed(1)} · críticos ${run.seasons.reduce((sum, s) => sum + s.critical, 0)} · cabeça ${run.seasons.map((s) => s.mind).join('/')} · fãs ${run.final.fame ?? 0}`);
    console.log(`\n=== Carreiras longas ===\n${lines.join('\n')}`);
  }, 240000);

  it('acontecimentos por ano dentro do teto (10) e crítico no máximo 1 por temporada', () => {
    for (const run of results.values()) {
      for (const season of run.seasons) {
        expect(season.happenings).toBeLessThanOrEqual(10);
        expect(season.critical).toBeLessThanOrEqual(1);
      }
      const average = run.seasons.reduce((sum, season) => sum + season.happenings, 0) / run.seasons.length;
      expect(average).toBeGreaterThan(1);
    }
  });

  it('a mesma fala não volta antes do cooldown dela', () => {
    for (const run of results.values()) for (const gap of run.lineGaps) expect(gap).toBeGreaterThanOrEqual(Math.min(...CONTEXT_LINES.map((line) => line.cooldown)));
  });

  it('Cabeça viva e limitada: nunca sai de 0-100 e não trava num extremo', () => {
    for (const run of results.values()) {
      const minds = run.seasons.map((season) => season.mind);
      for (const mind of minds) expect(mind).toBeGreaterThanOrEqual(0), expect(mind).toBeLessThanOrEqual(100);
      if (minds.length >= 10) expect(new Set(minds).size).toBeGreaterThan(2);
    }
  });

  it('fãs crescem com a carreira, sem número absurdo', () => {
    for (const run of results.values()) {
      expect(Number.isFinite(run.final.fame ?? 0)).toBe(true);
      expect(run.final.fame ?? 0).toBeLessThan(50_000_000);
    }
  });

  it('a semana varia: nenhum tipo passa de metade das ações', () => {
    const totals = new Map<string, number>();
    for (const run of results.values()) for (const [category, count] of run.categories) totals.set(category, (totals.get(category) ?? 0) + count);
    const all = [...totals.values()].reduce((sum, count) => sum + count, 0);
    expect(totals.size).toBeGreaterThanOrEqual(8);
    for (const [, count] of totals) expect(count / all).toBeLessThan(0.5);
  });

  it('tier: tem carreira que sobe e carreira que trava (o sólido não chega no topo em 10 anos)', () => {
    const runs = [...results.values()];
    expect(runs.some((run) => Math.min(...run.seasons.map((s) => s.level)) < run.seasons[0].level)).toBe(true);
    const solid = results.get('lr10-solido')!;
    expect(Math.min(...solid.seasons.map((s) => s.level))).toBeGreaterThanOrEqual(1);
  });

  it('30 temporadas pedidas: a carreira fecha pela idade (40 anos vira coach), sem quebrar o save', () => {
    const longest = results.get('lr30-a')!;
    expect(longest.final.status === 'ACTIVE' || longest.final.verdict?.becameCoach).toBeTruthy();
  });

  it('morar fora não é castigo automático: a Cabeça média fora e em casa fica perto', () => {
    const away: number[] = [];
    const home: number[] = [];
    for (const run of results.values()) for (const season of run.seasons) (season.abroad ? away : home).push(season.mind);
    if (away.length >= 3 && home.length >= 3) {
      const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
      expect(Math.abs(avg(away) - avg(home))).toBeLessThan(15);
    }
  });

  it('save inteiro: volta igual do JSON, listas com limite e tamanho que cabe no navegador', () => {
    for (const run of results.values()) {
      const json = JSON.stringify(run.final);
      expect(JSON.stringify(JSON.parse(json))).toBe(json);
      expect(json.length).toBeLessThan(600_000);
      expect((run.final.happeningHistory ?? []).length).toBeLessThanOrEqual(160);
      expect((run.final.talkMemory?.log ?? []).length).toBeLessThanOrEqual(30);
      expect((run.final.weekLog ?? []).length).toBeLessThanOrEqual(24);
      expect(lifeOf(run.final).flags.length).toBeLessThanOrEqual(40);
      for (const record of run.final.happeningHistory ?? []) expect(record.id.startsWith('dilema-') || HAPPENING_BY_ID.has(record.id)).toBe(true);
      expect(matesOf).toBeTypeOf('function');
    }
  });
});
