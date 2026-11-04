// tests/playerCareerWorldGrowth.test.ts
// O mundo evolui pelo mesmo motor de idade do jogador: jovem cresce, veterano cai, as promessas da base real
// estreiam e podem virar estrela (ou não); os elencos da planilha do usuário entram na cena.
import { describe, expect, it } from 'vitest';
import { memberBirthYear, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { sheetConflicts } from '../src/lib/game/playerCareer/extraTeams';
import { memberKey, risingProspects, sceneDebuts, sceneWorld, yearOfSeason } from '../src/lib/game/playerCareer/world';

const overallOf = (seed: string, season: number, nick: string) => {
  for (const roster of sceneWorld(seed, season).rosters.values()) {
    const member = roster.find((other) => other.nick.toLowerCase() === nick.toLowerCase());
    if (member) return member.overall ?? null;
  }
  return null;
};

describe('o mundo envelhece de verdade', () => {
  it('na média, quem tem até 21 sobe e quem passou dos 31 cai de uma temporada para a outra', () => {
    const world1 = sceneWorld('grow-1', 2);
    const world2 = sceneWorld('grow-1', 3);
    const deltas = { young: [] as number[], old: [] as number[] };
    for (const roster of world2.rosters.values()) for (const member of roster) {
      const born = memberBirthYear(member);
      const before = world1.dev.get(memberKey(member))?.overall;
      const after = world2.dev.get(memberKey(member))?.overall;
      if (born === null || before === undefined || after === undefined) continue;
      const age = yearOfSeason(3) - born;
      if (age <= 21) deltas.young.push(after - before);
      if (age >= 32) deltas.old.push(after - before);
    }
    const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
    expect(deltas.young.length).toBeGreaterThan(10);
    expect(deltas.old.length).toBeGreaterThan(10);
    expect(mean(deltas.young)).toBeGreaterThan(0.5);
    expect(mean(deltas.old)).toBeLessThan(0);
  });

  it('é determinístico pela seed e seeds diferentes dão futuros diferentes', () => {
    const a = [...sceneWorld('grow-a', 4).dev.values()].map((entry) => entry.overall).join(',');
    expect([...sceneWorld('grow-a', 4).dev.values()].map((entry) => entry.overall).join(',')).toBe(a);
    expect([...sceneWorld('grow-b', 4).dev.values()].map((entry) => entry.overall).join(',')).not.toBe(a);
  });
});

describe('promessas da base real', () => {
  it('as 19 estreiam na virada para 2027, em time de CCT/GC ou Challenger da região', () => {
    const debuts = sceneDebuts('kids-1', 2);
    expect(debuts.length).toBeGreaterThanOrEqual(12);
    expect(debuts.every((debut) => debut.season === 2)).toBe(true);
    // gtw já está na RED Canids Academy da coleta: vira promessa ali mesmo, sem estreia nem cópia.
    const academy = sceneWorld('kids-1', 2).rosters.get(sceneOrgs.find((org) => org.name === 'RED Canids Academy')!.id)!;
    expect(academy.find((member) => member.nick === 'gtw')?.hltv).toBeTruthy();
    for (const debut of debuts) expect(sceneOrgs.find((org) => org.id === debut.orgId)!.level).toBeGreaterThanOrEqual(3);
    expect(risingProspects('kids-1', 2, 4).every((kid) => kid.curated)).toBe(true);
  });

  it('o mesmo garoto vira craque numa carreira e trava em outra', () => {
    const peaks = Array.from({ length: 12 }, (_, index) => {
      let best = 0;
      for (let season = 2; season <= 7; season += 1) best = Math.max(best, overallOf(`kid-fate-${index}`, season, 'k0gass') ?? 0);
      return best;
    }).filter(Boolean);
    expect(peaks.length).toBeGreaterThan(6);
    expect(Math.max(...peaks) - Math.min(...peaks)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...peaks)).toBeGreaterThan(75);
  }, 60000);
});

describe('elencos da planilha do usuário', () => {
  it('times do guia entram com os nicks reais; vazios da coleta (Rooster) ganham o elenco da planilha', () => {
    const corinthians = sceneOrgs.find((org) => org.name === 'Corinthians Esports');
    expect(corinthians?.roster.map((member) => member.nick)).toContain('r1n');
    expect(corinthians?.level).toBe(4);
    const rooster = sceneOrgs.find((org) => org.name === 'Rooster');
    expect(rooster?.roster.map((member) => member.nick)).toContain('chelleos');
    expect(sceneOrgs.find((org) => org.name === 'Complexity')?.roster.some((member) => member.birthDate?.startsWith('1999'))).toBe(true);
  });

  it('ninguém da planilha joga em dois times: conflito com a coleta fica registrado', () => {
    const seen = new Map<string, string>();
    const repeated: string[] = [];
    for (const org of sceneOrgs.filter((candidate) => candidate.sources.some((source) => source.tournament?.startsWith('Planilha')))) {
      for (const member of org.roster) {
        if (seen.has(member.nick.toLowerCase())) repeated.push(member.nick);
        seen.set(member.nick.toLowerCase(), org.name);
      }
    }
    expect(repeated).toEqual([]);
    // makazze fica na NAVI (escolha do usuário): a vaga dele no NAVI Junior da planilha vira conflito.
    expect(sheetConflicts.some((conflict) => conflict.nick === 'makazze' && conflict.team === 'NAVI Junior')).toBe(true);
  });

  it('cada jogador repetido fica só no time que o usuário escolheu (Ax1Le no Cloud9, não no TDK)', async () => {
    const { stayAt } = (await import('../src/lib/data/cs/career-roster-resolutions.game.json')).default as { stayAt: Record<string, string> };
    const key = (name: string) => name.toLowerCase().replace(/^team\s+/, '').replace(/\s+(team|gaming|esports?|club)$/, '').replace(/[^a-z0-9]/g, '');
    const teamsOf = (nick: string) => sceneOrgs.filter((org) => org.roster.some((member) => member.nick.toLowerCase() === nick.toLowerCase()));
    expect(teamsOf('Ax1Le').map((org) => org.name)).toEqual(['Cloud9']);
    // saadzin ficou na Legacy pela resolução, mas o elenco atual da Legacy não tem ele: está sem time.
    expect(teamsOf('saadzin').length).toBeLessThanOrEqual(1);
    let checked = 0;
    const { teams: overrides } = (await import('../src/lib/data/cs/career-roster-overrides.game.json')).default as { teams: Array<{ members: Array<{ nick: string }> }> };
    const current = new Set(overrides.flatMap((team) => team.members.map((member) => member.nick.toLowerCase())));
    for (const [nick, team] of Object.entries(stayAt)) {
      if (current.has(nick.toLowerCase())) continue; // elenco atual informado depois vence a resolução
      const teams = teamsOf(nick);
      if (!teams.length) continue; // o time escolhido pode ter sido fundido (ex.: "Team Vitality" é a Vitality)
      expect(teams.length, nick).toBe(1);
      expect(key(teams[0].name), nick).toBe(key(team));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(250);
    for (const org of sceneOrgs) expect(org.roster.length, org.name).toBeGreaterThanOrEqual(5);
  });

  it('sugestões das vagas entram só quando o jogador está livre (coldzera no RED Canids; FalleN segue na FURIA)', () => {
    const teamOf = (nick: string) => sceneOrgs.filter((org) => org.roster.some((member) => member.nick === nick)).map((org) => org.name);
    expect(teamOf('coldzera')).toEqual(['RED Canids']);
    expect(teamOf('FalleN')).toEqual(['FURIA']);
    const real = sceneOrgs.flatMap((org) => org.roster.filter((member) => !member.generated).map((member) => member.nick.toLowerCase()));
    expect(real.length - new Set(real).size).toBe(0);
    expect(sceneOrgs.flatMap((org) => org.roster.filter((member) => member.generated)).length).toBeLessThan(120);
  });

  it('nome gerado nunca é sósia de jogador real (sem "k3_sasha", "Nitr0", "Taz")', async () => {
    const { faceOf } = await import('../src/lib/game/playerCareer/extraTeams');
    const realFaces = new Set(sceneOrgs.flatMap((org) => org.roster.filter((member) => !member.generated).map((member) => faceOf(member.nick))));
    for (const legend of ['sasha', 'nitr0', 'TaZ', 'tatu', 'FalleN', 's1mple']) realFaces.add(faceOf(legend));
    const generated = sceneOrgs.flatMap((org) => org.roster.filter((member) => member.generated));
    expect(generated.length).toBeGreaterThan(0);
    for (const member of generated) expect(realFaces.has(faceOf(member.nick, true)), member.nick).toBe(false);
  });

  it('nick vazio vira um nick sorteado (nada de "cascavel" fixo), determinístico pela seed', async () => {
    const { createPlayerCareer } = await import('../src/lib/game/playerCareer/engine');
    const { randomNick } = await import('../src/lib/game/playerCareer/extraTeams');
    const a = createPlayerCareer({ nick: '  ', country: 'Brazil', role: 'awper', seed: 'nick-1' });
    expect(a.nick).not.toBe('cascavel');
    expect(a.nick.length).toBeGreaterThan(1);
    expect(createPlayerCareer({ nick: '', country: 'Brazil', role: 'awper', seed: 'nick-1' }).nick).toBe(a.nick);
    expect(createPlayerCareer({ nick: 'midowz', country: 'Brazil', role: 'awper', seed: 'nick-1' }).nick).toBe('midowz');
    expect(new Set(Array.from({ length: 20 }, (_, index) => randomNick(`r-${index}`))).size).toBeGreaterThan(12);
  });

  it('elencos atuais do usuário vencem tudo: Legacy com ksloks, ODDIK com NEKIZ e righi, Folha Amarela real', () => {
    const roster = (name: string) => sceneOrgs.find((org) => org.name.toLowerCase() === name.toLowerCase())!.roster.map((member) => member.nick);
    expect(roster('Legacy').sort()).toEqual(['arT', 'dumau', 'ksloks', 'latto', 'try'].sort());
    expect(roster('ODDIK').sort()).toEqual(['Ceruttera', 'diozera', 'NEKIZ', 'nardes', 'righi'].sort());
    expect(roster('Folha Amarela').sort()).toEqual(['ckzao', 'f4stzin', 'mello', 'RCF', 's1cko'].sort());
    const teamsOf = (nick: string) => sceneOrgs.filter((org) => org.roster.some((member) => member.nick === nick)).map((org) => org.name);
    for (const nick of ['ksloks', 'NEKIZ', 'righi', 'mello', 'ckzao', 'nardes', 'latto']) expect(teamsOf(nick), nick).toHaveLength(1);
    // Quem já existia na cena leva o catálogo (overall real) junto.
    expect(sceneOrgs.find((org) => org.name === 'ODDIK')!.roster.find((member) => member.nick === 'NEKIZ')?.catalogBaseId).toBeTruthy();
    expect(sceneOrgs.every((org) => org.roster.length >= 5)).toBe(true);
  });
});

