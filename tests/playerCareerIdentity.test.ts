// tests/playerCareerIdentity.test.ts
// Identidade dos times (D3): FURIA e paiN continuam brasileiras e time da América do Sul continua sul-americano em
// todos os caminhos de entrada no mundo da carreira.
import { describe, expect, it } from 'vitest';
import { coreCountryOf, keepsIdentity, memberCountryIn, nationFits, orgIdentity, orgNation, sceneOrgById, sceneOrgs, type SceneRosterMember } from '../src/lib/game/playerCareer/data';

const member = (nick: string, country: string | null): SceneRosterMember => ({ nick, country, birthDate: null, roles: [], catalogBaseId: null, prospect: null });
const swap = (roster: SceneRosterMember[], out: string, incoming: SceneRosterMember) => roster.map((other) => (other.nick === out ? incoming : other));
const furiaLike = [member('a', 'Brazil'), member('b', 'Brazil'), member('c', 'Brazil'), member('d', 'Latvia'), member('e', 'Kazakhstan')];

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

describe('regra de identidade', () => {
  it('a identidade sai do elenco de partida: FURIA e paiN brasileiras, 9z sul-americana sem país único', () => {
    expect(orgIdentity('furia-2026')).toEqual({ nation: 'Brazil', southAmerican: true });
    expect(orgIdentity('pain-2026')).toEqual({ nation: 'Brazil', southAmerican: true });
    expect(orgIdentity('9z-2026')).toEqual({ nation: null, southAmerican: true });
  });

  it('conta o elenco DEPOIS da troca: com 3 brasileiros, sai brasileiro e entra estrangeiro não passa', () => {
    expect(keepsIdentity('furia-2026', furiaLike, swap(furiaLike, 'a', member('x', 'Denmark')))).toBe(false);
    expect(keepsIdentity('furia-2026', furiaLike, swap(furiaLike, 'd', member('x', 'Denmark')))).toBe(true);
    expect(keepsIdentity('furia-2026', furiaLike, swap(furiaLike, 'a', member('x', 'Brazil')))).toBe(true);
  });

  it('jogador sem país conhecido não passa automaticamente', () => {
    expect(keepsIdentity('furia-2026', furiaLike, swap(furiaLike, 'a', member('x', null)))).toBe(false);
    expect(nationFits(furiaLike, null)).toBe(false);
    expect(nationFits(furiaLike, 'Brazil')).toBe(true);
  });

  it('time da região SA aceita qualquer sul-americano, mas não fica com menos de 3', () => {
    const nineZ = [member('a', 'Uruguay'), member('b', 'Uruguay'), member('c', 'Argentina'), member('d', 'Argentina'), member('e', 'Chile')];
    expect(keepsIdentity('9z-2026', nineZ, swap(nineZ, 'a', member('x', 'Brazil')))).toBe(true);
    const three = swap(swap(nineZ, 'a', member('y', 'Denmark')), 'b', member('z', 'France'));
    expect(keepsIdentity('9z-2026', nineZ, three)).toBe(true);
    expect(keepsIdentity('9z-2026', three, swap(three, 'c', member('w', 'Poland')))).toBe(false);
  });

  it('time que começou abaixo de 3 não perde mais ninguém da identidade', () => {
    const academy = sceneOrgById.get('pain-gaming-academy-2026')!;
    const brazilian = academy.roster.find((other) => other.country === 'Brazil')!;
    expect(keepsIdentity(academy.id, academy.roster, swap(academy.roster, brazilian.nick, member('x', null)))).toBe(false);
    const unknown = academy.roster.find((other) => other.country === null)!;
    expect(keepsIdentity(academy.id, academy.roster, swap(academy.roster, unknown.nick, member('x', 'Denmark')))).toBe(true);
  });

  it('quem sobe da base vem do país do núcleo; time sul-americano sem núcleo sobe um sul-americano', () => {
    expect(coreCountryOf('furia-2026', furiaLike, 'Latvia')).toBe('Brazil');
    expect(coreCountryOf('9z-2026', sceneOrgById.get('9z-2026')!.roster, 'Denmark')).toBe('Argentina');
    expect(coreCountryOf('9z-2026', sceneOrgById.get('9z-2026')!.roster, 'Chile')).toBe('Chile');
    expect(coreCountryOf('vitality-2026', [], 'Denmark')).toBe('Denmark');
  });
});
