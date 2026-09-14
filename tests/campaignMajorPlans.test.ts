import { describe, expect, it } from 'vitest';
import { coaches, getTeamPlayers, players, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { applyCampaignVeto, createCampaignMajor, currentCampaignSeries, pendingCampaignDecision, setCampaignSeriesPlan } from '../src/lib/game/campaign-major';
import { buildDynastyUserTeam } from '../src/lib/game/dynasty/seriesPlan';
import type { SeriesPlan, SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(roster, teams);
const coach = coaches.find((item) => item.confidence !== 'placeholder')!;
const plan = (style: SeriesPlan['style']): SeriesPlan => ({ style, tactic: 'standard', study: false });
const create = (style: SeriesPlan['style']) => createCampaignMajor(roster, style, teams, players, 'planos-campanha', lineup, { selectedMaps, mode: 'dynasty', dynastyEntryStage: 'stage1', dynastyRules: 2, dynastyPlan: plan(style), coach });

describe('planos no motor da campanha', () => {
  it('não usa o estilo para formar o campo e o primeiro pareamento', () => {
    const balanced = create('balanced');
    const aggressive = create('aggressive');
    expect(aggressive.engine.options.seed).toBe(balanced.engine.options.seed);
    expect(currentCampaignSeries(aggressive)?.config.teamB.id).toBe(currentCampaignSeries(balanced)?.config.teamB.id);
  });

  it('recalibra a série atual de forma determinística e rejeita depois do veto', () => {
    const state = create('balanced');
    const before = currentCampaignSeries(state)!;
    const beforePower = before.config.teamA.id === 'user' ? before.config.teamA.power : before.config.teamB.power;
    const team = buildDynastyUserTeam({ players: roster, lineup, seed: 'planos-campanha', coach, teams, plan: { style: 'aggressive', tactic: 'pressure', study: true } });
    setCampaignSeriesPlan(state, team);
    const after = currentCampaignSeries(state)!;
    expect(after.config.teamA.id === 'user' ? after.config.teamA.power : after.config.teamB.power).not.toBe(beforePower);
    const pending = pendingCampaignDecision(state);
    if (!pending || pending.kind !== 'veto') throw new Error('veto esperado');
    applyCampaignVeto(state, pending.action, pending.available[0]);
    const acceptedPower = state.engine.byId.get('user')!.team.power;
    expect(() => setCampaignSeriesPlan(state, { ...team, power: team.power + 10 })).toThrow(/veto/);
    expect(state.engine.byId.get('user')!.team.power).toBe(acceptedPower);
  });
});
