import type { LineupSlotRole, MapId, OrgStyle } from '../types';

export type ReplayPlaybackSpeed = 'simulate' | 'normal' | 'fast' | 'ultra';
export type ReplaySide = 'T' | 'CT';
export type ReplayGrenadeType = 'flash' | 'he' | 'smoke' | 'molotov';
export type ReplayWeapon = 'ak47' | 'm4a1' | 'awp' | 'glock' | 'usp';
export type ReplayTacticalRole = 'entry' | 'trade' | 'support' | 'awp' | 'igl' | 'lurk' | 'rifler';
export type ReplayTSplit = '5-0' | '4-1' | '3-2' | '2-1-2';

export interface ReplayOrganizationV1 {
  id: string;
  name: string;
  style: OrgStyle;
}

export interface ReplayPlayerV1 {
  id: string;
  organizationId: string;
  role: LineupSlotRole;
  tacticalRole: ReplayTacticalRole;
}

export interface ReplayLoadoutV1 {
  playerId: string;
  primary: ReplayWeapon;
  grenades: ReplayGrenadeType[];
}

export interface ReplayRouteV1 {
  playerId: string;
  nodeIds: string[];
  tacticalRole: ReplayTacticalRole;
  startAtMs: number;
  endAtMs: number;
  stopOffset: { x: number; y: number };
}

interface ReplayEventBaseV1 {
  id: string;
  roundNumber: number;
  atMs: number;
  sequence: number;
  nodeId: string;
}

export interface ReplayShotEventV1 extends ReplayEventBaseV1 {
  type: 'shot';
  playerId: string;
  targetPlayerId: string;
  weapon: ReplayWeapon;
}

export interface ReplayDamageEventV1 extends ReplayEventBaseV1 {
  type: 'damage';
  sourcePlayerId: string;
  targetPlayerId: string;
  damage: number;
  weapon: ReplayWeapon | ReplayGrenadeType;
}

export interface ReplayKillEventV1 extends ReplayEventBaseV1 {
  type: 'kill';
  killerPlayerId: string;
  victimPlayerId: string;
  weapon: ReplayWeapon;
  assistantPlayerId?: string;
  flashAssistantPlayerId?: string;
}

export interface ReplayGrenadeEventV1 extends ReplayEventBaseV1 {
  type: 'grenade';
  playerId: string;
  grenadeType: ReplayGrenadeType;
  targetNodeId: string;
}

export interface ReplayPlantEventV1 extends ReplayEventBaseV1 {
  type: 'plant';
  playerId: string;
  siteNodeId: 'a_site' | 'b_site';
}

export interface ReplayDefuseEventV1 extends ReplayEventBaseV1 {
  type: 'defuse';
  playerId: string;
  siteNodeId: 'a_site' | 'b_site';
}

export interface ReplayExplosionEventV1 extends ReplayEventBaseV1 {
  type: 'explosion';
  siteNodeId: 'a_site' | 'b_site';
}

export interface ReplayRoundEndEventV1 extends ReplayEventBaseV1 {
  type: 'round-end';
  winnerOrganizationId: string;
  reason: 'elimination' | 'defuse' | 'explosion';
}

export type ReplayEventV1 =
  | ReplayShotEventV1
  | ReplayDamageEventV1
  | ReplayKillEventV1
  | ReplayGrenadeEventV1
  | ReplayPlantEventV1
  | ReplayDefuseEventV1
  | ReplayExplosionEventV1
  | ReplayRoundEndEventV1;

export interface ReplayRoundPlanV1 {
  number: number;
  durationMs: number;
  winnerOrganizationId: string;
  tOrganizationId: string;
  ctOrganizationId: string;
  tSplit: ReplayTSplit;
  ctSetup: { a: number; b: number; mid: number };
  executeAtMs: number;
  routes: ReplayRouteV1[];
  loadouts: ReplayLoadoutV1[];
  events: ReplayEventV1[];
}

export interface ReplayPlanV1 {
  version: 1;
  id: string;
  seriesId: string;
  mapIndex: number;
  mapId: MapId;
  tickRate: 4;
  organizations: [ReplayOrganizationV1, ReplayOrganizationV1];
  players: ReplayPlayerV1[];
  result: {
    scoreA: number;
    scoreB: number;
    winnerOrganizationId: string;
  };
  rounds: ReplayRoundPlanV1[];
}

export interface ReplayPlayerFrameV1 {
  playerId: string;
  organizationId: string;
  side: ReplaySide;
  x: number;
  y: number;
  level: number;
  hp: number;
  alive: boolean;
}

export interface ReplayGrenadeFrameV1 {
  eventId: string;
  grenadeType: ReplayGrenadeType;
  x: number;
  y: number;
  level: number;
  progress: number;
}

export interface ReplayBombFrameV1 {
  state: 'carried' | 'planted' | 'defused' | 'exploded';
  carrierPlayerId?: string;
  siteNodeId?: 'a_site' | 'b_site';
}

export interface ReplayFrameV1 {
  index: number;
  roundNumber: number;
  atMs: number;
  players: ReplayPlayerFrameV1[];
  grenades: ReplayGrenadeFrameV1[];
  bomb: ReplayBombFrameV1;
}

export interface ReplayV1 {
  version: 1;
  planId: string;
  mapId: MapId;
  tickRate: 4;
  durationMs: number;
  frames: ReplayFrameV1[];
  events: ReplayEventV1[];
}
