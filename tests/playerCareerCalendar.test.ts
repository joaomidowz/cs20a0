// tests/playerCareerCalendar.test.ts
// Calendário real por nível (quantidade, mês, tier, formato) e o Major com stages pela entrada no ranking.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, finishSeason, recordEventResult, startSeason, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { worldEventByKey } from '../src/lib/game/playerCareer/circuit';
import { EXTRA_QUALIFIERS, applyQualifierResult, entryKind, qualifierField, userQualifierRegion } from '../src/lib/game/playerCareer/qualifiers';
import { EVENT_RANGE, majorsOf, seasonEvents } from '../src/lib/game/playerCareer/calendar';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { PLACEMENT_ORDER, majorEntryStage, notQualified, simulateSceneEvent } from '../src/lib/game/playerCareer/live';

function seasonAtOrg(orgId: string, seed: string, overall = 80): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, overall, seatsTaken: [] });
}

const orgAt = (level: number) => sceneOrgs.find((org) => org.level === level)!;

/** Abaixo do Tier S Elite, o Major entra no calendário pela qualificatória (plano 04): você passa em 1º e ele vem logo depois. */
function withMajor(career: PlayerCareerState): PlayerCareerState {
  const entry = career.calendar!.find((candidate) => entryKind(candidate) === 'qualifier' && worldEventByKey(career, candidate.qualifiesFor!)?.tier === 'Major');
  if (!entry) return career;
  const event = worldEventByKey(career, entry.qualifiesFor!)!;
  const rivals = qualifierField(career, event, userQualifierRegion(career), true).filter((orgId) => orgId !== career.orgId);
  const result: TournamentResult = {
    name: entry.name, placement: 'Classificado', rating: 1.1, seriesWins: 3, seriesLosses: 0, skipped: true, orgId: career.orgId,
    placements: [{ orgId: career.orgId, place: 1 }, ...rivals.map((orgId, index) => ({ orgId, place: [2, 3, 3, 5, 5, 5, 5][index] }))]
  };
  return applyQualifierResult(recordEventResult(career, entry.index, result), entry.index);
}

describe('calendário real por nível', () => {
  it('cada nível joga a quantidade da sua faixa, em ordem de mês', () => {
    for (const level of [0, 1, 2, 3, 4]) {
      const [min, max] = EVENT_RANGE[level];
      for (const seed of ['a', 'b', 'c']) {
        const calendar = seasonAtOrg(orgAt(level).id, `cal-${level}-${seed}`).calendar!;
        expect(calendar.length).toBeGreaterThanOrEqual(min);
        // As qualificatórias a mais do nível (plano 04) não contam na faixa.
        expect(calendar.length).toBeLessThanOrEqual(max + EXTRA_QUALIFIERS[level]);
        const months = calendar.map((entry) => entry.month!);
        expect(months).toEqual([...months].sort((a, b) => a - b));
        expect(calendar.map((entry) => entry.index)).toEqual(calendar.map((_, index) => index));
      }
    }
  });

  it('Tier S joga os 2 Majors e eventos S/A; CCT/GC só tier C', () => {
    const elite = seasonAtOrg(orgAt(0).id, 'cal-elite').calendar!;
    expect(elite.filter((entry) => entry.format === 'major')).toHaveLength(2);
    expect(elite.every((entry) => ['Major', 'S', 'A'].includes(entry.tier!))).toBe(true);
    const circuit = seasonAtOrg(orgAt(4).id, 'cal-cct').calendar!;
    expect(circuit.every((entry) => entry.tier === 'C' && entry.format === 'bracket8')).toBe(true);
  });
});

describe('campeonatos do guia por região e tier', () => {
  it('cada região joga a sua tabela: CBCS no Brasil, ESEA na América do Norte, MESA na Ásia', () => {
    const names = (level: number, region: Parameters<typeof seasonEvents>[1]) => seasonEvents(level, region, 11, `guide-${level}-${region}`).map((event) => event.name);
    expect(names(3, 'sa').some((name) => /CBCS|Gamers Club|RedZone|Gamergy/.test(name))).toBe(true);
    expect(names(4, 'na').some((name) => /ESEA|Fragadelphia|NACE/.test(name))).toBe(true);
    expect(names(3, 'asia').some((name) => /MESA|LPL|5E|Perfect World/.test(name))).toBe(true);
    expect(names(3, 'oce')).toEqual(names(3, 'oce'));
    for (const level of [2, 3, 4]) for (const region of ['sa', 'eu', 'na', 'asia'] as const) {
      const events = seasonEvents(level, region, EVENT_RANGE[level][1], `guide-max-${level}-${region}`);
      expect(new Set(events.map((event) => event.name)).size).toBe(events.length);
    }
  });

  it('Majors do ano: 2026 Colônia e Singapura; 2027 fecha em Xangai; sempre MD5 em junho e novembro', () => {
    expect(majorsOf(2026).map((event) => event.name)).toEqual(['IEM Cologne Major', 'PGL Major Singapore']);
    expect(majorsOf(2027).map((event) => event.name)).toEqual(['FiReSPORTS Major Buenos Aires', 'Perfect World Shanghai Major']);
    expect(majorsOf(2027)[0].location).toBe('Buenos Aires, Argentina');
    // Depois de 2027 a sede é sorteada por ano (fixa para o ano), e os dois Majors do ano nunca são o mesmo.
    expect(majorsOf(2031)).toEqual(majorsOf(2031));
    for (const year of [2028, 2029, 2030, 2035]) expect(majorsOf(year)[0].name).not.toBe(majorsOf(year)[1].name);
    // CBCS Masters (topo regional do Brasil) é tier B, não A.
    const tier2 = Array.from({ length: 10 }, (_, index) => seasonEvents(2, 'sa', 10, `cbcs-${index}`)).flat();
    expect(tier2.filter((event) => event.name === 'CBCS Masters').every((event) => event.tier === 'B')).toBe(true);
    for (const year of [2026, 2027, 2030]) {
      expect(majorsOf(year).map((event) => event.month)).toEqual([6, 11]);
      expect(majorsOf(year).every((event) => event.format === 'major' && event.finalBestOf === 5)).toBe(true);
    }
  });

  it('Tier S tem final MD5; Colônia volta a ser IEM Tier S depois de 2026', () => {
    const elite = seasonEvents(0, 'eu', 12, 'guide-elite', 2028);
    expect(elite.filter((event) => event.tier === 'S').every((event) => event.finalBestOf === 5)).toBe(true);
    const all = Array.from({ length: 12 }, (_, index) => seasonEvents(0, 'eu', 12, `guide-cgn-${index}`, 2028)).flat();
    expect(all.some((event) => event.name === 'Intel Extreme Masters Cologne')).toBe(true);
    expect(Array.from({ length: 12 }, (_, index) => seasonEvents(0, 'eu', 12, `guide-cgn-${index}`, 2026)).flat().some((event) => event.name === 'Intel Extreme Masters Cologne')).toBe(false);
  });
});

describe('Major pelo ranking', () => {
  it('Tier S entra no Stage 3; CCT/GC não entra', () => {
    expect(majorEntryStage(seasonAtOrg(orgAt(0).id, 'vrs-1'))).toBe('stage3');
    expect(majorEntryStage(seasonAtOrg(orgAt(4).id, 'vrs-2'))).toBeNull();
  });

  it('o Major simulado fecha com uma colocação válida e W-L coerente', () => {
    const career = seasonAtOrg(orgAt(0).id, 'major-sim', 85);
    const index = career.calendar!.findIndex((entry) => entry.format === 'major');
    const outcome = simulateSceneEvent(career, index);
    expect(PLACEMENT_ORDER).toContain(outcome.result.placement);
    expect(outcome.result.placement).not.toBe('Não classificado');
    expect(outcome.result.seriesWins + outcome.result.seriesLosses).toBeGreaterThanOrEqual(3);
    expect(outcome.result.tier).toBe('Major');
  }, 30000);

  it('começando no Stage 1: cai num stage ou passa por todos', () => {
    const career = seasonAtOrg(orgAt(0).id, 'major-s1', 75);
    const index = career.calendar!.findIndex((entry) => entry.format === 'major');
    const outcome = simulateSceneEvent(career, index, undefined, 'stage1');
    expect(PLACEMENT_ORDER).toContain(outcome.result.placement);
    if (outcome.result.placement === 'Stage 1') expect(outcome.result.seriesLosses).toBe(3);
  }, 30000);

  it('stages pelo ranking: o top 8 está todo no Stage 3 e nenhum dele no Stage 1 ou 2', async () => {
    const { majorInvites, sceneEventField } = await import('../src/lib/game/playerCareer/live');
    const career = withMajor(seasonAtOrg(orgAt(2).id, 'major-field', 78));
    const index = career.calendar!.findIndex((entry) => entry.format === 'major');
    const top = majorInvites(career).map((org) => org.id);
    expect(top).toHaveLength(8);
    const field = (stage: 'stage1' | 'stage2' | 'stage3') => sceneEventField(career, index, stage).map((team) => team.orgId);
    for (const id of top) expect(field('stage3')).toContain(id);
    for (const stage of ['stage1', 'stage2'] as const) for (const id of top) expect(field(stage)).not.toContain(id);
    expect(field('stage3')).toHaveLength(16);
  });

  it('Major de verdade: os 3 stages num campeonato só (16 times cada), com campeão e MVP', async () => {
    const career = withMajor(seasonAtOrg(orgAt(1).id, 'major-3stages', 82));
    const index = career.calendar!.findIndex((entry) => entry.format === 'major');
    const outcome = simulateSceneEvent(career, index, undefined, 'stage2');
    const tournament = outcome.campaign!.run.tournament!;
    expect(tournament.stages?.map((stage) => stage.stage)).toEqual(['stage1', 'stage2', 'stage3']);
    for (const stage of tournament.stages!) expect(stage.standings).toHaveLength(16);
    expect(outcome.result.champion).toBeTruthy();
    expect(outcome.result.mvp).toBeTruthy();
    expect(['Stage 2', 'Fase suíça', 'Quartas', 'Semis', 'Vice', 'Campeão']).toContain(outcome.result.placement);
  }, 30000);

  it('a tela do Major lista 8 + 8 + 16 times por stage, com você no seu stage', async () => {
    const { eventTeams, majorEntryStage: entryOf } = await import('../src/lib/game/playerCareer/live');
    const career = withMajor(seasonAtOrg(orgAt(1).id, 'major-teams', 82));
    const index = career.calendar!.findIndex((entry) => entry.format === 'major');
    const groups = eventTeams(career, index);
    expect(groups.map((group) => group.teams.length)).toEqual([8, 8, 16]);
    const mine = groups.findIndex((group) => group.teams.some((team) => team.isUser));
    expect(mine).toBe(({ stage3: 0, stage2: 1, stage1: 2 } as Record<string, number>)[entryOf(career)!]);
    expect(new Set(groups.flatMap((group) => group.teams.map((team) => team.orgId))).size).toBe(32);
  });

  it('"Não classificado" não conta na média da temporada', () => {
    let career = seasonAtOrg(orgAt(4).id, 'skip-1');
    const calendar = career.calendar!;
    career = recordEventResult(career, 0, notQualified(career, 0).result);
    for (const entry of calendar.slice(1)) career = recordEventResult(career, entry.index, { name: entry.name, placement: 'Quartas', rating: 1.1, seriesWins: 0, seriesLosses: 1 });
    expect(finishSeason(career).history.at(-1)!.seasonRating).toBe(1.1);
  });
});
