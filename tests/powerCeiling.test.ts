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
import { playerCountryOf } from '../src/lib/game/online/collection-countries';
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
    // O pino da escala passou a ser o híbrido BR (ver o bloco das seleções): os campeões completos ficam logo
    // abaixo dele — nunca acima, e perto o bastante para o topo da tabela continuar lendo ~99,8.
    expect(best, label).toBeLessThanOrEqual(PLAYER_SOFT_TOP_COURT + 0.05);
    expect(best, label).toBeGreaterThan(PLAYER_SOFT_TOP_COURT - 1.2);
    // Re-baseline 2026-10-05: com o catálogo publicado (hash 92003799c82e38a1, revisões de 2026-09-30), a era
    // brasileira lidera — SK 2016 (116,70) e Luminosity 2016 (116,30) à frente da Vitality 2025 (115,87),
    // Astralis 2019 (115,60) e Astralis 2018 (115,29). A ordem continua nascendo das cartas, sem lista curada.
    const order = Object.entries(levels).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    expect(order.slice(0, 5), label).toEqual(['sk-2016', 'luminosity-2016', 'vitality-2025', 'astralis-2019', 'astralis-2018']);
    expect(levels['sk-2016'], label).toBeGreaterThan(levels['luminosity-2016']);
    expect(levels['luminosity-2016'], label).toBeGreaterThan(levels['faze-2022']);
    // Em quadra, o melhor campeão completo lê ~99,79 (o 99,9 é do híbrido BR) e a FaZe 2022 fica abaixo de 99,5.
    expect(playerCourtLevel(best)).toBeGreaterThanOrEqual(99.75);
    expect(playerCourtLevel(levels['faze-2022'])).toBeLessThan(99.5);
  });
});

// Buff de país/era (dono, 2026-10-05): as seleções nacionais são o ponto cego que este bloco fecha — nenhuma
// pode passar do pino em silêncio (acima de PLAYER_SOFT_TOP_COURT a tela crava 99,9 e o teste de ordem não vê).
describe('seleções nacionais ficam sob o pino', { timeout: 300_000 }, () => {
  /** As cinco melhores cartas do país com baseId distinto (a regra de duplicata barra device × 4), garantindo
   *  um capitão e um AWPer elegíveis para a line fechar algum template de funções. */
  const nationalSelection = (country: string): Player[] => {
    const pool: Player[] = [];
    const seen = new Set<string>();
    for (const player of [...collectionPlayers].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))) {
      if (playerCountryOf(player) !== country) continue;
      const base = player.baseId ?? player.id;
      if (seen.has(base)) continue;
      seen.add(base);
      pool.push(player);
    }
    const picked: Player[] = [];
    const take = (player: Player | undefined) => { if (player && !picked.includes(player)) picked.push(player); };
    // Um por papel do template clássico, sempre uma carta nova — cobre igl/awper/entry/rifler/support e
    // garante que o força-bruta encontre pelo menos uma montagem válida.
    take(pool.find((player) => eligibleRolesOf(player).some((role) => role === 'igl' || role === 'awper-igl' || role === 'igl-support')));
    for (const role of ['awper', 'entry', 'rifler', 'support'] as const) {
      take(pool.find((player) => !picked.includes(player) && eligibleRolesOf(player).includes(role)));
    }
    for (const player of pool) { if (picked.length >= 5) break; take(player); }
    return picked;
  };

  /** O melhor nível de régua da seleção com o pior caso de coach: o de maior tática e os com afinidade possível. */
  const selectionLevel = (cards: Player[]): number => {
    const coachIds = new Set<string | null>([null]);
    const topTactics = [...collectionCoaches].sort((a, b) => b.tactics - a.tactics)[0];
    if (topTactics) coachIds.add(topTactics.id);
    for (const coach of collectionCoaches) if (cards.some((card) => card.teamId === coach.teamId)) coachIds.add(coach.id);
    return Math.max(...[...coachIds].map((id) => bestLevel(cards, id)));
  };

  it('as seleções por papéis sobem com o buff mas nenhuma crava 99,9', () => {
    const levels = Object.fromEntries(['dk', 'ru', 'br', 'fr', 'se'].map((country) => {
      const cards = nationalSelection(country);
      expect(cards, country).toHaveLength(5);
      return [country, selectionLevel(cards)];
    }));
    const label = Object.entries(levels).map(([country, level]) => `${country} ${level.toFixed(2)} (tela ${playerCourtLevel(level).toFixed(2)})`).join(' · ');
    console.info(`seleções: ${label}`);
    for (const level of Object.values(levels)) {
      expect(level, label).toBeLessThanOrEqual(PLAYER_SOFT_TOP_COURT - 0.5);
      expect(playerCourtLevel(level), label).toBeGreaterThanOrEqual(99.0);
      expect(playerCourtLevel(level), label).toBeLessThanOrEqual(99.8);
    }
  });

  /** O top-5 cru por overall do país, sem olhar papéis: é esta variante que produz o híbrido BR. */
  const rawSelection = (country: string): Player[] => {
    const pool: Player[] = [];
    const seen = new Set<string>();
    for (const player of [...collectionPlayers].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))) {
      if (playerCountryOf(player) !== country) continue;
      const base = player.baseId ?? player.id;
      if (seen.has(base)) continue;
      seen.add(base);
      pool.push(player);
      if (pool.length === 5) break;
    }
    return pool;
  };

  it('o híbrido BR (4× Luminosity 2016 + fer) É o pino da escala, e nenhum top-5 cru passa dele', () => {
    // Núcleo de 4 + país cheio + ano cabem inteiros no teto temático (o campeão completo é capado em 30):
    // por isso a line mais forte do jogo é esta, não um time completo. Ela define PLAYER_SOFT_TOP_COURT e é a
    // única leitura 99,9 da tela; se o conteúdo mudar e outra line passar dela, este teste avisa.
    const levels = ['dk', 'ru', 'br', 'fr', 'se'].map((country) => {
      const cards = rawSelection(country);
      return [country, cards.length === 5 ? selectionLevel(cards) : -Infinity] as const;
    });
    const label = levels.map(([country, level]) => `${country} ${Number.isFinite(level) ? level.toFixed(2) : 'inviável'}`).join(' · ');
    console.info(`top-5 crus: ${label}`);
    for (const [, level] of levels) expect(level, label).toBeLessThanOrEqual(PLAYER_SOFT_TOP_COURT + 0.05);
    const brHybrid = levels.find(([country]) => country === 'br')?.[1] ?? -Infinity;
    expect(brHybrid, label).toBeGreaterThan(PLAYER_SOFT_TOP_COURT - 0.05);
    expect(playerCourtLevel(brHybrid), label).toBe(PLAYER_CEILING_COURT);
  });
});
