import { describe, expect, it } from 'vitest';
import { players, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { aggregatePlayerLines, computeMajorAwards, placementsOf } from '../src/lib/game/majorAwards';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { buildMajorRun, stripSeriesDetails } from '../src/lib/game/simulation';
import type { CombatTeam, Player, RoundDetail, SelectedPlayer, SeriesResult } from '../src/lib/game/types';

const picked: Player[] = teams.slice(0, 5)
  .map((team) => players.find((player) => player.teamId === team.id))
  .filter((player): player is Player => Boolean(player));
const lineup: SelectedPlayer[] = picked.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const run = buildMajorRun(picked, 'balanced', teams, players, 'awards-seed', lineup, {
  selectedMaps: getDefaultMapSelection(picked, teams),
  mode: 'premier'
});
const tournament = run.tournament!;

describe('Major awards', () => {
  it('are attached to the offline run before the field kill feeds are stripped', () => {
    const awards = tournament.awards;
    expect(awards).not.toBeNull();
    expect(awards!.mvp).not.toBeNull();
    expect(awards!.mvp!.rating).toBeGreaterThan(0);
    // The whole field counts: the run only keeps the user's kill feeds, yet the ratings cover every team.
    expect(awards!.teams.length).toBe(16);
    expect(new Set(awards!.topPlayers.map((award) => award.teamId)).size).toBeGreaterThan(1);
  });

  it('sorts teams by rating with the best one on top and MVP first among the top players', () => {
    const awards = computeMajorAwards(tournament.rounds, tournament.championId)!;
    expect(awards.teams.every((team, index) => index === 0 || awards.teams[index - 1].rating >= team.rating)).toBe(true);
    expect(awards.topTeam).toEqual(awards.teams[0]);
    expect(awards.topPlayers.length).toBeGreaterThan(0);
    expect(awards.topPlayers.length).toBeLessThanOrEqual(8);
    expect(awards.topPlayers[0]).toEqual(awards.mvp);
    for (const award of awards.topPlayers) {
      expect(award.rounds).toBeGreaterThan(0);
      expect(award.kdRatio).toBeCloseTo(award.kills / Math.max(1, award.deaths), 2);
    }
    const placements = placementsOf(tournament.rounds, tournament.championId);
    expect(placements.get(tournament.championId!)).toBe('placementChampion');
    expect(awards.mvp!.placement).toBe(placements.get(awards.mvp!.teamId));
  });

  it('favours the champion when raw ratings are close', () => {
    const awards = computeMajorAwards(tournament.rounds, tournament.championId)!;
    const bonus: Record<string, number> = { placementChampion: 0.12, placementRunnerUp: 0.07, placement3to4: 0.04, placement5to8: 0.02 };
    const score = (award: { rating: number; placement: string }) => award.rating + (bonus[award.placement] ?? 0);
    const byRating = [...awards.topPlayers].sort((left, right) => right.rating - left.rating);
    const mvp = awards.mvp!;
    // The MVP maximises rating plus placement bonus, never raw rating alone.
    expect(awards.topPlayers.every((award) => score(mvp) >= score(award))).toBe(true);
    const champion = byRating.find((award) => award.placement === 'placementChampion');
    if (champion && byRating[0].placement !== 'placementChampion' && byRating[0].rating - champion.rating < 0.12 - (bonus[byRating[0].placement] ?? 0)) {
      expect(mvp.placement).toBe('placementChampion');
    }
  });

  it('returns null without any kill feed', () => {
    const stripped = tournament.rounds.map((round) => ({ ...round, series: round.series.map(stripSeriesDetails) }));
    expect(computeMajorAwards(stripped, tournament.championId)).toBeNull();
  });

  it('keeps the same player id separate when two organizations drafted it', () => {
    const combatTeam = (id: string): CombatTeam => ({ id, name: id, power: 90, mental: 90, clutch: 90, experience: 90 });
    const detail: RoundDetail = {
      number: 1,
      winner: 'a',
      sideA: 'ct',
      overtime: false,
      economy: {
        a: { buy: 'pistol', awp: false, money: 800 },
        b: { buy: 'pistol', awp: false, money: 800 }
      },
      kills: [
        { killerId: 'shared-player', killerName: 'Shared', killerSide: 'a', victimId: 'b-victim', victimName: 'B victim', weapon: 'usp', headshot: true, second: 20 },
        { killerId: 'shared-player', killerName: 'Shared', killerSide: 'b', victimId: 'a-victim', victimName: 'A victim', weapon: 'glock', headshot: false, second: 30 }
      ],
      ending: 'elimination',
      tags: ['pistol']
    };
    const series: SeriesResult = {
      id: 'duplicate-draft',
      phase: 'final',
      bestOf: 1,
      teamA: combatTeam('org-a'),
      teamB: combatTeam('org-b'),
      scoreA: 1,
      scoreB: 0,
      winnerId: 'org-a',
      maps: [{ map: 1, scoreA: 1, scoreB: 0, winnerId: 'org-a', rounds: [{ a: 1, b: 0, overtime: false }], overtime: false, details: [detail] }],
      userMatch: false
    };

    const duplicateLines = aggregatePlayerLines([series]).filter((line) => line.playerId === 'shared-player');
    expect(duplicateLines).toHaveLength(2);
    expect(duplicateLines.map((line) => line.teamId).sort()).toEqual(['org-a', 'org-b']);
    expect(duplicateLines.map((line) => line.kills)).toEqual([1, 1]);

    const awards = computeMajorAwards([{ series: [series] }], 'org-a')!;
    expect(awards.teams.map((team) => team.teamId).sort()).toEqual(['org-a', 'org-b']);
    expect(awards.topPlayers.filter((line) => line.playerId === 'shared-player')).toHaveLength(2);
  });
});
