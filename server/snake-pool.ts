import { collectionCoaches, collectionPlayers } from '../src/lib/game/online/collection-pool';
import { RARITIES, rarityOf } from '../src/lib/game/online/collection-rules';
import { SNAKE_POOL_PER_PARTICIPANT, dedupeByBase } from '../src/lib/game/online/snake-draft';
import { offerCoaches } from '../src/lib/game/dynasty/coachOffer';
import type { Coach, Player } from '../src/lib/game/types';
import { rollPack } from './collection/packs';

/**
 * Fila Draft (protocolo 12): sorteios da sala snake. O pool nasce de um "pacote ouro" gigante (mesma distribuição de
 * raridade da caixa), com uma versão por jogador e exatamente `SNAKE_POOL_PER_PARTICIPANT` cartas por participante.
 * Tudo determinístico pelo seed da sala: dois servidores com o mesmo seed veem o mesmo pool.
 */
export function rollSnakePool(seed: string, participants: number): Player[] {
  const needed = participants * SNAKE_POOL_PER_PARTICIPANT;
  // Sorteia o dobro porque o dedupe por base (s1mple-2018 e s1mple-2021 são a mesma pessoa) descarta parte das cartas.
  const rolled = dedupeByBase(rollPack('ouro', `${seed}:snake`, collectionPlayers, { size: needed * 2, distinctYears: false }));
  if (rolled.length >= needed) return rolled.slice(0, needed);
  // Caso extremo (pool pequeno): completa com as melhores cartas que faltam, por raridade decrescente e depois overall.
  const taken = new Set(rolled.map((player) => player.id));
  const rank = (player: Player) => RARITIES.indexOf(rarityOf(player));
  const rest = dedupeByBase([...rolled, ...[...collectionPlayers]
    .filter((player) => !taken.has(player.id))
    .sort((left, right) => rank(right) - rank(left) || (right.overall ?? 0) - (left.overall ?? 0) || left.id.localeCompare(right.id))]);
  return rest.slice(0, needed);
}

/** Três coaches por assento (um com 80+), sem restrição de time: o drafter não "veio" de nenhuma organização. */
export function rollSnakeCoachOffer(seed: string, participantId: string, rerollsUsed: number): Coach[] {
  return offerCoaches(collectionCoaches, `${seed}:${participantId}`, [], rerollsUsed);
}
