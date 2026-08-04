import { describe, expect, it } from 'vitest';
import type { CombatTeam } from '../src/lib/game/types';
import { revealTournament, runOnlineTournament, type TournamentOrganization } from '../src/lib/game/online/tournament';

const organization = (index: number, human = true): TournamentOrganization => {
  const team: CombatTeam = {
    id: `org-${index}`,
    name: `Organization ${index}`,
    power: 78 + (index % 14),
    mental: 80 + (index % 10),
    clutch: 79 + (index % 11),
    experience: 77 + (index % 12)
  };
  return { id: team.id, name: team.name, seed: index + 1, team, human };
};

describe('online tournament engine', () => {
  it('is deterministic and produces a complete 16-team Swiss stage without rematches', () => {
    const organizations = Array.from({ length: 16 }, (_, index) => organization(index));
    const first = runOnlineTournament({ organizations, botPool: [], entryStage: 'stage3', seed: 'shared-seed' });
    const second = runOnlineTournament({ organizations, botPool: [], entryStage: 'stage3', seed: 'shared-seed' });
    expect(second).toEqual(first);
    const swiss = first.rounds.filter((round) => round.phase === 'swiss');
    const pairings = swiss.flatMap((round) => round.series.map((series) => [series.teamA.id, series.teamB.id].sort().join(':')));
    expect(new Set(pairings).size).toBe(pairings.length);
    expect(first.standings.filter((standing) => standing.status === 'qualified' || standing.status === 'champion')).toHaveLength(8);
    expect(first.standings.filter((standing) => standing.status === 'eliminated')).toHaveLength(8);
    expect(swiss.flatMap((round) => round.series).every((series) => series.bestOf === 1 || series.bestOf === 3)).toBe(true);
  });

  it('fills direct playoffs to eight teams and crowns exactly one champion', () => {
    const humans = Array.from({ length: 3 }, (_, index) => organization(index));
    const bots = Array.from({ length: 12 }, (_, index) => organization(index + 20, false));
    const result = runOnlineTournament({ organizations: humans, botPool: bots, entryStage: 'playoffs', seed: 'playoffs' });
    const playoffs = result.rounds.flatMap((round) => round.series);
    expect(result.standings).toHaveLength(8);
    expect(playoffs).toHaveLength(7);
    expect(playoffs.at(-1)?.bestOf).toBe(5);
    expect(result.standings.filter((standing) => standing.status === 'champion')).toHaveLength(1);
    expect(result.championId).toBeTruthy();
  });

  it('does not reveal precomputed future rounds', () => {
    const result = runOnlineTournament({
      organizations: Array.from({ length: 2 }, (_, index) => organization(index)),
      botPool: Array.from({ length: 14 }, (_, index) => organization(index + 20, false)),
      entryStage: 'stage3',
      seed: 'private-future'
    });
    const publicState = revealTournament(result, 1);
    expect(publicState.rounds).toHaveLength(1);
    expect(publicState.championId).toBeNull();
  });
});
