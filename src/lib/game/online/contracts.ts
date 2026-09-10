import { z } from 'zod';
import type { GameMode, LineupSlotRole, MajorAwards, MapId, MapSide, MapVetoStep, OnlineGameMode, OrgStyle, PlayerRunStats, RoundDetail, SelectedPlayer, SeriesResult } from '../types';

export type { OnlineGameMode } from '../types';

export const PROTOCOL_VERSION = 9 as const;
/** After a run ends, everybody has this long to accept the rematch that keeps the season going. */
export const REMATCH_WINDOW_MS = 10_000;
/** Season points by placement; Stage 3 eliminations score one point per series won (0-2). */
export const SEASON_POINTS: Record<string, number> = {
  placementChampion: 10,
  placementRunnerUp: 7,
  placement3to4: 5,
  placement5to8: 3
};
export const seasonPointsFor = (placement: string, stage3Wins: number) => SEASON_POINTS[placement] ?? Math.max(0, Math.min(2, stage3Wins));
export const ROOM_CODE_LENGTH = 8;

export const toPresentationGameMode = (mode: OnlineGameMode): GameMode =>
  mode === 'fun' || mode === 'max_fun' ? 'premier' : mode;

export const roomConfigSchema = z.object({
  mode: z.enum(['premier', 'faceit', 'pro', 'fun', 'max_fun']),
  entryStage: z.enum(['stage3', 'playoffs']),
  capacity: z.number().int().min(2).max(16),
  draftDeadlineSeconds: z.union([z.literal(60), z.literal(120), z.literal(180), z.literal(300), z.null()]),
  simulationMode: z.enum(['automatic', 'manual']),
  simulationSpeed: z.enum(['normal', 'fast', 'ultra']),
  /** Runs of a season: points add up across them and the season champion is declared after the last one. */
  seasonRuns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1)
}).strict().superRefine((config, context) => {
  if (config.entryStage === 'playoffs' && config.capacity > 8) {
    context.addIssue({ code: 'custom', path: ['capacity'], message: 'Playoffs rooms support at most 8 participants' });
  }
});

export type RoomConfig = z.infer<typeof roomConfigSchema>;
/** What a client may send: `seasonRuns` is optional and defaults to a single run. */
export type RoomConfigInput = z.input<typeof roomConfigSchema>;

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  mode: 'premier',
  entryStage: 'stage3',
  capacity: 16,
  draftDeadlineSeconds: 120,
  simulationMode: 'automatic',
  simulationSpeed: 'normal',
  seasonRuns: 1
};

const requestIdSchema = z.string().min(8).max(80);
const participantNameSchema = z.string().trim().min(2).max(24);
const baseCommandSchema = z.object({ requestId: requestIdSchema });
const mapIdSchema = z.enum(['ancient', 'anubis', 'cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo']);
const seriesIdSchema = z.string().min(1).max(160);

export const clientCommandSchema = z.discriminatedUnion('type', [
  baseCommandSchema.extend({
    type: z.literal('join'),
    protocolVersion: z.number().int(),
    dataHash: z.string().min(8).max(128),
    playerName: participantNameSchema,
    organizationName: participantNameSchema
  }).strict(),
  baseCommandSchema.extend({
    type: z.literal('resume'),
    protocolVersion: z.number().int(),
    dataHash: z.string().min(8).max(128),
    resumeToken: z.string().min(32).max(256)
  }).strict(),
  baseCommandSchema.extend({ type: z.literal('configure'), config: roomConfigSchema }).strict(),
  baseCommandSchema.extend({ type: z.literal('start') }).strict(),
  baseCommandSchema.extend({ type: z.literal('draw-team') }).strict(),
  baseCommandSchema.extend({ type: z.literal('reroll-team') }).strict(),
  baseCommandSchema.extend({ type: z.literal('set-style'), style: z.enum(['aggressive', 'balanced', 'tactical']) }).strict(),
  baseCommandSchema.extend({
    type: z.literal('pick-player'),
    playerId: z.string().min(1).max(100),
    role: z.enum(['awper', 'igl', 'entry', 'lurker', 'rifler', 'support']).optional(),
    secondaryRole: z.enum(['awper', 'igl', 'entry', 'lurker', 'rifler', 'support']).optional()
  }).strict(),
  baseCommandSchema.extend({
    type: z.literal('configure-pro'),
    style: z.enum(['aggressive', 'balanced', 'tactical']),
    assignments: z.record(z.string(), z.enum(['awper', 'igl', 'entry', 'lurker', 'rifler', 'support']))
  }).strict(),
  baseCommandSchema.extend({ type: z.literal('submit-map-preferences'), mapPreferences: z.tuple([mapIdSchema, mapIdSchema, mapIdSchema]) }).strict(),
  baseCommandSchema.extend({ type: z.literal('watch-match'), seriesId: z.string().max(160).nullable() }).strict(),
  baseCommandSchema.extend({
    type: z.literal('configure-simulation'),
    simulationMode: z.enum(['automatic', 'manual']).optional(),
    simulationSpeed: z.enum(['normal', 'fast', 'ultra']).optional()
  }).strict(),
  baseCommandSchema.extend({ type: z.literal('advance-round') }).strict(),
  // Live decisions (protocol 7). `seriesId` guards against a decision landing after the series moved on.
  baseCommandSchema.extend({
    type: z.literal('veto-action'),
    seriesId: seriesIdSchema,
    action: z.enum(['ban', 'pick']),
    mapId: mapIdSchema,
    /** Veto step the client believes it is answering; a stale step is rejected instead of banning the wrong map. */
    step: z.number().int().min(0).max(24).optional()
  }).strict(),
  baseCommandSchema.extend({ type: z.literal('pick-side'), seriesId: seriesIdSchema, side: z.enum(['ct', 't']) }).strict(),
  baseCommandSchema.extend({ type: z.literal('call-timeout'), seriesId: seriesIdSchema }).strict(),
  baseCommandSchema.extend({ type: z.literal('eco-call'), seriesId: seriesIdSchema, call: z.enum(['force', 'eco']) }).strict(),
  /** Season (protocol 7): accept or decline the rematch offered during the window after a run ends. */
  baseCommandSchema.extend({ type: z.literal('rematch-vote'), accept: z.boolean() }).strict(),
  /** Secret players (protocol 8): a Vargão Academy lineup adds one of the aliases by hand. */
  baseCommandSchema.extend({
    type: z.literal('pick-secret'),
    alias: z.string().trim().min(2).max(24),
    role: z.enum(['awper', 'igl', 'entry', 'lurker', 'rifler', 'support']),
    secondaryRole: z.enum(['awper', 'igl', 'entry', 'lurker', 'rifler', 'support']).optional()
  }).strict(),
  /** Live updates (protocol 9): asks for a fresh full snapshot when the client suspects it fell out of sync. */
  baseCommandSchema.extend({ type: z.literal('resync') }).strict()
]);

export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type RoomPhase = 'lobby' | 'draft' | 'swiss' | 'playoffs' | 'completed';

export interface PublicStanding {
  organizationId: string;
  name: string;
  seed: number;
  wins: number;
  losses: number;
  buchholz: number;
  status: 'active' | 'qualified' | 'eliminated' | 'champion';
}

export interface PublicRound {
  number: number;
  phase: 'swiss' | 'quarterfinal' | 'semifinal' | 'final';
  series: SeriesResult[];
  revealed: boolean;
}

export interface PublicOverviewSeries {
  id: string;
  phase: SeriesResult['phase'];
  bestOf: 1 | 3 | 5;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'live' | 'completed';
  /** Running score of the map being played, when the series is live. */
  liveMap?: { mapId: MapId | null; a: number; b: number } | null;
}

export type LiveSeriesPhase = 'veto' | 'intermission' | 'side-pick' | 'live' | 'finished';

/** Round detail as sent to clients: the internal momentum counters stay on the server. */
export type PublicRoundDetail = RoundDetail;

export interface PublicVetoBoard {
  available: MapId[];
  steps: MapVetoStep[];
  /** Organization whose turn it is, or null once the veto is complete. */
  turnTeamId: string | null;
  action: 'ban' | 'pick' | null;
  step: number;
}

export type PublicPendingDecision =
  | { kind: 'veto'; teamId: string; deadlineAt: number | null; action: 'ban' | 'pick'; step: number; available: MapId[] }
  | { kind: 'side'; teamId: string; deadlineAt: number | null; mapIndex: number; mapId: MapId | null }
  | { kind: 'eco-call'; teamId: string; deadlineAt: number | null; mapIndex: number; roundNumber: number; money: number };

export interface PublicLiveSeries {
  /** Oriented so the viewer's organization (when playing) is team A; `maps[activeMap].details` holds the recent kill feed. */
  series: SeriesResult;
  activeMap: number;
  visibleRounds: number;
  started: boolean;
  finished: boolean;
  phase: LiveSeriesPhase;
  veto: PublicVetoBoard | null;
  decision: PublicPendingDecision | null;
  /** Tactical timeouts left in the current half, oriented like `series` (a = the viewer's side when they play). */
  timeouts: { a: number; b: number };
  sideA: MapSide | null;
  /** When the next round of this series is due (null while paused for a decision or finished). */
  nextRoundAt: number | null;
}

export interface PublicLiveCursor {
  tournamentRound: number;
  phase: PublicRound['phase'];
  status: 'waiting' | 'waiting_host' | 'live' | 'completed';
  /** When the tournament round starts (automatic mode) — null while live or waiting for the host. */
  nextRoundAt: number | null;
  primarySeries: PublicLiveSeries | null;
  overviewSeries: PublicOverviewSeries[];
}

export interface PublicTournament {
  rounds: PublicRound[];
  standings: PublicStanding[];
  championId: string | null;
  currentRound: number;
  liveCursor: PublicLiveCursor | null;
  /** MVP, best lineup and top players of the whole Major; only sent once the room is completed. */
  awards?: MajorAwards | null;
  campaigns?: Array<{
    organizationId: string;
    seriesWon: number;
    seriesLost: number;
    mapsWon: number;
    mapsLost: number;
    roundsWon: number;
    roundsLost: number;
    placement: string;
  }>;
}

export interface PublicParticipant {
  id: string;
  playerName: string;
  organizationName: string;
  connected: boolean;
  host: boolean;
  joinedAt: number;
  picksCompleted: number;
  ready: boolean;
  /** Only the requesting participant sees their own preferences; other participants receive an empty list. */
  mapPreferences: MapId[];
  mapsConfirmed: boolean;
}

export interface PublicOrganization {
  id: string;
  name: string;
  human: boolean;
  sourceTeamId: string | null;
  style: OrgStyle | null;
  power: number;
  lineup: SelectedPlayer[];
}

export interface PublicSelfResult {
  campaign: NonNullable<PublicTournament['campaigns']>[number];
  stats: PlayerRunStats[];
}

export interface SelfDraftState {
  participantId: string;
  rolledTeamId: string | null;
  lineup: SelectedPlayer[];
  proPickedPlayerIds: string[];
  proRoleAssignments: Record<string, LineupSlotRole | null>;
  style: OrgStyle | null;
  rerollsUsed: number;
  rerollsMax: number;
  watchedSeriesId: string | null;
  mapPreferences: MapId[];
  /** Decision this participant has to take right now in their own series, if any. */
  pendingDecision: { seriesId: string; kind: PublicPendingDecision['kind']; deadlineAt: number | null } | null;
  /** Secret players a Vargão Academy lineup may still add (0 for everybody else). */
  secretPicksLeft: number;
}

export interface PublicSeasonRunResult {
  run: number;
  placement: string;
  points: number;
  champion: boolean;
}

export interface PublicSeasonStanding {
  /** Current participant id when the organization is still in the room, null when it left after a run. */
  participantId: string | null;
  organizationName: string;
  playerName: string;
  points: number;
  runs: PublicSeasonRunResult[];
}

/**
 * Points table of the room across its runs. A season is `totalRuns` long; once the last run ends the champion is
 * declared and the next rematch opens a new season. `rematch` is non-null only during the acceptance window.
 */
export interface PublicSeason {
  /** Season number in this room (starts at 1). */
  number: number;
  /** Runs completed in the current season. */
  run: number;
  totalRuns: number;
  standings: PublicSeasonStanding[];
  /** Organization that won the season, once `run >= totalRuns`. */
  championName: string | null;
  rematch: {
    deadlineAt: number;
    /** Participants who already accepted the rematch. */
    accepted: string[];
    /** Participants who declined. */
    declined: string[];
  } | null;
}

export interface RoomSnapshot {
  protocolVersion: typeof PROTOCOL_VERSION;
  capabilities: { mapPreferences: true; replayV1: false; liveDecisions: true; interactiveVeto: true; season: true; secretPlayers: true; liveUpdates: true };
  dataHash: string;
  version: number;
  roomCode: string;
  phase: RoomPhase;
  config: RoomConfig;
  hostParticipantId: string | null;
  participants: PublicParticipant[];
  self: SelfDraftState | null;
  deadlineAt: number | null;
  /** 'picks' while the lineup deadline runs, 'confirmation' during the short window to confirm roles and maps. */
  deadlineStage: 'picks' | 'confirmation' | null;
  tournament: PublicTournament | null;
  organizations?: PublicOrganization[];
  selfResult?: PublicSelfResult | null;
  /** Points across the runs of this room (null before the first run ends). */
  season: PublicSeason | null;
  serverTime: number;
}

/**
 * What changes round by round while a tournament runs (protocol 9). A `snapshot` carries the whole room and is sent
 * on join, resume, resync and every rare event (participants, config, phase, a tournament round closing); between
 * those the server only sends this, so the history is never retransmitted. `pendingDecision` is authoritative: null
 * means the viewer has nothing to decide right now.
 */
export interface LiveUpdate {
  version: number;
  serverTime: number;
  phase: RoomPhase;
  cursor: PublicLiveCursor;
  pendingDecision: SelfDraftState['pendingDecision'];
}

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'PROTOCOL_MISMATCH'
  | 'DATA_MISMATCH'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_STARTED'
  | 'NAME_TAKEN'
  | 'NOT_JOINED'
  | 'NOT_HOST'
  | 'INVALID_PHASE'
  | 'INVALID_ACTION'
  | 'DRAFT_POOL_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'RESUME_EXPIRED'
  | 'NOT_YOUR_TURN'
  | 'DECISION_NOT_PENDING'
  | 'INVALID_MAP'
  | 'TIMEOUT_UNAVAILABLE'
  | 'SERIES_MISMATCH'
  | 'REMATCH_CLOSED';

export type ServerMessage =
  | { type: 'ack'; requestId: string; version: number; resumeToken?: string }
  | { type: 'error'; requestId?: string; code: ErrorCode; message: string }
  | { type: 'snapshot'; snapshot: RoomSnapshot }
  | { type: 'live'; live: LiveUpdate };

export const parseClientCommand = (value: unknown): ClientCommand => clientCommandSchema.parse(value);
