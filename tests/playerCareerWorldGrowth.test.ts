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
    expect(debuts.length).toBeGreaterThanOrEqual(17);
    expect(debuts.every((debut) => debut.season === 2)).toBe(true);
    const gtw = debuts.find((debut) => debut.nick === 'gtw');
    expect(gtw?.orgName).toBe('RED Canids Academy');
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
    expect(sheetConflicts.some((conflict) => conflict.nick === 'Ax1Le')).toBe(true);
  });
});
