import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBracket, buildSwissGraph, computeStandings, countCompletedRounds, revealRounds } from '../src/lib/game/majorOverview';
import { players, teams } from '../src/lib/game/data';
import { buildMajorRun } from '../src/lib/game/simulation';
import type { MajorTournament } from '../src/lib/game/types';

const picked = teams.slice(0, 5).map((team) => players.find((player) => player.teamId === team.id)!).filter(Boolean);
const run = buildMajorRun(picked, 'balanced', teams, players, 'overview-seed');
const tournament = run.tournament as MajorTournament;

describe('Major overview presentation', () => {
  it('builds a full field for the offline Major and keeps the user on the left of every own series', () => {
    expect(tournament.rounds.filter((round) => round.phase === 'swiss')).toHaveLength(5);
    expect(tournament.rounds.map((round) => round.phase).slice(-3)).toEqual(['quarterfinal', 'semifinal', 'final']);
    expect(tournament.standings).toHaveLength(16);
    expect(run.matches.every((series) => series.teamA.id === 'user')).toBe(true);
    expect(run.stage3.matches.length).toBeGreaterThanOrEqual(3);
    expect(run.stage3.matches.length).toBeLessThanOrEqual(5);
    expect(run.champion).toBe(tournament.championId === 'user');
  });

  it('reveals only the rounds up to the live series and never later pairings', () => {
    const live = run.matches[1];
    const revealed = revealRounds(tournament.rounds, { liveSeriesId: live.id });
    expect(revealed).toHaveLength(2);
    expect(revealed[0].series.every((entry) => entry.status === 'completed')).toBe(true);
    const liveRound = revealed[1];
    expect(liveRound.series.filter((entry) => entry.status === 'live')).toHaveLength(1);
    expect(liveRound.series.filter((entry) => entry.status === 'pending')).toHaveLength(liveRound.series.length - 1);

    const everything = revealRounds(tournament.rounds, { liveSeriesId: null, complete: true });
    expect(everything).toHaveLength(tournament.rounds.length);
    expect(everything.flatMap((round) => round.series).every((entry) => entry.status === 'completed')).toBe(true);

    const resolved = new Set(tournament.rounds[0].series.map((series) => series.id));
    const byFlags = revealRounds(tournament.rounds, { liveSeriesId: null, isResolved: (id) => resolved.has(id) });
    expect(byFlags).toHaveLength(1);
    expect(countCompletedRounds(byFlags)).toBe(1);
  });

  it('groups Swiss matches by record and resolves qualified and eliminated teams', () => {
    const complete = revealRounds(tournament.rounds, { liveSeriesId: null, complete: true });
    const graph = buildSwissGraph(complete);
    expect(graph.columns).toHaveLength(5);
    expect(graph.columns[0].groups.map((group) => group.record)).toEqual(['0–0']);
    expect(graph.columns[1].groups.map((group) => group.record)).toEqual(['1–0', '0–1']);
    expect(graph.qualified.reduce((sum, outcome) => sum + outcome.teams.length, 0)).toBe(8);
    expect(graph.eliminated.reduce((sum, outcome) => sum + outcome.teams.length, 0)).toBe(8);
    expect(graph.done).toBe(true);

    const partial = buildSwissGraph(revealRounds(tournament.rounds, { liveSeriesId: run.matches[0].id }));
    expect(partial.columns).toHaveLength(1);
    expect(partial.qualified).toEqual([]);
    expect(partial.done).toBe(false);
  });

  it('builds the bracket with TBD slots until each round is revealed', () => {
    const complete = revealRounds(tournament.rounds, { liveSeriesId: null, complete: true });
    const bracket = buildBracket(complete.filter((round) => round.phase !== 'swiss'));
    expect(bracket.map((column) => column.matches.length)).toEqual([4, 2, 1]);
    expect(bracket[2].matches[0].status).toBe('completed');
    expect([bracket[2].matches[0].a, bracket[2].matches[0].b].some((slot) => slot.winner && slot.id === tournament.championId)).toBe(true);

    const quarterfinalsOnly = buildBracket(complete.filter((round) => round.phase === 'quarterfinal'));
    expect(quarterfinalsOnly[1].matches.every((match) => match.status === 'tbd' && match.a.id && match.b.id && match.a.score === null)).toBe(true);
    expect(quarterfinalsOnly[2].matches[0].a.id).toBeNull();

    const nothing = buildBracket([]);
    expect(nothing.flatMap((column) => column.matches).every((match) => match.status === 'tbd' && match.a.id === null)).toBe(true);
  });

  it('computes standings only from revealed rounds', () => {
    const afterOne = computeStandings(tournament, 1);
    expect(afterOne.filter((standing) => standing.wins === 1)).toHaveLength(8);
    expect(afterOne.every((standing) => standing.status === 'active')).toBe(true);
    const final = computeStandings(tournament, tournament.rounds.length);
    expect(final[0].status).toBe('champion');
    expect(final[0].organizationId).toBe(tournament.championId);
    expect(final.filter((standing) => standing.status === 'eliminated')).toHaveLength(15);
  });
});

describe('Major overview series cards', () => {
  const read = (name: string) => readFileSync(new URL(`../src/lib/components/${name}`, import.meta.url), 'utf8');

  it('forwards onSeries from MajorOverview to the Swiss graph and the bracket', () => {
    const overview = read('MajorOverview.svelte');
    expect(overview).toContain('export let onSeries: ((seriesId: string) => void) | null = null;');
    expect(overview).toContain('<SwissGraph graph={swiss} {userTeamId} {onTeam} {onSeries}');
    expect(overview).toContain('<PlayoffBracket columns={bracket} {userTeamId} {championId} {onTeam} {onSeries}');
  });

  it('opens only live series and keeps team-name clicks from also opening the series card', () => {
    for (const name of ['SwissGraph.svelte', 'PlayoffBracket.svelte']) {
      const source = read(name);
      expect(source).toContain('on:click|stopPropagation={() =>');
      expect(source).toContain("role={watchable(");
      expect(source).toContain('on:keydown={(event) => watchable(');
      const watchable = source.split('\n').find((line) => line.includes('const watchable')) ?? '';
      expect(watchable).toContain("=== 'live'");
      expect(watchable).not.toContain("=== 'completed'");
    }
  });

  it('keeps standings values on one aligned row and gives list changes restrained motion', () => {
    const standings = read('StandingsTable.svelte');
    expect(standings).toContain('animate:flip');
    expect(standings).toContain('in:fly');
    expect(standings).toContain('out:fade');
    expect(standings).toContain('white-space:nowrap');
    expect(standings).toContain('grid-template-columns:minmax(38px,1fr) 32px 18px 58px');
    expect(standings).toContain('prefers-reduced-motion: reduce');

    const layout = read('PageLayout.svelte');
    expect(layout).toContain('in:fly');
    expect(layout).toContain('out:fade');
    expect(layout).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  });
});
