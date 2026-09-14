import { runOnlineTournament } from '../online/tournament';
import { createMajorField, stripSeriesDetails } from '../simulation';
import type { CircuitEvent, CircuitResult, CombatTeam, HistoricalTeam, MajorRound, MapId, Player, SelectedPlayer } from '../types';
import { CIRCUIT_PRIZES, circuitPlacementFrom } from './circuit';

export interface CircuitPlayInput {
  event: CircuitEvent;
  /** `buildDynastyUserTeam` with the base plan, no study and no temporary training: coach, style and position already applied. */
  userTeam: CombatTeam;
  players: Player[];
  lineup: SelectedPlayer[];
  teams: HistoricalTeam[];
  allPlayers: Player[];
  seed: string;
  selectedMaps: MapId[];
}

/** Eight-team single elimination, every series BO3, all decisions by the bot policies. Kill feeds are dropped from the stored bracket. */
export function playCircuitEvent(input: CircuitPlayInput): { result: CircuitResult; rounds: MajorRound[] } {
  const byId = new Map(input.teams.map((team) => [team.id, team]));
  const eventTeams = input.event.teamIds.map((id) => byId.get(id)).filter((team): team is HistoricalTeam => Boolean(team));
  const { user, field, mapContext, tournamentSeed } = createMajorField(input.players, 'balanced', eventTeams, input.allPlayers, `${input.seed}:${input.event.id}`, input.lineup, {
    selectedMaps: input.selectedMaps,
    mode: 'dynasty',
    userTeam: input.userTeam,
    seedsWithoutStyle: true
  });
  const tournament = runOnlineTournament({
    organizations: [{ id: user.id, name: user.name, seed: 1, team: user, human: true }],
    botPool: field,
    entryStage: 'playoffs',
    seed: `${tournamentSeed}:circuit`,
    mapContext,
    playoffBestOf: { quarterfinal: 3, semifinal: 3, final: 3 }
  });
  const placement = circuitPlacementFrom(tournament.campaigns.find((campaign) => campaign.organizationId === user.id)?.placement ?? 'placement5to8');
  const rounds: MajorRound[] = tournament.rounds.map((round) => ({ number: round.number, phase: round.phase, series: round.series.map(stripSeriesDetails) }));
  return { result: { eventId: input.event.id, tier: input.event.tier, placement, prize: CIRCUIT_PRIZES[input.event.tier][placement] }, rounds };
}
