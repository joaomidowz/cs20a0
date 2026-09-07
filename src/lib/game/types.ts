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

export type BuyType = 'pistol' | 'eco' | 'force' | 'full';
export type MapSide = 'ct' | 't';
export type TeamSide = 'a' | 'b';
export type Weapon =
  | 'ak47' | 'm4a1' | 'awp' | 'usp' | 'glock' | 'deagle' | 'famas' | 'galil'
  | 'mac10' | 'mp9' | 'fiveseven' | 'p250' | 'tec9' | 'knife';
export type RoundEnding = 'elimination' | 'bomb' | 'defuse' | 'time';
export type RoundTag =
  | 'pistol'
  | 'anti-eco'
  | 'force-win'
  | 'eco-win'
  | 'clutch'
  | 'streak-break'
  | 'half-end'
  | 'comeback-alert'
  | 'match-point'
  | '3k'
  | '4k'
  | 'ace';

/** The single most notable individual feat of a round, produced by the engine while the kills are generated. */
export interface RoundHighlight {
  kind: 'ace' | 'quad' | 'triple' | 'clutch';
  playerId: string;
  playerName: string;
  side: TeamSide;
  /** Kills the player got in the round. */
  kills: number;
  /** For clutches: how many enemies were alive when the player was left alone (1vN). */
  against?: number;
}

export interface TeamEconomy {
  buy: BuyType;
  awp: boolean;
  /** Average money per player before the buy, rounded. */
  money: number;
}

export interface RoundKill {
  killerId: string;
  killerName: string;
  killerSide: TeamSide;
  victimId: string;
  victimName: string;
  weapon: Weapon;
  headshot: boolean;
  /** Seconds into the round. */
  second: number;
}

/** Everything that happened in one round: produced by the engine while the round is simulated, never derived afterwards. */
export interface RoundDetail {
  number: number;
  winner: TeamSide;
  /** Side team A played this round (team B is the opposite). */
  sideA: MapSide;
  overtime: boolean;
  economy: { a: TeamEconomy; b: TeamEconomy };
  kills: RoundKill[];
  ending: RoundEnding;
  /** Consecutive round wins each team carried into this round (stripped from what online clients receive). */
  momentum?: { a: number; b: number };
  /** Team that called a tactical timeout right before this round. */
  timeout?: TeamSide;
  tags: RoundTag[];
  /** Ace, multi-kill or clutch worth flashing on screen, when the round had one. */
  highlight?: RoundHighlight;
}

export interface Roster {
  players: Player[];
  /** Roles assigned by the user (authoritative over data-derived roles). */
  roles?: Map<string, LineupSlotRole>;
}

export type SeriesDecision =
  | { kind: 'veto'; teamId: string; action: 'ban' | 'pick'; mapId: MapId; auto: boolean }
  | { kind: 'side'; teamId: string; mapIndex: number; side: MapSide; auto: boolean }
  | { kind: 'eco-call'; teamId: string; mapIndex: number; roundNumber: number; call: 'force' | 'eco'; auto: boolean }
  | { kind: 'timeout'; teamId: string; mapIndex: number; roundNumber: number; auto: boolean };

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
  /** Average consistency of the lineup (0-100); steadier teams swing less between maps and match days. */
  consistency?: number;
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
  /** One entry per round (economy, sides, kills, tags). Present when the map was played by the round engine. */
  details?: RoundDetail[];
  aStartsCt?: boolean;
  /** Score of each regulation half (and each overtime block). */
  halves?: Array<{ a: number; b: number }>;
  /** Team that won after trailing by four or more rounds (or losing the first half by four or more). */
  comeback?: TeamSide;
  /** Organization that picked this map in the veto; null for the decider. */
  pickedBy?: string | null;
  /** Organization that chose its starting side. */
  sidePickerId?: string;
  /** Decisions taken on this map (side, eco call, timeouts). */
  decisions?: SeriesDecision[];
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
  /** Decisions (veto, side, eco call, timeout) taken during the series, in order. */
  decisions?: SeriesDecision[];
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
  /** Final placement once the bracket decided it; null while the team is still in the running or out in Stage 3. */
  placement?: 'champion' | 'runnerUp' | '3to4' | '5to8' | null;
}

export interface MajorRound {
  number: number;
  phase: 'swiss' | 'quarterfinal' | 'semifinal' | 'final';
  series: SeriesResult[];
}

/** Tournament-wide line of one player, derived from the kill feed of every map they played (HLTV Rating 1.0). */
export interface MajorPlayerAward {
  playerId: string;
  name: string;
  teamId: string;
  teamName: string;
  rating: number;
  kills: number;
  deaths: number;
  kdRatio: number;
  headshots: number;
  rounds: number;
  mapsPlayed: number;
  /** Rounds won as the last player alive against two or more enemies. */
  clutches: number;
  openingKills: number;
  multiKills: { triple: number; quad: number; ace: number };
  /** Final placement key of the player's team (placementChampion, placementRunnerUp, ...). */
  placement: string;
}

export interface MajorTeamAward {
  teamId: string;
  name: string;
  /** Average rating of the lineup across the tournament. */
  rating: number;
  mapsWon: number;
  mapsLost: number;
  roundsWon: number;
  roundsLost: number;
  placement: string;
}

/** Individual and team awards of a whole Major, computed from every series that carried a kill feed. */
export interface MajorAwards {
  mvp: MajorPlayerAward | null;
  /** Best players of the tournament by rating (MVP first), at most eight. */
  topPlayers: MajorPlayerAward[];
  /** Lineup with the highest average rating. */
  topTeam: MajorTeamAward | null;
  /** Every team by rating, best first. */
  teams: MajorTeamAward[];
  clutchKing: MajorPlayerAward | null;
  /** Player with the most aces (and quads as tiebreak), when anyone got one. */
  highlightReel: MajorPlayerAward | null;
}

/** The whole field's results, so the Major overview can show every other team, standings and the bracket. */
export interface MajorTournament {
  rounds: MajorRound[];
  standings: MajorStanding[];
  championId: string | null;
  /** MVP, best team and top players of the whole event (present once the champion is known). */
  awards?: MajorAwards | null;
}

export interface MajorRun {
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

/** One thing the user did in an offline series, in order: rounds stepped, a timeout, or a decision (always the user's team). */
export type OfflineSeriesEvent =
  | { kind: 'step'; count: number }
  | { kind: 'timeout' }
  /** A pending decision settled with the bot policy on the user's behalf. */
  | { kind: 'auto' }
  | { kind: 'veto'; action: 'ban' | 'pick'; mapId: MapId }
  | { kind: 'side'; side: MapSide }
  | { kind: 'eco-call'; call: 'force' | 'eco' };

export interface OfflineSeriesLog {
  seriesId: string;
  events: OfflineSeriesEvent[];
  /** The user acknowledged the finished series and the tournament moved on. */
  confirmed: boolean;
}

/** Serializable replay log of an offline Major: replaying it over the same draft rebuilds the live engine exactly. */
export interface OfflineDecisionLog {
  version: 1;
  series: OfflineSeriesLog[];
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
  /** What the user did in the offline Major so far; the in-memory engine is rebuilt from it on reload. */
  offlineLog: OfflineDecisionLog | null;
  completedSeries: number;
  stats: PlayerRunStats[];
}

export const SPEEDS: Record<SimSpeed, number> = {
  normal: 2400,
  fast: 1200,
  ultra: 200
};
