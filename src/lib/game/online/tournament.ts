import { createSeededRng, simulateSeries } from '../simulation';
import type { CombatTeam, SeriesResult } from '../types';
import type { PublicRound, PublicStanding, PublicTournament } from './contracts';

export interface TournamentOrganization {
  id: string;
  name: string;
  seed: number;
  team: CombatTeam;
  human: boolean;
  sourceTeamId?: string;
}

export interface OrganizationCampaign {
  organizationId: string;
  seriesWon: number;
  seriesLost: number;
  mapsWon: number;
  mapsLost: number;
  roundsWon: number;
  roundsLost: number;
  placement: string;
}

export interface OnlineTournamentResult extends PublicTournament {
  campaigns: OrganizationCampaign[];
}

interface MutableStanding extends PublicStanding {
  opponents: string[];
}

const standingOrder = (left: MutableStanding, right: MutableStanding) =>
  right.wins - left.wins ||
  right.buchholz - left.buchholz ||
  left.losses - right.losses ||
  left.seed - right.seed ||
  left.organizationId.localeCompare(right.organizationId);

const pairingPreference = (left: MutableStanding, right: MutableStanding) =>
  Math.abs(left.wins - right.wins) * 1000 +
  Math.abs(left.losses - right.losses) * 100 +
  Math.abs(left.seed - right.seed);

function findPairings(active: MutableStanding[]): Array<[MutableStanding, MutableStanding]> {
  const ordered = [...active].sort(standingOrder);
  const search = (remaining: MutableStanding[]): Array<[MutableStanding, MutableStanding]> | null => {
    if (!remaining.length) return [];
    const left = remaining[0];
    const candidates = remaining.slice(1)
      .filter((right) => !left.opponents.includes(right.organizationId))
      .sort((a, b) => pairingPreference(left, a) - pairingPreference(left, b) || standingOrder(a, b));
    for (const right of candidates) {
      const rest = remaining.filter((standing) => standing !== left && standing !== right);
      const tail = search(rest);
      if (tail) return [[left, right], ...tail];
    }
    return null;
  };
  const result = search(ordered);
  if (!result) throw new Error('Could not create a Swiss round without a rematch');
  return result;
}

const getTeam = (organizations: Map<string, TournamentOrganization>, id: string): CombatTeam => {
  const organization = organizations.get(id);
  if (!organization) throw new Error(`Unknown tournament organization: ${id}`);
  return { ...organization.team, id: organization.id, name: organization.name, organizationId: organization.id };
};

const updateBuchholz = (standings: MutableStanding[]) => {
  const byId = new Map(standings.map((standing) => [standing.organizationId, standing]));
  for (const standing of standings) {
    standing.buchholz = standing.opponents.reduce((sum, opponentId) => sum + (byId.get(opponentId)?.wins ?? 0), 0);
  }
};

function simulateSwiss(
  organizations: TournamentOrganization[],
  seed: string
): { rounds: PublicRound[]; standings: MutableStanding[]; qualified: TournamentOrganization[] } {
  if (organizations.length !== 16) throw new Error('Stage 3 requires exactly 16 organizations');
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));
  const standings: MutableStanding[] = organizations.map((organization) => ({
    organizationId: organization.id,
    name: organization.name,
    seed: organization.seed,
    wins: 0,
    losses: 0,
    buchholz: 0,
    status: 'active',
    opponents: []
  }));
  const rounds: PublicRound[] = [];
  for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
    const active = standings.filter((standing) => standing.status === 'active');
    if (!active.length) break;
    const pairings = findPairings(active);
    const series = pairings.map(([left, right], index) => {
      const bestOf: 1 | 3 = left.wins === 2 || right.wins === 2 || left.losses === 2 || right.losses === 2 ? 3 : 1;
      const match = simulateSeries(
        getTeam(byId, left.organizationId),
        getTeam(byId, right.organizationId),
        bestOf,
        createSeededRng(`${seed}:swiss:${roundNumber}:${left.organizationId}:${right.organizationId}`),
        'stage3',
        `swiss-r${roundNumber}-m${index + 1}-${left.organizationId}-${right.organizationId}`
      );
      left.opponents.push(right.organizationId);
      right.opponents.push(left.organizationId);
      const winner = match.winnerId === left.organizationId ? left : right;
      const loser = winner === left ? right : left;
      winner.wins += 1;
      loser.losses += 1;
      if (winner.wins === 3) winner.status = 'qualified';
      if (loser.losses === 3) loser.status = 'eliminated';
      return match;
    });
    updateBuchholz(standings);
    rounds.push({ number: roundNumber, phase: 'swiss', series, revealed: true });
  }
  const qualifiedStandings = standings.filter((standing) => standing.status === 'qualified').sort(standingOrder);
  if (qualifiedStandings.length !== 8 || standings.filter((standing) => standing.status === 'eliminated').length !== 8) {
    throw new Error('Swiss stage did not resolve to eight qualified and eight eliminated organizations');
  }
  return {
    rounds,
    standings,
    qualified: qualifiedStandings.map((standing, index) => ({ ...byId.get(standing.organizationId)!, seed: index + 1 }))
  };
}

function simulatePlayoffBracket(organizations: TournamentOrganization[], seed: string, startRound: number) {
  if (organizations.length !== 8) throw new Error('Playoffs require exactly 8 organizations');
  const seeded = [...organizations].sort((a, b) => a.seed - b.seed);
  const quarterfinals: Array<[TournamentOrganization, TournamentOrganization]> = [
    [seeded[0], seeded[7]],
    [seeded[3], seeded[4]],
    [seeded[1], seeded[6]],
    [seeded[2], seeded[5]]
  ];
  const rounds: PublicRound[] = [];
  let pairings = quarterfinals;
  const roundDefinitions: Array<{ phase: 'quarterfinal' | 'semifinal' | 'final'; bestOf: 3 | 5 }> = [
    { phase: 'quarterfinal', bestOf: 3 },
    { phase: 'semifinal', bestOf: 3 },
    { phase: 'final', bestOf: 5 }
  ];
  for (let roundIndex = 0; roundIndex < roundDefinitions.length; roundIndex += 1) {
    const definition = roundDefinitions[roundIndex];
    const winners: TournamentOrganization[] = [];
    const series = pairings.map(([left, right], index) => {
      const match = simulateSeries(
        getTeam(new Map([[left.id, left], [right.id, right]]), left.id),
        getTeam(new Map([[left.id, left], [right.id, right]]), right.id),
        definition.bestOf,
        createSeededRng(`${seed}:playoffs:${definition.phase}:${left.id}:${right.id}`),
        definition.phase,
        `${definition.phase}-m${index + 1}-${left.id}-${right.id}`
      );
      winners.push(match.winnerId === left.id ? left : right);
      return match;
    });
    rounds.push({ number: startRound + roundIndex, phase: definition.phase, series, revealed: true });
    pairings = [];
    for (let index = 0; index < winners.length; index += 2) {
      if (winners[index + 1]) pairings.push([winners[index], winners[index + 1]]);
    }
  }
  const final = rounds.at(-1)?.series[0];
  return { rounds, championId: final?.winnerId ?? null };
}

const calculateCampaigns = (organizations: TournamentOrganization[], rounds: PublicRound[], championId: string | null): OrganizationCampaign[] => {
  const allSeries = rounds.flatMap((round) => round.series);
  return organizations.map((organization) => {
    const matches = allSeries.filter((series) => series.teamA.id === organization.id || series.teamB.id === organization.id);
    const seriesWon = matches.filter((series) => series.winnerId === organization.id).length;
    const mapsWon = matches.reduce((sum, series) => sum + (series.teamA.id === organization.id ? series.scoreA : series.scoreB), 0);
    const mapsLost = matches.reduce((sum, series) => sum + (series.teamA.id === organization.id ? series.scoreB : series.scoreA), 0);
    const roundsWon = matches.flatMap((series) => series.maps).reduce((sum, map) => sum + (matches.find((series) => series.maps.includes(map))?.teamA.id === organization.id ? map.scoreA : map.scoreB), 0);
    const roundsLost = matches.flatMap((series) => series.maps).reduce((sum, map) => sum + (matches.find((series) => series.maps.includes(map))?.teamA.id === organization.id ? map.scoreB : map.scoreA), 0);
    const last = matches.at(-1);
    const placement = championId === organization.id
      ? 'placementChampion'
      : last?.phase === 'final' ? 'placementRunnerUp'
        : last?.phase === 'semifinal' ? 'placement3to4'
          : last?.phase === 'quarterfinal' ? 'placement5to8'
            : 'Eliminado no Stage 3';
    return { organizationId: organization.id, seriesWon, seriesLost: matches.length - seriesWon, mapsWon, mapsLost, roundsWon, roundsLost, placement };
  });
};

export function runOnlineTournament(options: {
  organizations: TournamentOrganization[];
  botPool: TournamentOrganization[];
  entryStage: 'stage3' | 'playoffs';
  seed: string;
}): OnlineTournamentResult {
  const required = options.entryStage === 'stage3' ? 16 : 8;
  if (options.organizations.length < 2 || options.organizations.length > required) throw new Error(`Tournament requires 2-${required} human organizations`);
  const humanIds = new Set(options.organizations.map((organization) => organization.id));
  const bots = options.botPool.filter((organization) => !humanIds.has(organization.id)).slice(0, required - options.organizations.length);
  if (bots.length !== required - options.organizations.length) throw new Error('Not enough bots to complete the tournament field');
  const field = [...options.organizations, ...bots].map((organization, index) => ({ ...organization, seed: index + 1 }));
  let rounds: PublicRound[] = [];
  let standings: MutableStanding[];
  let playoffField: TournamentOrganization[];
  if (options.entryStage === 'stage3') {
    const swiss = simulateSwiss(field, options.seed);
    rounds = swiss.rounds;
    standings = swiss.standings;
    playoffField = swiss.qualified;
  } else {
    standings = field.map((organization) => ({
      organizationId: organization.id,
      name: organization.name,
      seed: organization.seed,
      wins: 0,
      losses: 0,
      buchholz: 0,
      status: 'qualified',
      opponents: []
    }));
    playoffField = field;
  }
  const playoffs = simulatePlayoffBracket(playoffField, options.seed, rounds.length + 1);
  rounds.push(...playoffs.rounds);
  const champion = standings.find((standing) => standing.organizationId === playoffs.championId);
  if (champion) champion.status = 'champion';
  return {
    rounds,
    standings: standings.sort(standingOrder).map(({ opponents: _opponents, ...standing }) => standing),
    championId: playoffs.championId,
    currentRound: rounds.length,
    liveCursor: null,
    campaigns: calculateCampaigns(field, rounds, playoffs.championId)
  };
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
      if (!left || !right) continue;
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
