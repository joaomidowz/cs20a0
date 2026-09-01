import { describe, expect, it } from 'vitest';
import {
  assignGoldenSquadResponsibilities,
  selectGoldenStrategy
} from '../src/lib/game/replay/golden/tactics';

describe('Mirage golden tactics', () => {
  it('makes aggressive teams faster without removing smoke executions', () => {
    const plans = Array.from({ length: 512 }, (_, index) => selectGoldenStrategy('aggressive', `aggressive:${index}`));
    const rushOrMid = plans.filter((plan) => plan.kind.includes('rush') || plan.kind.startsWith('mid_')).length;

    expect(rushOrMid).toBeGreaterThan(plans.length * 0.5);
    expect(plans.every((plan) => plan.smokeTargets.length > 0)).toBe(true);
    expect(plans.every((plan) => plan.flashTargets.length === 4)).toBe(true);
    expect(plans.reduce((sum, plan) => sum + plan.executeAtSeconds, 0) / plans.length).toBeLessThan(18);
  });

  it('makes tactical teams slower and more coordinated', () => {
    const plans = Array.from({ length: 512 }, (_, index) => selectGoldenStrategy('tactical', `tactical:${index}`));

    expect(plans.reduce((sum, plan) => sum + plan.executeAtSeconds, 0) / plans.length).toBeGreaterThan(23);
    expect(plans.every((plan) => plan.smokeTargets.length === 4)).toBe(true);
    expect(plans.every((plan) => plan.molotovTargets.length === 2)).toBe(true);
    expect(plans.filter((plan) => plan.coordinatedUtilityCount >= 9).length).toBeGreaterThan(plans.length * 0.7);
  });

  it('keeps balanced weights equal to the HTML gold baseline', () => {
    const plan = selectGoldenStrategy('balanced', 'balanced:fixed');

    expect(plan.profile.weights).toEqual({ exec: 1, rush: 0.35, mid: 0.9, slow: 0.7, split: 0.8 });
  });

  it('assigns squad responsibilities without changing selected roles', () => {
    const players = [
      { id: 'awper', selectedRole: 'awper' as const },
      { id: 'igl', selectedRole: 'igl' as const },
      { id: 'entry', selectedRole: 'entry' as const },
      { id: 'lurker', selectedRole: 'lurker' as const },
      { id: 'support', selectedRole: 'support' as const }
    ];
    const selectedRoles = players.map((player) => player.selectedRole);
    const strategy = selectGoldenStrategy('balanced', 'responsibilities:fixed');
    const assignments = assignGoldenSquadResponsibilities(players, strategy);
    const byPlayer = new Map(assignments.map((assignment) => [assignment.playerId, assignment]));

    expect(players.map((player) => player.selectedRole)).toEqual(selectedRoles);
    expect(byPlayer.get('entry')?.responsibility).toBe('ENTRY');
    expect(byPlayer.get('support')?.responsibility).toBe('BANGER');
    expect(byPlayer.get('igl')?.responsibility).toBe('TRADER');
    expect(byPlayer.get('awper')?.responsibility).toBe('SECOND');
    expect(byPlayer.get('lurker')?.responsibility).toBe('LURK');
    expect(byPlayer.get('entry')?.stackOrder).toBe(Math.min(...assignments.map((assignment) => assignment.stackOrder)));
    expect(byPlayer.get('lurker')?.separateRoute).toBe(!strategy.kind.includes('rush'));
  });
});
