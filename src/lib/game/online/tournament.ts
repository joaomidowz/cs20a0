import type { PublicStanding, PublicTournament } from './contracts';
import {
  createTournamentEngine,
  runTournamentToEnd,
  toResult,
  type OnlineTournamentResult,
  type TournamentEngineOptions
} from './tournament-engine';

export type { OnlineTournamentResult, OrganizationCampaign, TournamentOrganization } from './tournament-engine';

/**
 * Simulates a whole tournament in one go: every organization (humans included) is driven by the bot policies.
 * Used by the solo Major, the automatic Sandbox and the tests; the online server drives the engine incrementally.
 */
export function runOnlineTournament(options: TournamentEngineOptions): OnlineTournamentResult {
  const engine = createTournamentEngine({ ...options, controllerFor: () => 'bot', interactiveVeto: () => false });
  return toResult(runTournamentToEnd(engine));
}

export function revealTournament(result: OnlineTournamentResult, revealedRounds: number): PublicTournament {
  const visibleRounds = result.rounds.slice(0, Math.max(0, revealedRounds)).map((round) => ({ ...round, revealed: true }));
  return {
    rounds: visibleRounds,
    standings: getStandingsAfterRounds(result, revealedRounds),
    championId: revealedRounds >= result.rounds.length ? result.championId : null,
    currentRound: Math.min(revealedRounds, result.rounds.length),
    liveCursor: null,
    campaigns: revealedRounds >= result.rounds.length ? result.campaigns : undefined
  };
}

export function getStandingsAfterRounds(result: OnlineTournamentResult, revealedRounds: number): PublicStanding[] {
  const standings: Array<PublicStanding & { opponents: string[] }> = result.standings.map((standing) => ({
    ...standing,
    wins: 0,
    losses: 0,
    buchholz: 0,
    status: result.rounds[0]?.phase === 'swiss' ? 'active' : 'qualified',
    opponents: [] as string[]
  }));
  const byId = new Map(standings.map((standing) => [standing.organizationId, standing]));
  for (const round of result.rounds.slice(0, revealedRounds)) {
    for (const series of round.series) {
      const left = byId.get(series.teamA.id);
      const right = byId.get(series.teamB.id);
      if (!left || !right || !series.winnerId) continue;
      if (round.phase === 'swiss') {
        left.opponents.push(right.organizationId);
        right.opponents.push(left.organizationId);
        const winner = series.winnerId === left.organizationId ? left : right;
        const loser = winner === left ? right : left;
        winner.wins += 1;
        loser.losses += 1;
        if (winner.wins === 3) winner.status = 'qualified';
        if (loser.losses === 3) loser.status = 'eliminated';
      } else {
        const loser = series.winnerId === left.organizationId ? right : left;
        loser.status = 'eliminated';
        const winner = loser === left ? right : left;
        winner.status = round.phase === 'final' ? 'champion' : 'qualified';
      }
    }
    const currentWins = new Map(standings.map((standing) => [standing.organizationId, standing.wins]));
    for (const standing of standings) {
      standing.buchholz = standing.opponents.reduce((sum, opponentId) => sum + (currentWins.get(opponentId) ?? 0), 0);
    }
  }
  return standings
    .map(({ opponents: _opponents, ...standing }) => standing)
    .sort((left, right) => right.wins - left.wins || right.buchholz - left.buchholz || left.losses - right.losses || left.seed - right.seed);
}
