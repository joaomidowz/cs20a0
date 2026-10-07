import { collectionCoaches, collectionPlayers } from '../src/lib/game/online/collection-pool';
import { RARITIES, rarityOf, type Rarity } from '../src/lib/game/online/collection-rules';
import { SNAKE_POOL_PER_PARTICIPANT, SNAKE_POOL_QUOTA, SNAKE_ROLE_MIN_PER_PARTICIPANT, snakeBaseOf } from '../src/lib/game/online/snake-draft';
import { createSeededRng } from '../src/lib/game/simulation';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { offerCoaches } from '../src/lib/game/dynasty/coachOffer';
import type { Coach, LineupSlotRole, Player } from '../src/lib/game/types';

/**
 * Fila Draft (protocolo 12): sorteios da sala snake. O pool é montado por COTAS, não por odds: cada participante
 * adiciona `SNAKE_POOL_QUOTA` cartas (1 GOAT, 2 Legends, 3 Superstars, 4 Elites, 2 Raras), uma versão por jogador, e
 * o conjunto garante `SNAKE_ROLE_MIN_PER_PARTICIPANT` cartas elegíveis para cada função por participante. Tudo
 * determinístico pelo seed da sala: dois servidores com o mesmo seed veem o mesmo pool.
 */
const SLOT_ROLES: readonly LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'rifler', 'support'];

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

export function rollSnakePool(seed: string, participants: number): Player[] {
  const rng = createSeededRng(`${seed}:snake`);
  const roleMin = participants * SNAKE_ROLE_MIN_PER_PARTICIPANT;
  const byRarity = new Map<Rarity, Player[]>();
  for (const player of [...collectionPlayers].sort((left, right) => left.id.localeCompare(right.id))) {
    byRarity.set(rarityOf(player), [...(byRarity.get(rarityOf(player)) ?? []), player]);
  }
  for (const [rarity, list] of byRarity) byRarity.set(rarity, shuffle(list, rng));

  const chosen: Player[] = [];
  const bases = new Set<string>();
  const coverage = Object.fromEntries(SLOT_ROLES.map((role) => [role, 0])) as Record<LineupSlotRole, number>;
  const free = (player: Player) => !bases.has(snakeBaseOf(player));
  const take = (player: Player) => {
    chosen.push(player);
    bases.add(snakeBaseOf(player));
    for (const role of getEligibleSlotRoles(player)) coverage[role] += 1;
  };
  const lackingRoles = () => SLOT_ROLES.filter((role) => coverage[role] < roleMin).sort((left, right) => coverage[left] - coverage[right]);
  // Da raridade mais escassa à mais comum: o GOAT e as Legends escolhem primeiro, as Raras completam as funções que faltam.
  const descending = [...RARITIES].reverse();
  const slots: Rarity[] = descending.flatMap((rarity) => Array.from({ length: SNAKE_POOL_QUOTA[rarity] * participants }, () => rarity));
  for (const rarity of slots) {
    const ladder = [rarity, ...descending.filter((other) => other !== rarity)];
    let pick: Player | undefined;
    for (const step of ladder) {
      const bucket = (byRarity.get(step) ?? []).filter(free);
      for (const role of lackingRoles()) {
        pick = bucket.find((player) => getEligibleSlotRoles(player).includes(role));
        if (pick) break;
      }
      pick ??= bucket[0];
      if (pick) break;
    }
    if (!pick) break;
    take(pick);
  }
  // Garantia de função: troca uma carta redundante (todas as funções dela seguem cobertas sem ela) por uma que cubra a que falta.
  for (const role of SLOT_ROLES) {
    for (let guard = 0; coverage[role] < roleMin && guard < roleMin; guard += 1) {
      const candidate = descending.flatMap((rarity) => byRarity.get(rarity) ?? []).find((player) => free(player) && getEligibleSlotRoles(player).includes(role));
      if (!candidate) break;
      const redundant = chosen
        .filter((player) => !getEligibleSlotRoles(player).includes(role) && getEligibleSlotRoles(player).every((other) => coverage[other] - 1 >= roleMin))
        .sort((left, right) => Number(rarityOf(right) === rarityOf(candidate)) - Number(rarityOf(left) === rarityOf(candidate)) || (left.overall ?? 0) - (right.overall ?? 0));
      const out = redundant[0];
      if (out) {
        chosen.splice(chosen.indexOf(out), 1);
        bases.delete(snakeBaseOf(out));
        for (const other of getEligibleSlotRoles(out)) coverage[other] -= 1;
      }
      take(candidate);
    }
  }
  return shuffle(chosen, rng).slice(0, participants * SNAKE_POOL_PER_PARTICIPANT);
}

/** Três coaches por assento (um com 80+), sem restrição de time: o drafter não "veio" de nenhuma organização. */
export function rollSnakeCoachOffer(seed: string, participantId: string, rerollsUsed: number): Coach[] {
  return offerCoaches(collectionCoaches, `${seed}:${participantId}`, [], rerollsUsed);
}
