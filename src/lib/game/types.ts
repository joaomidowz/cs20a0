import type { SimulationMode, SimulationSpeed } from './preferences';

export type GamePhase =
  | 'home'
  | 'mode-select'
  | 'draft'
  | 'pro-style'
  | 'pro-roles'
  | 'pro-reveal'
  | 'map-selection'
  | 'stage3'
  | 'playoffs'
  | 'result'
  | 'stats';

export type GameMode = 'premier' | 'faceit' | 'pro';
export type OrgStyle = 'aggressive' | 'balanced' | 'tactical';
export type SimSpeed = SimulationSpeed;
export type SimMode = SimulationMode;
export type SeriesType = 'bo3' | 'bo5';
export type Language = 'pt-BR' | 'es' | 'en';
export type Theme = 'dark' | 'light';
export type LineupSlotRole = 'awper' | 'igl' | 'entry' | 'lurker' | 'rifler' | 'support';
export type MapId = 'ancient' | 'anubis' | 'cache' | 'dust2' | 'inferno' | 'mirage' | 'nuke';
export type MapAffinity = 'EVEN' | '+' | '++';

export interface HistoricalMapRecord {
  mapId: MapId;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number | null;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface MapPreference {
  mapId: MapId;
  source: 'observed' | 'fallback';
}

export interface TeamMapProfile {
  poolVersion: string;
  records: HistoricalMapRecord[];
  preferences: [MapPreference, MapPreference, MapPreference];
}

export interface MapVetoStep {
  order: number;
  action: 'ban' | 'pick' | 'decider';
  teamId: string | null;
  mapId: MapId;
}

export interface Player {
  id: string;
  baseId?: string | null;
  nickname?: string | null;
  title?: string | null;
  teamId?: string | null;
  year?: number | null;
  game?: string | null;
  role?: string | null;
  eligibleSlotRoles?: string[] | null;
  overall?: number | null;
  rarity?: string | null;
  playstyle?: OrgStyle | null;
  traits?: string[] | null;
  badges?: string[] | null;
  awardBadges?: string[] | null;
  needsReview?: boolean | null;
  roleConfidence?: string | null;
  firepower?: number | null;
  clutch?: number | null;
  entry?: number | null;
  awp?: number | null;
  support?: number | null;
  igl?: number | null;
  experience?: number | null;
  consistency?: number | null;
  mental?: number | null;
  source?: unknown;
}

export interface SelectedPlayer {
  playerId: string;
  selectedSlotRole: LineupSlotRole;
}

export interface HistoricalTeam {
  id: string;
  name?: string | null;
  year?: number | null;
  game?: string | null;
  rank?: number | null;
  sourceRank?: number | null;
  players?: string[] | null;
  power?: number | null;
  teamPowerPreview?: number | null;
  rarity?: string | null;
  teamStats?: Record<string, number> | null;
  style?: OrgStyle | string | null;
  badges?: string[] | null;
  needsReview?: boolean | null;
  majorSummary?: {
    bestPlacement?: string | null;
    titles?: number | null;
    finals?: number | null;
    semifinals?: number | null;
    top8?: number | null;
    stage3Runs?: number | null;
  } | null;
  sourceUrl?: string | null;
  source?: unknown;
  mapProfile?: TeamMapProfile | null;
}

export interface CombatTeam {
  id: string;
  name: string;
  power: number;
  mental: number;
  clutch: number;
  experience: number;
  style?: OrgStyle;
  studyPercentage?: number;
  aggressionPercentage?: number;
  isUser?: boolean;
  organizationId?: string;
  lineup?: SelectedPlayer[];
}

export interface RoundScore {
  a: number;
  b: number;
  overtime: boolean;
}

export interface MapResult {
  map: number;
  mapId?: MapId;
  scoreA: number;
  scoreB: number;
  winnerId: string;
  rounds: RoundScore[];
  overtime: boolean;
}

export interface SeriesResult {
  id: string;
  phase: 'stage3' | 'quarterfinal' | 'semifinal' | 'final';
  bestOf: 1 | 3 | 5;
  teamA: CombatTeam;
  teamB: CombatTeam;
  scoreA: number;
  scoreB: number;
  winnerId: string;
  maps: MapResult[];
  veto?: MapVetoStep[];
  userMatch: boolean;
}

export interface Stage3Result {
  wins: number;
  losses: number;
  qualified: boolean;
  matches: SeriesResult[];
}

export interface PlayoffsResult {
  championId: string;
  placement: string;
  userMatches: SeriesResult[];
  allMatches: SeriesResult[];
}

export interface MajorRun {
  stage3: Stage3Result;
  playoffs?: PlayoffsResult;
  matches: SeriesResult[];
  champion: boolean;
  placement: string;
}

export interface PlayerRunStats {
  playerId: string;
  assignedRole: LineupSlotRole;
  runRating: number;
  kills: number;
  deaths: number;
  kdRatio: number;
  adr: number;
  impact: number;
  clutches: number;
  openingKills: number;
  mvpCount: number;
  consistency: number;
  mapsPlayed: number;
  mapsWon: number;
  mapsLost: number;
  roundsWon: number;
  roundsLost: number;
}

export interface GameState {
  phase: GamePhase;
  language: Language;
  theme: Theme;
  seed: string;
  mode: GameMode | null;
  style: OrgStyle;
  styleLocked: boolean;
  selectedPlayers: SelectedPlayer[];
  proPickedPlayerIds: string[];
  proRoleAssignments: Record<string, LineupSlotRole | null>;
  proRevealed: boolean;
  usedTeamIds: string[];
  rolledTeamId: string | null;
  rerollsUsed: number;
  selectedMaps: MapId[];
  simMode: SimMode;
  simSpeed: SimSpeed;
  majorRun: MajorRun | null;
  completedSeries: number;
  stats: PlayerRunStats[];
}

export const SPEEDS: Record<SimSpeed, number> = {
  normal: 2400,
  fast: 1200,
  ultra: 200
};
