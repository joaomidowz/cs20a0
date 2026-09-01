import type { LineupSlotRole, OrgStyle } from '../../types';
import type { ReplaySide } from '../types';

export type GoldenWeapon =
  | 'knife'
  | 'glock'
  | 'usp'
  | 'p2000'
  | 'duals'
  | 'p250'
  | 'deagle'
  | 'mp9'
  | 'mac10'
  | 'ump'
  | 'nova'
  | 'galil'
  | 'famas'
  | 'ak47'
  | 'm4a1'
  | 'awp';

export type GoldenGrenade = 'he' | 'flash' | 'smoke' | 'molotov';

export type GoldenStrategy =
  | 'A_exec'
  | 'B_exec'
  | 'A_rush'
  | 'B_rush'
  | 'mid_A'
  | 'mid_B'
  | 'A_slow'
  | 'B_slow'
  | 'A_split'
  | 'B_split';

export interface GoldenPoint {
  x: number;
  y: number;
}

export interface GoldenInventory {
  primary: GoldenWeapon;
  secondary: GoldenWeapon;
  armor: number;
  helmet: boolean;
  kit: boolean;
  grenades: Record<GoldenGrenade, number>;
}

export interface GoldenPlayerState {
  id: string;
  organizationId: string;
  side: ReplaySide;
  selectedRole: LineupSlotRole;
  style: OrgStyle;
  money: number;
  inventory: GoldenInventory;
  x: number;
  y: number;
  angle: number;
  hp: number;
  alive: boolean;
}

export interface GoldenPlayerSnapshot {
  x: number;
  y: number;
  angle: number;
  hp: number;
  alive: boolean;
  planting: boolean;
  defusing: boolean;
  blind: boolean;
  hasBomb: boolean;
  firing: boolean;
  weapon: GoldenWeapon;
  grenades: Record<GoldenGrenade, number>;
  actionProgress: number;
}

export interface GoldenGroundItem {
  id: string;
  kind: 'weapon' | 'grenade';
  weapon?: GoldenWeapon;
  grenade?: GoldenGrenade;
  x: number;
  y: number;
  sourcePlayerId: string;
  reservedForRole?: 'awper';
}

export interface GoldenRoundReplayV1 {
  number: number;
  tickRate: 32;
  frameStrideTicks: 2;
  playerIds: string[];
  sides: ReplaySide[];
  frames: number;
  snapshots: Float32Array;
  grenadeSnapshots?: Uint8Array;
  shots: Float32Array;
  events: GoldenReplayEvent[];
  winnerOrganizationId: string;
  durationMs: number;
  roleMetrics: {
    entryFirstChokeCrossing: boolean;
    lurkerSeparateUntilMs: number;
    awperAwpShare: number;
  };
}

export interface GoldenReplayEvent {
  tick: number;
  type:
    | 'go'
    | 'shot'
    | 'kill'
    | 'grenade'
    | 'smoke'
    | 'fire'
    | 'flash'
    | 'he'
    | 'weapon-drop'
    | 'grenade-drop'
    | 'pickup'
    | 'delivery'
    | 'bomb-drop'
    | 'bomb-pickup'
    | 'plant'
    | 'defuse'
    | 'explode'
    | 'round-end';
  playerId?: string;
  targetPlayerId?: string;
  itemId?: string;
  weapon?: GoldenWeapon;
  grenade?: GoldenGrenade;
  x?: number;
  y?: number;
  site?: 'A' | 'B';
  winnerOrganizationId?: string;
}

export interface GoldenMatchReplayV1 {
  version: 1;
  planId: string;
  mapId: 'mirage';
  rounds: GoldenRoundReplayV1[];
  validation: {
    blockedPlayerSnapshots: number;
    mismatchedRoundWinners: number[];
  };
}

export interface GoldenStrategyProfile {
  weights: {
    exec: number;
    rush: number;
    mid: number;
    slow: number;
    split: number;
  };
  executeShiftSeconds: number;
  reactiveFlashChance: number;
  ctDomainMultiplier: number;
}

export interface GoldenTacticalPlan {
  kind: GoldenStrategy;
  site: 'A' | 'B';
  executeAtSeconds: number;
  smokeTargets: GoldenPoint[];
  flashTargets: GoldenPoint[];
  molotovTargets: GoldenPoint[];
  coordinatedUtilityCount: number;
  profile: GoldenStrategyProfile;
}

export interface GoldenSquadAssignment {
  playerId: string;
  responsibility: 'ENTRY' | 'BANGER' | 'TRADER' | 'SECOND' | 'LURK';
  stackOrder: number;
  separateRoute: boolean;
}
