// tests/playerCareerBench.test.ts
// Banco e escalação: reserva que entra no lugar de um titular (e quem sai vai para o banco), funções trocadas pelo
// IGL (cada um aceita ou não; fora da função rende menos) e os acontecimentos que mexem no banco.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { addReserve, canSwapRoles, matesOf, OFF_ROLE_PENALTY, planOf, promoteReserve, swapMateRoles } from '../src/lib/game/playerCareer/squad';
import { resolveHappening } from '../src/lib/game/playerCareer/happenings';

const at = (role: 'awper' | 'igl', seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country: 'Brazil', role, seed });
  const org = sceneOrgs.find((candidate) => candidate.name === 'FURIA')!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};
const five = ['awper', 'entry', 'igl', 'lurker', 'support'];
const roles = (state: PlayerCareerState) => [state.role, ...matesOf(state).map((mate) => mate.player.role)].sort();

describe('banco', () => {
  it('o reserva entra no lugar do parceiro, que vai para o banco e não gosta; dá para desfazer', () => {
    const state = at('awper', 'bench-1');
    const { state: withReserve, reserve } = addReserve(state, 'jovem');
    expect(planOf(withReserve).reserve?.nick).toBe(reserve.nick);
    const target = matesOf(withReserve)[0];
    const { state: promoted } = promoteReserve(withReserve, target.player.id);
    const nicks = matesOf(promoted).map((mate) => mate.player.nickname);
    expect(nicks).toContain(reserve.nick);
    expect(nicks).not.toContain(target.player.nickname);
    expect(planOf(promoted).reserve?.nick).toBe(target.player.nickname);
    expect(promoted.relationships[target.player.id]).toBe(target.relationship - 12);
    expect(roles(promoted)).toEqual(five);
    // O titular volta e o jovem volta para o banco.
    const back = matesOf(promoted).find((mate) => mate.player.nickname === reserve.nick)!;
    const { state: undone } = promoteReserve(promoted, back.player.id);
    expect(matesOf(undone).map((mate) => mate.player.nickname)).toContain(target.player.nickname);
    expect(planOf(undone).reserve?.nick).toBe(reserve.nick);
  });

  it('"jovem reserva impressiona": plano de desenvolvimento põe ele no banco; titular na final põe ele no time', () => {
    const state = at('awper', 'bench-2');
    const { state: developing } = resolveHappening({ ...state, pendingHappening: { id: 'EV134', trigger: 'post', eventIndex: 0 } }, 0);
    expect(planOf(developing).reserve).not.toBeNull();
    const { state: starting } = resolveHappening({ ...state, pendingHappening: { id: 'EV134', trigger: 'post', eventIndex: 0 } }, 2);
    expect(Object.keys(planOf(starting).lineup)).toHaveLength(1);
    expect(roles(starting)).toEqual(five);
  });
});

describe('IGL troca funções', () => {
  it('só o IGL troca, uma vez por semana; aceitando, as funções trocam e fora da função ele rende menos', () => {
    expect(canSwapRoles(at('awper', 'swap-0'))).toBe(false);
    let done = false;
    for (let index = 0; index < 12 && !done; index += 1) {
      const state = at('igl', `swap-${index}`);
      expect(canSwapRoles(state)).toBe(true);
      const [a, b] = matesOf(state);
      const before = { a: a.player.overall!, b: b.player.overall! };
      const result = swapMateRoles(state, a.player.id, b.player.id);
      expect(canSwapRoles(result.state)).toBe(false);
      if (!result.done) continue;
      done = true;
      const after = matesOf(result.state);
      expect(after.find((mate) => mate.player.id === a.player.id)!.player.role).toBe(b.player.role);
      expect(after.find((mate) => mate.player.id === b.player.id)!.player.role).toBe(a.player.role);
      expect(after.find((mate) => mate.player.id === a.player.id)!.player.overall).toBeLessThanOrEqual(before.a - OFF_ROLE_PENALTY + 2);
      expect(roles(result.state)).toEqual(five);
    }
    expect(done).toBe(true);
  });
});

describe('Rookie of the Year', () => {
  it('quem já apareceu num Top 20 anterior não é mais estreante (nada de rookie com 31 anos)', async () => {
    const { seasonAwards } = await import('../src/lib/game/playerCareer/awards');
    const { rosterIn } = await import('../src/lib/game/playerCareer/world');
    const { memberNick } = await import('../src/lib/game/playerCareer/data');
    const state = at('awper', 'rookie-1');
    const everyone = sceneOrgs.filter((org) => org.level <= 2).flatMap((org) => rosterIn(state.seed, state.seasonNumber, org.id).map((member) => ({ nick: memberNick(member), team: org.name, score: 1 })));
    const veteranWorld = { ...state, history: [{ ...({} as PlayerCareerState['history'][number]), seasonNumber: 0, year: 2025, tournaments: [], hltvTop: everyone }] } as PlayerCareerState;
    const awards = seasonAwards(veteranWorld, 0, 'FURIA');
    expect(awards.rookie === null || awards.rookie.you).toBe(true);
  });
});
