import type { PublicStanding } from '../online/contracts';
import type { CombatTeam, MapId, OrgStyle, Player, SelectedPlayer, SeriesResult } from '../types';

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

export interface SandboxMajorMatch extends SeriesResult {
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
  championId: string | null;
  currentMatchIndex: number;
  finished: boolean;
}
