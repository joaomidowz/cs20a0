import { randomBytes, randomUUID } from 'node:crypto';
import { buildProRoleEvaluations, validateProAssignments } from '../src/lib/game/proMode';
import { createBotMapStrategy, createUserMapStrategy, type MapSimulationContext } from '../src/lib/game/map-veto';
import { getDefaultMapSelection, isValidLineupMapSelection } from '../src/lib/game/maps';
import { computeMajorAwards } from '../src/lib/game/majorAwards';
import { LAST_ROUND_FEED_FACTOR } from '../src/lib/game/seriesPresentation';
import { createRunStats } from '../src/lib/game/runStats';
import { calculateHistoricalTeamPower, calculateUserTeamPower, createSeededRng, orientSeriesToTeam } from '../src/lib/game/simulation';
import type { CombatTeam, MajorAwards, MajorRun, MapId, MapResult, OrgStyle, Player, Roster, SeriesResult } from '../src/lib/game/types';
import {
  DEFAULT_ROOM_CONFIG,
  PROTOCOL_VERSION,
  REMATCH_WINDOW_MS,
  seasonPointsFor,
  toPresentationGameMode,
  type ClientCommand,
  type ErrorCode,
  type LiveUpdate,
  type PublicLiveCursor,
  type PublicLiveSeries,
  type PublicOrganization,
  type PublicOverviewSeries,
  type PublicParticipant,
  type PublicPendingDecision,
  type PublicRoundDetail,
  type PublicSeason,
  type PublicSeasonRunResult,
  type PublicSeasonStanding,
  type PublicTournament,
  type RoomConfig,
  type RoomPhase,
  type RoomSnapshot
} from '../src/lib/game/online/contracts';
import { feedOwes, type FeedCursor, type RoomVersions } from './broadcast';
import {
  autocompleteDraft,
  chooseDraftPlayer,
  completeProAssignments,
  drawDraftTeam,
  emptyDraftState,
  getRerollLimit,
  isDraftComplete,
  type DraftState
} from '../src/lib/game/online/draft';
import { DraftPoolExhaustedError } from '../src/lib/game/online/draft-pool';
import { revealTournament, type OnlineTournamentResult, type TournamentOrganization } from '../src/lib/game/online/tournament';
import {
  completeRound,
  completedRoundCount,
  createTournamentEngine,
  currentRound,
  drawHumanSeeds,
  isRoundComplete,
  startNextRound,
  toResult,
  type TournamentEngineState
} from '../src/lib/game/online/tournament-engine';
import {
  LiveSeriesError,
  applySeriesDecision,
  autoDecide,
  pendingSeriesDecision,
  requestSeriesTimeout,
  seriesSideA,
  seriesTimeouts,
  stepSeries,
  toSeriesResult,
  type LiveSeriesState,
  type PendingSeriesDecision
} from '../src/lib/game/online/live-series';
import { findSecretAlias, pickSecretPlayer, SecretPickError, secretPicksLeftFor, secretPlayerId, withSecretPlayers } from '../src/lib/game/online/secret-players';
import { ONLINE_DATA_HASH, playerById, players, teams } from './data';

export const RESUME_TTL_MS = 120_000;
export const EMPTY_ROOM_TTL_MS = 120_000;
/** After the pick deadline, participants get this long to confirm roles and maps before the server fills the gaps. */
export const CONFIRMATION_GRACE_MS = 45_000;
/** Pause between tournament rounds (automatic mode) and between maps of a series. */
export const ROUND_GAP_MS = 900;
export const MAP_GAP_MS = 900;
/** How long a human gets for each live decision before the server decides with the bot policy. */
export const VETO_STEP_DEADLINE_MS = 20_000;
export const SIDE_PICK_DEADLINE_MS = 12_000;
export const ECO_CALL_DEADLINE_MS = 8_000;
const DECISION_DEADLINE_MS: Record<PendingSeriesDecision['kind'], number> = { veto: VETO_STEP_DEADLINE_MS, side: SIDE_PICK_DEADLINE_MS, 'eco-call': ECO_CALL_DEADLINE_MS };
/** Commands whose whole effect lives in the live cursor: they never invalidate the snapshot the clients hold. */
const LIVE_ONLY_COMMANDS: ReadonlySet<ClientCommand['type']> = new Set(['watch-match', 'advance-round', 'veto-action', 'pick-side', 'eco-call', 'call-timeout']);
const REQUEST_CACHE_SIZE = 200;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
  }
}

interface ParticipantState {
  id: string;
  playerName: string;
  organizationName: string;
  resumeToken: string;
  connected: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  draft: DraftState;
  watchedSeriesId: string | null;
  requestIds: string[];
}

/** Server-side pacing of one live series: its own clock plus the deadline of the human decision it waits for. */
interface LiveSeriesRuntime {
  state: LiveSeriesState;
  nextRoundAt: number | null;
  decisionDeadlineAt: number | null;
  decisionKey: string | null;
  /** When the series ended; the round only closes once every client had time to play its last kill feed. */
  finishedAt: number | null;
}

/** One organization's line in the season table, keyed by its normalized name so a rejoining participant keeps it. */
interface SeasonLine {
  participantId: string | null;
  organizationName: string;
  playerName: string;
  /** First join of the organization in this room; the last tiebreak of the season table. */
  joinedAt: number;
  runs: PublicSeasonRunResult[];
}

interface SeasonState {
  number: number;
  /** Runs completed in the current season. */
  run: number;
  results: Map<string, SeasonLine>;
  championName: string | null;
}

/** Acceptance window offered after every run: whoever accepts plays the next run together. */
interface RematchState {
  deadlineAt: number;
  /** Participants present when the run ended. Every one of them owns the full acceptance window, even offline. */
  eligible: Set<string>;
  accepted: Set<string>;
  declined: Set<string>;
}

/** The public tournament minus the live cursor: what every client holds until the next round closes. */
type PublicHistory = Omit<PublicTournament, 'liveCursor'>;

interface RoomState {
  code: string;
  seed: string;
  config: RoomConfig;
  phase: RoomPhase;
  /** Bumped on every change (the `ack` and the live updates carry it). */
  version: number;
  /**
   * Bumped only when something outside the live cursor changes: participants, host, config, phase, draft, history,
   * season, rematch. Clients get a full snapshot when it moves and only live updates in between, so every path that
   * touches one of those must bump it next to `version`.
   */
  stateVersion: number;
  createdAt: number;
  deadlineAt: number | null;
  deadlineStage: 'picks' | 'confirmation' | null;
  hostParticipantId: string | null;
  participants: Map<string, ParticipantState>;
  engine: TournamentEngineState | null;
  organizations: TournamentOrganization[] | null;
  /** Series of the tournament round in progress, keyed by series id. */
  live: Map<string, LiveSeriesRuntime>;
  roundStarted: boolean;
  /** When the next tournament round goes live (automatic mode); null while live or waiting for the host. */
  nextRoundAt: number | null;
  emptySince: number | null;
  resultCache: { stateVersion: number; result: OnlineTournamentResult } | null;
  historyCache: { stateVersion: number; history: PublicHistory } | null;
  season: SeasonState;
  rematch: RematchState | null;
  /** Awards of the completed run, computed once when the champion is known. */
  awards: MajorAwards | null;
}

export interface JoinResult {
  participantId: string;
  resumeToken: string;
}

const lookupPlayer = (id: string) => playerById.get(id);

const roundInterval = (config: RoomConfig) => config.simulationSpeed === 'normal' ? 2_400 : config.simulationSpeed === 'fast' ? 1_200 : 200;
/** Pause after the last round of a map: the clients play that round's kill feed slower before the map closes. */
const lastRoundLinger = (config: RoomConfig) => Math.round(roundInterval(config) * LAST_ROUND_FEED_FACTOR) + MAP_GAP_MS;

const publicTeam = (team: CombatTeam, isUser: boolean): CombatTeam => ({
  id: team.id,
  name: team.name,
  power: 0,
  mental: 0,
  clutch: 0,
  experience: 0,
  isUser
});

const publicRoundDetail = ({ momentum: _momentum, ...detail }: NonNullable<MapResult['details']>[number]): PublicRoundDetail => detail;

const decisionKey = (pending: PendingSeriesDecision) =>
  pending.kind === 'veto' ? `veto:${pending.step}` : pending.kind === 'side' ? `side:${pending.mapIndex}` : `eco:${pending.mapIndex}:${pending.roundNumber}`;

const publicDecision = (pending: PendingSeriesDecision, deadlineAt: number | null): PublicPendingDecision =>
  pending.kind === 'veto'
    ? { kind: 'veto', teamId: pending.teamId, deadlineAt, action: pending.action, step: pending.step, available: pending.available }
    : pending.kind === 'side'
      ? { kind: 'side', teamId: pending.teamId, deadlineAt, mapIndex: pending.mapIndex, mapId: pending.mapId }
      : { kind: 'eco-call', teamId: pending.teamId, deadlineAt, mapIndex: pending.mapIndex, roundNumber: pending.roundNumber, money: pending.money };

/** A finished series as the clients read it: ids, names, scores, rounds and veto. No ratings, kill feed, halves or decisions. */
const publicHistorySeries = (series: SeriesResult): SeriesResult => ({
  id: series.id,
  phase: series.phase,
  bestOf: series.bestOf,
  teamA: publicTeam(series.teamA, false),
  teamB: publicTeam(series.teamB, false),
  scoreA: series.scoreA,
  scoreB: series.scoreB,
  winnerId: series.winnerId,
  maps: series.maps.map(({ map, mapId, scoreA, scoreB, winnerId, rounds, overtime, pickedBy }) => ({
    map,
    ...(mapId ? { mapId } : {}),
    scoreA,
    scoreB,
    winnerId,
    rounds,
    overtime,
    ...(pickedBy === undefined ? {} : { pickedBy })
  })),
  ...(series.veto ? { veto: series.veto } : {}),
  userMatch: false
});

/**
 * The viewer's picture of a live series: oriented so `focusId` is team A, hidden ratings zeroed, the kill feed limited
 * to the rounds this connection has not received yet (`feedCursor`, on every map of the series, and only when
 * `includeDetails`). `userMatch` tells whether the viewer's own organization plays in it, whatever the focus. Future
 * results do not exist yet, so they cannot leak.
 */
function sanitizeLiveSeries(runtime: LiveSeriesRuntime, focusId: string, viewerId: string | null, includeDetails: boolean, feedCursor: FeedCursor | null): PublicLiveSeries {
  const { state } = runtime;
  const raw = toSeriesResult(state);
  const activeMap = state.current ? state.current.index : Math.max(0, raw.maps.length - 1);
  // Pruned before orienting: every map keeps only the rounds still owed to this connection (earlier maps included, so
  // a client that fell behind across a map change catches up), and only those get mirrored, never the whole feed.
  const pruned: SeriesResult = {
    ...raw,
    maps: raw.maps.map(({ details, ...map }, index) => {
      const owed = includeDetails && details ? details.filter((detail) => feedOwes(feedCursor, state.config.id, index, detail.number)) : [];
      return owed.length ? { ...map, details: owed.map(publicRoundDetail) } : map;
    })
  };
  const oriented = orientSeriesToTeam(pruned, focusId);
  const flipped = oriented.teamA.id !== state.config.teamA.id;
  const maps = oriented.maps;
  const pending = pendingSeriesDecision(state);
  const timeouts = seriesTimeouts(state);
  const sideA = seriesSideA(state);
  return {
    series: {
      ...oriented,
      teamA: publicTeam(oriented.teamA, oriented.teamA.id === focusId),
      teamB: publicTeam(oriented.teamB, oriented.teamB.id === focusId),
      maps,
      userMatch: viewerId !== null && (oriented.teamA.id === viewerId || oriented.teamB.id === viewerId)
    },
    activeMap,
    visibleRounds: maps[activeMap]?.rounds.length ?? 0,
    started: state.maps.length > 0 || state.current !== null,
    finished: state.phase === 'finished',
    phase: state.phase,
    veto: state.veto
      ? {
        available: [...state.veto.available],
        steps: [...state.veto.steps],
        turnTeamId: pending?.kind === 'veto' ? pending.teamId : null,
        action: pending?.kind === 'veto' ? pending.action : null,
        step: state.veto.cursor
      }
      : null,
    decision: pending ? publicDecision(pending, runtime.decisionDeadlineAt) : null,
    timeouts: flipped ? { a: timeouts.b, b: timeouts.a } : timeouts,
    sideA: sideA && flipped ? (sideA === 'ct' ? 't' : 'ct') : sideA,
    nextRoundAt: runtime.nextRoundAt
  };
}

function overviewSeries(runtime: LiveSeriesRuntime, roundStarted: boolean): PublicOverviewSeries {
  const { state } = runtime;
  const current = state.current;
  return {
    id: state.config.id,
    phase: state.config.phase,
    bestOf: state.config.bestOf,
    teamA: { id: state.config.teamA.id, name: state.config.teamA.name },
    teamB: { id: state.config.teamB.id, name: state.config.teamB.name },
    scoreA: state.scoreA,
    scoreB: state.scoreB,
    status: state.phase === 'finished' ? 'completed' : roundStarted ? 'live' : 'pending',
    liveMap: current ? { mapId: current.state.mapId ?? null, a: current.state.scoreA, b: current.state.scoreB } : null
  };
}

const randomRoomCode = () => {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
};

const normalizeName = (value: string) => value.trim().toLocaleLowerCase('en-US');

const PLACEMENT_RANK: Record<string, number> = { placementChampion: 0, placementRunnerUp: 1, placement3to4: 2, placement5to8: 3 };
const placementRank = (placement: string) => PLACEMENT_RANK[placement] ?? 4;
const seasonPoints = (line: SeasonLine) => line.runs.reduce((sum, run) => sum + run.points, 0);
const seasonTitles = (line: SeasonLine) => line.runs.filter((run) => run.champion).length;

/** Season table order: points, then titles, then the better last run, then who joined the room first. */
const seasonOrder = (left: SeasonLine, right: SeasonLine) => {
  const lastLeft = left.runs.at(-1);
  const lastRight = right.runs.at(-1);
  return seasonPoints(right) - seasonPoints(left) ||
    seasonTitles(right) - seasonTitles(left) ||
    placementRank(lastLeft?.placement ?? 'placementStage3') - placementRank(lastRight?.placement ?? 'placementStage3') ||
    (lastRight?.points ?? 0) - (lastLeft?.points ?? 0) ||
    left.joinedAt - right.joinedAt;
};

const emptySeason = (number: number): SeasonState => ({ number, run: 0, results: new Map(), championName: null });

export class RoomManager {
  private readonly rooms = new Map<string, RoomState>();

  createRoom(config: RoomConfig = DEFAULT_ROOM_CONFIG, now = Date.now(), seed = randomBytes(24).toString('base64url')): string {
    let code = randomRoomCode();
    while (this.rooms.has(code)) code = randomRoomCode();
    this.rooms.set(code, {
      code,
      seed,
      config,
      phase: 'lobby',
      version: 1,
      stateVersion: 1,
      createdAt: now,
      deadlineAt: null,
      deadlineStage: null,
      hostParticipantId: null,
      participants: new Map(),
      engine: null,
      organizations: null,
      live: new Map(),
      roundStarted: false,
      nextRoundAt: null,
      emptySince: now,
      resultCache: null,
      historyCache: null,
      season: emptySeason(1),
      rematch: null,
      awards: null
    });
    return code;
  }

  hasRoom(code: string): boolean {
    return this.rooms.has(code.toUpperCase());
  }

  roomCount(): number {
    return this.rooms.size;
  }

  join(code: string, playerName: string, organizationName: string, now = Date.now()): JoinResult {
    const room = this.requireRoom(code);
    if (room.phase !== 'lobby') throw new RoomError('ROOM_STARTED', 'The room has already started');
    if (room.participants.size >= room.config.capacity) throw new RoomError('ROOM_FULL', 'The room is full');
    if ([...room.participants.values()].some((participant) => normalizeName(participant.organizationName) === normalizeName(organizationName))) {
      throw new RoomError('NAME_TAKEN', 'Organization name is already in use');
    }
    const participant: ParticipantState = {
      id: randomUUID(),
      playerName: playerName.trim(),
      organizationName: organizationName.trim(),
      resumeToken: randomBytes(32).toString('base64url'),
      connected: true,
      joinedAt: now,
      disconnectedAt: null,
      draft: emptyDraftState(),
      watchedSeriesId: null,
      requestIds: []
    };
    room.participants.set(participant.id, participant);
    room.hostParticipantId ??= participant.id;
    room.emptySince = null;
    room.version += 1;
    room.stateVersion += 1;
    return { participantId: participant.id, resumeToken: participant.resumeToken };
  }

  resume(code: string, resumeToken: string, now = Date.now()): JoinResult {
    const room = this.requireRoom(code);
    const participant = [...room.participants.values()].find((candidate) => candidate.resumeToken === resumeToken);
    if (!participant || (participant.disconnectedAt !== null && now - participant.disconnectedAt >= RESUME_TTL_MS)) {
      throw new RoomError('RESUME_EXPIRED', 'Resume token is invalid or expired');
    }
    participant.connected = true;
    participant.disconnectedAt = null;
    room.hostParticipantId ??= participant.id;
    room.emptySince = null;
    room.version += 1;
    room.stateVersion += 1;
    return { participantId: participant.id, resumeToken: participant.resumeToken };
  }

  /** Current room version: every change bumps it, so an `ack` can report it without building a snapshot. */
  getVersion(code: string): number {
    return this.requireRoom(code).version;
  }

  /** Both versions plus the phase: everything the transport needs to choose between a snapshot and a live update. */
  getVersions(code: string): RoomVersions {
    const room = this.requireRoom(code);
    return { version: room.version, stateVersion: room.stateVersion, phase: room.phase };
  }

  execute(code: string, participantId: string, command: Exclude<ClientCommand, { type: 'join' | 'resume' | 'resync' }>, now = Date.now()): { duplicate: boolean } {
    const room = this.requireRoom(code);
    const participant = this.requireParticipant(room, participantId);
    if (participant.requestIds.includes(command.requestId)) return { duplicate: true };

    switch (command.type) {
      case 'configure':
        this.requireHost(room, participantId);
        if (room.phase !== 'lobby') throw new RoomError('INVALID_PHASE', 'Configuration is locked after the lobby');
        if (command.config.capacity < room.participants.size) throw new RoomError('INVALID_ACTION', 'Capacity cannot be lower than the current participant count');
        room.config = command.config;
        break;
      case 'start':
        this.requireHost(room, participantId);
        if (room.phase !== 'lobby') throw new RoomError('INVALID_PHASE', 'The room is not in the lobby');
        if ([...room.participants.values()].filter((candidate) => candidate.connected).length < 2) throw new RoomError('INVALID_ACTION', 'At least two connected participants are required');
        room.phase = 'draft';
        // The mode is final now: friends with a secret alias start the draft with their player already in the lineup.
        for (const candidate of room.participants.values()) candidate.draft = withSecretPlayers(emptyDraftState(), room.config.mode, candidate.playerName, candidate.organizationName, lookupPlayer);
        room.deadlineAt = room.config.draftDeadlineSeconds === null ? null : now + room.config.draftDeadlineSeconds * 1_000;
        room.deadlineStage = room.deadlineAt === null ? null : 'picks';
        break;
      case 'pick-secret': {
        this.requireDraft(room);
        const alias = findSecretAlias(command.alias);
        const player = alias ? playerById.get(secretPlayerId(alias)) : undefined;
        if (!alias || !player) throw new RoomError('INVALID_ACTION', 'Unknown secret player');
        try {
          participant.draft = pickSecretPlayer(participant.draft, room.config.mode, participant.organizationName, alias, player, command.role, lookupPlayer, command.secondaryRole);
        } catch (error) {
          if (error instanceof SecretPickError) throw new RoomError('INVALID_ACTION', error.message);
          throw new RoomError('INVALID_ACTION', error instanceof Error ? error.message : 'Invalid secret pick');
        }
        break;
      }
      case 'draw-team':
        this.requireDraft(room);
        try {
          participant.draft = drawDraftTeam(room.seed, participant.id, room.config.mode, participant.draft, teams, players);
        } catch (error) {
          if (error instanceof DraftPoolExhaustedError) throw new RoomError('DRAFT_POOL_EXHAUSTED', error.message);
          throw error;
        }
        break;
      case 'reroll-team':
        this.requireDraft(room);
        try {
          participant.draft = drawDraftTeam(room.seed, participant.id, room.config.mode, participant.draft, teams, players, true);
        } catch (error) {
          if (error instanceof DraftPoolExhaustedError) throw new RoomError('DRAFT_POOL_EXHAUSTED', error.message);
          throw error;
        }
        break;
      case 'set-style':
        this.requireDraft(room);
        if (room.config.mode === 'pro') throw new RoomError('INVALID_ACTION', 'PRO style and roles must be confirmed together');
        participant.draft.style = command.style;
        break;
      case 'pick-player': {
        this.requireDraft(room);
        const player = playerById.get(command.playerId);
        if (!player) throw new RoomError('INVALID_ACTION', 'Unknown player');
        try {
          participant.draft = chooseDraftPlayer(room.config.mode, participant.draft, player, command.role, (id) => playerById.get(id), command.secondaryRole);
        } catch (error) {
          throw new RoomError('INVALID_ACTION', error instanceof Error ? error.message : 'Invalid pick');
        }
        break;
      }
      case 'configure-pro':
        this.requireDraft(room);
        if (room.config.mode !== 'pro') throw new RoomError('INVALID_ACTION', 'PRO configuration is only available in PRO mode');
        if (participant.draft.proPickedPlayerIds.length !== 5) throw new RoomError('INVALID_ACTION', 'Five PRO players are required');
        if (!validateProAssignments(command.assignments, participant.draft.proPickedPlayerIds).complete) {
          throw new RoomError('INVALID_ACTION', 'PRO assignments must contain five unique roles for the selected players');
        }
        {
          const selected = participant.draft.proPickedPlayerIds.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
          const evaluations = buildProRoleEvaluations(selected, command.assignments, command.style);
          participant.draft = {
            ...participant.draft,
            style: command.style,
            proRoleAssignments: { ...command.assignments },
            lineup: evaluations.map((evaluation) => ({ playerId: evaluation.player.id, selectedSlotRole: evaluation.selectedRole })),
            mapPreferences: []
          };
        }
        break;
      case 'submit-map-preferences': {
        this.requireDraft(room);
        if (participant.draft.lineup.length !== 5) throw new RoomError('INVALID_ACTION', 'Complete the lineup configuration first');
        const selected = participant.draft.lineup.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
        if (!isValidLineupMapSelection(command.mapPreferences, selected, teams)) {
          throw new RoomError('INVALID_ACTION', 'Map preferences must be three unique maps known by the lineup');
        }
        participant.draft.mapPreferences = [...command.mapPreferences];
        break;
      }
      case 'watch-match':
        if (!room.engine) throw new RoomError('INVALID_PHASE', 'The tournament has not started');
        if (command.seriesId !== null && !room.live.has(command.seriesId)) throw new RoomError('SERIES_MISMATCH', 'That series is not part of the current round');
        participant.watchedSeriesId = command.seriesId;
        break;
      case 'rematch-vote':
        if (
          room.phase !== 'completed' ||
          !room.rematch ||
          now >= room.rematch.deadlineAt ||
          !room.rematch.eligible.has(participant.id)
        ) throw new RoomError('REMATCH_CLOSED', 'The rematch window is closed');
        if (command.accept) {
          room.rematch.accepted.add(participant.id);
          room.rematch.declined.delete(participant.id);
        } else {
          room.rematch.declined.add(participant.id);
          room.rematch.accepted.delete(participant.id);
        }
        break;
      case 'configure-simulation':
        this.requireHost(room, participantId);
        if (!room.engine) throw new RoomError('INVALID_PHASE', 'The tournament has not started');
        if (command.simulationMode) room.config = { ...room.config, simulationMode: command.simulationMode };
        if (command.simulationSpeed) room.config = { ...room.config, simulationSpeed: command.simulationSpeed };
        if (room.roundStarted && command.simulationSpeed) {
          // The new pace is felt immediately; series paused for a decision keep waiting for it.
          for (const runtime of room.live.values()) {
            if (runtime.state.phase !== 'finished' && !pendingSeriesDecision(runtime.state)) runtime.nextRoundAt = now + roundInterval(room.config);
          }
        }
        if (!room.roundStarted && room.config.simulationMode === 'automatic' && room.phase !== 'completed') room.nextRoundAt = now + ROUND_GAP_MS;
        if (!room.roundStarted && room.config.simulationMode === 'manual') room.nextRoundAt = null;
        break;
      case 'advance-round':
        this.requireHost(room, participantId);
        if (!room.engine || room.phase === 'completed') throw new RoomError('INVALID_PHASE', 'There is no tournament round to start');
        if (room.config.simulationMode !== 'manual') throw new RoomError('INVALID_ACTION', 'The room is not in manual mode');
        if (room.roundStarted) throw new RoomError('INVALID_ACTION', 'The tournament round is already live');
        this.launchRound(room, now);
        break;
      case 'veto-action':
      case 'pick-side':
      case 'eco-call':
      case 'call-timeout': {
        if (!room.engine || !room.roundStarted) throw new RoomError('INVALID_PHASE', 'No series is live');
        const runtime = room.live.get(command.seriesId);
        if (!runtime || (runtime.state.config.teamA.id !== participantId && runtime.state.config.teamB.id !== participantId)) {
          throw new RoomError('SERIES_MISMATCH', 'This series is not yours or is no longer live');
        }
        try {
          if (command.type === 'call-timeout') {
            requestSeriesTimeout(runtime.state, participantId);
          } else {
            const pending = pendingSeriesDecision(runtime.state);
            const kind = command.type === 'veto-action' ? 'veto' : command.type === 'pick-side' ? 'side' : 'eco-call';
            if (!pending || pending.kind !== kind) throw new LiveSeriesError('DECISION_NOT_PENDING', `No ${kind} decision is pending`);
            if (pending.teamId !== participantId) throw new LiveSeriesError('NOT_YOUR_TURN', 'It is not your turn');
            if (command.type === 'veto-action') {
              if (pending.kind === 'veto' && command.step !== undefined && command.step !== pending.step) throw new LiveSeriesError('DECISION_NOT_PENDING', 'That veto step is over');
              applySeriesDecision(runtime.state, { kind: 'veto', teamId: participantId, action: command.action, mapId: command.mapId });
            } else if (command.type === 'pick-side') {
              applySeriesDecision(runtime.state, { kind: 'side', teamId: participantId, side: command.side });
            } else {
              applySeriesDecision(runtime.state, { kind: 'eco-call', teamId: participantId, call: command.call });
            }
            runtime.decisionKey = null;
            runtime.decisionDeadlineAt = null;
            runtime.nextRoundAt = now + roundInterval(room.config);
          }
        } catch (error) {
          if (error instanceof LiveSeriesError) throw new RoomError(error.code === 'SERIES_FINISHED' ? 'INVALID_PHASE' : error.code, error.message);
          throw error;
        }
        break;
      }
    }
    // Only successful commands are cached: a retry after a failure must execute again instead of receiving a false ack.
    participant.requestIds.push(command.requestId);
    if (participant.requestIds.length > REQUEST_CACHE_SIZE) participant.requestIds.splice(0, participant.requestIds.length - REQUEST_CACHE_SIZE);
    room.version += 1;
    if (!LIVE_ONLY_COMMANDS.has(command.type)) room.stateVersion += 1;
    this.startTournamentIfReady(room, now);
    return { duplicate: false };
  }

  disconnect(code: string, participantId: string, now = Date.now()): void {
    const room = this.rooms.get(code.toUpperCase());
    const participant = room?.participants.get(participantId);
    if (!room || !participant) return;
    participant.connected = false;
    participant.disconnectedAt = now;
    if (room.hostParticipantId === participantId) {
      room.hostParticipantId = [...room.participants.values()]
        .filter((candidate) => candidate.connected)
        .sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? null;
    }
    if (![...room.participants.values()].some((candidate) => candidate.connected)) room.emptySince = now;
    room.version += 1;
    room.stateVersion += 1;
  }

  /** What changes round by round: the live cursor (feed pruned to what this connection lacks) and the viewer's own decision. */
  getLiveUpdate(code: string, participantId: string, now = Date.now(), feedCursor: FeedCursor | null = null): LiveUpdate {
    const room = this.requireRoom(code);
    if (!room.engine) throw new RoomError('INVALID_PHASE', 'The tournament has not started');
    return {
      version: room.version,
      serverTime: now,
      phase: room.phase,
      cursor: this.liveCursor(room, participantId, feedCursor),
      pendingDecision: this.selfPendingDecision(room, participantId)
    };
  }

  getSnapshot(code: string, participantId: string | null, now = Date.now()): RoomSnapshot {
    const room = this.requireRoom(code);
    const participant = participantId ? room.participants.get(participantId) ?? null : null;
    const participants: PublicParticipant[] = [...room.participants.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((candidate) => ({
        id: candidate.id,
        playerName: candidate.playerName,
        organizationName: candidate.organizationName,
        connected: candidate.connected,
        host: candidate.id === room.hostParticipantId,
        joinedAt: candidate.joinedAt,
        picksCompleted: room.config.mode === 'pro' ? candidate.draft.proPickedPlayerIds.length : candidate.draft.lineup.length,
        ready: isDraftComplete(room.config.mode, candidate.draft),
        mapPreferences: candidate.id === participantId ? [...candidate.draft.mapPreferences] : [],
        mapsConfirmed: candidate.draft.mapPreferences.length === 3
      }));
    const organizations = room.organizations?.map((organization): PublicOrganization => ({
      id: organization.id,
      name: organization.name,
      human: organization.human,
      sourceTeamId: organization.sourceTeamId ?? null,
      style: organization.team.style ?? null,
      power: Number(organization.team.power.toFixed(1)),
      lineup: organization.team.lineup ?? []
    }));
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { mapPreferences: true, replayV1: false, liveDecisions: true, interactiveVeto: true, season: true, secretPlayers: true, liveUpdates: true },
      season: this.publicSeason(room),
      dataHash: ONLINE_DATA_HASH,
      version: room.version,
      roomCode: room.code,
      phase: room.phase,
      config: room.config,
      hostParticipantId: room.hostParticipantId,
      participants,
      self: participant ? {
        participantId: participant.id,
        rolledTeamId: participant.draft.rolledTeamId,
        lineup: participant.draft.lineup,
        proPickedPlayerIds: participant.draft.proPickedPlayerIds,
        proRoleAssignments: participant.draft.proRoleAssignments,
        style: participant.draft.style,
        rerollsUsed: participant.draft.rerollsUsed,
        rerollsMax: getRerollLimit(room.config.mode),
        watchedSeriesId: participant.watchedSeriesId,
        mapPreferences: [...participant.draft.mapPreferences],
        pendingDecision: this.selfPendingDecision(room, participant.id),
        secretPicksLeft: room.phase === 'draft' ? secretPicksLeftFor(room.config.mode, participant.organizationName, participant.draft) : 0
      } : null,
      deadlineAt: room.deadlineAt,
      deadlineStage: room.deadlineAt === null ? null : room.deadlineStage,
      tournament: room.engine ? this.publicTournament(room, participantId, null) : null,
      ...(organizations ? { organizations } : {}),
      ...(participant && room.phase === 'completed' ? { selfResult: this.getSelfResult(room, participant) } : {}),
      serverTime: now
    };
  }

  tick(now = Date.now()): string[] {
    const changed: string[] = [];
    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince >= EMPTY_ROOM_TTL_MS) {
        this.rooms.delete(code);
        continue;
      }
      try {
        if (this.tickRoom(room, now)) changed.push(code);
      } catch (error) {
        // One broken room must never take the whole server (and every other room) down with it.
        console.error(`[room ${code}] tick failed`, error);
        room.deadlineAt = null;
        room.deadlineStage = null;
        room.nextRoundAt = null;
        room.version += 1;
        room.stateVersion += 1;
        changed.push(code);
      }
    }
    return [...new Set(changed)];
  }

  private tickRoom(room: RoomState, now: number): boolean {
    let changed = false;
    for (const [participantId, participant] of room.participants) {
      if (!participant.connected && participant.disconnectedAt !== null && now - participant.disconnectedAt >= RESUME_TTL_MS) {
        room.participants.delete(participantId);
        room.version += 1;
        room.stateVersion += 1;
        changed = true;
      }
    }
    if (room.phase === 'draft' && room.participants.size < 2) {
      // The remaining participant would otherwise wait forever: nobody else can join a started room.
      this.returnToLobby(room);
      return true;
    }
    if (room.phase === 'completed' && room.rematch && this.resolveRematch(room, now)) return true;
    if (room.phase === 'draft' && room.deadlineAt !== null && now >= room.deadlineAt) {
      if (room.deadlineStage === 'confirmation') {
        for (const participant of room.participants.values()) this.autocompleteConfirmation(room, participant);
        room.deadlineAt = null;
        room.deadlineStage = null;
      } else {
        for (const participant of room.participants.values()) {
          const picksCompleted = room.config.mode === 'pro' ? participant.draft.proPickedPlayerIds.length : participant.draft.lineup.length;
          if (picksCompleted < 5) {
            participant.draft = autocompleteDraft(room.seed, participant.id, room.config.mode, participant.draft, teams, players, lookupPlayer);
          }
        }
        const everyoneReady = [...room.participants.values()].every((participant) => isDraftComplete(room.config.mode, participant.draft));
        room.deadlineAt = everyoneReady ? null : now + CONFIRMATION_GRACE_MS;
        room.deadlineStage = everyoneReady ? null : 'confirmation';
      }
      room.version += 1;
      room.stateVersion += 1;
      this.startTournamentIfReady(room, now);
      changed = true;
    } else if (room.engine && room.phase !== 'completed') {
      if (!room.roundStarted) {
        if (room.nextRoundAt !== null && now >= room.nextRoundAt) {
          this.launchRound(room, now);
          changed = true;
        }
      } else {
        for (const runtime of room.live.values()) {
          if (this.advanceSeries(room, runtime, now)) changed = true;
        }
        const round = currentRound(room.engine);
        const lingerUntil = Math.max(0, ...[...room.live.values()].map((runtime) => (runtime.finishedAt ?? 0) + lastRoundLinger(room.config)));
        if (round && isRoundComplete(round) && now >= lingerUntil) {
          completeRound(room.engine);
          // The round joins the public history: every client needs a snapshot, not a live update.
          room.stateVersion += 1;
          room.roundStarted = false;
          if (room.engine.finished) {
            room.phase = 'completed';
            room.live = new Map();
            room.nextRoundAt = null;
            this.completeRun(room, now);
          } else {
            this.prepareRound(room);
            room.nextRoundAt = room.config.simulationMode === 'automatic' ? now + ROUND_GAP_MS : null;
          }
          changed = true;
        }
      }
      if (changed) room.version += 1;
    }
    if (room.phase === 'draft') this.startTournamentIfReady(room, now);
    return changed;
  }

  private returnToLobby(room: RoomState) {
    room.phase = 'lobby';
    room.deadlineAt = null;
    room.deadlineStage = null;
    for (const participant of room.participants.values()) participant.draft = emptyDraftState();
    room.version += 1;
    room.stateVersion += 1;
  }

  /**
   * The run just ended: every human's placement becomes season points, the awards of the whole field are computed
   * once, the season champion is declared after its last run and the rematch window opens for everybody.
   */
  private completeRun(room: RoomState, now: number) {
    const result = toResult(room.engine!);
    room.awards = computeMajorAwards(result.rounds, result.championId);
    const season = room.season;
    const runNumber = season.run + 1;
    for (const participant of [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt)) {
      const placement = result.campaigns.find((campaign) => campaign.organizationId === participant.id)?.placement ?? 'placementStage3';
      const stage3Wins = result.rounds.flatMap((round) => round.series)
        .filter((series) => series.phase === 'stage3' && series.winnerId === participant.id).length;
      const key = normalizeName(participant.organizationName);
      const line = season.results.get(key) ?? {
        participantId: participant.id,
        organizationName: participant.organizationName,
        playerName: participant.playerName,
        joinedAt: participant.joinedAt,
        runs: []
      };
      line.participantId = participant.id;
      line.playerName = participant.playerName;
      line.runs.push({ run: runNumber, placement, points: seasonPointsFor(placement, stage3Wins), champion: result.championId === participant.id });
      season.results.set(key, line);
    }
    season.run = runNumber;
    if (season.run >= room.config.seasonRuns) season.championName = [...season.results.values()].sort(seasonOrder)[0]?.organizationName ?? null;
    room.rematch = {
      deadlineAt: now + REMATCH_WINDOW_MS,
      eligible: new Set(room.participants.keys()),
      accepted: new Set(),
      declined: new Set()
    };
  }

  /**
   * Closes the rematch window once its deadline passes or every participant who finished the run has voted. Two or more
   * acceptances restart the room with them; otherwise the room simply stays completed.
   */
  private resolveRematch(room: RoomState, now: number): boolean {
    const rematch = room.rematch!;
    const everyoneVoted = rematch.eligible.size > 0 && [...rematch.eligible]
      .every((participantId) => rematch.accepted.has(participantId) || rematch.declined.has(participantId));
    if (now < rematch.deadlineAt && !everyoneVoted) return false;
    const accepted = [...room.participants.values()]
      .filter((participant) => rematch.eligible.has(participant.id) && rematch.accepted.has(participant.id));
    room.rematch = null;
    if (accepted.length >= 2) this.restartRoom(room, accepted, now);
    room.version += 1;
    room.stateVersion += 1;
    return true;
  }

  /** Starts the next run with the participants who accepted: a fresh draft on a new seed, straight into the draft phase. */
  private restartRoom(room: RoomState, accepted: ParticipantState[], now: number) {
    const keep = new Set(accepted.map((participant) => participant.id));
    for (const participantId of [...room.participants.keys()]) {
      if (!keep.has(participantId)) room.participants.delete(participantId);
    }
    for (const participant of room.participants.values()) {
      participant.draft = withSecretPlayers(emptyDraftState(), room.config.mode, participant.playerName, participant.organizationName, lookupPlayer);
      participant.watchedSeriesId = null;
    }
    room.seed = randomBytes(24).toString('base64url');
    room.engine = null;
    room.organizations = null;
    room.live = new Map();
    room.resultCache = null;
    room.historyCache = null;
    room.awards = null;
    room.roundStarted = false;
    room.nextRoundAt = null;
    room.hostParticipantId = [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? null;
    if (room.season.run >= room.config.seasonRuns) room.season = emptySeason(room.season.number + 1);
    room.phase = 'draft';
    room.deadlineAt = room.config.draftDeadlineSeconds === null ? null : now + room.config.draftDeadlineSeconds * 1_000;
    room.deadlineStage = room.deadlineAt === null ? null : 'picks';
  }

  /** The points table; null until the room's first run ends (a fresh season afterwards shows run 0 and no standings). */
  private publicSeason(room: RoomState): PublicSeason | null {
    const { season } = room;
    if (season.number === 1 && season.run === 0) return null;
    const standings: PublicSeasonStanding[] = [...season.results.values()].sort(seasonOrder).map((line) => ({
      participantId: line.participantId && room.participants.has(line.participantId) ? line.participantId : null,
      organizationName: line.organizationName,
      playerName: line.playerName,
      points: seasonPoints(line),
      runs: line.runs.map((run) => ({ ...run }))
    }));
    return {
      number: season.number,
      run: season.run,
      totalRuns: room.config.seasonRuns,
      standings,
      championName: season.championName,
      rematch: room.rematch
        ? { deadlineAt: room.rematch.deadlineAt, accepted: [...room.rematch.accepted], declined: [...room.rematch.declined] }
        : null
    };
  }

  /** Fills whatever is still missing after the confirmation window, keeping every role the participant already chose. */
  private autocompleteConfirmation(room: RoomState, participant: ParticipantState) {
    const draft = participant.draft;
    if (room.config.mode === 'pro' && draft.lineup.length < 5 && draft.proPickedPlayerIds.length === 5) {
      const selected = draft.proPickedPlayerIds.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
      if (selected.length === 5) {
        const assignments = completeProAssignments(selected, draft.proRoleAssignments);
        const style = draft.style ?? 'balanced';
        const evaluations = buildProRoleEvaluations(selected, assignments, style);
        participant.draft = {
          ...draft,
          style,
          proRoleAssignments: { ...assignments },
          lineup: evaluations.map((evaluation) => ({ playerId: evaluation.player.id, selectedSlotRole: evaluation.selectedRole })),
          mapPreferences: []
        };
      }
    }
    if (participant.draft.lineup.length === 5 && participant.draft.mapPreferences.length !== 3) {
      const selected = participant.draft.lineup.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
      participant.draft.mapPreferences = [...getDefaultMapSelection(selected, teams)];
    }
  }

  private startTournamentIfReady(room: RoomState, now: number) {
    if (room.phase !== 'draft' || room.participants.size < 2) return;
    if ([...room.participants.values()].every((participant) => isDraftComplete(room.config.mode, participant.draft))) this.beginTournament(room, now);
  }

  private beginTournament(room: RoomState, now: number) {
    if (room.engine) return;
    const organizations = [...room.participants.values()].map((participant, index) => this.toTournamentOrganization(participant, index + 1, room.config.mode));
    const humanIds = new Set(organizations.map((organization) => organization.id));
    const shuffledTeams = [...teams].sort((left, right) => {
      const leftRoll = createSeededRng(`${room.seed}:bot:${left.id}`)();
      const rightRoll = createSeededRng(`${room.seed}:bot:${right.id}`)();
      return leftRoll - rightRoll || left.id.localeCompare(right.id);
    });
    const botPool: TournamentOrganization[] = shuffledTeams.map((team, index) => {
      const combat = calculateHistoricalTeamPower(team, players);
      const id = `bot-${team.id}`;
      return { id, name: combat.name, seed: organizations.length + index + 1, team: { ...combat, id }, human: false, sourceTeamId: team.id };
    }).filter((organization) => !humanIds.has(organization.id));
    // Humans are spread over the field by the room seed, so friends who joined in sequence do not always meet first.
    const fieldSize = room.config.entryStage === 'stage3' ? 16 : 8;
    const humanSeeds = drawHumanSeeds(room.seed, organizations.length, fieldSize);
    const seedOrder: string[] = Array.from({ length: fieldSize }, () => '');
    organizations.forEach((organization, index) => { seedOrder[humanSeeds[index] - 1] = organization.id; });
    const remainingBots = botPool.slice(0, fieldSize - organizations.length);
    for (let index = 0, bot = 0; index < seedOrder.length; index += 1) if (!seedOrder[index]) seedOrder[index] = remainingBots[bot++]?.id ?? '';
    const organizationById = new Map([...organizations, ...botPool].map((organization) => [organization.id, organization]));
    room.organizations = seedOrder.map((id) => organizationById.get(id)).filter((organization): organization is TournamentOrganization => Boolean(organization));
    const strategies: MapSimulationContext['strategies'] = new Map();
    const rosters = new Map<string, Roster>();
    for (const participant of room.participants.values()) {
      const selected = participant.draft.lineup.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
      strategies.set(participant.id, createUserMapStrategy(
        participant.id,
        participant.draft.mapPreferences as [MapId, MapId, MapId],
        selected,
        teams
      ));
      rosters.set(participant.id, { players: selected, roles: new Map(participant.draft.lineup.map((pick) => [pick.playerId, pick.selectedSlotRole])) });
    }
    for (const organization of botPool) {
      const historicalTeam = organization.sourceTeamId ? teams.find((team) => team.id === organization.sourceTeamId) : null;
      if (!historicalTeam) continue;
      strategies.set(organization.id, { ...createBotMapStrategy(historicalTeam), teamId: organization.id });
      rosters.set(organization.id, { players: players.filter((player) => (historicalTeam.players ?? []).includes(player.id)) });
    }
    const mapContext: MapSimulationContext = { mode: room.config.mode, seed: `${room.seed}:online-maps`, strategies, rosters };
    room.engine = createTournamentEngine({
      organizations,
      botPool,
      entryStage: room.config.entryStage,
      seed: room.seed,
      mapContext,
      seedOrder,
      swissBestOf: 3,
      controllerFor: (organization) => organization.human ? 'human' : 'bot',
      // Only two humans veto by hand; against a bot the veto is settled by the policies, decisions inside the maps stay live.
      interactiveVeto: (left, right) => left.human && right.human
    });
    room.deadlineAt = null;
    this.prepareRound(room);
    room.phase = room.config.entryStage === 'stage3' ? 'swiss' : 'playoffs';
    room.nextRoundAt = room.config.simulationMode === 'automatic' ? now + ROUND_GAP_MS : null;
    room.version += 1;
    room.stateVersion += 1;
  }

  /** Pairs the next tournament round so everybody can see the matchups while the round waits to go live. */
  private prepareRound(room: RoomState) {
    const round = startNextRound(room.engine!);
    room.live = new Map(round.series.map((series) => [series.config.id, { state: series, nextRoundAt: null, decisionDeadlineAt: null, decisionKey: null, finishedAt: null }]));
    room.roundStarted = false;
    room.phase = round.phase === 'swiss' ? 'swiss' : 'playoffs';
  }

  private launchRound(room: RoomState, now: number) {
    room.roundStarted = true;
    room.nextRoundAt = null;
    for (const runtime of room.live.values()) runtime.nextRoundAt = now + roundInterval(room.config);
  }

  /**
   * One tick of a live series: a pending human decision pauses this series alone (and is taken by the server when its
   * deadline passes); otherwise the series moves one round when its own clock is due.
   */
  private advanceSeries(room: RoomState, runtime: LiveSeriesRuntime, now: number): boolean {
    const { state } = runtime;
    if (state.phase === 'finished') return false;
    const pending = pendingSeriesDecision(state);
    if (pending) {
      const key = decisionKey(pending);
      if (runtime.decisionKey !== key) {
        runtime.decisionKey = key;
        runtime.decisionDeadlineAt = now + DECISION_DEADLINE_MS[pending.kind];
        return true;
      }
      if (runtime.decisionDeadlineAt !== null && now >= runtime.decisionDeadlineAt) {
        autoDecide(state);
        runtime.decisionKey = null;
        runtime.decisionDeadlineAt = null;
        runtime.nextRoundAt = now + roundInterval(room.config);
        return true;
      }
      return false;
    }
    if (runtime.nextRoundAt === null) runtime.nextRoundAt = now + roundInterval(room.config);
    if (now < runtime.nextRoundAt) return false;
    const outcome = stepSeries(state);
    runtime.nextRoundAt = outcome === 'finished' ? null : outcome === 'map-complete' ? now + lastRoundLinger(room.config) : now + roundInterval(room.config);
    if (outcome === 'finished') runtime.finishedAt = now;
    return true;
  }

  /** Cached per state version: the revealed rounds, standings and campaigns only move when a round closes. */
  private tournamentResult(room: RoomState): OnlineTournamentResult {
    if (room.resultCache?.stateVersion === room.stateVersion) return room.resultCache.result;
    const result = toResult(room.engine!);
    room.resultCache = { stateVersion: room.stateVersion, result };
    return result;
  }

  /** Completed rounds as the clients read them, sanitized and cached per state version. */
  private publicHistory(room: RoomState): PublicHistory {
    if (room.historyCache?.stateVersion === room.stateVersion) return room.historyCache.history;
    const { liveCursor: _cursor, ...revealed } = revealTournament(this.tournamentResult(room), completedRoundCount(room.engine!));
    const history: PublicHistory = { ...revealed, rounds: revealed.rounds.map((round) => ({ ...round, series: round.series.map(publicHistorySeries) })) };
    room.historyCache = { stateVersion: room.stateVersion, history };
    return history;
  }

  private publicTournament(room: RoomState, participantId: string | null, feedCursor: FeedCursor | null): PublicTournament {
    return {
      ...this.publicHistory(room),
      liveCursor: this.liveCursor(room, participantId, feedCursor),
      ...(room.phase === 'completed' ? { awards: room.awards } : {})
    };
  }

  private selfPendingDecision(room: RoomState, participantId: string): NonNullable<RoomSnapshot['self']>['pendingDecision'] {
    if (!room.engine || !room.roundStarted) return null;
    for (const runtime of room.live.values()) {
      const pending = pendingSeriesDecision(runtime.state);
      if (pending?.teamId === participantId) return { seriesId: runtime.state.config.id, kind: pending.kind, deadlineAt: runtime.decisionDeadlineAt };
    }
    return null;
  }

  private liveCursor(room: RoomState, participantId: string | null, feedCursor: FeedCursor | null): PublicLiveCursor {
    const engine = room.engine!;
    const round = currentRound(engine);
    const runtimes = [...room.live.values()];
    const standings = this.publicHistory(room).standings;
    const seedById = new Map(standings.map((standing) => [standing.organizationId, standing.seed]));
    const participant = participantId ? room.participants.get(participantId) ?? null : null;
    const plays = (runtime: LiveSeriesRuntime) => Boolean(participantId) && (runtime.state.config.teamA.id === participantId || runtime.state.config.teamB.id === participantId);
    // A live series being watched takes precedence over the viewer's own; a stale watch id falls back to the usual pick.
    const watched = participant?.watchedSeriesId ? room.live.get(participant.watchedSeriesId) : undefined;
    let primary = watched ?? runtimes.find(plays);
    let focusId = primary && plays(primary) ? participantId! : primary?.state.config.teamA.id ?? '';
    if (!primary) {
      const humanCandidates = runtimes
        .flatMap((runtime) => [runtime.state.config.teamA.id, runtime.state.config.teamB.id].filter((id) => !id.startsWith('bot-')).map((id) => ({ runtime, id })))
        .sort((left, right) => (seedById.get(left.id) ?? 999) - (seedById.get(right.id) ?? 999));
      const bySeed = (runtime: LiveSeriesRuntime) => Math.min(seedById.get(runtime.state.config.teamA.id) ?? 999, seedById.get(runtime.state.config.teamB.id) ?? 999);
      const fallback = [...runtimes].sort((left, right) => bySeed(left) - bySeed(right))[0];
      primary = humanCandidates[0]?.runtime ?? fallback;
      focusId = humanCandidates[0]?.id ?? primary?.state.config.teamA.id ?? '';
    }
    const status: PublicLiveCursor['status'] = room.phase === 'completed'
      ? 'completed'
      : room.roundStarted ? 'live'
        : room.config.simulationMode === 'manual' ? 'waiting_host' : 'waiting';
    const ownSeries = Boolean(primary && plays(primary));
    return {
      tournamentRound: completedRoundCount(engine) + 1,
      phase: round?.phase ?? engine.rounds.at(-1)?.phase ?? 'final',
      status,
      nextRoundAt: room.nextRoundAt,
      primarySeries: primary ? sanitizeLiveSeries(primary, focusId, participantId, ownSeries || Boolean(participant?.watchedSeriesId), feedCursor) : null,
      overviewSeries: runtimes.map((runtime) => overviewSeries(runtime, room.roundStarted))
    };
  }

  private toTournamentOrganization(participant: ParticipantState, seed: number, mode: RoomConfig['mode']): TournamentOrganization {
    const selected = (mode === 'pro' ? participant.draft.proPickedPlayerIds : participant.draft.lineup.map((pick) => pick.playerId))
      .map((id) => playerById.get(id))
      .filter((player): player is Player => Boolean(player));
    const style: OrgStyle = participant.draft.style ?? 'balanced';
    const runPlayers = mode === 'pro'
      ? buildProRoleEvaluations(selected, participant.draft.proRoleAssignments, style).map((evaluation) => evaluation.adjustedPlayer)
      : selected;
    const base: CombatTeam = calculateUserTeamPower(runPlayers, style, participant.draft.lineup, participant.id);
    return {
      id: participant.id,
      name: participant.organizationName,
      seed,
      human: true,
      team: { ...base, id: participant.id, name: participant.organizationName, organizationId: participant.id, isUser: false, lineup: participant.draft.lineup }
    };
  }

  private getSelfResult(room: RoomState, participant: ParticipantState) {
    if (!room.engine) return null;
    const tournament = this.tournamentResult(room);
    const campaign = tournament.campaigns.find((candidate) => candidate.organizationId === participant.id);
    if (!campaign) return null;
    const matches = tournament.rounds.flatMap((round) => round.series)
      .filter((series) => series.teamA.id === participant.id || series.teamB.id === participant.id);
    const stageMatches = matches.filter((series) => series.phase === 'stage3');
    const stageWins = stageMatches.filter((series) => series.winnerId === participant.id).length;
    const champion = tournament.championId === participant.id;
    const run: MajorRun = {
      stage3: {
        wins: stageWins,
        losses: stageMatches.length - stageWins,
        qualified: matches.some((series) => series.phase !== 'stage3'),
        matches: stageMatches
      },
      matches,
      champion,
      placement: campaign.placement
    };
    const selected = participant.draft.lineup
      .map((pick) => playerById.get(pick.playerId))
      .filter((player): player is Player => Boolean(player));
    const runPlayers = room.config.mode === 'pro'
      ? buildProRoleEvaluations(selected, participant.draft.proRoleAssignments, participant.draft.style ?? 'balanced')
        .map((evaluation) => evaluation.adjustedPlayer)
      : selected;
    return {
      campaign,
      stats: createRunStats(runPlayers, run, `${room.seed}:participant-result:${participant.id}`, participant.draft.lineup, participant.id)
    };
  }

  private requireRoom(code: string): RoomState {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Room not found');
    return room;
  }

  private requireParticipant(room: RoomState, participantId: string): ParticipantState {
    const participant = room.participants.get(participantId);
    if (!participant) throw new RoomError('NOT_JOINED', 'Participant is not in the room');
    return participant;
  }

  private requireHost(room: RoomState, participantId: string) {
    if (room.hostParticipantId !== participantId) throw new RoomError('NOT_HOST', 'Only the host can perform this action');
  }

  private requireDraft(room: RoomState) {
    if (room.phase !== 'draft') throw new RoomError('INVALID_PHASE', 'The room is not drafting');
  }
}
