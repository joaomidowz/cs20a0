// tests/playerCareerSeats.test.ts
// A vaga que você toma e a posição de cada parceiro seguem a função REAL do jogador: a coleta da cena ou, quando
// ela veio vazia, o catálogo do jogo (caso Vitality: apEX, ropz e ZywOo vieram sem função na Liquipedia).
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, seatToTake, type PlayerCareerState, type PlayerRole } from '../src/lib/game/playerCareer/engine';
import { memberNick, memberRoles, sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { sceneOrgEnginePlayers, SLOTS } from '../src/lib/game/playerCareer/live';
import { ensureSquad, matesOf } from '../src/lib/game/playerCareer/squad';

const vitality = sceneOrgs.filter((org) => org.roster.some((member) => member.catalogBaseId === 'zywoo') && org.roster.some((member) => member.catalogBaseId === 'apex'));

function careerAt(orgId: string, role: PlayerRole): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'cascavel', country: 'Brazil', role, seed: `seat-${orgId}-${role}` });
  const org = sceneOrgById.get(orgId)!;
  return { ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken: [seatToTake(org, role)] };
}

describe('vaga pela função real', () => {
  it('na Vitality: AWPer entra no lugar do ZywOo, IGL do apEX, lurker do ropz', () => {
    expect(vitality.length).toBeGreaterThan(0);
    for (const org of vitality) {
      expect(seatToTake(org, 'awper').nick.toLowerCase()).toBe('zywoo');
      expect(seatToTake(org, 'igl').nick.toLowerCase()).toBe('apex');
      expect(seatToTake(org, 'lurker').nick.toLowerCase()).toBe('ropz');
    }
  });

  it('no motor, cada nick fica na posição da sua função (ZywOo no AWP, apEX no IGL)', () => {
    for (const org of vitality) {
      const players = sceneOrgEnginePlayers(org, 'season-key');
      const roleOf = (nick: string) => players.find((player) => (player.nickname ?? '').toLowerCase() === nick)?.role;
      expect(roleOf('zywoo')).toBe('awper');
      expect(roleOf('apex')).toBe('igl');
    }
  });

  it('AWPer na Vitality: o ZywOo sai do elenco e o apEX fica como parceiro', () => {
    const org = vitality[0];
    const nicks = matesOf(careerAt(org.id, 'awper')).map((mate) => (mate.player.nickname ?? '').toLowerCase());
    expect(nicks).toHaveLength(4);
    expect(nicks).not.toContain('zywoo');
    expect(nicks).toContain('apex');
  });

  it('save antigo com a vaga errada do apEX é corrigido ao carregar', () => {
    const org = vitality[0];
    const wrong = { ...careerAt(org.id, 'awper'), seatsTaken: [{ orgId: org.id, orgName: org.name, nick: 'apEX', viaRole: false }] };
    const fixed = ensureSquad(wrong);
    expect(fixed.seatsTaken.at(-1)?.nick.toLowerCase()).toBe('zywoo');
    expect(matesOf(fixed).map((mate) => (mate.player.nickname ?? '').toLowerCase())).toContain('apex');
  });

  it('em toda a cena: quem tem função conhecida e é escolhido pela função, joga essa função', () => {
    for (const org of sceneOrgs) {
      for (const role of ['awper', 'igl', 'entry', 'lurker', 'support'] as PlayerRole[]) {
        const seat = seatToTake(org, role);
        if (!seat.viaRole) continue;
        const member = org.roster.find((candidate) => memberNick(candidate) === seat.nick)!;
        expect(memberRoles(member)).toContain(role);
      }
      const players = sceneOrgEnginePlayers(org, 'k');
      for (const player of players) {
        const member = org.roster.find((candidate) => memberNick(candidate) === player.nickname);
        const primary = member ? memberRoles(member)[0] : undefined;
        // Se a função principal é uma posição do motor e ela não foi tomada por outro com a mesma função, bate.
        if (primary && SLOTS.includes(primary) && player.role !== primary) {
          const holder = players.find((candidate) => candidate.role === primary)!;
          const holderMember = org.roster.find((candidate) => memberNick(candidate) === holder.nickname);
          expect(holderMember && memberRoles(holderMember).includes(primary)).toBe(true);
        }
      }
    }
  });
});
