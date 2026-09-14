import { describe, expect, it } from 'vitest';
import { createTournamentEngine, type TournamentOrganization } from '../src/lib/game/online/tournament-engine';
import { runOnlineTournament } from '../src/lib/game/online/tournament';
import type { CombatTeam, MajorStage } from '../src/lib/game/types';

const organization = (id: string, power: number, human = false): TournamentOrganization => {
  const team: CombatTeam = { id, name: id.toUpperCase(), power, mental: 80, clutch: 80, experience: 80, ...(human ? { isUser: true } : {}) };
  return { id, name: team.name, seed: 0, team, human };
};
const user = organization('user', 82, true);
const bots = (prefix: string, count: number, power: number) => Array.from({ length: count }, (_, index) => organization(`${prefix}-${index}`, power + (index % 5)));

const fields = (entry: MajorStage) => {
  const stage1 = bots('s1', entry === 'stage1' ? 15 : 16, 70);
  const stage2 = bots('s2', entry === 'stage2' ? 7 : 8, 80);
  const stage3 = bots('s3', entry === 'stage3' ? 7 : 8, 90);
  if (entry === 'stage1') stage1.unshift(user);
  if (entry === 'stage2') stage2.unshift(user);
  if (entry === 'stage3') stage3.unshift(user);
  return { stage1, stage2, stage3 };
};

const run = (entry: MajorStage, seed = 'estagios') =>
  runOnlineTournament({ organizations: [user], botPool: [], entryStage: entry, stageFields: fields(entry), seed });

describe('motor com três estágios', () => {
  it('joga três suíços de cinco rodadas e depois o mata-mata', () => {
    const result = run('stage1');
    expect(result.rounds.map((round) => round.phase)).toEqual([...Array(15).fill('swiss'), 'quarterfinal', 'semifinal', 'final']);
    expect(result.rounds.slice(0, 5).every((round) => round.stage === 'stage1')).toBe(true);
    expect(result.rounds.slice(5, 10).every((round) => round.stage === 'stage2')).toBe(true);
    expect(result.rounds.slice(10, 15).every((round) => round.stage === 'stage3')).toBe(true);
    expect(result.rounds[0].series[0].id).toMatch(/^stage1-r1-m1-/);
    expect(result.rounds[0].series.every((series) => series.phase === 'stage1')).toBe(true);
    expect(result.championId).toBeTruthy();
  });

  it('classifica 8 e elimina 8 em cada estágio; novos entram como cabeças 1 a 8', () => {
    const result = run('stage1');
    expect(result.stages).toHaveLength(3);
    for (const stage of result.stages ?? []) {
      expect(stage.standings).toHaveLength(16);
      expect(stage.standings.filter((standing) => standing.status === 'qualified' || standing.status === 'champion')).toHaveLength(8);
      expect(stage.standings.filter((standing) => standing.status === 'eliminated')).toHaveLength(8);
    }
    const stage2 = result.stages!.find((stage) => stage.stage === 'stage2')!;
    const newcomers = stage2.standings.filter((standing) => standing.organizationId.startsWith('s2-'));
    expect(newcomers.every((standing) => standing.seed <= 8)).toBe(true);
    const stage3Participants = new Set(result.stages!.find((stage) => stage.stage === 'stage3')!.standings.map((standing) => standing.organizationId));
    const stage2Qualified = stage2.standings.filter((standing) => standing.status !== 'eliminated').map((standing) => standing.organizationId);
    expect(stage2Qualified.every((id) => stage3Participants.has(id))).toBe(true);
  });

  it('dá colocação por estágio de saída para todo mundo', () => {
    const result = run('stage1');
    const placements = new Map(result.campaigns.map((campaign) => [campaign.organizationId, campaign.placement]));
    expect(placements.size).toBe(32);
    const counts = [...placements.values()].reduce<Record<string, number>>((acc, placement) => ({ ...acc, [placement]: (acc[placement] ?? 0) + 1 }), {});
    expect(counts.placementStage1).toBe(8);
    expect(counts.placementStage2).toBe(8);
    expect(counts.placementStage3).toBe(8);
    expect(counts.placement5to8).toBe(4);
    expect(counts.placement3to4).toBe(2);
    expect(counts.placementRunnerUp).toBe(1);
    expect(counts.placementChampion).toBe(1);
  });

  it('coloca o usuário no estágio de entrada e ele só joga a partir dali', () => {
    for (const entry of ['stage1', 'stage2', 'stage3'] as const) {
      const result = run(entry, `entrada-${entry}`);
      const userSeries = result.rounds.flatMap((round) => round.series).filter((series) => series.userMatch);
      expect(userSeries[0].phase).toBe(entry);
    }
  });

  it('é determinístico e valida os campos', () => {
    expect(JSON.stringify(run('stage2', 'igual'))).toBe(JSON.stringify(run('stage2', 'igual')));
    const broken = fields('stage1');
    broken.stage2 = broken.stage2.slice(0, 7);
    expect(() => createTournamentEngine({ organizations: [user], botPool: [], entryStage: 'stage1', stageFields: broken, seed: 'x' })).toThrow(/stage2 needs exactly 8/);
    const misplaced = fields('stage1');
    expect(() => createTournamentEngine({ organizations: [user], botPool: [], entryStage: 'stage3', stageFields: misplaced, seed: 'x' })).toThrow(/must be placed in stage3/);
    expect(() => createTournamentEngine({ organizations: [user], botPool: bots('b', 15, 70), entryStage: 'stage1', seed: 'x' })).toThrow(/require stageFields/);
  });

  it('sem stageFields o resultado não ganha chaves novas', () => {
    const legacy = runOnlineTournament({ organizations: [user], botPool: bots('b', 15, 75), entryStage: 'stage3', seed: 'legado' });
    expect('stages' in legacy).toBe(false);
    expect('stage' in legacy.rounds[0]).toBe(false);
    expect(legacy.rounds[0].series[0].id).toMatch(/^swiss-r1-m1-/);
  });
});
