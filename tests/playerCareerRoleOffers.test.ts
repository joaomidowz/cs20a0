// tests/playerCareerRoleOffers.test.ts
// Propostas de função: "o time não tem IGL" só quando é verdade, avaliar não é aceitar, e há proposta para AWPer, entry,
// lurker, rifler e suporte quando a carta não é ruim na função nova.
import { describe, expect, it } from 'vitest';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, startSeason, type PlayerCareerState, type PlayerRole } from '../src/lib/game/playerCareer/engine';
import { HAPPENING_BY_ID, roleMoveOf, rollHappening } from '../src/lib/game/playerCareer/happenings';
import { conditionsHold, careerCtx } from '../src/lib/game/playerCareer/conditions';
import { bestOtherRole, matesOf } from '../src/lib/game/playerCareer/squad';

const careerAs = (role: PlayerRole, seed: string, level = 1): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role, seed });
  const orgId = level === 5 ? 'lan-house' : sceneOrgs.find((org) => org.level === level)!.id;
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken: [] });
};

describe('propostas de função', () => {
  it('avaliar com a comissão não vira IGL; aceitar vira', () => {
    expect(roleMoveOf('EV144', 0)).toBeNull();
    expect(roleMoveOf('EV144', 1)).toBe('igl');
  });

  it('uma proposta por função nas três fases, com a condição de encaixe', () => {
    const roles = ['awper', 'entry', 'lurker', 'rifler'] as const;
    for (const [index, role] of roles.flatMap((role) => [role, role, role]).entries()) {
      const id = `FUN${String(index + 1).padStart(3, '0')}`;
      const event = HAPPENING_BY_ID.get(id)!;
      expect(event, id).toBeTruthy();
      expect(roleMoveOf(id, 0)).toBe(role);
      expect(roleMoveOf(id, 1)).toBeNull();
      expect(roleMoveOf(id, 2)).toBeNull();
    }
    expect(roleMoveOf('NOV024', 1)).toBe('support');
  });

  it('a proposta só aparece para outra função e com a carta não muito abaixo nela', () => {
    const awper = careerAs('awper', 'role-offer-1');
    const ctx = careerCtx(awper, 'between', null);
    expect(conditionsHold(['combina_com awper'], ctx)).toBe(false);
    expect(conditionsHold(['combina_com lurker'], ctx)).toBe(true);
    // A IGL tem AWP 12 abaixo do overall: proposta de AWP não aparece.
    expect(conditionsHold(['combina_com awper'], careerCtx(careerAs('igl', 'role-offer-2'), 'between', null))).toBe(false);
  });

  it('"o time não tem IGL" nunca sai com IGL no elenco', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const state = careerAs('rifler', `no-igl-${seed}`, 5);
      const next = rollHappening(state, 'between', { eventIndex: 0 } as never);
      if (next.pendingHappening?.id !== 'EV007') continue;
      expect(state.role === 'igl' || matesOf(state).some((mate) => mate.player.role === 'igl')).toBe(false);
    }
  });

  it('"a sua melhor função" pode ser rifler', () => {
    const roles = new Set(Array.from({ length: 30 }, (_, seed) => bestOtherRole(careerAs('entry', `best-${seed}`))));
    expect(roles.has('rifler')).toBe(true);
  });
});
