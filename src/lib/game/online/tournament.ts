import { createStrategicSeries, type StrategicSeriesBook } from '../strategic-series';
import { createSeededRng, simulateMappedSeries, simulateSeries } from '../simulation';
import type { MapSimulationContext } from '../map-veto';
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

const botResults = new WeakMap<StrategicSeriesBook, Map<string, SeriesResult>>();
function cachedBotMatch(live: StrategicSeriesBook | undefined, id: string, simulate: () => SeriesResult): SeriesResult {
  if (!live) return simulate();
  let cache = botResults.get(live);
  if (!cache) { cache = new Map(); botResults.set(live, cache); }
  let result = cache.get(id);
  if (!result) { result = simulate(); cache.set(id, result); }
  return result;
}

export interface ContinuousSwissStanding extends PublicStanding {
  opponents: string[];
}

export interface ContinuousSwissPairingResult {
  pairings: Array<[ContinuousSwissStanding, ContinuousSwissStanding]>;
  waitingIds: string[];
  usedFallback: boolean;
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

/**
 * Pairs only teams that are ready. Same-record, rematch-free games are emitted first; callers can keep
 * `allowFallback` false while another eligible game is in flight, then enable it to prevent a real deadlock.
 */
export function pairContinuousSwiss(
  standings: ContinuousSwissStanding[],
  readyIds: Iterable<string>,
  allowFallback = false
): ContinuousSwissPairingResult {
  const ready = new Set(readyIds);
  const available = standings.filter((standing) => standing.status === 'active' && ready.has(standing.organizationId)).sort(standingOrder);
  const paired = new Set<string>();
  const pairings: Array<[ContinuousSwissStanding, ContinuousSwissStanding]> = [];
  const makePass = (crossRecord: boolean, rematch: boolean) => {
    for (const left of available) {
      if (paired.has(left.organizationId)) continue;
      const right = available.filter((candidate) => candidate !== left && !paired.has(candidate.organizationId))
        .filter((candidate) => crossRecord || (candidate.wins === left.wins && candidate.losses === left.losses))
        .filter((candidate) => rematch || !left.opponents.includes(candidate.organizationId))
        .sort((a, b) => pairingPreference(left, a) - pairingPreference(left, b) || standingOrder(a, b))[0];
      if (!right) continue;
      paired.add(left.organizationId);
      paired.add(right.organizationId);
      pairings.push([left, right]);
    }
  };
  makePass(false, false);
  let usedFallback = false;
  if (allowFallback) {
    const before = pairings.length;
    makePass(true, false);
    makePass(true, true);
    usedFallback = pairings.length > before;
  }
  return { pairings, waitingIds: available.filter((standing) => !paired.has(standing.organizationId)).map((standing) => standing.organizationId), usedFallback };
}

export type PlayoffNodeId = 'qf1' | 'qf2' | 'qf3' | 'qf4' | 'sf1' | 'sf2' | 'final';

export interface PlayoffDependencyNode {
  id: PlayoffNodeId;
  phase: 'quarterfinal' | 'semifinal' | 'final';
  bestOf: 3 | 5;
  left: string | { winnerOf: PlayoffNodeId };
  right: string | { winnerOf: PlayoffNodeId };
}

export function createPlayoffDependencies(qualifiedIds: string[]): PlayoffDependencyNode[] {
  if (qualifiedIds.length !== 8) throw new Error('Playoffs require exactly 8 qualified teams');
  return [
    { id: 'qf1', phase: 'quarterfinal', bestOf: 3, left: qualifiedIds[0], right: qualifiedIds[7] },
    { id: 'qf2', phase: 'quarterfinal', bestOf: 3, left: qualifiedIds[3], right: qualifiedIds[4] },
    { id: 'qf3', phase: 'quarterfinal', bestOf: 3, left: qualifiedIds[1], right: qualifiedIds[6] },
    { id: 'qf4', phase: 'quarterfinal', bestOf: 3, left: qualifiedIds[2], right: qualifiedIds[5] },
    { id: 'sf1', phase: 'semifinal', bestOf: 3, left: { winnerOf: 'qf1' }, right: { winnerOf: 'qf2' } },
    { id: 'sf2', phase: 'semifinal', bestOf: 3, left: { winnerOf: 'qf3' }, right: { winnerOf: 'qf4' } },
    { id: 'final', phase: 'final', bestOf: 5, left: { winnerOf: 'sf1' }, right: { winnerOf: 'sf2' } }
  ];
}

export function getReadyPlayoffNodes(
  nodes: PlayoffDependencyNode[],
  winners: Partial<Record<PlayoffNodeId, string>>,
  started: Iterable<PlayoffNodeId> = []
): Array<PlayoffDependencyNode & { teamAId: string; teamBId: string }> {
  const active = new Set(started);
  const resolve = (slot: PlayoffDependencyNode['left']) => typeof slot === 'string' ? slot : winners[slot.winnerOf];
  return nodes.flatMap((node) => {
    if (active.has(node.id) || winners[node.id]) return [];
    const teamAId = resolve(node.left);
    const teamBId = resolve(node.right);
    return teamAId && teamBId ? [{ ...node, teamAId, teamBId }] : [];
  });
}

function findPairings(active: MutableStanding[]): Array<[MutableStanding, MutableStanding]> {
  const ordered = [...active].sort(standingOrder);
  const search = (remaining: MutableStanding[], allowRematch = false): Array<[MutableStanding, MutableStanding]> | null => {
    if (!remaining.length) return [];
    const left = remaining[0];
    const candidates = remaining.slice(1)
      .filter((right) => allowRematch || !left.opponents.includes(right.organizationId))
      .sort((a, b) => pairingPreference(left, a) - pairingPreference(left, b) || standingOrder(a, b));
    for (const right of candidates) {
      const rest = remaining.filter((standing) => standing !== left && standing !== right);
      const tail = search(rest, allowRematch);
      if (tail) return [[left, right], ...tail];
    }
    return null;
  };
  // A rematch-free pairing can be impossible late in the Swiss stage; a rematch beats crashing the whole tournament.
  const result = search(ordered) ?? search(ordered, true);
  if (!result) throw new Error('Could not create a Swiss round');
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
  seed: string,
  mapContext?: MapSimulationContext,
  swissBestOf?: 1 | 3,
  live?: StrategicSeriesBook,
  humanIds?: Set<string>
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
      const bestOf: 1 | 3 = swissBestOf ?? (left.wins === 2 || right.wins === 2 || left.losses === 2 || right.losses === 2 ? 3 : 1);
      const simulationArgs = [
        getTeam(byId, left.organizationId),
        getTeam(byId, right.organizationId),
        bestOf,
        createSeededRng(`${seed}:swiss:${roundNumber}:${left.organizationId}:${right.organizationId}`),
        'stage3',
        `swiss-r${roundNumber}-m${index + 1}-${left.organizationId}-${right.organizationId}`
      ] as const;
      const interactive = live && mapContext && (humanIds?.has(left.organizationId) || humanIds?.has(right.organizationId));
      const match = interactive
        ? (live[simulationArgs[5]] ??= createStrategicSeries(simulationArgs[0], simulationArgs[1], simulationArgs[2], simulationArgs[4], simulationArgs[5], mapContext)).result
        : cachedBotMatch(live, simulationArgs[5], () => mapContext ? simulateMappedSeries(...simulationArgs, mapContext) : simulateSeries(...simulationArgs));
      if (!match.winnerId) return match;
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
    if (series.some(match => !match.winnerId)) break;
  }
  const qualifiedStandings = standings.filter((standing) => standing.status === 'qualified').sort(standingOrder);
  if (!live && (qualifiedStandings.length !== 8 || standings.filter((standing) => standing.status === 'eliminated').length !== 8)) {
    throw new Error('Swiss stage did not resolve to eight qualified and eight eliminated organizations');
  }
  return {
    rounds,
    standings,
    qualified: qualifiedStandings.map((standing, index) => ({ ...byId.get(standing.organizationId)!, seed: index + 1 }))
  };
}

function simulatePlayoffBracket(organizations: TournamentOrganization[], seed: string, startRound: number, mapContext?: MapSimulationContext, live?: StrategicSeriesBook, humanIds?: Set<string>) {
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
      const simulationArgs = [
        getTeam(new Map([[left.id, left], [right.id, right]]), left.id),
        getTeam(new Map([[left.id, left], [right.id, right]]), right.id),
        definition.bestOf,
        createSeededRng(`${seed}:playoffs:${definition.phase}:${left.id}:${right.id}`),
        definition.phase,
        `${definition.phase}-m${index + 1}-${left.id}-${right.id}`
      ] as const;
      const interactive = live && mapContext && (humanIds?.has(left.id) || humanIds?.has(right.id));
      const match = interactive
        ? (live[simulationArgs[5]] ??= createStrategicSeries(simulationArgs[0], simulationArgs[1], simulationArgs[2], simulationArgs[4], simulationArgs[5], mapContext)).result
        : cachedBotMatch(live, simulationArgs[5], () => mapContext ? simulateMappedSeries(...simulationArgs, mapContext) : simulateSeries(...simulationArgs));
      if (!match.winnerId) return match;
      winners.push(match.winnerId === left.id ? left : right);
      return match;
    });
    rounds.push({ number: startRound + roundIndex, phase: definition.phase, series, revealed: true });
    if (series.some(match => !match.winnerId)) break;
    pairings = [];
    for (let index = 0; index < winners.length; index += 2) {
      if (winners[index + 1]) pairings.push([winners[index], winners[index + 1]]);
    }
  }
  const final = rounds.at(-1)?.series[0];
  return { rounds, championId: final?.phase === 'final' ? final.winnerId || null : null };
}

const calculateCampaigns = (organizations: TournamentOrganization[], rounds: PublicRound[], championId: string | null): OrganizationCampaign[] => {
  const allSeries = rounds.flatMap((round) => round.series).filter(series => series.winnerId);
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
            : 'placementStage3';
    return { organizationId: organization.id, seriesWon, seriesLost: matches.length - seriesWon, mapsWon, mapsLost, roundsWon, roundsLost, placement };
  });
};

export function runOnlineTournament(options: {
  organizations: TournamentOrganization[];
  botPool: TournamentOrganization[];
  entryStage: 'stage3' | 'playoffs';
  seed: string;
  mapContext?: MapSimulationContext;
  /** Forces every Swiss series to this format (the offline Major is all BO3 except the final). */
  swissBestOf?: 1 | 3;
  live?: StrategicSeriesBook;
}): OnlineTournamentResult {
  const required = options.entryStage === 'stage3' ? 16 : 8;
  if (options.organizations.length < 1 || options.organizations.length > required) throw new Error(`Tournament requires 1-${required} organizations`);
  const humanIds = new Set(options.organizations.map((organization) => organization.id));
  const bots = options.botPool.filter((organization) => !humanIds.has(organization.id)).slice(0, required - options.organizations.length);
  if (bots.length !== required - options.organizations.length) throw new Error('Not enough bots to complete the tournament field');
  const field = [...options.organizations, ...bots].map((organization, index) => ({ ...organization, seed: index + 1 }));
  let rounds: PublicRound[] = [];
  let standings: MutableStanding[];
  let playoffField: TournamentOrganization[];
  if (options.entryStage === 'stage3') {
    const swiss = simulateSwiss(field, options.seed, options.mapContext, options.swissBestOf, options.live, humanIds);
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
  const playoffs = playoffField.length === 8 && !rounds.some(round => round.series.some(match => !match.winnerId))
    ? simulatePlayoffBracket(playoffField, options.seed, rounds.length + 1, options.mapContext, options.live, humanIds)
    : { rounds: [], championId: null };
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
