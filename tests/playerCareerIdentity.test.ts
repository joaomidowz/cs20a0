// tests/playerCareerIdentity.test.ts
// Identidade dos times (D3): FURIA e paiN continuam brasileiras e time da América do Sul continua sul-americano em
// todos os caminhos de entrada no mundo da carreira.
import { describe, expect, it } from 'vitest';
import { memberCountryIn, orgNation, sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';

describe('dados de identidade', () => {
  it('FURIA é brasileira (região SA) e yuurih, KSCERATO e FalleN têm país', () => {
    const furia = sceneOrgById.get('furia-2026')!;
    expect(furia.country).toBe('Brazil');
    expect(furia.region).toBe('sa');
    const countryOf = (nick: string) => furia.roster.find((other) => other.nick.toLowerCase() === nick)?.country;
    expect(['yuurih', 'kscerato', 'fallen'].map(countryOf)).toEqual(['Brazil', 'Brazil', 'Brazil']);
    expect(orgNation(furia.roster)).toBe('Brazil');
  });

  it('o país do time não vira país de jogador no mundo: BORRACHEIROS segue sem país (só a carta usa o do time)', () => {
    const borracheiros = sceneOrgs.find((org) => org.name === 'BORRACHEIROS')!;
    expect(borracheiros.roster.every((other) => other.country === null)).toBe(true);
    expect(memberCountryIn(borracheiros.roster[0], { country: 'Brazil' })).toBe('Brazil');
  });
});
