import { describe, expect, it } from 'vitest';
import { players, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { aggregateRunStats, createRunStats, getRunMvpScore } from '../src/lib/game/runStats';
import { buildMajorRun, stripSeriesDetails } from '../src/lib/game/simulation';
import type { MajorRun, Player, SelectedPlayer } from '../src/lib/game/types';

const picked: Player[] = teams.slice(0, 5)
  .map((team) => players.find((player) => player.teamId === team.id))
  .filter((player): player is Player => Boolean(player));
const lineup: SelectedPlayer[] = picked.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const run = buildMajorRun(picked, 'balanced', teams, players, 'run-stats-seed', lineup, {
  selectedMaps: getDefaultMapSelection(picked, teams),
  mode: 'premier'
});

const feedTotals = (source: MajorRun, playerId: string) => {
  let kills = 0;
  let deaths = 0;
  for (const match of source.matches) {
    for (const map of match.maps) {
      for (const detail of map.details ?? []) {
        for (const kill of detail.kills) {
          if (kill.killerId === playerId) kills += 1;
          if (kill.victimId === playerId) deaths += 1;
        }
      }
    }
  }
  return { kills, deaths };
};

describe('run statistics from the kill feed', () => {
  it('takes kills, deaths, K/D and rating straight from the user series', () => {
    expect(picked).toHaveLength(5);
    expect(run.matches.some((match) => match.maps.some((map) => map.details?.some((detail) => detail.kills.length)))).toBe(true);
    const stats = createRunStats(picked, run, 'run-stats-seed', lineup);
    expect(stats).toHaveLength(5);
    for (const stat of stats) {
      const totals = feedTotals(run, stat.playerId);
      expect(stat.kills).toBe(totals.kills);
      expect(stat.deaths).toBe(totals.deaths);
      expect(stat.kdRatio).toBeCloseTo(totals.kills / Math.max(1, totals.deaths), 2);
      expect(stat.runRating).toBeGreaterThan(0);
      expect(stat.runRating).toBeLessThan(2.2);
      expect(stat.adr).toBeGreaterThanOrEqual(40);
      expect(stat.adr).toBeLessThanOrEqual(115);
      expect(stat.impact).toBeGreaterThanOrEqual(0.5);
      expect(stat.impact).toBeLessThanOrEqual(1.6);
      expect(stat.consistency).toBeGreaterThanOrEqual(45);
      expect(stat.consistency).toBeLessThanOrEqual(99);
      expect(stat.mapsPlayed).toBe(stat.mapsWon + stat.mapsLost);
      expect(Number.isFinite(getRunMvpScore(stat))).toBe(true);
    }
    const mvpMaps = stats.reduce((sum, stat) => sum + stat.mvpCount, 0);
    expect(mvpMaps).toBe(stats[0].mapsWon);
    expect(aggregateRunStats(run, stats).kills).toBe(stats.reduce((sum, stat) => sum + stat.kills, 0));
  });

  it('is reproducible for the same run and seed', () => {
    expect(createRunStats(picked, run, 'run-stats-seed', lineup)).toEqual(createRunStats(picked, run, 'run-stats-seed', lineup));
  });

  it('falls back to the synthetic model when the run has no kill feed', () => {
    const stripped: MajorRun = { ...run, matches: run.matches.map(stripSeriesDetails), stage3: { ...run.stage3, matches: run.stage3.matches.map(stripSeriesDetails) } };
    const stats = createRunStats(picked, stripped, 'run-stats-seed', lineup);
    expect(stats).toHaveLength(5);
    expect(stats).toEqual(createRunStats(picked, stripped, 'run-stats-seed', lineup));
    for (const stat of stats) {
      expect(stat.kills).toBeGreaterThan(0);
      expect(stat.deaths).toBeGreaterThan(0);
      expect(stat.runRating).toBeGreaterThan(0.4);
      expect(stat.mapsPlayed).toBe(stat.mapsWon + stat.mapsLost);
    }
    expect(stats.map((stat) => stat.kills)).not.toEqual(createRunStats(picked, run, 'run-stats-seed', lineup).map((stat) => stat.kills));
  });

  it('falls back safely instead of mixing a partial kill feed with the full match summary', () => {
    const withoutFeed: MajorRun = { ...run, matches: run.matches.map(stripSeriesDetails) };
    const partial: MajorRun = {
      ...run,
      matches: run.matches.map((match, matchIndex) => ({
        ...match,
        maps: match.maps.map((map, mapIndex) => matchIndex === 0 && mapIndex === 0 ? { ...map, details: undefined } : map)
      }))
    };

    expect(createRunStats(picked, partial, 'run-stats-seed', lineup))
      .toEqual(createRunStats(picked, withoutFeed, 'run-stats-seed', lineup));
  });
});
