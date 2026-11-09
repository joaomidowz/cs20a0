// tests/playerCareerMembers.test.ts
// Jogadores criados na sua carreira (reserva promovido, substituto de quem saiu a seu pedido) são membros do time:
// ficam ao recarregar a página, ao trocar de função, na virada da temporada e no time quando você sai. A sessão e o
// recarregamento mostram o mesmo elenco.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, ensureDraw, seatToTake, startSeason, type CareerMember, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { memberRoles, sceneOrgById } from '../src/lib/game/playerCareer/data';
import { addReserve, changeRole, ensureSquad, matesOf, promoteReserve, seatsWithSeason } from '../src/lib/game/playerCareer/squad';
import { orgPowerIn, registerSeats, rosterIn, sceneWorld, seatMovesOf, slotOfNick, worldOrgOfNick, worldRosterIn, worldRosters } from '../src/lib/game/playerCareer/world';

const PAIN = 'pain-2026';
/** Recarregar a página: o save vira texto e volta pelo mesmo caminho do onMount. */
const reload = (state: PlayerCareerState): PlayerCareerState => ensureSquad(ensureDraw(JSON.parse(JSON.stringify(state)) as PlayerCareerState));
/** O elenco como a página mostra: registra o save no mundo e lê os 4 parceiros. */
const squad = (state: PlayerCareerState) => {
  registerSeats(state.seed, seatsWithSeason(state));
  return matesOf(state).map((mate) => mate.player.nickname ?? '');
};
const atPain = (seed: string, role: 'awper' | 'igl' = 'awper'): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 'eu', country: 'Brazil', role, seed });
  return startSeason({ ...base, orgId: PAIN, pendingDraw: null, drawDone: true, seatsTaken: [seatToTake(sceneOrgById.get(PAIN)!, role)] });
};
/** Dois reservas gerados promovidos no lugar dos dois primeiros parceiros (o caminho do relato do dono). */
const withTwoPromoted = (state: PlayerCareerState): PlayerCareerState => {
  let next = addReserve(state, 'jovem').state;
  next = promoteReserve(next, matesOf(next)[0].player.id).state;
  next = addReserve(next, 'pugs').state;
  return promoteReserve(next, matesOf(next)[1].player.id).state;
};

describe('cache das vagas', () => {
  it('vaga nova na mesma sessão aparece no mundo como depois de recarregar', () => {
    const seed = 'members-cache-1';
    const vitality = sceneOrgById.get('vitality-2026')!;
    const first = [{ ...seatToTake(sceneOrgById.get(PAIN)!, 'awper'), season: 1 }];
    registerSeats(seed, first);
    expect(seatMovesOf(seed)).toHaveLength(1);
    worldRosters(seed, 1);
    registerSeats(seed, [...first, { ...seatToTake(vitality, 'awper'), season: 1 }]);
    const move = seatMovesOf(seed).find((entry) => entry.fromId === vitality.id);
    expect(move).toBeDefined();
    expect(rosterIn(seed, 1, move!.toId).map((member) => member.nick.toLowerCase())).toContain(move!.nick.toLowerCase());
    expect(rosterIn(seed, 1, vitality.id).map((member) => member.nick.toLowerCase())).toContain(move!.standIn.toLowerCase());
  });
});

describe('recarregar a página', () => {
  it('pc-reload1: AWPer da paiN que virou IGL com 2 reservas promovidos recarrega com o mesmo elenco', () => {
    const live = changeRole(withTwoPromoted(atPain('pc-reload1')), 'igl').state;
    expect(live.role).toBe('igl');
    const before = squad(live);
    expect(before).toContain('sl_reaper');
    expect(squad(reload(live))).toEqual(before);
  });

  it('a vaga guarda a função com que foi tomada e não é refeita depois de trocar de função', () => {
    const live = changeRole(atPain('pc-reload2'), 'igl').state;
    expect(live.seatsTaken[0].role).toBe('awper');
    expect(reload(live).seatsTaken).toEqual(live.seatsTaken);
  });

  it('save antigo sem função na vaga: corrigido uma vez, com a temporada mantida', () => {
    const vitality = sceneOrgById.get('vitality-2026')!;
    const base = createPlayerCareer({ nick: 'eu', country: 'Brazil', role: 'awper', seed: 'members-old-seat' });
    const old: PlayerCareerState = { ...base, orgId: vitality.id, pendingDraw: null, drawDone: true, seasonNumber: 3, year: 2028, seatsTaken: [{ orgId: vitality.id, orgName: vitality.name, nick: 'apEX', viaRole: false, season: 2 }] };
    const fixed = ensureSquad(old);
    expect(fixed.seatsTaken[0].nick.toLowerCase()).toBe('zywoo');
    expect(fixed.seatsTaken[0]).toMatchObject({ season: 2, role: 'awper' });
    expect(ensureSquad({ ...fixed, role: 'igl' }).seatsTaken).toEqual(fixed.seatsTaken);
  });
});

describe('membros da carreira no mundo', () => {
  const seed = 'members-world-1';
  const made = (slot: number, since = 1): CareerMember => ({ nick: 'cria_da_base', role: 'entry', overall: 71, potential: 84, born: 2008, country: 'Brazil', orgId: PAIN, slot, since });

  it('o membro ocupa a posição dele a partir da temporada em que entrou e joga a posição de quem estava nela', () => {
    const world = sceneWorld(seed, 1).rosters.get(PAIN)!;
    registerSeats(seed, [], [made(2)]);
    expect(rosterIn(seed, 1, PAIN)[2]).toMatchObject({ nick: 'cria_da_base', country: 'Brazil', overall: 71, careerMade: true, roles: memberRoles(world[2]) });
    expect(rosterIn(seed, 1, PAIN).filter((_, index) => index !== 2).map((member) => member.nick)).toEqual(world.filter((_, index) => index !== 2).map((member) => member.nick));
    expect(worldRosterIn(seed, 1, PAIN)[2].nick).toBe(world[2].nick);
    registerSeats(seed, [], [made(2, 3)]);
    expect(rosterIn(seed, 2, PAIN)[2].nick).toBe(sceneWorld(seed, 2).rosters.get(PAIN)![2].nick);
    expect(rosterIn(seed, 3, PAIN)[2].nick).toBe('cria_da_base');
  });

  it('acha a posição e o time do mundo de cada jogador (o membro da carreira não é do mundo)', () => {
    const world = sceneWorld(seed, 1).rosters.get(PAIN)!;
    registerSeats(seed, [], [made(2)]);
    expect(slotOfNick(seed, 1, PAIN, world[2].nick)).toBe(2);
    expect(worldOrgOfNick(seed, 1, world[2].nick)).toBe(PAIN);
    expect(worldOrgOfNick(seed, 1, 'cria_da_base')).toBeNull();
    expect(slotOfNick(seed, 1, PAIN, 'cria_da_base')).toBe(-1);
  });

  it('a força do time no ranking não muda com os membros da carreira', () => {
    registerSeats(seed, [], []);
    const before = orgPowerIn(seed, 3, PAIN);
    registerSeats(seed, [], [made(2)]);
    expect(orgPowerIn(seed, 3, PAIN)).toBe(before);
  });
});
