import { describe, expect, it } from 'vitest';
import { getTeamPlayers, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { autoDecideSandbox, createSandboxMajor, getSandboxLiveView, pendingSandboxDecision, stepSandboxSeries } from '../src/lib/game/sandbox/major';
import type { SandboxLineupSelection, SandboxMajorState } from '../src/lib/game/sandbox/types';

const organization = teams[0];
const roster = getTeamPlayers(organization).slice(0, 5);
const selection: SandboxLineupSelection = {
  organizationId: organization.id,
  style: 'balanced',
  players: roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' })),
  mapPreferences: getDefaultMapSelection(roster, teams)
};

/** The loop the gear runs in the page: take every pending decision automatically. */
const resolveAll = (state: SandboxMajorState, guard = 40): SandboxMajorState => {
  let next = state;
  for (let i = 0; i < guard && pendingSandboxDecision(next); i += 1) next = autoDecideSandbox(next);
  return next;
};

describe('automação das decisões do Sandbox', () => {
  it('resolve o veto inteiro sozinho quando os toggles estão ligados', () => {
    let major = createSandboxMajor(selection, 'gear-auto', { interactive: true });
    expect(pendingSandboxDecision(major)).toMatchObject({ kind: 'veto' });

    major = resolveAll(major);

    expect(pendingSandboxDecision(major)).toBeNull();
    const view = getSandboxLiveView(major);
    expect(view?.veto?.steps.length).toBeGreaterThan(0);
    expect(view?.phase).not.toBe('veto');
  });

  it('leva a série até o fim sem nunca parar em uma decisão', () => {
    let major = resolveAll(createSandboxMajor(selection, 'gear-auto-run', { interactive: true }));
    for (let round = 0; round < 400 && !getSandboxLiveView(major)?.finished; round += 1) {
      major = resolveAll(major);
      major = stepSandboxSeries(major);
    }
    const view = getSandboxLiveView(major);
    expect(view?.finished).toBe(true);
    expect(pendingSandboxDecision(major)).toBeNull();
  });

  it('mantém a decisão pendente quando o jogador não automatiza nada', () => {
    const major = createSandboxMajor(selection, 'gear-manual', { interactive: true });
    expect(pendingSandboxDecision(major)).toMatchObject({ kind: 'veto' });
    expect(stepSandboxSeries(major)).toBe(major);
  });
});
