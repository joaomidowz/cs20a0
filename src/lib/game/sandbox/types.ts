import type { PublicStanding } from '../online/contracts';
import type { CombatTeam, OrgStyle, Player, SelectedPlayer, SeriesResult } from '../types';

export interface SandboxLineupSelection {
  organizationId: string;
  style: OrgStyle;
  players: SelectedPlayer[];
}

export interface SandboxLineupValidation {
  valid: boolean;
  errors: Record<string, string>;
  players: Player[];
}

export type SandboxMajorPhase = SeriesResult['phase'] | 'finished';

export interface SandboxMajorMatch extends SeriesResult {
  roundNumber: number;
  replayable: boolean;
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
  phase: SandboxMajorPhase;
  finished: boolean;
}
