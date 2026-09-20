// tests/collectionTheme.test.ts
// Sinergia temática da coleção: contagem por time/país/ano, escada, tetos e o coach como sexto integrante.
import { describe, expect, it } from 'vitest';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { playerCountryOf } from '../src/lib/game/online/collection-countries';

describe('dados de país da coleção', () => {
  it('todo jogador do pool tem país, para a linha de país nunca depender de dado faltando', () => {
    const semPais = collectionPlayers.filter((player) => !playerCountryOf(player));
    expect(semPais.map((player) => player.baseId ?? player.id)).toEqual([]);
  });
});
