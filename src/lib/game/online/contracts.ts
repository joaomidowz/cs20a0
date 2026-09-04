import { z } from 'zod';
import type { GameMode, LineupSlotRole, MapId, OrgStyle, PlayerRunStats, SelectedPlayer, SeriesResult } from '../types';

export const PROTOCOL_VERSION = 5 as const;
export const ROOM_CODE_LENGTH = 8;

export type OnlineGameMode = GameMode | 'fun' | 'max_fun';

export const toPresentationGameMode = (mode: OnlineGameMode): GameMode =>
  mode === 'fun' || mode === 'max_fun' ? 'premier' : mode;

export const roomConfigSchema = z.object({
  mode: z.enum(['premier', 'faceit', 'pro', 'fun', 'max_fun']),
  entryStage: z.enum(['stage3', 'playoffs']),
  capacity: z.number().int().min(2).max(16),
  draftDeadlineSeconds: z.union([z.literal(60), z.literal(120), z.literal(180), z.literal(300), z.null()]),
  simulationMode: z.enum(['automatic', 'manual']),
  simulationSpeed: z.enum(['normal', 'fast', 'ultra'])
}).strict().superRefine((config, context) => {
  if (config.entryStage === 'playoffs' && config.capacity > 8) {
    context.addIssue({ code: 'custom', path: ['capacity'], message: 'Playoffs rooms support at most 8 participants' });
  }
});

export type RoomConfig = z.infer<typeof roomConfigSchema>;

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  mode: 'premier',
  entryStage: 'stage3',
  capacity: 16,
  draftDeadlineSeconds: 120,
  simulationMode: 'automatic',
  simulationSpeed: 'normal'
};

const requestIdSchema = z.string().min(8).max(80);
const participantNameSchema = z.string().trim().min(2).max(24);
const baseCommandSchema = z.object({ requestId: requestIdSchema });
const mapIdSchema = z.enum(['ancient', 'anubis', 'cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo']);

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
  baseCommandSchema.extend({ type: z.literal('advance-round') }).strict()
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
}

export interface PublicLiveSeries {
  series: SeriesResult;
  activeMap: number;
  visibleRounds: number;
  started: boolean;
  finished: boolean;
}

export interface PublicLiveCursor {
  tournamentRound: number;
  phase: PublicRound['phase'];
  status: 'waiting' | 'waiting_host' | 'live' | 'completed';
  step: number;
  nextTickAt: number | null;
  primarySeries: PublicLiveSeries | null;
  overviewSeries: PublicOverviewSeries[];
}

export interface PublicTournament {
  rounds: PublicRound[];
  standings: PublicStanding[];
  championId: string | null;
  currentRound: number;
  liveCursor: PublicLiveCursor | null;
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
}

export interface RoomSnapshot {
  protocolVersion: typeof PROTOCOL_VERSION;
  capabilities: { mapPreferences: true; replayV1: false };
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
  serverTime: number;
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
  | 'RESUME_EXPIRED';

export type ServerMessage =
  | { type: 'ack'; requestId: string; version: number; resumeToken?: string }
  | { type: 'error'; requestId?: string; code: ErrorCode; message: string }
  | { type: 'snapshot'; snapshot: RoomSnapshot };

export const parseClientCommand = (value: unknown): ClientCommand => clientCommandSchema.parse(value);
