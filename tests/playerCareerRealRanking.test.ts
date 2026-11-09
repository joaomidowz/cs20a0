// tests/playerCareerRealRanking.test.ts
// D12 (decisão do dono): a cena segue o ranking mundial da HLTV de novembro de 2026. Elencos dos times do ranking,
// rebrands com o id de sempre (os saves continuam achando o time), times novos com o nível pelo ranking (D11) e os
// pontos reais como base do ranking no começo da carreira.
import { describe, expect, it } from 'vitest';
import { applyRealRanking, realRanking, sceneOrgById, sceneOrgs, type RealRankingFile, type SceneOrg } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer } from '../src/lib/game/playerCareer/engine';
import { teamRanking } from '../src/lib/game/playerCareer/ranking';

const ranking = JSON.parse(JSON.stringify(realRanking)) as RealRankingFile;
const orgOf = (rank: number) => sceneOrgs.find((org) => org.worldRank === rank)!;
const nicksOf = (org: SceneOrg) => org.roster.map((member) => member.nick.toLowerCase());
/** Xarás: o nick fica no time de melhor ranking (o outro time completa a vaga com o gerador). */
const HOMONYMS: Record<string, string> = { Salazar: 'Black Phoenix', Drop: 'Chicken Coop', pr: 'Famalicão', rain: 'Vitalem Aerem', Dexter: 'Martians', max: 'RUSH' };

describe('cena pelo ranking HLTV de novembro de 2026', () => {
  it('os 250 times do ranking estão na cena, cada um com a posição e os pontos reais', () => {
    expect(ranking.teams).toHaveLength(250);
    for (const team of ranking.teams) {
      const org = sceneOrgById.get(team.orgId)!;
      expect(org, team.name).toBeDefined();
      expect(org.worldRank, team.name).toBe(team.rank);
      expect(org.worldPoints, team.name).toBe(team.points);
    }
    const ranked = sceneOrgs.filter((org) => org.worldRank != null);
    expect(ranked).toHaveLength(250);
  });

  it('cada time do ranking joga com o elenco da HLTV (menos os xarás) e completa até 5', () => {
    for (const team of ranking.teams) {
      const org = sceneOrgById.get(team.orgId)!;
      expect(org.roster, team.name).toHaveLength(5);
      for (const member of team.roster) expect(nicksOf(org), team.name).toContain(member.nick.toLowerCase());
      expect(org.roster.filter((member) => !member.generated).length, team.name).toBe(team.roster.length);
    }
    expect(nicksOf(orgOf(1))).toEqual(['fallen', 'yuurih', 'yekindar', 'kscerato', 'molodoy']);
    for (const [nick, team] of Object.entries(HOMONYMS)) {
      expect(ranking.teams.find((entry) => entry.name === team)!.roster.some((member) => member.nick === nick), `${nick} ${team}`).toBe(false);
    }
  });

  it('ninguém joga em dois times e não há dois times com o mesmo nome', () => {
    const nicks = sceneOrgs.flatMap(nicksOf);
    expect(new Set(nicks).size).toBe(nicks.length);
    const names = sceneOrgs.map((org) => org.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(sceneOrgs.map((org) => org.id)).size).toBe(sceneOrgs.length);
  });

  it('rebrand troca o nome e mantém o id; o Monte da HLTV é um time novo', () => {
    expect(sceneOrgById.get('3dmax-2026')!.name).toBe('Envy');
    expect(sceneOrgById.get('sharks-2026')!.name).toBe('DENDELE');
    expect(sceneOrgById.get('monte-2026')!.name).toBe('Luminosity');
    // O id antigo da Luminosity (duplicata da coleta) continua caindo na mesma org.
    expect(sceneOrgById.get('luminosity-gaming-2026')!.id).toBe('monte-2026');
    const monte = sceneOrgs.find((org) => org.name === 'Monte')!;
    expect(monte.id).not.toBe('monte-2026');
    expect(monte.worldRank).toBe(145);
    // Variante de nome não renomeia: FaZe da HLTV é a FaZe Clan do jogo.
    expect(sceneOrgById.get('faze-clan-2026')!.name).toBe('FaZe Clan');
    expect(sceneOrgById.get('faze-clan-2026')!.worldRank).toBe(20);
  });

  it('nível pelo ranking real: top 8 Elite, 9 a 16 Tier S, 17 a 30 no máximo Tier A, 31 a 60 no máximo Tier B; time novo do 61º para baixo no Tier C', () => {
    for (const org of sceneOrgs) {
      const rank = org.worldRank;
      if (rank == null) continue;
      if (rank <= 8) expect(org.level, org.name).toBe(0);
      else if (rank <= 16) expect(org.level, org.name).toBe(1);
      else if (rank <= 30) expect(org.level, org.name).toBe(2);
      else if (rank <= 60) expect(org.level, org.name).toBeLessThanOrEqual(3);
    }
    for (const team of ranking.teams.filter((entry) => entry.newOrg && entry.rank > 60)) expect(team.newOrg!.level, team.name).toBe(4);
  });

  it('time fora do ranking fica com quem não saiu: o TDK perde nafany, ArtFr0st e Xant3r e mantém sugaR e NickelBack', () => {
    const tdk = sceneOrgById.get('tdk-2026')!;
    expect(tdk.worldRank).toBeNull();
    expect(nicksOf(tdk)).toEqual(expect.arrayContaining(['sugar', 'nickelback']));
    for (const gone of ['nafany', 'artfr0st', 'xant3r']) expect(nicksOf(tdk)).not.toContain(gone);
    expect(tdk.roster).toHaveLength(5);
  });

  it('jogador que a cena conhece leva a identidade dele (país, nascimento, catálogo) com a grafia da HLTV', () => {
    const device = sceneOrgById.get('100t-2026')!.roster.find((member) => member.nick === 'device')!;
    expect(device).toMatchObject({ country: 'Denmark', birthDate: '1995-09-08', catalogBaseId: 'device' });
    const hunter = sceneOrgById.get('g2-2026')!.roster.find((member) => member.nick === 'huNter-')!;
    expect(hunter.catalogBaseId).toBe('hunter');
  });

  it('FURIA continua brasileira (D3): FalleN, yuurih e KSCERATO', () => {
    const furia = sceneOrgById.get('furia-2026')!;
    const brazilians = furia.roster.filter((member) => member.country === 'Brazil').map((member) => member.nick);
    expect(brazilians).toEqual(expect.arrayContaining(['FalleN', 'yuurih', 'KSCERATO']));
  });
});

describe('applyRealRanking', () => {
  const member = (nick: string, role: string, country: string | null = 'Brazil') => ({ nick, country, birthDate: null, roles: [role], catalogBaseId: null, prospect: null });
  const org = (id: string, name: string, roster: SceneOrg['roster']): SceneOrg => ({ id, name, level: 3, country: 'Brazil', calendarDensity: 10, tournaments: [], roster, sources: [] });
  const scene = [
    org('alfa-2026', 'Alfa', [member('a1', 'igl'), member('a2', 'awp'), member('a3', 'entry'), member('a4', 'support'), member('a5', 'lurker')]),
    org('beta-2026', 'Beta', [member('b1', 'igl'), member('b2', 'awp'), member('b3', 'entry'), member('b4', 'support'), member('b5', 'lurker')])
  ];
  const file: RealRankingFile = {
    source: 'teste',
    aliases: {},
    teams: [
      { rank: 20, name: 'Alfa Nova', points: 100, change: '-', orgId: 'alfa-2026', rename: 'Alfa Nova', roster: [member('a1', 'igl'), member('a2', 'awp'), member('b3', 'entry'), member('zz', 'rifler', null)] },
      { rank: 70, name: 'Gama', points: 9, change: '-', orgId: 'gama-2026', newOrg: { level: 4, country: null, region: 'sa' }, roster: [member('g1', 'igl'), member('g2', 'awp'), member('g3', 'entry')] }
    ]
  };
  const result = applyRealRanking(scene, file);
  const byId = new Map(result.map((entry) => [entry.id, entry]));

  it('rebrand: mesmo id, nome novo e o elenco da HLTV completado até 5', () => {
    const alfa = byId.get('alfa-2026')!;
    expect(alfa.name).toBe('Alfa Nova');
    expect(alfa.roster.slice(0, 4).map((entry) => entry.nick)).toEqual(['a1', 'a2', 'b3', 'zz']);
    expect(alfa.roster).toHaveLength(5);
    expect(alfa.roster[4].generated).toBe(true);
  });

  it('quem saiu de um time fora do ranking abre vaga com a mesma função', () => {
    const beta = byId.get('beta-2026')!;
    expect(beta.roster).toHaveLength(5);
    expect(beta.roster.map((entry) => entry.nick)).not.toContain('b3');
    const replacement = beta.roster.find((entry) => entry.generated)!;
    expect(replacement.roles).toEqual(['entry']);
  });

  it('time novo entra com o nível, a região e o elenco do arquivo', () => {
    const gama = byId.get('gama-2026')!;
    expect(gama).toMatchObject({ name: 'Gama', level: 4, region: 'sa', tournaments: [] });
    expect(gama.roster).toHaveLength(5);
  });
});

describe('ranking no começo da carreira pelos pontos reais', () => {
  it('o top 16 do ranking da carreira é o top 16 da HLTV, na mesma ordem', () => {
    const state = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed: 'ranking-real-start' });
    const top = teamRanking(state).slice(0, 16).map((team) => team.orgId);
    expect(top).toEqual(ranking.teams.slice(0, 16).map((team) => team.orgId));
  });

  it('a base de partida são os pontos reais: nenhum time fora do ranking da HLTV começa à frente de um do top 30', () => {
    const state = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed: 'ranking-real-base' });
    const table = teamRanking(state);
    const worstTop30 = Math.max(...table.filter((team) => (sceneOrgById.get(team.orgId)!.worldRank ?? 999) <= 30).map((team) => team.rank));
    const bestUnranked = Math.min(...table.filter((team) => sceneOrgById.get(team.orgId)!.worldRank == null).map((team) => team.rank));
    expect(worstTop30).toBeLessThan(bestUnranked);
    // A distância do topo segue os pontos: FURIA (944) abre mais sobre a Aurora (588) do que a Aurora sobre o Falcons (477).
    const points = (rank: number) => table.find((team) => team.orgId === orgOf(rank).id)!.points;
    expect(points(1) - points(5)).toBeGreaterThan(points(5) - points(6));
  });
});

describe('nocries, promessa curada (D12)', () => {
  it('estreia na virada para 2027 num time de Tier B ou C da América do Norte, com a identidade do dono', async () => {
    const { sceneDebuts, sceneWorld, risingProspects } = await import('../src/lib/game/playerCareer/world');
    for (const seed of ['nocries-1', 'nocries-2', 'nocries-3']) {
      const debut = sceneDebuts(seed, 2).find((entry) => entry.nick === 'nocries')!;
      expect(debut, seed).toBeDefined();
      expect(debut.age).toBe(20);
      const org = sceneOrgById.get(debut.orgId)!;
      expect(org.level, seed).toBeGreaterThanOrEqual(3);
      expect(org.region, seed).toBe('na');
      const member = sceneWorld(seed, 2).rosters.get(debut.orgId)!.find((entry) => entry.nick === 'nocries')!;
      expect(member).toMatchObject({ country: 'Russia', birthDate: '2007-01-03', roles: ['entry'], prospect: true, curated: true });
      expect(risingProspects(seed, 2, 40).find((kid) => kid.nick === 'nocries')?.curated, seed).toBe(true);
    }
  });

  it('tem o teto de prodígio: a faixa mais alta das promessas curadas', async () => {
    const { prospects } = (await import('../src/lib/data/cs/career-prospects.game.json')).default as unknown as { prospects: Array<{ nick: string; potentialRange: [number, number] }> };
    const top = Math.max(...prospects.map((kid) => kid.potentialRange[1]));
    const nocries = prospects.find((kid) => kid.nick === 'nocries')!;
    expect(nocries.potentialRange[1]).toBe(top);
    expect(nocries.potentialRange[0]).toBe(Math.max(...prospects.map((kid) => kid.potentialRange[0])));
  });
});
