import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { buildDynastyUserTeam, confirmSeriesPlan, studiesLeft, studyBudget } from '../src/lib/game/dynasty/seriesPlan';
import { needsStyleBeforeDraft } from '../src/lib/game/draftFlow';
import type { Coach, DynastyMajorPlan, SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const coach = (patch: Partial<Coach> = {}): Coach => ({ id: 'coach', baseId: 'coach', name: 'Coach', teamId: 'unrelated-team', year: 2026, game: 'cs2', tactics: 70, discipline: 70, aggression: 70, development: 70, overall: 70, rarity: 'common', confidence: 'high', needsReview: false, source: { page: null, url: null, year: null, note: '' }, ...patch });
const plan: DynastyMajorPlan = { majorNumber: 1, rules: 2, training: null, basePlan: { style: 'balanced', tactic: 'standard', study: false }, plans: {}, confirmed: true };

describe('planos por série da Dinastia', () => {
  it('escolhe a identidade depois do draft na Dinastia e no PRO', () => {
    expect(needsStyleBeforeDraft('dynasty')).toBe(false);
    expect(needsStyleBeforeDraft('pro')).toBe(false);
    expect(needsStyleBeforeDraft('premier')).toBe(true);
  });
  it('aplica o estilo v2 sem os multiplicadores legados e mantém coach 70 neutro', () => {
    const plain = buildDynastyUserTeam({ players: roster, lineup, seed: 'plan', coach: null, teams, plan: { style: 'balanced', tactic: 'standard', study: false } });
    const neutral = buildDynastyUserTeam({ players: roster, lineup, seed: 'plan', coach: coach(), teams, plan: { style: 'balanced', tactic: 'standard', study: false } });
    expect(neutral.power).toBeCloseTo(plain.power, 8);
    expect(plain.power).toBeCloseTo(buildDynastyUserTeam({ players: roster, lineup, seed: 'plan', coach: null, teams, plan: { style: 'tactical', tactic: 'standard', study: false } }).power, 8);
    const aggressive = buildDynastyUserTeam({ players: roster, lineup, seed: 'plan', coach: null, teams, plan: { style: 'aggressive', tactic: 'standard', study: false } });
    expect(plain.consistency).toBe(Math.min(99, (aggressive.consistency ?? 0) + 8));
  });

  it('escala tática acima de 70, preservando os custos fixos', () => {
    const standard = buildDynastyUserTeam({ players: roster, lineup, seed: 'tactic', coach: coach({ aggression: 100 }), teams, plan: { style: 'balanced', tactic: 'standard', study: false } });
    const pressure = buildDynastyUserTeam({ players: roster, lineup, seed: 'tactic', coach: coach({ aggression: 100 }), teams, plan: { style: 'balanced', tactic: 'pressure', study: false } });
    expect(pressure.power / standard.power).toBeCloseTo(1.008, 6);
    expect(pressure.mental).toBeCloseTo(standard.mental - 1, 6);
    expect(pressure.coachSidePreference).toBeCloseTo((standard.coachSidePreference ?? 0) - 0.01, 6);
  });

  it('dá 3 estudos, ou 4 com coach tático, e consome ao confirmar', () => {
    expect(studyBudget(null)).toBe(3);
    expect(studyBudget(coach({ tactics: 85 }))).toBe(4);
    const once = confirmSeriesPlan(plan, 'series-1', { style: 'balanced', tactic: 'standard', study: true }, null);
    expect(studiesLeft(once, null)).toBe(2);
    expect(() => confirmSeriesPlan(once, 'series-1', { style: 'aggressive', tactic: 'standard', study: true }, null)).toThrow(/confirmado/);
  });

  it('estudo multiplica o poder da série em 1,5%', () => {
    const base = buildDynastyUserTeam({ players: roster, lineup, seed: 'study', coach: null, teams, plan: { style: 'aggressive', tactic: 'standard', study: false } });
    const studied = buildDynastyUserTeam({ players: roster, lineup, seed: 'study', coach: null, teams, plan: { style: 'aggressive', tactic: 'standard', study: true } });
    expect(studied.power / base.power).toBeCloseTo(1.015, 6);
  });
});
