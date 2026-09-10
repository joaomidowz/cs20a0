import { describe, expect, it } from 'vitest';
import {
  canStartNextRound,
  completeRound,
  completedRoundCount,
  createTournamentEngine,
  currentRound,
  drawHumanSeeds,
  isRoundComplete,
  standingOrder,
  startNextRound,
  toResult,
  type TournamentOrganization
} from '../src/lib/game/online/tournament-engine';
import { pendingSeriesDecision, runSeriesToEnd, toSeriesResult } from '../src/lib/game/online/live-series';
import { revealTournament, runOnlineTournament } from '../src/lib/game/online/tournament';
import { MAP_POOL } from '../src/lib/game/maps';
import type { MapSimulationContext, MapStrategy } from '../src/lib/game/map-veto';
import type { CombatTeam, MapAffinity, MapId } from '../src/lib/game/types';

const organization = (index: number, human = true): TournamentOrganization => {
  const team: CombatTeam = { id: `org-${index}`, name: `Organization ${index}`, power: 78 + (index % 14), mental: 80 + (index % 10), clutch: 79 + (index % 11), experience: 77 + (index % 12) };
  return { id: team.id, name: team.name, seed: index + 1, team, human };
};

const strategy = (teamId: string, bot: boolean): MapStrategy => {
  const affinities = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, 'EVEN'])) as Record<MapId, MapAffinity>;
  const familiarity = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, 60])) as Record<MapId, number>;
  return { teamId, selectedMaps: ['mirage', 'inferno', 'nuke'], affinities, familiarity, bot };
};

const mapContext = (organizations: TournamentOrganization[]): MapSimulationContext => ({
  mode: 'premier',
  seed: 'engine-maps',
  strategies: new Map(organizations.map((organization) => [organization.id, strategy(organization.id, !organization.human)]))
});

const field = () => ({ organizations: [organization(0), organization(1)], botPool: Array.from({ length: 14 }, (_, index) => organization(index + 20, false)) });
/** The two humans placed as seeds 1 and 9, so the top-half/bottom-half pairing makes them meet in round one. */
const meeting = () => ({ ...field(), seedOrder: ['org-0', 'org-20', 'org-21', 'org-22', 'org-23', 'org-24', 'org-25', 'org-26', 'org-1'] });

describe('incremental tournament engine', () => {
  it('starts with no rounds and pairs the first Swiss round lazily', () => {
    const engine = createTournamentEngine({ ...field(), entryStage: 'stage3', seed: 'engine' });
    expect(engine.rounds).toHaveLength(0);
    expect(canStartNextRound(engine)).toBe(true);
    const round = startNextRound(engine);
    expect(round.series).toHaveLength(8);
    expect(round.series.map((series) => series.config.id)).toEqual(expect.arrayContaining([expect.stringMatching(/^swiss-r1-m1-/)]));
    expect(round.series.every((series) => series.config.bestOf === 3)).toBe(true);
    expect(() => startNextRound(engine)).toThrow(/not complete/);
    expect(currentRound(engine)).toBe(round);
    expect(isRoundComplete(round)).toBe(false);
  });

  it('resolves a bot-only Swiss to eight qualified and eight eliminated, then a bracket with one champion', () => {
    const engine = createTournamentEngine({ ...field(), entryStage: 'stage3', seed: 'engine', controllerFor: () => 'bot', interactiveVeto: () => false });
    while (!engine.finished) {
      const round = startNextRound(engine);
      for (const series of round.series) runSeriesToEnd(series);
      completeRound(engine);
    }
    const swiss = engine.rounds.filter((round) => round.phase === 'swiss');
    expect(swiss).toHaveLength(5);
    // Rounds four and five only pair the organizations still active (2-1/1-2 and 2-2 records).
    expect(engine.rounds.map((round) => round.series.length)).toEqual([8, 8, 8, 6, 3, 4, 2, 1]);
    const result = toResult(engine);
    expect(result.standings.filter((standing) => standing.status === 'qualified' || standing.status === 'champion')).toHaveLength(8);
    expect(result.standings.filter((standing) => standing.status === 'eliminated')).toHaveLength(8);
    expect(result.standings.filter((standing) => standing.status === 'champion')).toHaveLength(1);
    expect(result.championId).toBe(engine.championId);
    expect(result.campaigns.find((campaign) => campaign.organizationId === result.championId)?.placement).toBe('placementChampion');
  });

  it('matches the batch wrapper exactly when every series is driven by bots', () => {
    const options = { ...field(), entryStage: 'stage3' as const, seed: 'batch-equivalence' };
    const batch = runOnlineTournament(options);
    const engine = createTournamentEngine({ ...options, controllerFor: () => 'bot', interactiveVeto: () => false });
    while (!engine.finished) {
      const round = startNextRound(engine);
      for (const series of round.series) runSeriesToEnd(series);
      completeRound(engine);
    }
    expect(toResult(engine)).toEqual(batch);
  });

  it('never exposes the round in progress through revealTournament', () => {
    const engine = createTournamentEngine({ ...field(), entryStage: 'stage3', seed: 'reveal' });
    const first = startNextRound(engine);
    for (const series of first.series) runSeriesToEnd(series);
    completeRound(engine);
    const second = startNextRound(engine);
    // The human's series waits for its side pick / eco call, so the round in progress has an unfinished series.
    const humanSeries = second.series.find((series) => series.config.teamA.id === 'org-0' || series.config.teamB.id === 'org-0')!;
    expect(humanSeries.phase).not.toBe('finished');
    const result = toResult(engine);
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[1].series.some((series) => series.winnerId === '')).toBe(true);
    const revealed = revealTournament(result, completedRoundCount(engine));
    expect(revealed.rounds).toHaveLength(1);
    expect(revealed.standings.reduce((sum, standing) => sum + standing.wins, 0)).toBe(8);
    expect(revealed.championId).toBeNull();
  });

  it('opens an interactive veto only between two humans and lets humans decide sides against bots', () => {
    const options = meeting();
    const engine = createTournamentEngine({ ...options, entryStage: 'stage3', seed: 'humans', mapContext: mapContext([...options.organizations, ...options.botPool]) });
    const round = startNextRound(engine);
    const humanVsHuman = round.series.find((series) => series.config.controllers.a === 'human' && series.config.controllers.b === 'human');
    expect(humanVsHuman?.config.interactiveVeto).toBe(true);
    expect(pendingSeriesDecision(humanVsHuman!)?.kind).toBe('veto');
    const botSeries = round.series.filter((series) => series.config.controllers.a === 'bot' && series.config.controllers.b === 'bot');
    expect(botSeries.every((series) => !series.config.interactiveVeto && series.phase === 'intermission')).toBe(true);
    for (const series of botSeries) runSeriesToEnd(series);
    expect(botSeries.every((series) => toSeriesResult(series).winnerId)).toBe(true);
    expect(isRoundComplete(round)).toBe(false);
  });

  it('pairs the top half against the bottom half of every record group, like a real Major', () => {
    const engine = createTournamentEngine({ ...field(), entryStage: 'stage3', seed: 'pairing', controllerFor: () => 'bot', interactiveVeto: () => false });
    const seedOf = new Map(engine.field.map((organization) => [organization.id, organization.seed]));
    const first = startNextRound(engine);
    // Round one: 1v9, 2v10 … 8v16 — two humans who joined in sequence (seeds 1 and 2) do not meet.
    expect(first.series.map((series) => Math.abs(seedOf.get(series.config.teamA.id)! - seedOf.get(series.config.teamB.id)!))).toEqual(Array(8).fill(8));
    expect(first.series.some((series) => series.config.teamA.id === 'org-0' && series.config.teamB.id === 'org-1')).toBe(false);
    for (const series of first.series) runSeriesToEnd(series);
    completeRound(engine);
    const second = startNextRound(engine);
    const standing = new Map(engine.standings.map((item) => [item.organizationId, item]));
    for (const series of second.series) {
      const left = standing.get(series.config.teamA.id)!;
      const right = standing.get(series.config.teamB.id)!;
      expect(left.wins).toBe(right.wins);
      // Inside a group of eight the pairing is again top half against bottom half (positions four apart).
      const group = engine.standings.filter((item) => item.wins === left.wins && item.losses === left.losses).sort(standingOrder).map((item) => item.organizationId);
      expect(Math.abs(group.indexOf(left.organizationId) - group.indexOf(right.organizationId))).toBe(4);
    }
  });

  it('seeds the playoffs by record before Buchholz: 3-0 teams first, 3-2 teams last', () => {
    const engine = createTournamentEngine({ ...field(), entryStage: 'stage3', seed: 'seeding', controllerFor: () => 'bot', interactiveVeto: () => false });
    while (engine.rounds.filter((round) => round.phase === 'swiss').length < 5 || !engine.rounds.at(-1)!.complete) {
      const round = startNextRound(engine);
      for (const series of round.series) runSeriesToEnd(series);
      completeRound(engine);
    }
    const standing = new Map(engine.standings.map((item) => [item.organizationId, item]));
    const losses = engine.playoffField!.map((organization) => standing.get(organization.id)!.losses);
    expect(losses).toEqual([0, 0, 1, 1, 1, 2, 2, 2]);
    const buchholz = engine.playoffField!.map((organization) => standing.get(organization.id)!.buchholz);
    for (let index = 1; index < buchholz.length; index += 1) {
      if (losses[index] === losses[index - 1]) expect(buchholz[index]).toBeLessThanOrEqual(buchholz[index - 1]);
    }
  });

  it('honours an explicit seed order and draws human seeds deterministically', () => {
    const engine = createTournamentEngine({ ...meeting(), entryStage: 'stage3', seed: 'order' });
    expect(engine.field.find((organization) => organization.id === 'org-1')?.seed).toBe(9);
    expect(engine.field.find((organization) => organization.id === 'org-27')?.seed).toBe(10);
    const drawn = drawHumanSeeds('room', 3, 16);
    expect(drawn).toEqual(drawHumanSeeds('room', 3, 16));
    expect(new Set(drawn).size).toBe(3);
    expect(drawn.every((seed) => seed >= 1 && seed <= 16)).toBe(true);
    expect(drawHumanSeeds('other', 3, 16)).not.toEqual(drawn);
  });

  it('runs direct playoffs from eight organizations', () => {
    const engine = createTournamentEngine({ organizations: [organization(0), organization(1), organization(2)], botPool: Array.from({ length: 12 }, (_, index) => organization(index + 20, false)), entryStage: 'playoffs', seed: 'direct', controllerFor: () => 'bot', interactiveVeto: () => false });
    while (!engine.finished) {
      const round = startNextRound(engine);
      for (const series of round.series) runSeriesToEnd(series);
      completeRound(engine);
    }
    expect(engine.rounds.map((round) => round.phase)).toEqual(['quarterfinal', 'semifinal', 'final']);
    expect(engine.rounds.at(-1)!.series[0].config.bestOf).toBe(5);
    expect(toResult(engine).standings).toHaveLength(8);
  });
});
