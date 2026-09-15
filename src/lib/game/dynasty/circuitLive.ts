import {
  advanceCampaignMajor,
  autoDecideCampaign,
  createCampaignMajor,
  currentCampaignSeries,
  pendingCampaignDecision,
  stepCampaignSeries,
  type CampaignMajorState
} from '../campaign-major';
import { stripSeriesDetails } from '../simulation';
import type { CircuitEvent, CircuitResult, Coach, HistoricalTeam, MajorRound, MapId, Player, SelectedPlayer, SeriesPlan, SeriesResult } from '../types';
import type { LiveSeriesState } from '../online/live-series';
import { CIRCUIT_PRIZES, circuitPlacementFrom } from './circuit';

export interface CircuitCampaignInput {
  event: CircuitEvent;
  /** Resolved dynasty players (overrides applied) — the base plan, no study and no temporary training. */
  players: Player[];
  lineup: SelectedPlayer[];
  teams: HistoricalTeam[];
  allPlayers: Player[];
  seed: string;
  selectedMaps: MapId[];
  coach: Coach | null;
  plan: SeriesPlan;
}

/**
 * A circuit event played live on the Major's own engine: eight teams, single elimination, the user's series
 * step by step (every decision on the bot policies) while the bracket fills in round by round.
 */
export function createCircuitCampaign(input: CircuitCampaignInput): CampaignMajorState {
  const byId = new Map(input.teams.map((team) => [team.id, team]));
  const eventTeams = input.event.teamIds.map((id) => byId.get(id)).filter((team): team is HistoricalTeam => Boolean(team));
  return createCampaignMajor(input.players, 'balanced', eventTeams, input.allPlayers, `${input.seed}:${input.event.id}`, input.lineup, {
    mode: 'dynasty',
    selectedMaps: input.selectedMaps,
    playoffEntry: { quarterfinal: 3, semifinal: 3, final: 3 },
    dynastyRules: 2,
    dynastyPlan: input.plan,
    coach: input.coach ?? undefined
  });
}

/** One live step of the event: pending decisions go to the bot policies, the user's series advances a round, and a finished (or absent) user series settles the bots and opens the next round. */
export function stepCircuitCampaign(state: CampaignMajorState): CampaignMajorState {
  let next = state;
  for (let guard = 0; guard < 40; guard += 1) {
    if (!pendingCampaignDecision(next)) break;
    next = autoDecideCampaign(next);
  }
  const live = currentCampaignSeries(next);
  if (live && live.phase !== 'finished') return stepCampaignSeries(next);
  return advanceCampaignMajor(next);
}

const seriesAsResult = (live: LiveSeriesState): SeriesResult => {
  const finished = live.phase === 'finished';
  return stripSeriesDetails({
    id: live.config.id,
    phase: live.config.phase,
    bestOf: live.config.bestOf,
    teamA: live.config.teamA,
    teamB: live.config.teamB,
    scoreA: live.scoreA,
    scoreB: live.scoreB,
    // An empty winner never matches a team id, so a live series simply shows no winner yet.
    winnerId: finished ? (live.scoreA > live.scoreB ? live.config.teamA.id : live.config.teamB.id) : '',
    maps: live.maps,
    userMatch: live.config.teamA.id === 'user' || live.config.teamB.id === 'user'
  });
};

/** Rounds ready for the bracket: finished series carry their result, the live one its running score. */
export function circuitRounds(state: CampaignMajorState): MajorRound[] {
  return state.engine.rounds.map((round) => ({
    number: round.number,
    phase: round.phase,
    series: round.series.map(seriesAsResult)
  }));
}

/** Prize by the placement the campaign ended on, ready to settle into the dynasty. */
export function circuitResultFrom(state: CampaignMajorState, event: CircuitEvent): CircuitResult {
  const placement = circuitPlacementFrom(state.run.placement);
  return { eventId: event.id, tier: event.tier, placement, prize: CIRCUIT_PRIZES[event.tier][placement] };
}
