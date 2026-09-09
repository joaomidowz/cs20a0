import type { SimulationMode, SimulationSpeed } from './preferences';

export type AutomationMode = 'manual' | 'automatic';
export type VisualMode = 'complete' | 'clean';

export interface AutomationPreferences {
  draft: AutomationMode;
  veto: AutomationMode;
  match: AutomationMode;
}

export type BuyDecision = 'eco' | 'force' | 'full';

export interface RoundDecision {
  buy: BuyDecision;
  tacticalPause: boolean;
}

export type RoundSide = 'a' | 'b';
export type TeamSide = 'ct' | 't';
export type RoundWeapon =
  | 'ak47' | 'm4a1' | 'awp' | 'usp' | 'glock' | 'deagle' | 'famas' | 'galil'
  | 'mac10' | 'mp9' | 'fiveseven' | 'p250' | 'tec9' | 'knife';

export interface RoundKillEvent {
  killerId: string;
  killerName: string;
  killerSide: RoundSide;
  victimId: string;
  victimName: string;
  weapon: RoundWeapon;
  headshot: boolean;
  second: number;
}

export interface RoundHighlight {
  type: 'clutch' | 'ace' | '4k' | '3k';
  playerId: string;
  playerName: string;
  kills: number;
  versus?: number;
}

export interface RoundEconomyEvent {
  buy: BuyDecision | 'pistol';
  moneyBefore: number;
  moneyAfter: number;
  spent: number;
  equipmentStrength: number;
  awp: boolean;
  tacticalPause: boolean;
}

export interface RoundEvent {
  number: number;
  winner: RoundSide;
  sideA: TeamSide;
  overtime: boolean;
  score: RoundScore;
  economy: { a: RoundEconomyEvent; b: RoundEconomyEvent };
  kills: RoundKillEvent[];
  ending: 'elimination' | 'bomb' | 'defuse' | 'time';
  highlight: RoundHighlight | null;
}

export interface PendingVetoDecision {
  type: 'veto';
  participantIds: string[];
  seriesId: string;
  actorId: string;
  action: 'ban' | 'pick';
  legalMapIds: MapId[];
  recommendation: MapId;
  deadlineAt: number;
}

export interface PendingRoundDecision {
  type: 'round';
  participantIds: string[];
  seriesId: string;
  map: number;
  round: number;
  legalBuys: BuyDecision[];
  canTacticalPause: boolean;
  recommendation: RoundDecision;
  deadlineAt: number;
}

export type PendingDecision = PendingVetoDecision | PendingRoundDecision;

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
export type MapId =
  | 'ancient'
  | 'anubis'
  | 'cache'
  | 'cobblestone'
  | 'dust2'
  | 'inferno'
  | 'mirage'
  | 'nuke'
  | 'overpass'
  | 'train'
  | 'vertigo';
export type MapAffinity = 'EVEN' | '+' | '++' | '+++';

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
  /** Second position (e.g. an AWPer who also calls). Only available in online modes with free roles. */
  secondarySlotRole?: LineupSlotRole;
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
  /** Public player profiles used by the shared round engine for structured events. */
  players?: Player[];
  igl?: number;
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
  /** Present on tournaments generated by the incremental v2 engine. */
  events?: RoundEvent[];
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

export interface MajorStanding {
  organizationId: string;
  name: string;
  seed: number;
  wins: number;
  losses: number;
  buchholz: number;
  status: 'active' | 'qualified' | 'eliminated' | 'champion';
}

export interface MajorRound {
  number: number;
  phase: 'swiss' | 'quarterfinal' | 'semifinal' | 'final';
  series: SeriesResult[];
}

/** The whole field's results, so the Major overview can show every other team, standings and the bracket. */
export interface MajorTournament {
  rounds: MajorRound[];
  standings: MajorStanding[];
  championId: string | null;
}

export interface MajorRun {
  strategicSeries?: import('./strategic-series').StrategicSeriesBook;
  stage3: Stage3Result;
  playoffs?: PlayoffsResult;
  matches: SeriesResult[];
  champion: boolean;
  placement: string;
  tournament?: MajorTournament;
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
  automationPreferences: AutomationPreferences;
  visualMode: VisualMode;
  /** Old in-progress campaigns omit this and continue through the legacy presentation path. */
  simulationStateVersion: 1 | 2 | 3;
  majorRun: MajorRun | null;
  completedSeries: number;
  stats: PlayerRunStats[];
}

export const SPEEDS: Record<SimSpeed, number> = {
  normal: 2400,
  fast: 1200,
  ultra: 200
};
