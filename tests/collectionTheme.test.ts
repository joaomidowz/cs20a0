// tests/collectionTheme.test.ts
// Sinergia temática da coleção: contagem por time/país/ano, escada, tetos e o coach como sexto integrante.
import { describe, expect, it } from 'vitest';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { playerCountryOf } from '../src/lib/game/online/collection-countries';
import { SCENE_BLOCS, blocOf } from '../src/lib/game/online/collection-theme';

describe('dados de país da coleção', () => {
  it('todo jogador do pool tem país, para a linha de país nunca depender de dado faltando', () => {
    const semPais = collectionPlayers.filter((player) => !playerCountryOf(player));
    expect(semPais.map((player) => player.baseId ?? player.id)).toEqual([]);
  });
});

describe('blocos da cena', () => {
  it('todo país do pool cai num bloco', () => {
    const paises = new Set(collectionPlayers.map((player) => playerCountryOf(player)).filter((country): country is string => Boolean(country)));
    expect([...paises].filter((country) => !blocOf(country))).toEqual([]);
    expect(paises.size).toBe(52);
  });

  it('agrupa a cena como ela se divide de verdade', () => {
    expect(['ru', 'ua', 'kz'].map(blocOf)).toEqual(['cis', 'cis', 'cis']);
    expect(['dk', 'se'].map(blocOf)).toEqual(['nordic', 'nordic']);
    expect(blocOf('br')).toBe('latam');
    expect(['us', 'ca'].map(blocOf)).toEqual(['northAmerica', 'northAmerica']);
    expect(blocOf('fr')).toBe('westEurope');
    expect(blocOf('pl')).toBe('eastEurope');
    expect(['cn', 'mn'].map(blocOf)).toEqual(['asiaOceania', 'asiaOceania']);
    expect(['tr', 'za'].map(blocOf)).toEqual(['mena', 'mena']);
    expect(blocOf(null)).toBeNull();
    expect(blocOf('zz')).toBeNull();
  });

  it('nenhum país aparece em dois blocos', () => {
    expect(Object.keys(SCENE_BLOCS).length).toBe(52);
  });
});
