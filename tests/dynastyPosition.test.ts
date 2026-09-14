import { describe, expect, it } from 'vitest';
import { teams } from '../src/lib/game/data';
import { MAX_OFF_ROLE_PENALTY, offRolePlayerIds, positionMultiplier } from '../src/lib/game/dynasty/position';
import { buildDynastyUserTeam } from '../src/lib/game/dynasty/seriesPlan';
import type { LineupSlotRole, Player, SelectedPlayer } from '../src/lib/game/types';

// Same attributes and ids for every roster: only `role` changes, so eligibility is the only difference.
const makePlayer = (id: string, role: string): Player => ({
  id, baseId: id, nickname: id, title: '', traits: [], teamId: `${id}-team`, year: 2020, role, overall: 82, rarity: 'common',
  firepower: 80, clutch: 80, entry: 80, awp: 60, support: 60, igl: 30, experience: 80, consistency: 80, mental: 80
});
const SLOTS: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'support'];
const roster = (roles: string[]) => SLOTS.map((_, index) => makePlayer(`posicao-${index}`, roles[index]));
const lineupOf = (players: Player[]): SelectedPlayer[] => players.map((player, index) => ({ playerId: player.id, selectedSlotRole: SLOTS[index] }));
const plan = { style: 'balanced' as const, tactic: 'standard' as const, study: false };

describe('penalidade de posição da Dinastia', () => {
  it('conta só quem está fora das posições elegíveis', () => {
    const eligible = roster(['awper', 'igl', 'entry', 'lurker', 'support']);
    expect(offRolePlayerIds(eligible, lineupOf(eligible))).toEqual([]);
    const oneOff = roster(['rifler', 'igl', 'entry', 'lurker', 'support']);
    expect(offRolePlayerIds(oneOff, lineupOf(oneOff))).toEqual(['posicao-0']);
    const twoOff = roster(['rifler', 'rifler', 'entry', 'lurker', 'support']);
    expect(offRolePlayerIds(twoOff, lineupOf(twoOff))).toEqual(['posicao-0', 'posicao-1']);
  });

  it('tira 1,5% por jogador, com teto de 7,5%', () => {
    expect(positionMultiplier(0)).toBe(1);
    expect(positionMultiplier(1)).toBeCloseTo(0.985, 10);
    expect(positionMultiplier(3)).toBeCloseTo(0.955, 10);
    expect(positionMultiplier(5)).toBeCloseTo(1 - MAX_OFF_ROLE_PENALTY, 10);
    expect(positionMultiplier(9)).toBeCloseTo(0.925, 10);
    expect(positionMultiplier(-2)).toBe(1);
  });

  it('aplica a penalidade no time da Dinastia sem mexer no resto', () => {
    const eligible = roster(['awper', 'igl', 'entry', 'lurker', 'support']);
    const oneOff = roster(['rifler', 'igl', 'entry', 'lurker', 'support']);
    const base = buildDynastyUserTeam({ players: eligible, lineup: lineupOf(eligible), seed: 'posicao', coach: null, teams, plan });
    const penalized = buildDynastyUserTeam({ players: oneOff, lineup: lineupOf(oneOff), seed: 'posicao', coach: null, teams, plan });
    expect(penalized.power / base.power).toBeCloseTo(0.985, 10);
    expect(penalized.mental).toBe(base.mental);
    expect(penalized.consistency).toBe(base.consistency);
  });
});
