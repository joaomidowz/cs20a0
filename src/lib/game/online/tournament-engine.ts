import type { MapSimulationContext } from '../map-veto';
import { createSeededRng } from '../simulation';
import type { CombatTeam, SeriesResult } from '../types';
import type { PublicRound, PublicStanding, PublicTournament } from './contracts';
import {
  createLiveSeries,
  runSeriesToEnd,
  toSeriesResult,
  type Controller,
  type LiveSeriesConfig,
  type LiveSeriesState
} from './live-series';

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

export interface MutableStanding extends PublicStanding {
  opponents: string[];
}

export interface TournamentEngineOptions {
  organizations: TournamentOrganization[];
  botPool: TournamentOrganization[];
  entryStage: 'stage3' | 'playoffs';
  seed: string;
  mapContext?: MapSimulationContext;
  /** Format of every Swiss series. Defaults to BO3 (the Major's advancement/elimination format for every round). */
  swissBestOf?: 1 | 3;
  /** Who takes the decisions of an organization. Defaults to humans → 'human', bots → 'bot'. */
  controllerFor?: (organization: TournamentOrganization) => Controller;
  /** Whether a series waits for the two organizations to veto by hand. Defaults to human vs human only. */
  interactiveVeto?: (left: TournamentOrganization, right: TournamentOrganization) => boolean;
  /** Decision kinds human controllers take by hand in every series (see `LiveSeriesConfig.humanDecisions`). */
  humanDecisions?: LiveSeriesConfig['humanDecisions'];
  /** Initial seed order by organization id; ids left out keep their field order after the listed ones. */
  seedOrder?: string[];
}

export interface TournamentRoundState {
  number: number;
  phase: PublicRound['phase'];
  series: LiveSeriesState[];
  complete: boolean;
}

export interface TournamentEngineState {
  options: TournamentEngineOptions;
  field: TournamentOrganization[];
  byId: Map<string, TournamentOrganization>;
  standings: MutableStanding[];
  rounds: TournamentRoundState[];
  playoffField: TournamentOrganization[] | null;
  bracketWinners: TournamentOrganization[];
  championId: string | null;
  finished: boolean;
}

export const SWISS_ROUNDS = 5;

/**
 * Seeds (1-based) the humans of an online room take, drawn from the whole field so two friends who joined one after
 * the other are not forced to meet in the first round. Deterministic for a room seed; the bots fill the other slots.
 */
export function drawHumanSeeds(seed: string, humanCount: number, fieldSize: number): number[] {
  const rng = createSeededRng(`${seed}:human-seeds`);
  const slots = Array.from({ length: fieldSize }, (_, index) => index + 1);
  const drawn: number[] = [];
  for (let index = 0; index < Math.min(humanCount, fieldSize); index += 1) {
    const target = index + Math.floor(rng() * (slots.length - index));
    [slots[index], slots[target]] = [slots[target], slots[index]];
    drawn.push(slots[index]);
  }
  return drawn;
}

/** Record first (3-0 ahead of 3-1 ahead of 3-2), then Buchholz, then the initial seed: the Major's own tiebreak order. */
export const standingOrder = (left: MutableStanding, right: MutableStanding) =>
  right.wins - left.wins ||
  left.losses - right.losses ||
  right.buchholz - left.buchholz ||
  left.seed - right.seed ||
  left.organizationId.localeCompare(right.organizationId);

/**
 * Swiss pairing like a real Major: inside each record group the top half meets the bottom half (1v9, 2v10 … in the
 * first round; best Buchholz against worst later on). The record terms dominate so groups only mix when they must.
 */
export function findPairings(active: MutableStanding[]): Array<[MutableStanding, MutableStanding]> {
  const ordered = [...active].sort(standingOrder);
  const slot = new Map<string, { index: number; size: number }>();
  const groups = new Map<string, MutableStanding[]>();
  for (const standing of ordered) {
    const key = `${standing.wins}-${standing.losses}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(standing);
  }
  for (const group of groups.values()) group.forEach((standing, index) => slot.set(standing.organizationId, { index, size: group.length }));
  const pairingPreference = (left: MutableStanding, right: MutableStanding) => {
    const leftSlot = slot.get(left.organizationId)!;
    const rightSlot = slot.get(right.organizationId)!;
    return Math.abs(left.wins - right.wins) * 1000 +
      Math.abs(left.losses - right.losses) * 100 +
      Math.abs(rightSlot.index - (leftSlot.index + Math.ceil(leftSlot.size / 2)));
  };
  const sameRecord = (left: MutableStanding, right: MutableStanding) => left.wins === right.wins && left.losses === right.losses;
  const search = (remaining: MutableStanding[], allowCrossGroup: boolean, allowRematch: boolean): Array<[MutableStanding, MutableStanding]> | null => {
    if (!remaining.length) return [];
    const left = remaining[0];
    const candidates = remaining.slice(1)
      .filter((right) => (allowRematch || !left.opponents.includes(right.organizationId)) && (allowCrossGroup || sameRecord(left, right)))
      .sort((a, b) => pairingPreference(left, a) - pairingPreference(left, b) || standingOrder(a, b));
    for (const right of candidates) {
      const rest = remaining.filter((standing) => standing !== left && standing !== right);
      const tail = search(rest, allowCrossGroup, allowRematch);
      if (tail) return [[left, right], ...tail];
    }
    return null;
  };
  // Every team meets its own record group first; only when that is impossible do groups mix, and only as a last resort
  // does a rematch happen (it beats crashing the whole tournament).
  const result = search(ordered, false, false) ?? search(ordered, true, false) ?? search(ordered, true, true);
  if (!result) throw new Error('Could not create a Swiss round');
  return result;
}

const getTeam = (organization: TournamentOrganization): CombatTeam =>
  ({ ...organization.team, id: organization.id, name: organization.name, organizationId: organization.id });

const updateBuchholz = (standings: MutableStanding[]) => {
  const byId = new Map(standings.map((standing) => [standing.organizationId, standing]));
  for (const standing of standings) {
    standing.buchholz = standing.opponents.reduce((sum, opponentId) => sum + (byId.get(opponentId)?.wins ?? 0), 0);
  }
};

export const calculateCampaigns = (organizations: TournamentOrganization[], rounds: PublicRound[], championId: string | null): OrganizationCampaign[] => {
  const allSeries = rounds.flatMap((round) => round.series).filter((series) => series.winnerId);
  return organizations.map((organization) => {
    const matches = allSeries.filter((series) => series.teamA.id === organization.id || series.teamB.id === organization.id);
    const seriesWon = matches.filter((series) => series.winnerId === organization.id).length;
    const mapsWon = matches.reduce((sum, series) => sum + (series.teamA.id === organization.id ? series.scoreA : series.scoreB), 0);
    const mapsLost = matches.reduce((sum, series) => sum + (series.teamA.id === organization.id ? series.scoreB : series.scoreA), 0);
    const roundsWon = matches.reduce((sum, series) => sum + series.maps.reduce((mapSum, map) => mapSum + (series.teamA.id === organization.id ? map.scoreA : map.scoreB), 0), 0);
    const roundsLost = matches.reduce((sum, series) => sum + series.maps.reduce((mapSum, map) => mapSum + (series.teamA.id === organization.id ? map.scoreB : map.scoreA), 0), 0);
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

const defaultController = (organization: TournamentOrganization): Controller => (organization.human ? 'human' : 'bot');
const defaultInteractiveVeto = (left: TournamentOrganization, right: TournamentOrganization) => left.human && right.human;

export function createTournamentEngine(options: TournamentEngineOptions): TournamentEngineState {
  const required = options.entryStage === 'stage3' ? 16 : 8;
  if (options.organizations.length < 1 || options.organizations.length > required) throw new Error(`Tournament requires 1-${required} organizations`);
  const humanIds = new Set(options.organizations.map((organization) => organization.id));
  const bots = options.botPool.filter((organization) => !humanIds.has(organization.id)).slice(0, required - options.organizations.length);
  if (bots.length !== required - options.organizations.length) throw new Error('Not enough bots to complete the tournament field');
  const rank = new Map((options.seedOrder ?? []).map((id, index) => [id, index]));
  const field = [...options.organizations, ...bots]
    .sort((left, right) => (rank.get(left.id) ?? Number.POSITIVE_INFINITY) - (rank.get(right.id) ?? Number.POSITIVE_INFINITY))
    .map((organization, index) => ({ ...organization, seed: index + 1 }));
  const standings: MutableStanding[] = field.map((organization) => ({
    organizationId: organization.id,
    name: organization.name,
    seed: organization.seed,
    wins: 0,
    losses: 0,
    buchholz: 0,
    status: options.entryStage === 'stage3' ? 'active' : 'qualified',
    opponents: []
  }));
  return {
    options,
    field,
    byId: new Map(field.map((organization) => [organization.id, organization])),
    standings,
    rounds: [],
    playoffField: options.entryStage === 'playoffs' ? field : null,
    bracketWinners: [],
    championId: null,
    finished: false
  };
}

export const currentRound = (state: TournamentEngineState): TournamentRoundState | null => {
  const last = state.rounds.at(-1);
  return last && !last.complete ? last : null;
};

export const completedRoundCount = (state: TournamentEngineState) => state.rounds.filter((round) => round.complete).length;

export const canStartNextRound = (state: TournamentEngineState) => !state.finished && (state.rounds.length === 0 || state.rounds.at(-1)!.complete);

export const isRoundComplete = (round: TournamentRoundState) => round.series.every((series) => series.phase === 'finished');

function createSeries(state: TournamentEngineState, left: TournamentOrganization, right: TournamentOrganization, bestOf: 1 | 3 | 5, phase: SeriesResult['phase'], id: string, seed: string): LiveSeriesState {
  const { mapContext } = state.options;
  const strategyA = mapContext?.strategies.get(left.id);
  const strategyB = mapContext?.strategies.get(right.id);
  const controllerFor = state.options.controllerFor ?? defaultController;
  const interactiveVeto = state.options.interactiveVeto ?? defaultInteractiveVeto;
  const config: LiveSeriesConfig = {
    id,
    phase,
    bestOf,
    teamA: getTeam(left),
    teamB: getTeam(right),
    seed,
    vetoSeed: mapContext ? `${mapContext.seed}:${id}:veto` : undefined,
    mode: mapContext?.mode ?? 'premier',
    strategies: strategyA && strategyB ? { a: strategyA, b: strategyB } : null,
    rosters: { a: mapContext?.rosters?.get(left.id), b: mapContext?.rosters?.get(right.id) },
    controllers: { a: controllerFor(left), b: controllerFor(right) },
    interactiveVeto: Boolean(strategyA && strategyB) && interactiveVeto(left, right),
    ...(state.options.humanDecisions ? { humanDecisions: state.options.humanDecisions } : {})
  };
  return createLiveSeries(config);
}

const swissRoundCount = (state: TournamentEngineState) => state.rounds.filter((round) => round.phase === 'swiss').length;

/** Pairs the next round (Swiss or bracket). Throws while the current round is still running. */
export function startNextRound(state: TournamentEngineState): TournamentRoundState {
  if (!canStartNextRound(state)) throw new Error('The current round is not complete');
  const number = state.rounds.length + 1;
  const { seed } = state.options;
  let round: TournamentRoundState;
  if (state.options.entryStage === 'stage3' && swissRoundCount(state) < SWISS_ROUNDS) {
    const active = state.standings.filter((standing) => standing.status === 'active');
    const roundNumber = swissRoundCount(state) + 1;
    const series = findPairings(active).map(([left, right], index) => {
      const bestOf: 1 | 3 = state.options.swissBestOf ?? 3;
      return createSeries(
        state,
        state.byId.get(left.organizationId)!,
        state.byId.get(right.organizationId)!,
        bestOf,
        'stage3',
        `swiss-r${roundNumber}-m${index + 1}-${left.organizationId}-${right.organizationId}`,
        `${seed}:swiss:${roundNumber}:${left.organizationId}:${right.organizationId}`
      );
    });
    round = { number, phase: 'swiss', series, complete: false };
  } else {
    if (!state.playoffField) throw new Error('Playoffs cannot start before the Swiss stage resolves');
    const playoffRounds = state.rounds.filter((item) => item.phase !== 'swiss').length;
    const definitions: Array<{ phase: 'quarterfinal' | 'semifinal' | 'final'; bestOf: 3 | 5 }> = [
      { phase: 'quarterfinal', bestOf: 3 },
      { phase: 'semifinal', bestOf: 3 },
      { phase: 'final', bestOf: 5 }
    ];
    const definition = definitions[playoffRounds];
    if (!definition) throw new Error('The bracket is already complete');
    let pairings: Array<[TournamentOrganization, TournamentOrganization]>;
    if (playoffRounds === 0) {
      const seeded = [...state.playoffField].sort((a, b) => a.seed - b.seed);
      pairings = [[seeded[0], seeded[7]], [seeded[3], seeded[4]], [seeded[1], seeded[6]], [seeded[2], seeded[5]]];
    } else {
      pairings = [];
      for (let index = 0; index < state.bracketWinners.length; index += 2) {
        if (state.bracketWinners[index + 1]) pairings.push([state.bracketWinners[index], state.bracketWinners[index + 1]]);
      }
    }
    const series = pairings.map(([left, right], index) => createSeries(
      state,
      left,
      right,
      definition.bestOf,
      definition.phase,
      `${definition.phase}-m${index + 1}-${left.id}-${right.id}`,
      `${seed}:playoffs:${definition.phase}:${left.id}:${right.id}`
    ));
    round = { number, phase: definition.phase, series, complete: false };
  }
  state.rounds.push(round);
  return round;
}

/** Applies the results of the finished current round to standings, bracket and champion. */
export function completeRound(state: TournamentEngineState): void {
  const round = currentRound(state);
  if (!round) throw new Error('No round is running');
  if (!isRoundComplete(round)) throw new Error('The round still has unfinished series');
  const byId = new Map(state.standings.map((standing) => [standing.organizationId, standing]));
  if (round.phase === 'swiss') {
    for (const series of round.series) {
      const left = byId.get(series.config.teamA.id)!;
      const right = byId.get(series.config.teamB.id)!;
      left.opponents.push(right.organizationId);
      right.opponents.push(left.organizationId);
      const winner = series.winnerId === left.organizationId ? left : right;
      const loser = winner === left ? right : left;
      winner.wins += 1;
      loser.losses += 1;
      if (winner.wins === 3) winner.status = 'qualified';
      if (loser.losses === 3) loser.status = 'eliminated';
    }
    updateBuchholz(state.standings);
    if (swissRoundCount(state) === SWISS_ROUNDS) {
      const qualified = state.standings.filter((standing) => standing.status === 'qualified').sort(standingOrder);
      if (qualified.length !== 8 || state.standings.filter((standing) => standing.status === 'eliminated').length !== 8) {
        throw new Error('Swiss stage did not resolve to eight qualified and eight eliminated organizations');
      }
      state.playoffField = qualified.map((standing, index) => ({ ...state.byId.get(standing.organizationId)!, seed: index + 1 }));
    }
  } else {
    const winners: TournamentOrganization[] = [];
    for (const series of round.series) {
      const winnerId = series.winnerId;
      const bracketWinner = (state.playoffField ?? state.field).find((organization) => organization.id === winnerId) ?? state.byId.get(winnerId)!;
      winners.push(bracketWinner);
      // Playoff losers keep their 'qualified' status in the final table; only the champion is singled out.
      if (round.phase === 'final') {
        byId.get(winnerId)!.status = 'champion';
        state.championId = winnerId;
        state.finished = true;
      }
    }
    state.bracketWinners = winners;
  }
  round.complete = true;
}

export const findSeries = (state: TournamentEngineState, seriesId: string): LiveSeriesState | undefined =>
  state.rounds.flatMap((round) => round.series).find((series) => series.config.id === seriesId);

export const seriesFor = (round: TournamentRoundState, organizationId: string): LiveSeriesState | undefined =>
  round.series.find((series) => series.config.teamA.id === organizationId || series.config.teamB.id === organizationId);

const toPublicRound = (round: TournamentRoundState): PublicRound =>
  ({ number: round.number, phase: round.phase, series: round.series.map(toSeriesResult), revealed: true });

/** Everything simulated so far, including the round in progress (its unfinished series carry `winnerId: ''`). */
export function toResult(state: TournamentEngineState): OnlineTournamentResult {
  const rounds = state.rounds.map(toPublicRound);
  const completedRounds = rounds.filter((_, index) => state.rounds[index].complete);
  return {
    rounds,
    standings: [...state.standings].sort(standingOrder).map(({ opponents: _opponents, ...standing }) => standing),
    championId: state.championId,
    currentRound: rounds.length,
    liveCursor: null,
    campaigns: calculateCampaigns(state.field, completedRounds, state.championId)
  };
}

/** Runs every series with bot policies until the champion is known. */
export function runTournamentToEnd(state: TournamentEngineState): TournamentEngineState {
  while (!state.finished) {
    const round = startNextRound(state);
    for (const series of round.series) runSeriesToEnd(series);
    completeRound(state);
  }
  return state;
}
