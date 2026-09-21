import type { SimulationMode, SimulationSpeed } from './preferences';

export type GamePhase =
  | 'home'
  | 'mode-select'
  | 'draft'
  | 'pro-style'
  | 'pro-roles'
  | 'pro-reveal'
  | 'coach-draft'
  | 'circuit'
  | 'window'
  | 'map-selection'
  | 'stage3'
  | 'playoffs'
  | 'result'
  | 'stats';

export type GameMode = 'premier' | 'faceit' | 'pro' | 'dynasty';
/** Swiss stages of a Major. Every mode but Dinastia plays only `stage3`. */
export type MajorStage = 'stage1' | 'stage2' | 'stage3';
export const MAJOR_STAGES: readonly MajorStage[] = ['stage1', 'stage2', 'stage3'];
/** Placement key of a team knocked out in each Swiss stage. */
export const STAGE_PLACEMENT: Readonly<Record<MajorStage, string>> = {
  stage1: 'placementStage1',
  stage2: 'placementStage2',
  stage3: 'placementStage3'
};
export const isMajorStage = (phase: string): phase is MajorStage => phase === 'stage1' || phase === 'stage2' || phase === 'stage3';
/** Online queues add the two Resenha modes; the engine reads it for mode-dependent rules such as the tactical timeout. */
export type OnlineGameMode = GameMode | 'fun' | 'max_fun';
/** When a tactical timeout was called relative to the 2–4 straight-loss window that gives it its full effect. */
export type TimeoutTiming = 'window' | 'early' | 'late';
/**
 * Estilos de organização/planos de time. Os três clássicos (agressivo, equilibrado, tático) cobrem identidade de
 * dia de jogo; os três de 2026 cobrem SITUAÇÃO: tempo vive de pistol e momentum, reativo de lado CT e rounds
 * quebrados, resiliente de sequência de derrotas, clutch e série longa. Cada um brilha num lugar e paga em outro —
 * nenhum domina tudo (ver `rounds.ts` e `getMatchDayPower`).
 */
export type OrgStyle = 'aggressive' | 'balanced' | 'tactical' | 'tempo' | 'reativo' | 'resiliente';
/** Ordem canônica dos estilos para a UI (draft, coleção, sandbox). */
export const ORG_STYLES: readonly OrgStyle[] = ['aggressive', 'balanced', 'tactical', 'tempo', 'reativo', 'resiliente'];
/**
 * Historical catalog a run was drafted on. `core` is the v1 dataset (Majors 2016–2026) the online mode is frozen on;
 * `x1` is core followed by the expansion. Runs, saves and shared links carry it so results stay reproducible as the
 * catalog grows; anything without a stamp replays on `core`.
 */
export type CatalogVersion = 'core' | 'x1';
/** Whether a historical team-year comes from a Major main event or from an official qualifier. Absent means main event. */
export type EventLevel = 'main' | 'qualifier';
/** Marks attributes produced by the rating model of the expansion instead of set by hand. Absent means hand-set. */
export interface RatingModelRef {
  version: string;
  source: 'RATING_MODELADO';
}
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
  /** An AWP was bought this round (full buys only). */
  awp: boolean;
  /** The AWP holder survived the previous round and kept the rifle without paying for it again. */
  awpKept?: boolean;
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
  /** CS2-style kill feed flags. */
  noscope?: boolean;
  blind?: boolean;
  wallbang?: boolean;
  smoke?: boolean;
  airborne?: boolean;
  /** Teammate credited with the assist (damage) or with the flash that set the kill up. */
  assistId?: string;
  assistName?: string;
  flashAssistId?: string;
  flashAssistName?: string;
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
  /** Whether that timeout landed inside the straight-loss window (full effect) or outside it (reduced). */
  timeoutTiming?: TimeoutTiming;
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
  | { kind: 'timeout'; teamId: string; mapIndex: number; roundNumber: number; auto: boolean; timing?: TimeoutTiming };

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
  /** Expansion card rejected after publication: still resolvable by id, never sampled again. Absent means active. */
  retired?: boolean;
  /** Present when the attributes come from the expansion rating model. Absent means hand-set. */
  ratingModel?: RatingModelRef;
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
  /** Strength tier from the dataset: underdog, dangerous-underdog, playoff-team, contender, finalist, champion, S, S+. */
  tier?: string | null;
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
  /** Main event or official qualifier. Absent means main event; only main-event team-years enter the draft and the bot field. */
  eventLevel?: EventLevel;
  /** Expansion team-year rejected after publication: still resolvable by id, never drafted nor used as an opponent. */
  retired?: boolean;
  /** Present when the team numbers come from the expansion rating model. Absent means hand-set. */
  ratingModel?: RatingModelRef;
}

export type CoachConfidence = 'high' | 'medium' | 'low' | 'placeholder';

/** Head coach of one historical team-year (one per team). `placeholder` fills teams with no known coach and is never offered in the draft. */
export interface Coach {
  id: string;
  baseId: string;
  name: string;
  teamId: string;
  year: number;
  game: string | null;
  tactics: number;
  discipline: number;
  aggression: number;
  development: number;
  overall: number;
  rarity: string;
  confidence: CoachConfidence;
  needsReview: boolean;
  source: { page: string | null; url: string | null; year: number | null; note: string };
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
  /** Dinastia: coach of the user's organization. Absent everywhere else. */
  coachId?: string;
  /** CT preference the coach adds to the side bias (negative favours the T side). */
  coachSidePreference?: number;
  /** Multiplier of this team's tactical timeout edge. */
  timeoutFactor?: number;
  /**
   * Sensitivity of the scale `power` is on, for `getWinProbability`. Absent means the raw engine scale; the online
   * modes stamp `COURT_WIN_DIVISOR` when they hand the match levels instead (`courtPower.ts`).
   */
  powerDivisor?: number;
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
  phase: MajorStage | 'quarterfinal' | 'semifinal' | 'final';
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
  /** Swiss stage this round belongs to; only present in Majors with three stages (Dinastia). */
  stage?: MajorStage;
  series: SeriesResult[];
}

/** Rating of awards and run statistics: HLTV 1.0 (online server, legacy) or the Rating 3.0 approximation (offline, Sandbox). */
export type RatingModel = 'hltv1' | 'v3';

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
  /** Rating 3.0 model only; absent in HLTV 1.0 awards (the online server). */
  assists?: number;
  flashAssists?: number;
  /** Rounds with a kill, assist, survival or traded death, in percent (one decimal). */
  kast?: number;
  /** Damage per round: kills, damage assists and utility. */
  adr?: number;
  /** Utility damage per round (one decimal). */
  utilityDamage?: number;
  /** Round Swing in percentage points per round (two decimals). */
  swing?: number;
  impact?: number;
  openingDeaths?: number;
  tradeKills?: number;
  tradedDeaths?: number;
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
  /** Present when `rating` fields use the Rating 3.0 approximation. */
  ratingModel?: 'v3';
  /** Mean raw Rating 3.0 of the field, the divisor that makes the average 1.00 (v3 only). */
  ratingBaseline?: number;
}

export interface MajorStageStandings {
  stage: MajorStage;
  standings: MajorStanding[];
}

/** The whole field's results, so the Major overview can show every other team, standings and the bracket. */
export interface MajorTournament {
  rounds: MajorRound[];
  standings: MajorStanding[];
  championId: string | null;
  /** Final (or current) table of every Swiss stage; only present in Majors with three stages. */
  stages?: MajorStageStandings[];
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
  /** Record of every Swiss stage the user played; only in Majors with three stages. */
  stages?: Partial<Record<MajorStage, Stage3Result>>;
  /** Stage the user's organization entered; only in Majors with three stages. */
  entryStage?: MajorStage;
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
  /** Rating 3.0 kill-feed stats only (absent in HLTV 1.0 and in the synthetic fallback). */
  assists?: number;
  flashAssists?: number;
  kast?: number;
  swing?: number;
  utilityDamage?: number;
  openingDeaths?: number;
  tradeKills?: number;
  multiKills?: { triple: number; quad: number; ace: number };
}


export type DynastyStatus = 'challenger' | 'legend';
export type CoachTactic = 'standard' | 'pressure' | 'control' | 'antistrat';
export type TrainingFocus = 'aim' | 'utility' | 'clutch' | 'opening' | 'recovery';
export type TrainingAttribute = 'firepower' | 'support' | 'clutch' | 'entry';

export interface SeriesPlan {
  style: OrgStyle;
  tactic: CoachTactic;
  study: boolean;
}

export interface DynastyMajorPlan {
  majorNumber: number;
  rules: 2;
  training: TrainingFocus | null;
  basePlan: SeriesPlan;
  plans: Record<string, SeriesPlan>;
  confirmed: boolean;
}

export interface DynastyMajorSummary {
  majorNumber: number;
  seed: string;
  entryStage: MajorStage;
  placement: string;
  /** Prize by placement, in whole dollars. */
  prize: number;
  /** MVP and individual award bonus, in whole dollars. */
  awardsBonus: number;
  lineup: SelectedPlayer[];
  coachId: string | null;
  movesMade: number;
  stats: PlayerRunStats[];
  /** Ruleset used by this Major. Missing in legacy summaries. */
  rules?: 1 | 2;
  /** Overall at the start of the Major, keyed by player id. */
  overalls?: Record<string, number>;
  /** Evolution applied after this Major, once its transfer window is confirmed. */
  evolution?: EvolutionEntry[];
  /** Temporary focus used during this Major. */
  training?: TrainingFocus | null;
  /** Circuit events played after this Major. */
  circuit?: CircuitResult[];
}

/** Attribute drift a Dinastia player carries over the dataset version (used from delivery C on). */
export interface PlayerOverride {
  drift: Partial<Record<'firepower' | 'clutch' | 'entry' | 'awp' | 'support' | 'consistency' | 'mental' | 'overall' | 'experience', number>>;
  /** Permanent training, separate from drift and limited independently. */
  training?: Partial<Record<TrainingAttribute, number>>;
  driftTotal: number;
  versionsSince: string[];
}

/** What happened to one lineup player at the start of the transfer window. */
export interface EvolutionEntry {
  fromPlayerId: string;
  toPlayerId: string;
  kind: 'version' | 'drift' | 'stable';
  overallBefore: number;
  overallAfter: number;
  training?: { attribute: TrainingAttribute; delta: number };
}

export interface WindowOffer {
  playerId: string;
  /** Whole dollars. */
  price: number;
  /** Set on the offers drawn for the lineup's weakest position. */
  focusRole: LineupSlotRole | null;
}

export interface WindowProposal {
  playerId: string;
  /** Whole dollars another organization pays for this lineup player. */
  price: number;
}

export interface WindowSwapOffer {
  id: string;
  /** Team-year of the player another organization offers. */
  fromTeamId: string;
  theirPlayerId: string;
  /** Lineup player they want in return. */
  forPlayerId: string;
  /** Whole dollars: positive the user receives, negative the user pays. */
  cashDelta: number;
}

export interface WindowMove {
  outPlayerId: string;
  inPlayerId: string;
  salePrice: number;
  buyPrice: number;
  kind: 'offer' | 'target' | 'swap';
}

/** Transfer window between two Dinastia Majors. Everything the screen shows derives from this object, so a reload reproduces it. */
export interface WindowState {
  majorNumber: number;
  seed: string;
  cashAtOpen: number;
  maxMoves: number;
  evolution: EvolutionEntry[];
  /** Lineup after the evolution, before any move. */
  baseLineup: SelectedPlayer[];
  /** Overrides after the evolution, keyed by player id. */
  overrides: Record<string, PlayerOverride>;
  proposals: WindowProposal[];
  offers: WindowOffer[];
  /** Direct player-for-player offers. Missing in windows saved before they existed. */
  swapOffers?: WindowSwapOffer[];
  coachOfferIds: string[];
  moves: WindowMove[];
  /** Positions the user reassigned in the window, keyed by player id. */
  roleAssignments: Record<string, LineupSlotRole>;
  coachChange: { coachId: string; cost: number } | null;
}

export type CircuitTier = 'elite' | 'open';
export type CircuitAccess = 'invite' | 'signup';
export type CircuitPlacement = 'champion' | 'runnerUp' | 'semi' | 'quarter' | 'groups';

/** A smaller event between two Dinastia Majors: eight teams, single elimination. */
export interface CircuitEvent {
  id: string;
  tier: CircuitTier;
  access: CircuitAccess;
  /** 1-based number shown in the event name ("Elite Series #1"). */
  index: number;
  /** Opponents, as historical team ids. The user's organization is the eighth team. */
  teamIds: string[];
  /** Event that must end in champion or runner-up before this one opens (second Open Cup for Challengers). */
  unlockedBy?: string;
  /** Real championship this event stands in for (circuit-events dataset). Absent in older saves. */
  sourceId?: string;
  name?: string;
  year?: number;
  /** Real prize pool in whole dollars — informational only; the in-game prize is CIRCUIT_PRIZES. */
  realPrizePool?: number;
  location?: string;
  organizer?: string;
}

/** Stats of the user's series in one circuit event (details stripped). */
export interface CircuitEventStats {
  series: SeriesResult[];
  players: PlayerRunStats[];
}

export interface CircuitResult {
  eventId: string;
  tier: CircuitTier;
  placement: CircuitPlacement;
  /** Whole dollars. */
  prize: number;
  /** Real championship name and year, when the event had one. */
  name?: string;
  year?: number;
}

export interface CircuitState {
  majorNumber: number;
  events: CircuitEvent[];
  results: CircuitResult[];
  skipped: string[];
  /** Bracket of every played event, without kill feeds. */
  brackets: Record<string, MajorRound[]>;
  finished: boolean;
  /** Year drawn for the real championships of this circuit. Absent in older saves. */
  year?: number;
  /** User's series and lineup stats per played event. Absent in older saves. */
  stats?: Record<string, CircuitEventStats>;
}

export interface DynastyState {
  majorNumber: number;
  /** Ruleset locked for the Major in progress. Saves without it are legacy v1. */
  majorRules: 1 | 2;
  /** Tactical identity and per-series choices for a v2 Major. */
  major?: DynastyMajorPlan | null;
  /** Whole dollars. */
  cash: number;
  coachId: string | null;
  /** Coach offers redrawn in the current coach draft (one allowed). */
  coachRerollsUsed: number;
  status: DynastyStatus;
  entryStage: MajorStage;
  titles: number;
  history: DynastyMajorSummary[];
  playerOverrides: Record<string, PlayerOverride>;
  /** Transfer window in progress (delivery C); null outside the window. */
  window: WindowState | null;
  /** Smaller events between the current Major's result and its transfer window. */
  circuit?: CircuitState | null;
  /** Last majorNumber whose prize was already credited, so a reload never pays twice. */
  prizeCreditedFor: number;
  /** Organization name picked by the player; absent means the translated default. */
  teamName?: string;
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
  /** The user's series already played, so a saved campaign restores exactly what it showed. */
  playedSeries?: Record<string, SeriesResult>;
  completedSeries: number;
  stats: PlayerRunStats[];
  /** Present only while the mode is 'dynasty'. */
  dynasty?: DynastyState | null;
  /** Dynasty save schema; absent means legacy v0. Migrations run centrally (dynasty/migrations) before validation. */
  dynastySchemaVersion?: number;
  /** Catalog the run drafts from and replays on. Absent (saves from before the expansion) means `core`. */
  catalogVersion?: CatalogVersion;
}

export const SPEEDS: Record<SimSpeed, number> = {
  normal: 2400,
  fast: 1200,
  ultra: 200
};
