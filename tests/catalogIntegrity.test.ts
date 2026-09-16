// tests/catalogIntegrity.test.ts
// Integridade do catálogo versionado (W1 da expansão de jogadores): o x1 é o core seguido da expansão, ids nunca
// colidem, todo time tem cinco jogadores e técnico, e só time de evento principal não aposentado entra no draft e
// no campo de bots. Com a expansão vazia, o x1 se comporta exatamente como o core.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { get, writable } from 'svelte/store';
import manifest from '../src/lib/data/cs/catalog-manifest.json';
import { CATALOG_VERSIONS, CORE_SOURCE, CURRENT_CATALOG_VERSION, EXPANSION_SOURCE, buildCatalog, catalogStoreOf, getCatalog, isCatalogVersion, parseCatalogVersion, type Catalog, type CatalogSource } from '../src/lib/game/catalog';
import { getCoreCatalog } from '../src/lib/game/catalogCore';
import { getTeamPlayers as coreGetTeamPlayers, teams as coreTeams } from '../src/lib/game/data';
import type { CatalogVersion, Coach, HistoricalTeam, Player } from '../src/lib/game/types';

const x1 = getCatalog('x1');
const core = getCatalog('core');

const ids = <T extends { id: string }>(entries: T[]) => entries.map((entry) => entry.id);
const duplicates = (values: string[]) => values.filter((value, index) => values.indexOf(value) !== index);

describe('catálogo x1 (core + expansão)', () => {
  it('a versão atual é conhecida e ausente/desconhecida cai no core', () => {
    expect(CURRENT_CATALOG_VERSION).toBe('x1');
    expect(CATALOG_VERSIONS).toContain(CURRENT_CATALOG_VERSION);
    expect(isCatalogVersion('x1')).toBe(true);
    expect(parseCatalogVersion(undefined)).toBe('core');
    expect(parseCatalogVersion(null)).toBe('core');
    expect(parseCatalogVersion('x9')).toBe('core');
    expect(parseCatalogVersion('x1')).toBe('x1');
    expect(getCatalog('x1')).toBe(x1);
    expect(getCatalog('core')).toBe(getCoreCatalog());
  });

  it('ids são únicos no core + expansão e a expansão nunca colide com o core', () => {
    expect(duplicates(ids(x1.teams))).toEqual([]);
    expect(duplicates(ids(x1.players))).toEqual([]);
    expect(duplicates(ids(x1.coaches))).toEqual([]);
    const coreTeamIds = new Set(ids(CORE_SOURCE.teams));
    const corePlayerIds = new Set(ids(CORE_SOURCE.players));
    const coreCoachIds = new Set(ids(CORE_SOURCE.coaches));
    expect(ids(EXPANSION_SOURCE.teams).filter((id) => coreTeamIds.has(id))).toEqual([]);
    expect(ids(EXPANSION_SOURCE.players).filter((id) => corePlayerIds.has(id))).toEqual([]);
    expect(ids(EXPANSION_SOURCE.coaches).filter((id) => coreCoachIds.has(id))).toEqual([]);
  });

  it('todo time tem cinco jogadores existentes, no próprio time, e um técnico', () => {
    const problems = x1.teams.flatMap((team) => {
      const playerIds = team.players ?? [];
      const roster = playerIds.map((id) => x1.playerById.get(id));
      return [
        ...(playerIds.length === 5 ? [] : [`${team.id} tem ${playerIds.length} jogadores`]),
        ...playerIds.filter((id) => !x1.playerById.has(id)).map((id) => `${team.id} referencia ${id} inexistente`),
        ...roster.filter((player): player is Player => player !== undefined).filter((player) => player.teamId !== team.id).map((player) => `${player.id} pertence a ${player.teamId}, não a ${team.id}`),
        ...(x1.coachByTeamId.has(team.id) ? [] : [`${team.id} sem técnico`])
      ];
    });
    expect(problems).toEqual([]);
  });

  it('todo jogador e técnico aponta para um time do catálogo', () => {
    expect(x1.players.filter((player) => !player.teamId || !x1.teamById.has(player.teamId)).map((player) => player.id)).toEqual([]);
    expect(x1.coaches.filter((coach) => !x1.teamById.has(coach.teamId)).map((coach) => coach.id)).toEqual([]);
  });

  it('o manifesto bate com os dados (versão, contagens e anos)', () => {
    expect(manifest.version).toBe(CURRENT_CATALOG_VERSION);
    expect(manifest.counts).toEqual({ teams: x1.teams.length, players: x1.players.length, coaches: x1.coaches.length });
    const years = [...new Set(x1.teams.map((team) => Number(team.year)))].sort((left, right) => left - right);
    expect(manifest.years).toEqual(years);
    expect(Array.isArray(manifest.events)).toBe(true);
  });

  it('identities.game.json tem os três mapas vazios ou preenchidos', () => {
    const identities = JSON.parse(readFileSync('src/lib/data/cs/identities.game.json', 'utf8')) as Record<string, unknown>;
    expect(Object.keys(identities).sort()).toEqual(['orgs', 'players', 'teamOrg']);
    for (const key of ['players', 'orgs', 'teamOrg']) expect(identities[key], key).toEqual(expect.any(Object));
  });

  it('o x1 começa pelo core inteiro, na mesma ordem, e segue com a expansão', () => {
    expect(ids(x1.teams).slice(0, core.teams.length)).toEqual(ids(core.teams));
    expect(ids(x1.players).slice(0, core.players.length)).toEqual(ids(core.players));
    expect(ids(x1.coaches).slice(0, core.coaches.length)).toEqual(ids(core.coaches));
    expect(x1.teams.length).toBe(core.teams.length + EXPANSION_SOURCE.teams.length);
    expect(x1.players.length).toBe(core.players.length + EXPANSION_SOURCE.players.length);
  });

  it('o pool de draft e de bots só tem times de evento principal, não aposentados, com cinco jogadores', () => {
    for (const pool of [x1.draftTeams, x1.botTeams]) {
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.filter((team) => (team.eventLevel ?? 'main') !== 'main' || team.retired || x1.getTeamPlayers(team).length !== 5)).toEqual([]);
    }
  });

  it('com a expansão vazia, o x1 se comporta exatamente como o core', () => {
    if (EXPANSION_SOURCE.teams.length || EXPANSION_SOURCE.players.length || EXPANSION_SOURCE.coaches.length) return;
    expect(ids(x1.teams)).toEqual(ids(core.teams));
    expect(ids(x1.players)).toEqual(ids(core.players));
    expect(ids(x1.draftTeams)).toEqual(ids(core.draftTeams));
    expect(ids(x1.botTeams)).toEqual(ids(core.botTeams));
    for (const team of coreTeams) expect(ids(x1.getTeamPlayers(team)), team.id).toEqual(ids(coreGetTeamPlayers(team)));
  });
});

describe('catalogStoreOf (catálogo carimbado na run)', () => {
  it('segue a versão do estado, cai no core sem carimbo e só emite quando a versão muda', () => {
    const state = writable<{ catalogVersion?: CatalogVersion; seed: string }>({ seed: 'a' });
    const store = catalogStoreOf(state);
    const emitted: Catalog[] = [];
    const unsubscribe = store.subscribe((catalog) => emitted.push(catalog));
    expect(get(store)).toBe(core);
    state.set({ seed: 'b' });
    state.set({ seed: 'c', catalogVersion: 'x1' });
    state.set({ seed: 'd', catalogVersion: 'x1' });
    state.set({ seed: 'e', catalogVersion: 'core' });
    unsubscribe();
    expect(emitted).toEqual([core, x1, core]);
  });
});

describe('buildCatalog com fixtures sintéticas', () => {
  const player = (id: string, teamId: string, year: number, extra: Partial<Player> = {}): Player => ({ id, teamId, year, nickname: id, overall: 80, ...extra });
  const coach = (teamId: string, year: number): Coach => ({
    id: `coach-${teamId}`, baseId: `coach-${teamId}`, name: `coach ${teamId}`, teamId, year, game: 'CS2',
    tactics: 70, discipline: 70, aggression: 70, development: 70, overall: 70, rarity: 'common', confidence: 'high', needsReview: false,
    source: { page: null, url: null, year, note: 'fixture' }
  });
  const team = (id: string, year: number, extra: Partial<HistoricalTeam> = {}): { team: HistoricalTeam; players: Player[]; coach: Coach } => {
    const roster = [1, 2, 3, 4, 5].map((index) => player(`${id}-p${index}`, id, year));
    return { team: { id, name: id, year, players: roster.map((entry) => entry.id), ...extra }, players: roster, coach: coach(id, year) };
  };
  const source = (entries: Array<ReturnType<typeof team>>): CatalogSource => ({
    teams: entries.map((entry) => entry.team),
    players: entries.flatMap((entry) => entry.players),
    coaches: entries.map((entry) => entry.coach)
  });

  const coreFixture = source([team('core-b-2016', 2016), team('core-a-2017', 2017)]);
  const main2014 = team('exp-main-2014', 2014, { eventLevel: 'main' });
  const qualifier2013 = team('exp-qual-2013', 2013, { eventLevel: 'qualifier' });
  const retired2015 = team('exp-retired-2015', 2015, { retired: true });
  const implicitMain2013 = team('exp-implicit-2013', 2013);
  const short2014 = { ...team('exp-short-2014', 2014), players: [] as Player[] };
  short2014.team = { ...short2014.team, players: [] };
  const expansionFixture = source([main2014, retired2015, qualifier2013, implicitMain2013, short2014]);
  const catalog = buildCatalog(coreFixture, expansionFixture);

  it('mantém a ordem do core e ordena a expansão por ano e id', () => {
    expect(catalog.version).toBe('x1');
    expect(ids(catalog.teams)).toEqual(['core-b-2016', 'core-a-2017', 'exp-implicit-2013', 'exp-qual-2013', 'exp-main-2014', 'exp-short-2014', 'exp-retired-2015']);
    expect(ids(catalog.coaches)).toEqual(['coach-core-b-2016', 'coach-core-a-2017', 'coach-exp-implicit-2013', 'coach-exp-qual-2013', 'coach-exp-main-2014', 'coach-exp-short-2014', 'coach-exp-retired-2015']);
    expect(ids(catalog.players).slice(0, 10)).toEqual(ids(coreFixture.players));
    expect(ids(catalog.players).slice(10, 15)).toEqual(ids(implicitMain2013.players));
  });

  it('exclui qualificatórias, aposentados e times incompletos do draft e dos bots, mas continua resolvendo por id', () => {
    expect(ids(catalog.draftTeams)).toEqual(['core-b-2016', 'core-a-2017', 'exp-implicit-2013', 'exp-main-2014']);
    expect(ids(catalog.botTeams)).toEqual(ids(catalog.draftTeams));
    expect(catalog.botTeams).not.toBe(catalog.draftTeams);
    expect(catalog.teamById.get('exp-qual-2013')?.eventLevel).toBe('qualifier');
    expect(catalog.teamById.get('exp-retired-2015')?.retired).toBe(true);
    expect(catalog.teamById.has('exp-short-2014')).toBe(true);
    expect(ids(catalog.getTeamPlayers(catalog.teamById.get('exp-qual-2013')!))).toEqual(ids(qualifier2013.players));
    expect(catalog.playerById.has('exp-retired-2015-p1')).toBe(true);
    expect(catalog.coachByTeamId.get('exp-qual-2013')?.id).toBe('coach-exp-qual-2013');
  });

  it('getTeamPlayers devolve uma cópia na ordem de team.players e nada para time nulo', () => {
    const roster = catalog.getTeamPlayers(catalog.teamById.get('core-b-2016')!);
    expect(ids(roster)).toEqual(ids(team('core-b-2016', 2016).players));
    expect(roster).not.toBe(catalog.rosterByTeamId.get('core-b-2016'));
    expect(catalog.getTeamPlayers(null)).toEqual([]);
  });

  it('é pura: não altera as fontes', () => {
    const before = JSON.stringify([coreFixture, expansionFixture]);
    buildCatalog(coreFixture, expansionFixture);
    expect(JSON.stringify([coreFixture, expansionFixture])).toBe(before);
  });
});
