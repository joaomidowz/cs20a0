// tests/collectionTheme.test.ts
// Sinergia temática da coleção: contagem por time/país/ano, escada, tetos e o coach como sexto integrante.
import { describe, expect, it } from 'vitest';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { playerCountryOf } from '../src/lib/game/online/collection-countries';
import { SCENE_BLOCS, THEME_LADDER, THEME_LADDER_PLAYERS, THEME_LINE_CAP, THEME_TOTAL_CAP, blocOf, themeLines, type ThemeMember } from '../src/lib/game/online/collection-theme';

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

const member = (over: Partial<ThemeMember> = {}): ThemeMember => ({ country: null, teamId: null, org: null, year: null, ...over });
const five = (over: Partial<ThemeMember>) => Array.from({ length: 5 }, () => member(over));
const powerOf = (lines: ReturnType<typeof themeLines>, key: string) => lines.find((line) => line.key === key)?.power ?? 0;

describe('regra do tema', () => {
  it('a escada premia fechar o tema', () => {
    expect(THEME_LADDER).toMatchObject({ 1: 0, 2: 0.25, 3: 0.5, 4: 1, 5: 1.5, 6: 2 });
    for (let count = 2; count <= 5; count += 1) {
      const players = Array.from({ length: 5 }, (_, index) => member(index < count ? { year: 2017 } : { year: 1900 + index }));
      expect(powerOf(themeLines(players, null), 'theme_year')).toBe(THEME_LADDER[count]);
    }
  });

  it('vale o maior grupo, não a soma dos grupos', () => {
    const players = [member({ country: 'br' }), member({ country: 'br' }), member({ country: 'br' }), member({ country: 'dk' }), member({ country: 'dk' })];
    expect(powerOf(themeLines(players, null), 'theme_country')).toBe(THEME_LADDER[3]);
  });

  it('time-ano exato vale cheio e a organização vale metade', () => {
    expect(powerOf(themeLines(five({ teamId: 'sk-2017', org: 'sk' }), null), 'theme_team')).toBe(THEME_LADDER[5]);
    const soOrg = [2016, 2017, 2018, 2019, 2020].map((year) => member({ teamId: `astralis-${year}`, org: 'astralis' }));
    expect(powerOf(themeLines(soOrg, null), 'theme_team')).toBe(THEME_LADDER[5] / 2);
    expect(themeLines(soOrg, null).find((line) => line.key === 'theme_team')?.exact).toBe(false);
  });

  it('país exato vale cheio e o bloco vale metade: a NAVI russo-ucraniana ganha pelo bloco', () => {
    const navi = ['ua', 'ru', 'ru', 'ru', 'ua'].map((country) => member({ country }));
    expect(powerOf(themeLines(navi, null), 'theme_country')).toBe(THEME_LADDER_PLAYERS[5] / 2);
    expect(themeLines(navi, null).find((line) => line.key === 'theme_country')?.exact).toBe(false);
    const spirit = five({ country: 'ru' });
    expect(powerOf(themeLines(spirit, null), 'theme_country')).toBe(THEME_LINE_CAP);
    expect(themeLines(spirit, null).find((line) => line.key === 'theme_country')?.exact).toBe(true);
  });

  it('o coach é o sexto de time e ano, e fica fora de país', () => {
    const players = five({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' });
    const semCoach = themeLines(players, null);
    expect(powerOf(semCoach, 'theme_team')).toBe(THEME_LADDER[5]);
    expect(powerOf(semCoach, 'theme_year')).toBe(THEME_LADDER[5]);
    expect(powerOf(semCoach, 'theme_country')).toBe(THEME_LINE_CAP);
    const comCoach = themeLines(players, member({ teamId: 'sk-2017', org: 'sk', year: 2017 }));
    expect(powerOf(comCoach, 'theme_team')).toBe(THEME_LADDER[6]);
    expect(powerOf(comCoach, 'theme_year')).toBe(THEME_LADDER[6]);
    expect(powerOf(comCoach, 'theme_country')).toBe(THEME_LINE_CAP);
  });

  it('respeita o teto por linha e o teto total', () => {
    const lines = themeLines(five({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' }), member({ teamId: 'sk-2017', org: 'sk', year: 2017 }));
    for (const line of lines) expect(line.power).toBeLessThanOrEqual(THEME_LINE_CAP);
    expect(lines.reduce((sum, line) => sum + line.power, 0)).toBe(THEME_TOTAL_CAP);
  });

  it('line sem tema nenhum não gera linha, e dado faltando não quebra', () => {
    const soltos = [['br', 2013], ['dk', 2014], ['cn', 2015], ['us', 2016], ['tr', 2017]].map(([country, year]) => member({ country: country as string, year: year as number }));
    expect(themeLines(soltos, null)).toEqual([]);
    expect(themeLines(five({}), null)).toEqual([]);
    expect(themeLines([], null)).toEqual([]);
  });

  it('o rótulo do tema diz em volta do que a line foi montada', () => {
    const sk = themeLines(five({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' }), null);
    expect(sk.find((line) => line.key === 'theme_team')).toMatchObject({ theme: 'sk-2017', count: 5, exact: true });
    expect(sk.find((line) => line.key === 'theme_country')).toMatchObject({ theme: 'br', count: 5, exact: true });
    expect(sk.find((line) => line.key === 'theme_year')).toMatchObject({ theme: '2017', count: 5 });
  });
});
