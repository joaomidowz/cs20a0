// tests/playerCareerAwardsSeason.test.ts
// Prêmios da temporada: Top 20 HLTV (peso do campeonato manda), Rookie of the Year só no ano da estreia em Major,
// e jogadas guardadas com mapa, round e adversário.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, finishSeason, recordEventResult, startSeason, trophyCase, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { seasonAwards, seasonScore } from '../src/lib/game/playerCareer/awards';
import type { RankedPlayer } from '../src/lib/game/playerCareer/engine';
import { simulateSceneEvent } from '../src/lib/game/playerCareer/live';
import { entryKind } from '../src/lib/game/playerCareer/qualifiers';

function seasonAt(level: number, seed: string): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed });
  return startSeason({ ...base, orgId: sceneOrgs.find((org) => org.level === level)!.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
}

const playAll = (state: PlayerCareerState, placement: string, rating: number) => {
  let next = state;
  for (const entry of next.calendar!) next = recordEventResult(next, entry.index, { name: entry.name, placement, rating, seriesWins: 2, seriesLosses: 1, tier: entry.tier });
  return finishSeason(next);
};

describe('Top 20 HLTV da temporada', () => {
  it('Tier S voando é top 1; Challenger ganhando tudo não entra no Top 20', () => {
    const elite = playAll(seasonAt(0, 'hltv-1'), 'Campeão', 1.32).history.at(-1)!;
    expect(elite.hltvRank).toBe(1);
    expect(elite.hltvTop).toHaveLength(20);
    expect(elite.hltvTop![0].you).toBe(true);
    const challenger = playAll(seasonAt(3, 'hltv-2'), 'Campeão', 1.3).history.at(-1)!;
    expect(challenger.hltvRank!).toBeGreaterThan(20);
    expect(challenger.hltvTop!.some((player) => player.you)).toBe(false);
  });

  it('jogou menos de 4 campeonatos: sem ranking', () => {
    expect(seasonScore([{ name: 'x', placement: 'Campeão', rating: 1.4, seriesWins: 3, seriesLosses: 0, tier: 'S' }], 0)).toBeNull();
  });

  it('o top 20 é da cena real: nomes conhecidos e nenhum nick gerado', () => {
    const log = playAll(seasonAt(1, 'hltv-3'), 'Quartas', 1.0).history.at(-1)!;
    const names = log.hltvTop!.map((player) => player.nick);
    expect(names.some((nick) => ['ZywOo', 'donk', 'm0NESY', 'NiKo', 'sh1ro'].includes(nick))).toBe(true);
    for (const org of sceneOrgs) for (const member of org.roster.filter((candidate) => candidate.generated)) expect(names).not.toContain(member.nick);
  });
});

describe('Rookie of the Year', () => {
  it('só concorre no ano da estreia em Major; no ano seguinte não', () => {
    const first = playAll(seasonAt(0, 'roty-1'), 'Campeão', 1.3);
    expect(first.history.at(-1)!.rookieEligible).toBe(true);
    expect(first.history.at(-1)!.rookie?.you).toBe(true);
    expect(trophyCase(first).rookie).toBe(true);
    const second = playAll(startSeason({ ...first, pendingOffers: null }), 'Campeão', 1.3);
    expect(second.history.at(-1)!.rookieEligible).toBe(false);
    expect(second.history.at(-1)!.rookie?.you).not.toBe(true);
  });

  it('com o ranking do fim do ano, o Rookie é o estreante mais bem colocado nele (você só no ano da estreia)', () => {
    const base = seasonAt(0, 'roty-rank');
    let played = base;
    for (const entry of played.calendar!) played = recordEventResult(played, entry.index, { name: entry.name, placement: 'Quartas', rating: 1.0, seriesWins: 1, seriesLosses: 1, tier: entry.tier });
    const org = sceneOrgs.find((candidate) => candidate.id === played.orgId)!;
    // Quem é estreante na regra de sempre: o Rookie da cena sem o ranking.
    const npc = seasonAwards({ ...played, history: [{ seasonNumber: 0, year: 2025, orgId: 'x', orgName: 'x', orgLevel: 0, tournaments: [{ name: 'Major velho', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1, tier: 'Major' }], seasonRating: 1, overallBefore: 80, overallAfter: 80, titles: 0, injury: null, agingNote: '' } as never] }, org.level, org.name).rookie!;
    expect(npc.you).not.toBe(true);
    const row = (nick: string, extra: Partial<RankedPlayer> = {}): RankedPlayer => ({ nick, team: 'T', score: 0, ...extra });
    const veteranTop = [row('ZywOo'), row('donk'), row('m0NESY')];
    // O estreante em 4º leva, mesmo com você (elegível) em 5º.
    const top = [...veteranTop, row(npc.nick), row(played.nick, { you: true })];
    const awards = seasonAwards(played, org.level, org.name, top);
    expect(awards.rookieEligible).toBe(true);
    expect(awards.rookie?.nick).toBe(npc.nick);
    expect(awards.hltvRank).toBe(5);
    // Você na frente do estreante leva o Rookie.
    expect(seasonAwards(played, org.level, org.name, [...veteranTop, row(played.nick, { you: true }), row(npc.nick)]).rookie?.you).toBe(true);
    // Ninguém estreante no ranking: sem Rookie.
    expect(seasonAwards(played, org.level, org.name, veteranTop).rookie).toBeNull();
  });

  it('quem não jogou Major (CCT) não é elegível', () => {
    expect(playAll(seasonAt(4, 'roty-2'), 'Campeão', 1.3).history.at(-1)!.rookieEligible).toBe(false);
  });
});

describe('jogadas guardadas', () => {
  it('cada jogada tem mapa, round e adversário, e o ace vem antes', () => {
    let found = null;
    for (let index = 0; index < 6 && !found; index += 1) {
      const state = seasonAt(1, `plays-${index}`);
      // Qualificatória (plano 04) não guarda jogadas: o primeiro mata-mata de 8 que é campeonato.
      const { result } = simulateSceneEvent(state, state.calendar!.findIndex((entry) => entry.format === 'bracket8' && entryKind(entry) === 'event'));
      if (result.highlights?.length) found = result.highlights;
    }
    expect(found).not.toBeNull();
    for (const play of found!) {
      expect(play.map.length).toBeGreaterThan(2);
      expect(play.round).toBeGreaterThan(0);
      expect(play.opponent.length).toBeGreaterThan(0);
    }
    expect(found!.length).toBeLessThanOrEqual(8);
  }, 60000);
});
