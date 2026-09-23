import { describe, expect, it } from 'vitest';
import { reconcileLineupOwnership } from '../src/lib/game/online/collection-reconciliation';

const original = {
  playerIds: ['owned-awp', 'sold-zywoo', 'owned-entry', null, null],
  roles: ['awper', 'rifler', 'entry', null, null] as const,
  starPlayerId: 'sold-zywoo',
  coachId: 'sold-coach',
  mapPreferences: ['mirage', 'inferno', 'dust2'] as const
};

describe('reconcileLineupOwnership', () => {
  it('remove do rascunho cartas vendidas e seleções dependentes sem alterar o objeto original', () => {
    const result = reconcileLineupOwnership(original, new Set(['owned-awp', 'owned-entry']));

    expect(result).toEqual({
      playerIds: ['owned-awp', null, 'owned-entry', null, null],
      roles: ['awper', null, 'entry', null, null],
      starPlayerId: null,
      coachId: null,
      mapPreferences: []
    });
    expect(original.playerIds[1]).toBe('sold-zywoo');
  });

  it('preserva cartas, treinador, funções, estrela e mapas que continuam possuídos', () => {
    const draft = { ...original, starPlayerId: 'owned-awp', coachId: 'owned-coach' };
    const result = reconcileLineupOwnership(draft, new Set(['owned-awp', 'sold-zywoo', 'owned-entry', 'owned-coach']));

    expect(result).toEqual({ ...draft });
  });
});
