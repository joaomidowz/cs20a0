import { describe, expect, it } from 'vitest';
import { beginNextDynastyMajor, createDynastyState, ensureDynastyState, entryForPlacement, settleDynastyMajor } from '../src/lib/game/dynasty/state';
import type { MajorRun } from '../src/lib/game/types';

const run = (placement: string, champion = false): MajorRun =>
  ({ stage3: { wins: 0, losses: 0, qualified: false, matches: [] }, matches: [], champion, placement }) as MajorRun;
const input = { seed: 'abc123', lineup: [], stats: [] };

describe('estado da Dinastia', () => {
  it('começa no Stage 1 como Challenger, sem caixa', () => {
    expect(createDynastyState()).toMatchObject({ majorNumber: 1, majorRules: 2, cash: 0, status: 'challenger', entryStage: 'stage1', titles: 0, history: [], prizeCreditedFor: 0, coachRerollsUsed: 0 });
  });

  it('decide a entrada do próximo Major pela colocação', () => {
    expect(entryForPlacement('placementStage1')).toEqual({ entryStage: 'stage1', status: 'challenger' });
    expect(entryForPlacement('placementStage2')).toEqual({ entryStage: 'stage1', status: 'challenger' });
    expect(entryForPlacement('placementStage3')).toEqual({ entryStage: 'stage2', status: 'challenger' });
    expect(entryForPlacement('placement5to8')).toEqual({ entryStage: 'stage3', status: 'legend' });
    expect(entryForPlacement('placementChampion')).toEqual({ entryStage: 'stage3', status: 'legend' });
  });

  it('credita o prêmio uma vez só, registra o Major e conta o título', () => {
    const settled = settleDynastyMajor(createDynastyState(), run('placementChampion', true), input);
    expect(settled.cash).toBe(500_000);
    expect(settled.titles).toBe(1);
    expect(settled.status).toBe('legend');
    expect(settled.entryStage).toBe('stage3');
    expect(settled.history).toHaveLength(1);
    expect(settled.history[0]).toMatchObject({ majorNumber: 1, seed: 'abc123', entryStage: 'stage1', placement: 'placementChampion', prize: 500_000, awardsBonus: 0 });
    expect(settled.prizeCreditedFor).toBe(1);
    expect(settleDynastyMajor(settled, run('placementChampion', true), input)).toBe(settled);
  });

  it('abre o próximo Major só depois de creditar o atual', () => {
    const fresh = createDynastyState();
    expect(() => beginNextDynastyMajor(fresh)).toThrow(/Settle/);
    const next = beginNextDynastyMajor(settleDynastyMajor(fresh, run('placementStage2'), input));
    expect(next.majorNumber).toBe(2);
    expect(next.majorRules).toBe(2);
    expect(next.entryStage).toBe('stage1');
    expect(next.cash).toBe(10_000);
  });

  it('normaliza um save quebrado ou antigo', () => {
    expect(ensureDynastyState(null)).toEqual(createDynastyState());
    expect(ensureDynastyState({ cash: -5, entryStage: 'stage9', status: 'x', majorNumber: 0, history: 'nope' })).toMatchObject({ cash: 0, entryStage: 'stage1', status: 'challenger', majorNumber: 1, history: [] });
    expect(ensureDynastyState({ cash: 20_000, entryStage: 'stage3', status: 'legend', majorNumber: 3, titles: 2, prizeCreditedFor: 2 })).toMatchObject({ cash: 20_000, entryStage: 'stage3', status: 'legend', majorNumber: 3, titles: 2, prizeCreditedFor: 2 });
    expect(ensureDynastyState({ majorNumber: 3 }).majorRules).toBe(1);
    expect(ensureDynastyState({ majorNumber: 3, majorRules: 2 }).majorRules).toBe(2);
  });

  it('mantém uma janela válida ao carregar e descarta lixo', () => {
    const saved = { majorNumber: 1, seed: 's', cashAtOpen: 0, maxMoves: 2, evolution: [], baseLineup: [], overrides: {}, proposals: [], offers: [], coachOfferIds: [], moves: [], roleAssignments: {}, coachChange: null };
    expect(ensureDynastyState({ window: saved }).window).toEqual(saved);
    expect(ensureDynastyState({ window: { moves: 'x' } }).window).toBeNull();
  });
});
