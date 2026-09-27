// tests/powerCeiling.test.ts
// O TETO MACIO (2026-09-27, dono): a régua do jogador não corta mais em 99. Até 97,5 nada muda; acima disso cada
// nível de montagem vale uma fração, e a melhor line montável — a Vitality 2025 completa, com as cartas ajustadas
// pelo dono (flameZ 97, mezii 95, dupreeh-2019 96, device-2019 98) — cai em 99,9. Este teste prega:
//   1. a curva em si (joelho, teto, monotonia);
//   2. onde as lines de referência do laboratório caem em QUADRA, agora espalhadas em vez de empilhadas em 99;
//   3. a ordem do topo entre os campeões completos, que tem que nascer das cartas e da montagem (sem lista curada).
// Se o conteúdo mudar (overalls no Studio), o item 3 avisa — e `PLAYER_SOFT_TOP_COURT` é remedido à mão.
import { describe, expect, it } from 'vitest';
import { LAB, labLineup } from './helpers/balanceLab';
import { courtPower, playerCourtLevel, withPlayerBand } from '../src/lib/game/courtPower';
import { PLAYER_CEILING_COURT, PLAYER_SOFT_KNEE, PLAYER_SOFT_TOP_COURT } from '../src/lib/game/balance';
import { applyCollectionLineup, collectionBaseTeam, eligibleRolesOf, toSelectedPlayer, validateLineup, type CollectionSlotRole } from '../src/lib/game/online/collection-lineup';
import { applyCoachToTeam, coachAffinity } from '../src/lib/game/dynasty/coach';
import { collectionCoaches, collectionPlayerById, collectionPlayers, collectionTeams } from '../src/lib/game/online/collection-pool';
import type { OrgStyle, Player } from '../src/lib/game/types';

const STYLES: OrgStyle[] = ['balanced', 'aggressive', 'tactical', 'tempo', 'reativo', 'resiliente'];
const SLOTS: CollectionSlotRole[][] = [
  ['igl', 'awper', 'entry', 'rifler', 'support'], ['igl', 'awper', 'entry', 'lurker', 'support'], ['awper-igl', 'entry', 'rifler', 'lurker', 'support'],
  ['igl', 'awper', 'rifler', 'lurker', 'support'], ['igl', 'awper', 'entry', 'rifler', 'lurker'], ['igl-support', 'awper', 'entry', 'rifler', 'lurker']
];

/** Level on the ruler (before the ceiling) of the best build of these five cards with this coach: every role
 *  template, permutation, plan and star. The same chain the server runs. */
function bestLevel(cards: Player[], coachId: string | null): number {
  let top = -Infinity;
  const perms = (arr: Player[]): Player[][] => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((r) => [x, ...r]));
  const coach = coachId ? collectionCoaches.find((item) => item.id === coachId) : undefined;
  for (const order of perms(cards)) for (const roles of SLOTS) {
    if (!order.every((player, index) => eligibleRolesOf(player).includes(roles[index]))) continue;
    for (const style of STYLES) for (const star of [null, ...order.map((player) => player.id)]) {
      const input = { players: order, roles, starPlayerId: star, style, coachId };
      if (!validateLineup(input, (id) => collectionPlayerById.get(id)).ok) continue;
      const base = collectionBaseTeam(order, style, order.map((player, index) => toSelectedPlayer(player.id, roles[index])), 'ceiling');
      const built = applyCollectionLineup(base, input);
      const team = coach ? applyCoachToTeam(built, coach, coachAffinity(coach, order, collectionTeams)) : built;
      top = Math.max(top, courtPower(team.power));
    }
  }
  return top;
}

const championLevel = (teamId: string): number => {
  const roster = collectionPlayers.filter((player) => player.teamId === teamId).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 5);
  return bestLevel(roster, collectionCoaches.find((coach) => coach.teamId === teamId)?.id ?? null);
};

describe('teto macio: a curva', () => {
  it('até o joelho é a régua; acima, uma fração; nunca passa do teto', () => {
    expect(playerCourtLevel(90)).toBe(90);
    expect(playerCourtLevel(PLAYER_SOFT_KNEE)).toBe(PLAYER_SOFT_KNEE);
    expect(playerCourtLevel(PLAYER_SOFT_TOP_COURT)).toBeCloseTo(PLAYER_CEILING_COURT, 10);
    expect(playerCourtLevel(PLAYER_SOFT_TOP_COURT + 30)).toBe(PLAYER_CEILING_COURT);
    for (let level = 80; level < 120; level += 0.5) expect(playerCourtLevel(level + 0.5)).toBeGreaterThanOrEqual(playerCourtLevel(level));
    // Sem piso: quem começa entra no nível que as cartas dão.
    expect(courtPower(withPlayerBand(rawOf(83)))).toBeCloseTo(83, 6);
  });
});

const rawOf = (court: number): number => { let lo = 0; let hi = 2000; for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (courtPower(mid) < court) lo = mid; else hi = mid; } return (lo + hi) / 2; };

describe('teto macio: as lines de referência em quadra', () => {
  const level = (key: keyof typeof LAB) => courtPower(labLineup(LAB[key]).team.power);

  it('o topo se espalha em vez de empilhar em 99 — e nenhuma line de referência chega ao teto', () => {
    const built = level('goatsBuilt');
    const sk = level('ownerSk');
    const lazy = level('goatsLazy');
    // Medido em 2026-09-27: GOATs montados ~99,1, SK 2017 do dono ~99,4, cinco GOATs sem pensar ~98,5.
    expect(built).toBeGreaterThan(98.8);
    expect(sk).toBeGreaterThan(built);
    expect(sk).toBeLessThan(PLAYER_CEILING_COURT);
    expect(lazy).toBeLessThan(built - 0.4);
    expect(lazy).toBeGreaterThan(98);
  });

  it('carta não substitui montagem: cinco GOATs sem IGL ficam abaixo de superstars bem montadas', () => {
    expect(level('goatsNoIgl')).toBeLessThan(level('superstarsBuilt'));
    expect(level('goatsNoIgl')).toBeLessThan(93);
  });

  it('sem o piso, iniciante e cinco elites têm cada um o seu número', () => {
    expect(level('beginner')).toBeLessThan(level('elites'));
    expect(level('elites')).toBeLessThan(85);
    expect(level('beginner')).toBeGreaterThan(80);
  });
});

describe('teto macio: a ordem do topo nasce das cartas', { timeout: 300_000 }, () => {
  it('a melhor line montável fica no teto e as dinastias vêm logo abaixo, na ordem do elenco e da montagem', () => {
    const levels = Object.fromEntries(['vitality-2025', 'astralis-2019', 'astralis-2018', 'sk-2016', 'luminosity-2016', 'spirit-2024', 'faze-2022'].map((id) => [id, championLevel(id)]));
    const label = Object.entries(levels).map(([id, value]) => `${id} ${value.toFixed(2)}`).join(' · ');
    const best = Math.max(...Object.values(levels));
    // O pino da escala é a melhor line medida: nunca acima dele (subir o conteúdo exige remedir a constante).
    expect(best, label).toBeLessThanOrEqual(PLAYER_SOFT_TOP_COURT + 0.05);
    expect(best, label).toBeGreaterThan(PLAYER_SOFT_TOP_COURT - 1);
    // Enquanto as quatro cartas do dono (flameZ 97, mezii 95, dupreeh-2019 96, device-2019 98) não entram pelo
    // Studio, a Astralis 2018 lidera por elenco + tema; com elas, a ordem pedida é Vitality 2025 > Astralis 2019 >
    // Astralis 2018 > SK 2016. As duas fases são aceitas aqui; o resto da escada é fixo.
    const order = Object.entries(levels).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    if (order[0] === 'vitality-2025') expect(order.slice(0, 4), label).toEqual(['vitality-2025', 'astralis-2019', 'astralis-2018', 'sk-2016']);
    else {
      expect(order[0], label).toBe('astralis-2018');
      expect(order.slice(0, 3), label).toContain('vitality-2025');
    }
    expect(levels['sk-2016'], label).toBeGreaterThan(levels['luminosity-2016']);
    expect(levels['luminosity-2016'], label).toBeGreaterThan(levels['faze-2022']);
    // Em quadra, o topo lê 99,8–99,9 e a FaZe 2022 fica abaixo de 99,5.
    expect(playerCourtLevel(best)).toBeGreaterThanOrEqual(99.8);
    expect(playerCourtLevel(levels['faze-2022'])).toBeLessThan(99.5);
  });
});
