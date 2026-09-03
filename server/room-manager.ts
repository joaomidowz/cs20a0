import { randomBytes, randomUUID } from 'node:crypto';
import { buildProRoleEvaluations, validateProAssignments } from '../src/lib/game/proMode';
import { createBotMapStrategy, createUserMapStrategy, type MapSimulationContext } from '../src/lib/game/map-veto';
import { getDefaultMapSelection, isValidLineupMapSelection } from '../src/lib/game/maps';
import { createRunStats } from '../src/lib/game/runStats';
import { calculateHistoricalTeamPower, calculateUserTeamPower, createSeededRng } from '../src/lib/game/simulation';
import type { CombatTeam, MajorRun, MapId, MapResult, OrgStyle, Player, SeriesResult } from '../src/lib/game/types';
import {
  DEFAULT_ROOM_CONFIG,
  PROTOCOL_VERSION,
  toPresentationGameMode,
  type ClientCommand,
  type ErrorCode,
  type PublicLiveCursor,
  type PublicLiveSeries,
  type PublicOrganization,
  type PublicOverviewSeries,
  type PublicParticipant,
  type RoomConfig,
  type RoomPhase,
  type RoomSnapshot
} from '../src/lib/game/online/contracts';
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
import { revealTournament, runOnlineTournament, type OnlineTournamentResult, type TournamentOrganization } from '../src/lib/game/online/tournament';
import { ONLINE_DATA_HASH, playerById, players, teams } from './data';

export const RESUME_TTL_MS = 120_000;
export const EMPTY_ROOM_TTL_MS = 120_000;
/** After the pick deadline, participants get this long to confirm roles and maps before the server fills the gaps. */
export const CONFIRMATION_GRACE_MS = 45_000;
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

interface RoomState {
  code: string;
  seed: string;
  config: RoomConfig;
  phase: RoomPhase;
  version: number;
  createdAt: number;
  deadlineAt: number | null;
  deadlineStage: 'picks' | 'confirmation' | null;
  hostParticipantId: string | null;
  participants: Map<string, ParticipantState>;
  tournament: OnlineTournamentResult | null;
  organizations: TournamentOrganization[] | null;
  revealedRounds: number;
  liveStep: number;
  roundStarted: boolean;
  nextTickAt: number | null;
  emptySince: number | null;
}

export interface JoinResult {
  participantId: string;
  resumeToken: string;
}

const ROUND_GAP_MS = 900;
const roundInterval = (config: RoomConfig) => config.simulationSpeed === 'normal' ? 2_400 : config.simulationSpeed === 'fast' ? 1_200 : 200;
const seriesRoundCount = (series: SeriesResult) => series.maps.reduce((sum, map) => sum + map.rounds.length, 0);
const tournamentRoundLength = (series: SeriesResult[]) => Math.max(0, ...series.map(seriesRoundCount));

const publicTeam = (team: CombatTeam, isUser: boolean): CombatTeam => ({
  id: team.id,
  name: team.name,
  power: 0,
  mental: 0,
  clutch: 0,
  experience: 0,
  isUser
});

function orientSeries(series: SeriesResult, focusId: string): SeriesResult {
  if (series.teamA.id === focusId || series.teamB.id !== focusId) return series;
  return {
    ...series,
    teamA: series.teamB,
    teamB: series.teamA,
    scoreA: series.scoreB,
    scoreB: series.scoreA,
    maps: series.maps.map((map) => ({
      ...map,
      scoreA: map.scoreB,
      scoreB: map.scoreA,
      rounds: map.rounds.map((round) => ({ ...round, a: round.b, b: round.a }))
    }))
  };
}

function sanitizeLiveSeries(source: SeriesResult, step: number, focusId: string): PublicLiveSeries {
  const series = orientSeries(source, focusId);
  const visibleMaps: MapResult[] = [];
  let remaining = Math.max(0, step);
  for (let index = 0; index < series.maps.length; index += 1) {
    const map = series.maps[index];
    const visibleRoundCount = Math.min(remaining, map.rounds.length);
    if (index > 0 && visibleRoundCount === 0) break;
    const visibleRounds = map.rounds.slice(0, visibleRoundCount);
    const mapComplete = visibleRoundCount === map.rounds.length;
    const current = visibleRounds.at(-1);
    visibleMaps.push({
      ...map,
      scoreA: mapComplete ? map.scoreA : current?.a ?? 0,
      scoreB: mapComplete ? map.scoreB : current?.b ?? 0,
      winnerId: mapComplete ? map.winnerId : '',
      rounds: visibleRounds,
      overtime: mapComplete ? map.overtime : Boolean(current?.overtime)
    });
    remaining -= visibleRoundCount;
    if (!mapComplete) break;
  }
  const complete = step >= seriesRoundCount(series);
  const scoreA = visibleMaps.filter((map) => map.winnerId === series.teamA.id).length;
  const scoreB = visibleMaps.filter((map) => map.winnerId === series.teamB.id).length;
  const activeMap = Math.max(0, visibleMaps.length - 1);
  return {
    series: {
      ...series,
      teamA: publicTeam(series.teamA, series.teamA.id === focusId),
      teamB: publicTeam(series.teamB, series.teamB.id === focusId),
      scoreA,
      scoreB,
      winnerId: complete ? series.winnerId : '',
      maps: visibleMaps,
      userMatch: series.teamA.id === focusId || series.teamB.id === focusId
    },
    activeMap,
    visibleRounds: visibleMaps[activeMap]?.rounds.length ?? 0,
    started: step > 0,
    finished: complete
  };
}

function overviewSeries(series: SeriesResult, step: number): PublicOverviewSeries {
  let remaining = Math.max(0, step);
  let scoreA = 0;
  let scoreB = 0;
  for (const map of series.maps) {
    if (remaining < map.rounds.length) break;
    remaining -= map.rounds.length;
    if (map.winnerId === series.teamA.id) scoreA += 1;
    else scoreB += 1;
  }
  const complete = step >= seriesRoundCount(series);
  return {
    id: series.id,
    phase: series.phase,
    bestOf: series.bestOf,
    teamA: { id: series.teamA.id, name: series.teamA.name },
    teamB: { id: series.teamB.id, name: series.teamB.name },
    scoreA,
    scoreB,
    status: complete ? 'completed' : step > 0 ? 'live' : 'pending'
  };
}

const randomRoomCode = () => {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
};

const normalizeName = (value: string) => value.trim().toLocaleLowerCase('en-US');

export class RoomManager {
  private readonly rooms = new Map<string, RoomState>();

  createRoom(config: RoomConfig = DEFAULT_ROOM_CONFIG, now = Date.now()): string {
    let code = randomRoomCode();
    while (this.rooms.has(code)) code = randomRoomCode();
    this.rooms.set(code, {
      code,
      seed: randomBytes(24).toString('base64url'),
      config,
      phase: 'lobby',
      version: 1,
      createdAt: now,
      deadlineAt: null,
      deadlineStage: null,
      hostParticipantId: null,
      participants: new Map(),
      tournament: null,
      organizations: null,
      revealedRounds: 0,
      liveStep: 0,
      roundStarted: false,
      nextTickAt: null,
      emptySince: now
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
    return { participantId: participant.id, resumeToken: participant.resumeToken };
  }

  resume(code: string, resumeToken: string, now = Date.now()): JoinResult {
    const room = this.requireRoom(code);
    const participant = [...room.participants.values()].find((candidate) => candidate.resumeToken === resumeToken);
    if (!participant || (participant.disconnectedAt !== null && now - participant.disconnectedAt > RESUME_TTL_MS)) {
      throw new RoomError('RESUME_EXPIRED', 'Resume token is invalid or expired');
    }
    participant.connected = true;
    participant.disconnectedAt = null;
    room.hostParticipantId ??= participant.id;
    room.emptySince = null;
    room.version += 1;
    return { participantId: participant.id, resumeToken: participant.resumeToken };
  }

  execute(code: string, participantId: string, command: Exclude<ClientCommand, { type: 'join' | 'resume' }>, now = Date.now()): { duplicate: boolean } {
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
        room.deadlineAt = room.config.draftDeadlineSeconds === null ? null : now + room.config.draftDeadlineSeconds * 1_000;
        room.deadlineStage = room.deadlineAt === null ? null : 'picks';
        break;
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
          participant.draft = chooseDraftPlayer(room.config.mode, participant.draft, player, command.role, (id) => playerById.get(id));
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
        participant.watchedSeriesId = command.seriesId;
        break;
      case 'configure-simulation':
        this.requireHost(room, participantId);
        if (!room.tournament) throw new RoomError('INVALID_PHASE', 'The tournament has not started');
        if (command.simulationMode) room.config = { ...room.config, simulationMode: command.simulationMode };
        if (command.simulationSpeed) room.config = { ...room.config, simulationSpeed: command.simulationSpeed };
        if (room.roundStarted && command.simulationSpeed) {
          const currentRound = room.tournament.rounds[room.revealedRounds];
          room.nextTickAt = now + (currentRound && room.liveStep >= tournamentRoundLength(currentRound.series) ? ROUND_GAP_MS : roundInterval(room.config));
        }
        if (!room.roundStarted && room.config.simulationMode === 'automatic' && room.phase !== 'completed') room.nextTickAt = now + ROUND_GAP_MS;
        if (!room.roundStarted && room.config.simulationMode === 'manual') room.nextTickAt = null;
        break;
      case 'advance-round':
        this.requireHost(room, participantId);
        if (!room.tournament || room.phase === 'completed') throw new RoomError('INVALID_PHASE', 'There is no tournament round to start');
        if (room.config.simulationMode !== 'manual') throw new RoomError('INVALID_ACTION', 'The room is not in manual mode');
        if (room.roundStarted) throw new RoomError('INVALID_ACTION', 'The tournament round is already live');
        room.roundStarted = true;
        room.liveStep = 0;
        room.nextTickAt = now + roundInterval(room.config);
        break;
    }
    // Only successful commands are cached: a retry after a failure must execute again instead of receiving a false ack.
    participant.requestIds.push(command.requestId);
    if (participant.requestIds.length > REQUEST_CACHE_SIZE) participant.requestIds.splice(0, participant.requestIds.length - REQUEST_CACHE_SIZE);
    room.version += 1;
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
      capabilities: { mapPreferences: true, replayV1: false },
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
        mapPreferences: [...participant.draft.mapPreferences]
      } : null,
      deadlineAt: room.deadlineAt,
      deadlineStage: room.deadlineAt === null ? null : room.deadlineStage,
      tournament: room.tournament ? this.publicTournament(room, participantId) : null,
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
        room.nextTickAt = null;
        room.version += 1;
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
        changed = true;
      }
    }
    if (room.phase === 'draft' && room.participants.size < 2) {
      // The remaining participant would otherwise wait forever: nobody else can join a started room.
      this.returnToLobby(room);
      return true;
    }
    if (room.phase === 'draft' && room.deadlineAt !== null && now >= room.deadlineAt) {
      if (room.deadlineStage === 'confirmation') {
        for (const participant of room.participants.values()) this.autocompleteConfirmation(room, participant);
        room.deadlineAt = null;
        room.deadlineStage = null;
      } else {
        for (const participant of room.participants.values()) {
          const picksCompleted = room.config.mode === 'pro' ? participant.draft.proPickedPlayerIds.length : participant.draft.lineup.length;
          if (picksCompleted < 5) {
            participant.draft = autocompleteDraft(room.seed, participant.id, room.config.mode, participant.draft, teams, players);
          }
        }
        const everyoneReady = [...room.participants.values()].every((participant) => isDraftComplete(room.config.mode, participant.draft));
        room.deadlineAt = everyoneReady ? null : now + CONFIRMATION_GRACE_MS;
        room.deadlineStage = everyoneReady ? null : 'confirmation';
      }
      room.version += 1;
      this.startTournamentIfReady(room, now);
      changed = true;
    } else if (room.tournament && room.nextTickAt !== null && now >= room.nextTickAt) {
        const currentRound = room.tournament.rounds[room.revealedRounds];
        if (!currentRound) {
          room.phase = 'completed';
          room.nextTickAt = null;
        } else if (!room.roundStarted) {
          room.roundStarted = true;
          room.liveStep = 0;
          room.nextTickAt = now + roundInterval(room.config);
        } else if (room.liveStep >= tournamentRoundLength(currentRound.series)) {
          room.revealedRounds += 1;
          room.liveStep = 0;
          room.roundStarted = false;
          const nextRound = room.tournament.rounds[room.revealedRounds];
          if (!nextRound) {
            room.phase = 'completed';
            room.nextTickAt = null;
          } else {
            room.phase = nextRound.phase === 'swiss' ? 'swiss' : 'playoffs';
            room.nextTickAt = room.config.simulationMode === 'automatic' ? now + ROUND_GAP_MS : null;
          }
        } else {
          room.liveStep += 1;
          room.nextTickAt = now + (room.liveStep >= tournamentRoundLength(currentRound.series) ? ROUND_GAP_MS : roundInterval(room.config));
        }
      room.version += 1;
      changed = true;
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
    if (room.tournament) return;
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
    room.organizations = [...organizations, ...botPool].slice(0, room.config.entryStage === 'stage3' ? 16 : 8);
    const strategies: MapSimulationContext['strategies'] = new Map();
    for (const participant of room.participants.values()) {
      const selected = participant.draft.lineup.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => Boolean(player));
      strategies.set(participant.id, createUserMapStrategy(
        participant.id,
        participant.draft.mapPreferences as [MapId, MapId, MapId],
        selected,
        teams
      ));
    }
    for (const organization of botPool) {
      const historicalTeam = organization.sourceTeamId ? teams.find((team) => team.id === organization.sourceTeamId) : null;
      if (historicalTeam) strategies.set(organization.id, { ...createBotMapStrategy(historicalTeam), teamId: organization.id });
    }
    const mapContext: MapSimulationContext = { mode: toPresentationGameMode(room.config.mode), seed: `${room.seed}:online-maps`, strategies };
    room.tournament = runOnlineTournament({ organizations, botPool, entryStage: room.config.entryStage, seed: room.seed, mapContext });
    room.deadlineAt = null;
    room.revealedRounds = 0;
    room.liveStep = 0;
    room.roundStarted = false;
    room.phase = room.config.entryStage === 'stage3' ? 'swiss' : 'playoffs';
    room.nextTickAt = room.config.simulationMode === 'automatic' ? now + ROUND_GAP_MS : null;
    room.version += 1;
  }

  private publicTournament(room: RoomState, participantId: string | null) {
    const tournament = revealTournament(room.tournament!, room.revealedRounds);
    const currentRound = room.tournament!.rounds[room.revealedRounds];
    if (!currentRound || room.phase === 'completed') {
      tournament.liveCursor = currentRound ? this.liveCursor(room, currentRound.series, participantId) : null;
      return tournament;
    }
    tournament.liveCursor = this.liveCursor(room, currentRound.series, participantId);
    return tournament;
  }

  private liveCursor(room: RoomState, series: SeriesResult[], participantId: string | null): PublicLiveCursor {
    const standings = revealTournament(room.tournament!, room.revealedRounds).standings;
    const seedById = new Map(standings.map((standing) => [standing.organizationId, standing.seed]));
    let primary = participantId ? series.find((match) => match.teamA.id === participantId || match.teamB.id === participantId) : undefined;
    let focusId = participantId ?? '';
    if (!primary) {
      const humanCandidates = series
        .flatMap((match) => [match.teamA.id, match.teamB.id].filter((id) => !id.startsWith('bot-')).map((id) => ({ match, id })))
        .sort((left, right) => (seedById.get(left.id) ?? 999) - (seedById.get(right.id) ?? 999));
      const fallback = [...series].sort((left, right) => Math.min(seedById.get(left.teamA.id) ?? 999, seedById.get(left.teamB.id) ?? 999) - Math.min(seedById.get(right.teamA.id) ?? 999, seedById.get(right.teamB.id) ?? 999))[0];
      primary = humanCandidates[0]?.match ?? fallback;
      focusId = humanCandidates[0]?.id ?? primary?.teamA.id ?? '';
    }
    const status: PublicLiveCursor['status'] = room.phase === 'completed'
      ? 'completed'
      : room.roundStarted ? 'live'
        : room.config.simulationMode === 'manual' ? 'waiting_host' : 'waiting';
    return {
      tournamentRound: room.revealedRounds + 1,
      phase: room.tournament!.rounds[room.revealedRounds]?.phase ?? 'final',
      status,
      step: room.liveStep,
      nextTickAt: room.nextTickAt,
      primarySeries: primary ? sanitizeLiveSeries(primary, room.liveStep, focusId) : null,
      overviewSeries: series.map((match) => overviewSeries(match, room.liveStep))
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
    const campaign = room.tournament?.campaigns.find((candidate) => candidate.organizationId === participant.id);
    if (!room.tournament || !campaign) return null;
    const matches = room.tournament.rounds.flatMap((round) => round.series)
      .filter((series) => series.teamA.id === participant.id || series.teamB.id === participant.id);
    const stageMatches = matches.filter((series) => series.phase === 'stage3');
    const stageWins = stageMatches.filter((series) => series.winnerId === participant.id).length;
    const champion = room.tournament.championId === participant.id;
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
