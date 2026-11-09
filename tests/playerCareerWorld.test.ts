// tests/playerCareerWorld.test.ts
// Tiers pela cena real (top 16 do ranking no tier 1, sem times duplicados) e o mundo trocando jogadores entre
// temporadas.
import { describe, expect, it } from 'vitest';
import { memberCatalogOverall, sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { headlineTransfers, orgIn, rosterIn, sceneWorld, TRANSFERS_PER_SEASON } from '../src/lib/game/playerCareer/world';
import { sceneOrgEnginePlayers } from '../src/lib/game/playerCareer/live';

const average = (orgId: string) => {
  const players = sceneOrgEnginePlayers(sceneOrgById.get(orgId)!, 'k');
  return players.reduce((sum, player) => sum + (player.overall ?? 0), 0) / players.length;
};

describe('tiers da cena', () => {
  it('Tier S é o top 8 e o tier 1 vai até o 16º do ranking real; Vitality é Tier S e a academia não', () => {
    const elite = sceneOrgs.filter((org) => org.level <= 1);
    expect(elite.length).toBeGreaterThanOrEqual(12);
    expect(elite.length).toBeLessThanOrEqual(16);
    for (const org of elite) expect(org.worldRank).toBeLessThanOrEqual(16);
    for (const org of sceneOrgs.filter((candidate) => candidate.level === 0)) expect(org.worldRank).toBeLessThanOrEqual(8);
    expect(sceneOrgById.get('vitality-2026')?.level).toBe(0);
    expect(sceneOrgById.get('legacy-2026')?.level).toBe(2);
    expect(sceneOrgById.get('red-canids-academy-2026')?.level).toBe(4);
  });

  it('sem duplicados: "Team Vitality" do save antigo cai na Vitality do tier 1', () => {
    const names = sceneOrgs.map((org) => org.name.toLowerCase().replace(/^team\s+/, '').replace(/[^a-z0-9]/g, ''));
    expect(new Set(names).size).toBe(names.length);
    expect(sceneOrgById.get('team-vitality-2026')?.id).toBe('vitality-2026');
  });

  it('força segue o mundo real: Vitality > Legacy > RED Canids Academy', () => {
    expect(average('vitality-2026')).toBeGreaterThan(average('legacy-2026'));
    expect(average('legacy-2026')).toBeGreaterThan(average('red-canids-academy-2026'));
  });
});

describe('o mundo troca jogadores', () => {
  it('temporada 1 é a cena coletada; depois há trocas, determinísticas', () => {
    expect(sceneWorld('w-1', 1).transfers).toHaveLength(0);
    const second = sceneWorld('w-1', 2);
    expect(second.transfers.length).toBeGreaterThan(5);
    expect(second.transfers.length).toBeLessThanOrEqual(TRANSFERS_PER_SEASON);
    expect(sceneWorld('w-1', 2)).toBe(second);
    expect(headlineTransfers('w-1', 2, 4)).toHaveLength(4);
  });

  it('as trocas não criam jogador em dois times (a coleta já traz alguns) e cada elenco mantém o tamanho', () => {
    const duplicates = (season: number) => {
      const world = sceneWorld('w-2', season);
      const seen = new Map<string, number>();
      for (const org of sceneOrgs) {
        const roster = world.rosters.get(org.id)!;
        expect(roster.length).toBe(org.roster.length);
        for (const member of roster) {
          const key = `${member.nick}:${member.catalogBaseId ?? ''}:${member.birthDate ?? ''}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
      return [...seen.values()].filter((count) => count > 1).length;
    };
    expect(duplicates(5)).toBeLessThanOrEqual(duplicates(1));
  });

  it('quem sobe de nível na troca é o mais forte dos dois', () => {
    for (const move of sceneWorld('w-3', 3).transfers) {
      const from = sceneOrgById.get(move.fromId)!;
      const to = sceneOrgById.get(move.toId)!;
      if (to.level >= from.level) continue;
      const mover = rosterIn('w-3', 3, to.id).find((member) => member.nick.toLowerCase() === move.nick.toLowerCase());
      const partner = rosterIn('w-3', 3, from.id).find((member) => member.nick.toLowerCase() === move.swappedNick.toLowerCase());
      if (!mover || !partner) continue;
      // Força da temporada (o mundo envelhece): quem subiu joga mais que quem desceu.
      expect((mover.overall ?? memberCatalogOverall(mover) ?? from.power ?? 70)).toBeGreaterThanOrEqual(partner.overall ?? memberCatalogOverall(partner) ?? to.power ?? 70);
    }
    expect(orgIn('w-3', 3, 'vitality-2026')?.roster).toHaveLength(sceneOrgById.get('vitality-2026')!.roster.length);
  });
});

describe('o mundo envelhece e respeita a nacionalidade', () => {
  it('FalleN (estreia 2013, ~1991) já pendurou o mouse antes de 2031', async () => {
    const { headlineRetirements, sceneWorld: world, yearOfSeason } = await import('../src/lib/game/playerCareer/world');
    expect(yearOfSeason(6)).toBe(2031);
    const inAnyRoster = (season: number) => [...world('aging-1', season).rosters.values()].some((roster) => roster.some((member) => member.nick.toLowerCase() === 'fallen'));
    expect(inAnyRoster(1)).toBe(true);
    expect(inAnyRoster(6)).toBe(false);
    const retired = [2, 3, 4, 5, 6].flatMap((season) => world('aging-1', season).retirements);
    expect(retired.some((entry) => entry.nick.toLowerCase() === 'fallen')).toBe(true);
    expect(headlineRetirements('aging-1', 3).length).toBeGreaterThan(0);
  });

  it('time nacional mantém pelo menos 3 do país: MongolZ depois de 6 temporadas', async () => {
    const { rosterIn: roster } = await import('../src/lib/game/playerCareer/world');
    const mongolz = sceneOrgs.find((org) => org.name === 'The MongolZ')!;
    expect(roster('nation-1', 7, mongolz.id).filter((member) => member.country === 'Mongolia').length).toBeGreaterThanOrEqual(3);
  });

  it('oferta de time nacional de outro país só quando o núcleo do país fica com você na vaga (D3)', async () => {
    const { chooseStartingOrg, createPlayerCareer, finishSeason, recordEventResult, startSeason } = await import('../src/lib/game/playerCareer/engine');
    const { seatKeepsIdentity } = await import('../src/lib/game/playerCareer/offers');
    for (let index = 0; index < 8; index += 1) {
      let career = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed: `offer-nation-${index}` });
      career = startSeason(chooseStartingOrg(career, career.pendingDraw!.find((option) => option.kind === 'real')!.orgId));
      for (const entry of career.calendar!) career = recordEventResult(career, entry.index, { name: entry.name, placement: 'Campeão', rating: 1.3, seriesWins: 3, seriesLosses: 0 });
      const done = finishSeason(career);
      for (const offer of done.pendingOffers ?? []) expect(seatKeepsIdentity(done, orgIn(done.seed, done.seasonNumber, offer.orgId)!), offer.orgName).toBe(true);
    }
  });
});
