// tests/snakePool.test.ts
// Fila Draft: o pool da sala sai por cotas de raridade e garante função para todo mundo (decisão do dono, 2026-10-06).
import { describe, expect, it } from 'vitest';
import { rollSnakePool } from '../server/snake-pool';
import { RARITIES, rarityOf, type Rarity } from '../src/lib/game/online/collection-rules';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { SNAKE_POOL_PER_PARTICIPANT, SNAKE_POOL_QUOTA, SNAKE_ROLE_MIN_PER_PARTICIPANT, snakeBaseOf } from '../src/lib/game/online/snake-draft';
import type { LineupSlotRole } from '../src/lib/game/types';

const ROLES: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'rifler', 'support'];

describe('pool da Fila Draft', () => {
  it.each([2, 3, 6])('com %i participantes traz exatamente as cotas por raridade, uma versão por jogador', (participants) => {
    const pool = rollSnakePool(`sala-${participants}`, participants);
    expect(pool).toHaveLength(participants * SNAKE_POOL_PER_PARTICIPANT);
    expect(new Set(pool.map(snakeBaseOf)).size).toBe(pool.length);
    const count = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
    for (const player of pool) count[rarityOf(player)] += 1;
    for (const rarity of RARITIES) expect(count[rarity], rarity).toBe(SNAKE_POOL_QUOTA[rarity] * participants);
  });

  it('garante pelo menos duas cartas elegíveis por função para cada participante, em muitas salas', () => {
    for (let index = 0; index < 60; index += 1) {
      const participants = 2 + (index % 5);
      const pool = rollSnakePool(`cobertura-${index}`, participants);
      const coverage = Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<LineupSlotRole, number>;
      for (const player of pool) for (const role of getEligibleSlotRoles(player)) coverage[role] += 1;
      for (const role of ROLES) expect(coverage[role], `${role} na sala ${index}`).toBeGreaterThanOrEqual(participants * SNAKE_ROLE_MIN_PER_PARTICIPANT);
    }
  });

  it('é determinístico pelo seed e muda com ele', () => {
    const ids = (seed: string) => rollSnakePool(seed, 2).map((player) => player.id);
    expect(ids('mesma')).toEqual(ids('mesma'));
    expect(ids('mesma')).not.toEqual(ids('outra'));
  });
});
