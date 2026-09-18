// tests/onlineCountries.test.ts
// O mapa de países do online é uma cópia gerada das identidades; este teste falha quando alguém esquece `npm run sync:countries`.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCountriesModule } from '../scripts/sync-online-countries.mjs';
import { PLAYER_COUNTRIES, playerCountryOf } from '../src/lib/game/online/collection-countries';

describe('collection-countries', () => {
  it('está em dia com identities.game.json', () => {
    const identities = JSON.parse(readFileSync('src/lib/data/cs/identities.game.json', 'utf8'));
    expect(readFileSync('src/lib/game/online/collection-countries.ts', 'utf8')).toBe(buildCountriesModule(identities));
    expect(Object.keys(PLAYER_COUNTRIES).length).toBeGreaterThan(400);
  });

  it('resolve por baseId e pelo id com ano', () => {
    expect(playerCountryOf({ id: 'device-2016', baseId: 'device' })).toBe('dk');
    expect(playerCountryOf({ id: 'fallen-2017' })).toBe('br');
    expect(playerCountryOf({ id: 'ninguem-2020' })).toBeNull();
  });
});
