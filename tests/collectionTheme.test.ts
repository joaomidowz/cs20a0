// tests/collectionTheme.test.ts
// Sinergia temática da coleção: contagem por time/país/ano, escada, tetos e o coach como sexto integrante.
import { describe, expect, it } from 'vitest';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { playerCountryOf } from '../src/lib/game/online/collection-countries';
import { SCENE_BLOCS, THEME_BLOC_RATIO, THEME_LADDER, THEME_LADDER_PLAYERS, THEME_LADDER_YEAR, THEME_LINE_CAP, THEME_LOOSE_RATIO, THEME_SECONDARY_RATIO, THEME_TOTAL_CAP, blocOf, eraOf, themeLines, type ThemeMember } from '../src/lib/game/online/collection-theme';

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
  it('a escada premia fechar o tema — e fechar o NÚCLEO é o maior bônus do jogo', () => {
    expect(THEME_LADDER).toMatchObject({ 1: 0, 2: 1.5, 3: 4, 4: 8, 5: 13, 6: 17 });
    for (let count = 2; count <= 5; count += 1) {
      const players = Array.from({ length: 5 }, (_, index) => member(index < count ? { year: 2017 } : { year: 1900 + index }));
      expect(powerOf(themeLines(players, null), 'theme_year')).toBe(THEME_LADDER_YEAR[count]);
    }
  });

  // Buff de país (dono, 2026-10-05): o maior grupo paga a escada cheia e cada grupo secundário de 2+ paga metade.
  it('o maior grupo vale cheio e os secundários pagam metade (3+2 e 2+2+1)', () => {
    const players = [member({ country: 'br' }), member({ country: 'br' }), member({ country: 'br' }), member({ country: 'dk' }), member({ country: 'dk' })];
    expect(powerOf(themeLines(players, null), 'theme_country')).toBe(THEME_LADDER_PLAYERS[3] + THEME_LADDER_PLAYERS[2] * THEME_SECONDARY_RATIO);
    const pares = [member({ country: 'fr' }), member({ country: 'fr' }), member({ country: 'br' }), member({ country: 'br' }), member({ country: 'cn' })];
    expect(powerOf(themeLines(pares, null), 'theme_country')).toBe(THEME_LADDER_PLAYERS[2] + THEME_LADDER_PLAYERS[2] * THEME_SECONDARY_RATIO);
  });

  it('time-ano exato vale cheio e a organização vale metade', () => {
    expect(powerOf(themeLines(five({ teamId: 'sk-2017', org: 'sk' }), null), 'theme_team')).toBe(THEME_LADDER[5]);
    const soOrg = [2016, 2017, 2018, 2019, 2020].map((year) => member({ teamId: `astralis-${year}`, org: 'astralis' }));
    expect(powerOf(themeLines(soOrg, null), 'theme_team')).toBe(THEME_LADDER[5] / 2);
    expect(themeLines(soOrg, null).find((line) => line.key === 'theme_team')?.exact).toBe(false);
  });

  it('país exato vale cheio e o bloco vale THEME_BLOC_RATIO: a NAVI russo-ucraniana ganha pelo bloco', () => {
    const navi = ['ua', 'ru', 'ru', 'ru', 'ua'].map((country) => member({ country }));
    expect(powerOf(themeLines(navi, null), 'theme_country')).toBe(THEME_LADDER_PLAYERS[5] * THEME_BLOC_RATIO);
    expect(themeLines(navi, null).find((line) => line.key === 'theme_country')?.exact).toBe(false);
    const spirit = five({ country: 'ru' });
    expect(powerOf(themeLines(spirit, null), 'theme_country')).toBe(THEME_LADDER_PLAYERS[5]);
    expect(themeLines(spirit, null).find((line) => line.key === 'theme_country')?.exact).toBe(true);
  });

  it('o coach é o sexto de time e ano, e fica fora de país', () => {
    const players = five({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' });
    const semCoach = themeLines(players, null);
    // O teto total (`balance.ts`) é gasto nas linhas maiores primeiro: time fecha em cinco, país fecha, ano pega o resto.
    const total = (lines: ReturnType<typeof themeLines>) => lines.reduce((sum, line) => sum + line.power, 0);
    expect(powerOf(semCoach, 'theme_country')).toBe(THEME_LADDER_PLAYERS[5]);
    expect(powerOf(semCoach, 'theme_team')).toBe(THEME_LADDER[5]);
    expect(total(semCoach)).toBe(Math.min(THEME_TOTAL_CAP, THEME_LADDER[5] + THEME_LADDER_PLAYERS[5] + THEME_LADDER_YEAR[5]));
    const comCoach = themeLines(players, member({ teamId: 'sk-2017', org: 'sk', year: 2017 }));
    expect(powerOf(comCoach, 'theme_team')).toBe(THEME_LADDER[6]);
    expect(powerOf(comCoach, 'theme_country')).toBe(THEME_LADDER_PLAYERS[5]);
    expect(total(comCoach)).toBe(THEME_TOTAL_CAP);
  });

  it('respeita o teto por linha e o teto total', () => {
    const lines = themeLines(five({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' }), member({ teamId: 'sk-2017', org: 'sk', year: 2017 }));
    for (const line of lines) expect(line.power).toBeLessThanOrEqual(THEME_LINE_CAP);
    expect(lines.reduce((sum, line) => sum + line.power, 0)).toBe(THEME_TOTAL_CAP);
  });

  it('line sem tema nenhum não gera linha, e dado faltando não quebra', () => {
    // Anos de eras distintas de propósito: três de 2013–2015 já formariam a linha de era.
    const soltos = [['br', 2013], ['dk', 2016], ['cn', 2018], ['us', 2020], ['tr', 2022]].map(([country, year]) => member({ country: country as string, year: year as number }));
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

describe('tema aplicado na line da coleção', () => {
  it('line temática ganha bônus e line de estrelas soltas quase nada', async () => {
    const { synergyOf, eligibleRolesOf } = await import('../src/lib/game/online/collection-lineup');
    const { collectionPlayerById } = await import('../src/lib/game/online/collection-pool');
    const sk = collectionPlayers.filter((player) => player.teamId === 'sk-2017').sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 5);
    expect(sk).toHaveLength(5);
    const { collectionCoachById } = await import('../src/lib/game/online/collection-pool');
    const roles = sk.map((player) => eligibleRolesOf(player)[0]);
    const temas = synergyOf({ players: sk, roles, starPlayerId: null }).filter((line) => line.key.startsWith('theme_'));
    expect(temas.map((line) => line.key).sort()).toEqual(['theme_country', 'theme_team', 'theme_year']);
    // Sem o coach as linhas fecham no quinto degrau (13 de time + 9 de país + 4,5 de ano), abaixo do teto total.
    expect(temas.reduce((sum, line) => sum + line.power, 0)).toBe(Math.min(THEME_TOTAL_CAP, THEME_LADDER[5] + THEME_LADDER_PLAYERS[5] + THEME_LADDER_YEAR[5]));
    // É o coach do próprio time que fecha as três linhas e leva ao teto.
    const coach = [...collectionCoachById.values()].find((item) => item.teamId === 'sk-2017')!;
    const comCoach = synergyOf({ players: sk, roles, starPlayerId: null, coachId: coach.id }).filter((line) => line.key.startsWith('theme_'));
    expect(comCoach.reduce((sum, line) => sum + line.power, 0)).toBe(THEME_TOTAL_CAP);
    const soltos = ['fallen-2019', 'coldzera-2017', 's1mple-2021', 'donk-2024', 'jl-2024'].map((id) => collectionPlayerById.get(id)!).filter(Boolean);
    expect(soltos).toHaveLength(5);
    const total = synergyOf({ players: soltos, roles: soltos.map((player) => eligibleRolesOf(player)[0]), starPlayerId: null })
      .filter((line) => line.key.startsWith('theme_')).reduce((sum, line) => sum + line.power, 0);
    // Cinco estrelas soltas: sobra só o rastro (dois de org, um par de ano), quase nada perto de um núcleo.
    expect(total).toBeLessThan(2);
  });

  it('o coach entra na contagem de time e ano da line', async () => {
    const { themeOf, eligibleRolesOf } = await import('../src/lib/game/online/collection-lineup');
    const { collectionCoachById } = await import('../src/lib/game/online/collection-pool');
    const sk = collectionPlayers.filter((player) => player.teamId === 'sk-2017').sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 5);
    const coach = [...collectionCoachById.values()].find((item) => item.teamId === 'sk-2017');
    expect(coach).toBeTruthy();
    const roles = sk.map((player) => eligibleRolesOf(player)[0]);
    expect(themeOf({ players: sk, roles, starPlayerId: null, coachId: coach!.id }).find((line) => line.key === 'theme_team')).toMatchObject({ count: 6, exact: true });
    expect(themeOf({ players: sk, roles, starPlayerId: null }).find((line) => line.key === 'theme_team')).toMatchObject({ count: 5, exact: true });
  });
});

// Buff de era (dono, 2026-10-05): o nível frouxo da linha de ano.
describe('eras', () => {
  it('os baldes cobrem 2013–2026 e cortam onde a cena cortou', () => {
    expect(eraOf(2013)).toBe('2013–2015');
    expect(eraOf(2015)).toBe('2013–2015');
    expect(eraOf(2016)).toBe('2016–2017');
    expect(eraOf(2019)).toBe('2018–2019');
    expect(eraOf(2021)).toBe('2020–2021');
    expect(eraOf(2023)).toBe('2022–2023');
    expect(eraOf(2024)).toBe('2024–2026');
    expect(eraOf(2026)).toBe('2024–2026');
    expect(eraOf(null)).toBeNull();
    expect(eraOf(2012)).toBeNull();
  });

  it('mesma era paga THEME_LOOSE_RATIO e perde para o ano exato fechado', () => {
    const mista = [2024, 2024, 2025, 2025, 2026].map((year) => member({ year }));
    const frouxa = themeLines(mista, null).find((line) => line.key === 'theme_year');
    expect(frouxa).toMatchObject({ exact: false, count: 5, theme: '2024–2026' });
    expect(frouxa?.power).toBe(THEME_LADDER_YEAR[5] * THEME_LOOSE_RATIO);
    const fechada = themeLines(five({ year: 2025 }), null).find((line) => line.key === 'theme_year');
    expect(fechada).toMatchObject({ exact: true, count: 5, theme: '2025' });
    expect(fechada?.power).toBe(THEME_LADDER_YEAR[5]);
  });

  it('a era frouxa dá a linha de ano mas NÃO conta como química', async () => {
    const { synergyOf, themeOf, eligibleRolesOf } = await import('../src/lib/game/online/collection-lineup');
    const { collectionOrganizationKeyByTeamId } = await import('../src/lib/game/online/collection-pool');
    // Cinco estranhos da era 2024–26: orgs e países todos diferentes, no máximo dois por ano exato.
    const picked: typeof collectionPlayers[number][] = [];
    const orgs = new Set<string>();
    const countries = new Set<string>();
    const perYear = new Map<number, number>();
    for (const player of collectionPlayers) {
      const year = player.year ?? 0;
      if (year < 2024 || year > 2026) continue;
      const org = collectionOrganizationKeyByTeamId.get(player.teamId ?? '') ?? player.teamId ?? '';
      const country = playerCountryOf(player);
      if (!country || countries.has(country) || orgs.has(org) || (perYear.get(year) ?? 0) >= 2) continue;
      picked.push(player);
      orgs.add(org);
      countries.add(country);
      perYear.set(year, (perYear.get(year) ?? 0) + 1);
      if (picked.length === 5) break;
    }
    expect(picked).toHaveLength(5);
    const roles = picked.map((player) => eligibleRolesOf(player)[0]);
    const input = { players: picked, roles, starPlayerId: null };
    const era = themeOf(input).find((line) => line.key === 'theme_year' && !line.exact);
    expect(era?.count ?? 0).toBeGreaterThanOrEqual(3);
    expect(synergyOf(input).some((line) => line.key === 'no_chemistry')).toBe(true);
  });
});
