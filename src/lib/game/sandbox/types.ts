import type { PublicStanding } from '../online/contracts';
import type { CombatTeam, MajorTournament, MapId, MapResult, OrgStyle, Player, SelectedPlayer, SeriesResult } from '../types';
import type { SandboxRoundDetail } from './rounds';

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
  /** Sandbox-only economy + kill feed derived from the simulated rounds. */
  details: SandboxRoundDetail[];
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
}
