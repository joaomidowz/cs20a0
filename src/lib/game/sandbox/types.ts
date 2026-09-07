import type { PublicStanding } from '../online/contracts';
import type { TournamentEngineState } from '../online/tournament-engine';
import type { CombatTeam, MajorTournament, MapId, MapResult, OrgStyle, Player, RoundDetail, SelectedPlayer, SeriesResult } from '../types';

export interface SandboxLineupSelection {
  organizationId: string;
  style: OrgStyle;
  players: SelectedPlayer[];
  mapPreferences: MapId[];
}

export interface SandboxLineupValidation {
  valid: boolean;
  errors: Record<string, string>;
  players: Player[];
}

export interface SandboxMapResult extends MapResult {
  /** Economy + kill feed produced by the round engine while the map was simulated. */
  details: RoundDetail[];
}

export interface SandboxMajorMatch extends SeriesResult {
  maps: SandboxMapResult[];
  roundNumber: number;
  userMatch: boolean;
  resolved: boolean;
}

export interface SandboxMajorState {
  seed: string;
  selection: SandboxLineupSelection;
  userTeam: CombatTeam;
  matches: SandboxMajorMatch[];
  standings: PublicStanding[];
  tournament: MajorTournament;
  championId: string | null;
  currentMatchIndex: number;
  finished: boolean;
  /** Interactive Sandbox: the user vetoes, picks sides, calls timeouts and eco calls in their own series. */
  interactive: boolean;
  /** Incremental engine behind an interactive Sandbox (null in the automatic, fully precomputed mode). */
  engine: TournamentEngineState | null;
  /** Ids of the user's series already confirmed with "advance". */
  confirmedSeriesIds: string[];
}
