import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import {
  advanceCampaignMajor,
  autoDecideCampaign,
  campaignPlayedSeries,
  createCampaignMajor,
  getCampaignLiveView,
  pendingCampaignDecision,
  stepCampaignSeries,
  type CampaignMajorState
} from '../src/lib/game/campaign-major';
import type { MajorStage, SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(roster, teams);
const create = (seed: string, dynastyEntryStage: MajorStage, played = {}, dynastyRules: 1 | 2 = 2) =>
  createCampaignMajor(roster, 'balanced', teams, players, seed, lineup, { selectedMaps, mode: 'dynasty', dynastyEntryStage, dynastyRules, played });

const resolveAll = (state: CampaignMajorState, guard = 40) => {
  let next = state;
  for (let i = 0; i < guard && pendingCampaignDecision(next); i += 1) next = autoDecideCampaign(next);
  return next;
};
const playToEnd = (state: CampaignMajorState) => {
  let next = state;
  for (let series = 0; series < 25 && !next.finished; series += 1) {
    for (let round = 0; round < 600 && !getCampaignLiveView(next)?.finished; round += 1) {
      next = resolveAll(next);
      next = stepCampaignSeries(next);
    }
    next = advanceCampaignMajor(next);
  }
  return next;
};

describe('campanha da Dinastia em três estágios', () => {
  it('começa no Stage 1 e a run registra o estágio de entrada', () => {
    const major = create('dinastia-1', 'stage1');
    expect(major.run.entryStage).toBe('stage1');
    expect(major.run.placement).toBe('placementStage1');
    expect(major.run.tournament?.stages?.[0]).toMatchObject({ stage: 'stage1' });
    expect(major.run.tournament?.rounds[0]).toMatchObject({ phase: 'swiss', stage: 'stage1' });
    expect(major.run.tournament?.rounds[0].series.every((series) => series.bestOf === 1)).toBe(true);
  });

  it('preserva MD3 em saves v1 e usa MD3 no Stage 3 v2', () => {
    expect(create('dinastia-v1', 'stage1', {}, 1).run.tournament?.rounds[0].series.every((series) => series.bestOf === 3)).toBe(true);
    expect(create('dinastia-v2-stage3', 'stage3').run.tournament?.rounds.at(-1)?.series.every((series) => series.bestOf === 3)).toBe(true);
  });

  it('joga até o fim com registro por estágio e colocação válida', () => {
    const finished = playToEnd(create('dinastia-fim', 'stage1'));
    expect(finished.finished).toBe(true);
    const { run } = finished;
    expect(run.stages?.stage1?.matches.length).toBeGreaterThanOrEqual(3);
    expect(run.stages?.stage1?.matches.length).toBeLessThanOrEqual(5);
    expect(['placementStage1', 'placementStage2', 'placementStage3', 'placement5to8', 'placement3to4', 'placementRunnerUp', 'placementChampion']).toContain(run.placement);
    if (run.stages?.stage1?.qualified) expect(run.stages.stage2?.matches.length).toBeGreaterThanOrEqual(3);
    else expect(run.stages?.stage2).toBeUndefined();
    expect(run.tournament?.rounds).toHaveLength(18);
    expect(run.tournament?.stages).toHaveLength(3);
    const phases = run.matches.map((match) => match.phase);
    const order = ['stage1', 'stage2', 'stage3', 'quarterfinal', 'semifinal', 'final'];
    expect([...phases].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(phases);
  }, 30_000);

  it('como Legend entra direto no Stage 3', () => {
    const major = create('dinastia-legend', 'stage3');
    expect(major.run.entryStage).toBe('stage3');
    expect(major.run.placement).toBe('placementStage3');
    // Stages 1 e 2 já resolvidos entre bots (5 + 5) mais a 1ª rodada do Stage 3 em andamento.
    expect(major.run.tournament?.rounds.filter((round) => round.phase === 'swiss')).toHaveLength(11);
    const live = getCampaignLiveView(major);
    expect(live).not.toBeNull();
    const current = major.run.tournament?.rounds.at(-1)?.series.find((series) => series.userMatch);
    expect(current?.phase).toBe('stage3');
  });

  it('restaura as séries jogadas exatamente', () => {
    let major = create('dinastia-restore', 'stage2');
    for (let series = 0; series < 2; series += 1) {
      for (let round = 0; round < 600 && !getCampaignLiveView(major)?.finished; round += 1) {
        major = resolveAll(major);
        major = stepCampaignSeries(major);
      }
      major = advanceCampaignMajor(major);
    }
    const played = campaignPlayedSeries(major);
    expect(Object.keys(played)).toHaveLength(2);
    const restored = create('dinastia-restore', 'stage2', played);
    expect(restored.restoredSeriesIds.sort()).toEqual(Object.keys(played).sort());
    expect(restored.run.matches.slice(0, 2).map((match) => [match.id, match.winnerId])).toEqual(major.run.matches.slice(0, 2).map((match) => [match.id, match.winnerId]));
  });
});
