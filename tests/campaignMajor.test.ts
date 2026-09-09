import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import {
  advanceCampaignMajor,
  applyCampaignVeto,
  autoDecideCampaign,
  campaignPlayedSeries,
  createCampaignMajor,
  getCampaignLiveView,
  pendingCampaignDecision,
  stepCampaignSeries,
  type CampaignMajorState
} from '../src/lib/game/campaign-major';
import type { SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(roster, teams);
const create = (seed: string, played = {}) =>
  createCampaignMajor(roster, 'balanced', teams, players, seed, lineup, { selectedMaps, mode: 'premier', played });

/** What the gear does when every toggle is on. */
const resolveAll = (state: CampaignMajorState, guard = 40) => {
  let next = state;
  for (let i = 0; i < guard && pendingCampaignDecision(next); i += 1) next = autoDecideCampaign(next);
  return next;
};

const playSeries = (state: CampaignMajorState) => {
  let next = resolveAll(state);
  for (let round = 0; round < 600 && !getCampaignLiveView(next)?.finished; round += 1) {
    next = resolveAll(next);
    next = stepCampaignSeries(next);
  }
  return next;
};

describe('Major da campanha jogado ao vivo', () => {
  it('para no veto do usuário antes de qualquer round', () => {
    const major = create('campanha-veto');
    expect(pendingCampaignDecision(major)).toMatchObject({ kind: 'veto' });
    expect(getCampaignLiveView(major)?.phase).toBe('veto');
    expect(stepCampaignSeries(major)).toBe(major);
  });

  it('aceita o veto do usuário e registra o mapa banido', () => {
    const major = create('campanha-ban');
    const pending = pendingCampaignDecision(major);
    if (pending?.kind !== 'veto') throw new Error('esperava um veto');
    const banned = pending.available[0];
    const after = applyCampaignVeto(major, pending.action, banned);
    expect(getCampaignLiveView(after)?.veto?.steps.some((step) => step.mapId === banned)).toBe(true);
  });

  it('joga a série inteira com tudo automático e alimenta a run com o resultado', () => {
    const major = playSeries(create('campanha-auto'));
    const view = getCampaignLiveView(major);
    expect(view?.finished).toBe(true);
    const series = major.run.matches[0];
    expect(series.winnerId).toBeTruthy();
    expect(series.maps.length).toBeGreaterThan(0);
    expect(series.maps[0].details?.length).toBeGreaterThan(0);
  });

  it('restaura uma campanha salva com o mesmo resultado, sem simular de novo', () => {
    const played = campaignPlayedSeries(advanceCampaignMajor(playSeries(create('campanha-salva'))));
    expect(Object.keys(played)).toHaveLength(1);
    const restored = create('campanha-salva', played);
    const first = restored.run.matches[0];
    const original = Object.values(played)[0];
    expect(first.winnerId).toBe(original.winnerId);
    expect(first.scoreA).toBe(original.scoreA);
    expect(first.scoreB).toBe(original.scoreB);
    expect(pendingCampaignDecision(restored)).toMatchObject({ kind: 'veto' });
  });
});
