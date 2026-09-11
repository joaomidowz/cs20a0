import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createOnlineServer, type OnlineServerOptions } from '../server/app';
import { ONLINE_DATA_HASH, playerById, players, teams } from '../server/data';
import { CONFIRMATION_GRACE_MS, RESUME_TTL_MS, ROUND_GAP_MS, RoomError, RoomManager, VETO_STEP_DEADLINE_MS } from '../server/room-manager';
import { drawHumanSeeds } from '../src/lib/game/online/tournament-engine';
import { DEFAULT_ROOM_CONFIG, PROTOCOL_VERSION, type RoomSnapshot, type ServerMessage } from '../src/lib/game/online/contracts';
import { getHistoricalTeamOverall } from '../src/lib/game/online/draft-pool';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { findBestProAssignments } from '../src/lib/game/online/draft';
import type { OnlineGameMode } from '../src/lib/game/online/contracts';

interface RunningServer {
  baseUrl: string;
  wsUrl: string;
  close: () => Promise<void>;
  advance: (milliseconds: number) => void;
  /** The fake clock the server reads. */
  now: () => number;
}

const servers: RunningServer[] = [];

async function startServer(options: Partial<OnlineServerOptions> = {}): Promise<RunningServer> {
  let clock = Date.now();
  const app = createOnlineServer({ allowedOrigins: ['http://localhost:5173'], now: () => clock, ...options });
  await new Promise<void>((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', () => {
      app.server.off('error', reject);
      resolve();
    });
  });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
  const running = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    wsUrl: `ws://127.0.0.1:${address.port}`,
    close: app.close,
    advance: (milliseconds: number) => { clock += milliseconds; },
    now: () => clock
  };
  servers.push(running);
  return running;
}

class TestClient {
  readonly socket: WebSocket;
  private readonly messages: ServerMessage[] = [];
  private readonly waiters: Array<() => void> = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw) => {
      this.messages.push(JSON.parse(raw.toString()) as ServerMessage);
      for (const notify of this.waiters.splice(0)) notify();
    });
  }

  static async connect(url: string): Promise<TestClient> {
    const socket = new WebSocket(url, { origin: 'http://localhost:5173' });
    const client = new TestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return client;
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  /** Everything received so far, in order. */
  received(): ServerMessage[] {
    return [...this.messages];
  }

  /** Resolves after `milliseconds` of real time, so a test can assert that nothing arrived. */
  static settle(milliseconds: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  async waitFor(predicate: (message: ServerMessage) => boolean, timeout = 12_000): Promise<ServerMessage> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const match = this.messages.find(predicate);
      if (match) return match;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), Math.max(1, deadline - Date.now()));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    throw new Error('Timed out waiting for WebSocket message');
  }
}

async function createRoom(server: RunningServer, capacity: number, mode: OnlineGameMode = 'premier') {
  const response = await fetch(`${server.baseUrl}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    body: JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      dataHash: ONLINE_DATA_HASH,
      config: { mode, entryStage: 'stage3', capacity, draftDeadlineSeconds: 60, simulationMode: 'automatic', simulationSpeed: 'ultra' }
    })
  });
  expect(response.status).toBe(201);
  return (await response.json() as { roomCode: string }).roomCode;
}

/**
 * Human seeds come from the room seed, so a test that needs the two humans to meet (or not) in the first round looks
 * for a seed whose draw puts them eight apart in a sixteen-team Swiss (or in the same quarterfinal of an eight-team bracket).
 */
function seedWhereHumans(fieldSize: 16 | 8, meet: boolean): string {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const seed = `humans-${fieldSize}-${meet}-${attempt}`;
    const [first, second] = drawHumanSeeds(seed, 2, fieldSize);
    // The host must also hold the higher seed (team A), so the first veto step is the host's.
    const together = fieldSize === 16 ? second - first === 8 : first + second === 9 && first < second;
    if (together === meet) return seed;
  }
  throw new Error('No seed found for the requested human pairing');
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function confirmManagerMaps(manager: RoomManager, code: string, participantIds: string[], now: number) {
  participantIds.forEach((participantId, index) => {
    const lineup = manager.getSnapshot(code, participantId, now).self?.lineup ?? [];
    const selected = lineup.map((pick) => playerById.get(pick.playerId)!).filter(Boolean);
    manager.execute(code, participantId, {
      type: 'submit-map-preferences',
      requestId: `maps-${index.toString().padStart(8, '0')}`,
      mapPreferences: getDefaultMapSelection(selected, teams)
    }, now + index);
  });
}

describe('authoritative online server', () => {
  it('reveals organization rosters only after the draft and returns a private final result', () => {
    const manager = new RoomManager();
    const startedAt = 5_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, startedAt);
    const host = manager.join(code, 'Host player', 'Host org', startedAt);
    const guest = manager.join(code, 'Guest player', 'Guest org', startedAt + 1);

    expect(manager.getSnapshot(code, host.participantId, startedAt)).not.toHaveProperty('organizations');
    expect(manager.getSnapshot(code, host.participantId, startedAt)).not.toHaveProperty('selfResult');
    // Protocol 7: the season table travels with every snapshot and is null until the first run ends.
    expect(manager.getSnapshot(code, host.participantId, startedAt).capabilities.season).toBe(true);
    expect(manager.getSnapshot(code, host.participantId, startedAt).season).toBeNull();

    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-public-data' }, startedAt + 2);
    expect(manager.getSnapshot(code, host.participantId, startedAt + 2)).not.toHaveProperty('organizations');
    manager.tick(startedAt + 61_000);
    confirmManagerMaps(manager, code, [host.participantId, guest.participantId], startedAt + 61_000);

    const tournamentSnapshot = manager.getSnapshot(code, host.participantId, startedAt + 61_000);
    expect(tournamentSnapshot.organizations).toHaveLength(8);
    expect(tournamentSnapshot.organizations?.filter((organization) => organization.human)).toHaveLength(2);
    expect(tournamentSnapshot.organizations?.find((organization) => organization.id === host.participantId)?.lineup).toHaveLength(5);
    expect(tournamentSnapshot.organizations?.find((organization) => !organization.human)?.sourceTeamId).toBeTruthy();
    expect(tournamentSnapshot).not.toHaveProperty('selfResult');
    expect(tournamentSnapshot.season).toBeNull();
    expect(tournamentSnapshot.tournament?.awards).toBeUndefined();

    let current = startedAt + 61_000;
    let completed = tournamentSnapshot;
    for (let index = 0; index < 2_000 && completed.phase !== 'completed'; index += 1) {
      current += 1_000;
      manager.tick(current);
      completed = manager.getSnapshot(code, host.participantId, current);
    }
    expect(completed.phase).toBe('completed');
    expect(completed.selfResult?.campaign.organizationId).toBe(host.participantId);
    expect(completed.selfResult?.stats).toHaveLength(5);
    expect(completed.selfResult?.stats.map((stat) => stat.playerId).sort()).toEqual(
      completed.self?.lineup.map((pick) => pick.playerId).sort()
    );
    const guestResult = manager.getSnapshot(code, guest.participantId, current).selfResult;
    expect(guestResult?.campaign.organizationId).toBe(guest.participantId);
    expect(guestResult?.campaign.organizationId).not.toBe(completed.selfResult?.campaign.organizationId);
  });

  it('runs each live series on its own clock and shows both humans the same mirrored rounds', () => {
    const manager = new RoomManager();
    const startedAt = 1_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 2, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, startedAt, seedWhereHumans(16, true));
    const host = manager.join(code, 'Host player', 'Host org', startedAt);
    const guest = manager.join(code, 'Guest player', 'Guest org', startedAt + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-sync-0001' }, startedAt);

    manager.tick(startedAt + 61_000);
    confirmManagerMaps(manager, code, [host.participantId, guest.participantId], startedAt + 61_000);
    const waiting = manager.getSnapshot(code, host.participantId, startedAt + 61_000);
    expect(waiting.tournament?.rounds).toHaveLength(0);
    expect(waiting.tournament?.liveCursor).toMatchObject({ status: 'waiting', nextRoundAt: expect.any(Number) });
    const roundStartsAt = waiting.tournament!.liveCursor!.nextRoundAt!;
    expect(roundStartsAt - (startedAt + 61_000)).toBeGreaterThanOrEqual(ROUND_GAP_MS);
    // The matchups of the first round are already visible while everybody waits for it to go live.
    expect(waiting.tournament?.liveCursor?.overviewSeries).toHaveLength(8);
    expect(waiting.tournament?.liveCursor?.overviewSeries.every((series) => series.status === 'pending')).toBe(true);

    // The room seed was chosen so the two humans meet in round one: their series opens with an interactive veto.
    let now = roundStartsAt;
    manager.tick(now);
    now += 200;
    manager.tick(now);
    const hostLive = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor;
    expect(hostLive).toMatchObject({ status: 'live', nextRoundAt: null });
    expect(hostLive?.primarySeries?.phase).toBe('veto');
    expect(hostLive?.primarySeries?.decision).toMatchObject({ kind: 'veto', teamId: host.participantId, action: 'ban', deadlineAt: now + VETO_STEP_DEADLINE_MS });
    const seriesId = hostLive!.primarySeries!.series.id;
    const available = hostLive!.primarySeries!.veto!.available;
    expect(() => manager.execute(code, guest.participantId, { type: 'veto-action', requestId: 'veto-guest-early', seriesId, action: 'ban', mapId: available[0] }, now)).toThrowError(/turn/);
    expect(() => manager.execute(code, host.participantId, { type: 'veto-action', requestId: 'veto-host-pick', seriesId, action: 'pick', mapId: available[0] }, now)).toThrowError(RoomError);
    manager.execute(code, host.participantId, { type: 'veto-action', requestId: 'veto-host-ban-1', seriesId, action: 'ban', mapId: available[0] }, now);
    const afterBan = manager.getSnapshot(code, guest.participantId, now).tournament?.liveCursor?.primarySeries;
    expect(afterBan?.veto?.steps).toHaveLength(1);
    expect(afterBan?.veto?.steps[0]).toMatchObject({ action: 'ban', teamId: host.participantId, mapId: available[0] });
    manager.tick(now + 100);
    expect(manager.getSnapshot(code, guest.participantId, now + 100).self?.pendingDecision).toMatchObject({ seriesId, kind: 'veto' });

    // The other series in the round keep playing while the humans veto.
    now += 1_000;
    manager.tick(now);
    const others = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor?.overviewSeries.filter((series) => series.id !== seriesId) ?? [];
    expect(others.some((series) => series.liveMap && series.liveMap.a + series.liveMap.b > 0)).toBe(true);

    // Every remaining decision expires: the server decides with the bot policy and the series gets under way.
    let hostSnapshot = manager.getSnapshot(code, host.participantId, now);
    for (let index = 0; index < 400 && (hostSnapshot.tournament?.liveCursor?.primarySeries?.visibleRounds ?? 0) < 1; index += 1) {
      now += 1_000;
      manager.tick(now);
      hostSnapshot = manager.getSnapshot(code, host.participantId, now);
    }
    const guestSnapshot = manager.getSnapshot(code, guest.participantId, now);
    const hostSeries = hostSnapshot.tournament?.liveCursor?.primarySeries;
    const guestSeries = guestSnapshot.tournament?.liveCursor?.primarySeries;
    expect(hostSeries?.series.id).toBe(guestSeries?.series.id);
    expect(hostSeries?.veto?.steps.length).toBeGreaterThanOrEqual(7);
    expect(hostSeries?.veto?.steps.at(-1)?.action).toBe('decider');
    expect(hostSeries?.series.decisions?.filter((decision) => decision.kind === 'veto' && decision.auto).length).toBeGreaterThanOrEqual(5);
    expect(hostSeries?.visibleRounds).toBe(guestSeries?.visibleRounds);
    const hostRound = hostSeries?.series.maps[0]?.rounds[0];
    const guestRound = guestSeries?.series.maps[0]?.rounds[0];
    expect(hostRound).toEqual(guestRound ? { a: guestRound.b, b: guestRound.a, overtime: guestRound.overtime } : undefined);
    expect(hostSeries?.series.teamA.id).toBe(host.participantId);
    expect(guestSeries?.series.teamA.id).toBe(guest.participantId);
    expect(hostSeries?.series.teamA.power).toBe(0);
    expect(hostSeries?.series.winnerId).toBe('');
    expect(hostSeries?.series.maps[0]?.details?.length).toBeGreaterThan(0);
    expect(hostSeries?.series.maps[0]?.details?.every((detail) => detail.momentum === undefined)).toBe(true);
    expect(hostSnapshot.tournament?.rounds).toHaveLength(0);

    // The humans' series is usually the slowest of the round (decision deadlines), so the round closes on the same tick
    // it ends and the cursor moves on: the reliable signal is the series showing up in the public history.
    let finishedSnapshot = hostSnapshot;
    const inHistory = (snapshot: RoomSnapshot) => snapshot.tournament?.rounds.flatMap((round) => round.series).find((series) => series.id === seriesId);
    for (let index = 0; index < 600 && !inHistory(finishedSnapshot) && !finishedSnapshot.tournament?.liveCursor?.primarySeries?.finished; index += 1) {
      now += 1_000;
      manager.tick(now);
      finishedSnapshot = manager.getSnapshot(code, host.participantId, now);
    }
    const recorded = inHistory(finishedSnapshot) ?? finishedSnapshot.tournament?.liveCursor?.primarySeries?.series;
    expect(recorded?.winnerId).toBeTruthy();
    expect(recorded?.maps.every((map) => map.winnerId && map.rounds.length >= 13)).toBe(true);
    expect(finishedSnapshot.tournament?.rounds.every((round) => round.series.every((series) => series.winnerId))).toBe(true);
  });

  it('pauses only the series waiting for a human side pick and honours an explicit eco call', () => {
    const manager = new RoomManager();
    const startedAt = 3_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, startedAt, seedWhereHumans(8, false));
    const host = manager.join(code, 'Host player', 'Host org', startedAt);
    const guest = manager.join(code, 'Guest player', 'Guest org', startedAt + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-decisions' }, startedAt);
    manager.tick(startedAt + 61_000);
    confirmManagerMaps(manager, code, [host.participantId, guest.participantId], startedAt + 61_000);
    let now = manager.getSnapshot(code, host.participantId, startedAt + 61_001).tournament!.liveCursor!.nextRoundAt!;
    manager.tick(now);
    // Human vs bot: the veto is automatic, but the human still picks the side when the bot picked the map.
    let live = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor?.primarySeries;
    expect(live?.veto?.steps.length).toBeGreaterThanOrEqual(7);
    expect(live?.veto?.turnTeamId).toBeNull();
    let decision = live?.decision ?? null;
    for (let index = 0; index < 40 && !decision; index += 1) {
      now += 200;
      manager.tick(now);
      live = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor?.primarySeries;
      decision = live?.decision ?? null;
    }
    expect(decision?.teamId).toBe(host.participantId);
    const seriesId = live!.series.id;
    if (decision?.kind === 'side') {
      const roundsBefore = live!.visibleRounds;
      now += 5_000;
      manager.tick(now);
      live = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor?.primarySeries;
      expect(live?.visibleRounds).toBe(roundsBefore);
      const others = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor?.overviewSeries.filter((series) => series.id !== seriesId) ?? [];
      expect(others.some((series) => series.liveMap && series.liveMap.a + series.liveMap.b > 0)).toBe(true);
      expect(() => manager.execute(code, guest.participantId, { type: 'pick-side', requestId: 'side-guest', seriesId, side: 'ct' }, now)).toThrowError(/not yours/);
      manager.execute(code, host.participantId, { type: 'pick-side', requestId: 'side-host', seriesId, side: 'ct' }, now);
      live = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor?.primarySeries;
      expect(live?.decision).toBeNull();
      expect(live?.sideA).toBe('ct');
    } else {
      // The human picked the map, so the bot chose the side and the first prompt is the eco call after a lost pistol.
      expect(decision?.kind).toBe('eco-call');
      expect(live?.series.maps[0]?.pickedBy).toBe(host.participantId);
    }

    // After the pistol round the loser gets an eco call; when it is the human, the call is applied to round two.
    let ecoDecision = null as typeof live extends infer T ? (T extends { decision: infer D } ? D : never) : never;
    for (let index = 0; index < 40 && !ecoDecision; index += 1) {
      now += 200;
      manager.tick(now);
      live = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor?.primarySeries;
      if (live?.decision?.kind === 'eco-call') ecoDecision = live.decision;
      if ((live?.visibleRounds ?? 0) >= 2) break;
    }
    let timeoutUsed = false;
    if (ecoDecision?.kind === 'eco-call') {
      // The prompt follows whichever pistol the human lost: round 2, or round 14 when the first-half pistol was won.
      expect(ecoDecision).toMatchObject({ kind: 'eco-call', teamId: host.participantId });
      expect([2, 14]).toContain(ecoDecision.roundNumber);
      expect(() => manager.execute(code, host.participantId, { type: 'call-timeout', requestId: 'timeout-early', seriesId }, now)).not.toThrow();
      timeoutUsed = true;
      manager.execute(code, host.participantId, { type: 'eco-call', requestId: 'eco-host', seriesId, call: 'force' }, now);
      now += 200;
      manager.tick(now);
      live = manager.getSnapshot(code, host.participantId, now).tournament?.liveCursor?.primarySeries;
      const { mapIndex, roundNumber } = ecoDecision;
      const called = live?.series.maps[mapIndex]?.details?.find((detail) => detail.number === roundNumber);
      expect(called?.economy.a.buy).toBe('force');
      expect(called?.timeout).toBe('a');
      expect(called?.timeoutTiming).toMatch(/^(window|early|late)$/);
    }
    // One tactical timeout per half: the second request of the half is refused.
    if (!timeoutUsed) expect(() => manager.execute(code, host.participantId, { type: 'call-timeout', requestId: 'timeout-1', seriesId }, now)).not.toThrow();
    expect(() => manager.execute(code, host.participantId, { type: 'call-timeout', requestId: 'timeout-2', seriesId }, now)).toThrowError(/timeout/i);
    expect(() => manager.execute(code, host.participantId, { type: 'pick-side', requestId: 'side-late', seriesId: 'nope', side: 'ct' }, now)).toThrowError(/not yours/);
  });

  it('lets only the host start a tournament round in manual mode', () => {
    const manager = new RoomManager();
    const startedAt = 2_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 2, draftDeadlineSeconds: 60, simulationMode: 'manual', simulationSpeed: 'fast' }, startedAt);
    const host = manager.join(code, 'Host player', 'Host org', startedAt);
    const guest = manager.join(code, 'Guest player', 'Guest org', startedAt + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-manual-01' }, startedAt);
    manager.tick(startedAt + 61_000);
    confirmManagerMaps(manager, code, [host.participantId, guest.participantId], startedAt + 61_000);

    expect(manager.getSnapshot(code, guest.participantId, startedAt + 61_000).tournament?.liveCursor).toMatchObject({ status: 'waiting_host', nextRoundAt: null });
    expect(() => manager.execute(code, guest.participantId, { type: 'advance-round', requestId: 'advance-guest-01' }, startedAt + 61_010)).toThrowError(RoomError);
    expect(() => manager.execute(code, host.participantId, { type: 'veto-action', requestId: 'veto-before-start', seriesId: 'x', action: 'ban', mapId: 'mirage' }, startedAt + 61_010)).toThrowError(/No series is live/);

    manager.execute(code, host.participantId, { type: 'advance-round', requestId: 'advance-host-001' }, startedAt + 61_010);
    const started = manager.getSnapshot(code, guest.participantId, startedAt + 61_010).tournament?.liveCursor;
    expect(started).toMatchObject({ status: 'live', nextRoundAt: null });
    expect(started?.overviewSeries.every((series) => series.status === 'live')).toBe(true);
    const botSeries = started?.overviewSeries.find((series) => series.teamA.id.startsWith('bot-') && series.teamB.id.startsWith('bot-'));
    expect(botSeries).toBeDefined();
    manager.tick(startedAt + 61_010 + 1_200);
    manager.tick(startedAt + 61_010 + 2_400);
    const later = manager.getSnapshot(code, guest.participantId, startedAt + 61_010 + 2_400).tournament?.liveCursor;
    expect(later?.overviewSeries.find((series) => series.id === botSeries?.id)?.liveMap?.a).toBeDefined();
  });

  it.each([{ capacity: 2, mode: 'max_fun' }, { capacity: 16, mode: 'fun' }] as const)('keeps $capacity clients on protocol 8 with synchronized valid $mode pools', async ({ capacity, mode }) => {
    const server = await startServer();
    const roomCode = await createRoom(server, capacity, mode);
    const clients = await Promise.all(Array.from({ length: capacity }, () => TestClient.connect(`${server.wsUrl}/rooms/${roomCode}`)));

    for (let index = 0; index < clients.length; index += 1) {
      clients[index].send({
        type: 'join',
        requestId: `join-${index.toString().padStart(4, '0')}`,
        protocolVersion: PROTOCOL_VERSION,
        dataHash: ONLINE_DATA_HASH,
        playerName: `Player ${index + 1}`,
        organizationName: `Org ${index + 1}`
      });
      await clients[index].waitFor((message) => message.type === 'ack' && message.requestId === `join-${index.toString().padStart(4, '0')}`);
    }

    clients[0].send({ type: 'start', requestId: 'start-0001' });
    await clients[0].waitFor((message) => message.type === 'ack' && message.requestId === 'start-0001');
    server.advance(61_000);

    const snapshots = await Promise.all(clients.map(async (client) => {
      // After the pick deadline the room stays in draft with a confirmation window for roles and maps.
      const message = await client.waitFor((candidate) => candidate.type === 'snapshot' && candidate.snapshot.phase === 'draft' && candidate.snapshot.deadlineStage === 'confirmation');
      if (message.type !== 'snapshot') throw new Error('Expected snapshot');
      return message.snapshot;
    }));
    expect(snapshots.every((snapshot) => snapshot.version === snapshots[0].version)).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.protocolVersion === 9 && snapshot.config.mode === mode)).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.capabilities.season === true && snapshot.season === null && snapshot.config.seasonRuns === 1)).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.tournament === null && snapshot.deadlineAt !== null)).toBe(true);
    expect(snapshots.map((snapshot) => snapshot.participants.length)).toEqual(Array(capacity).fill(capacity));
    for (const snapshot of snapshots) {
      expect(snapshot.self?.lineup).toHaveLength(5);
      expect(snapshot.self?.mapPreferences).toEqual([]);
      for (const pick of snapshot.self?.lineup ?? []) {
        const player = players.find((candidate) => candidate.id === pick.playerId);
        const team = teams.find((candidate) => candidate.id === player?.teamId);
        const average = team ? getHistoricalTeamOverall(team, players) : null;
        expect(average).not.toBeNull();
        expect(mode === 'fun' ? average! >= 82 : average! >= 90 || average! <= 80).toBe(true);
      }
    }
  }, 20_000);

  it('rejects an obsolete protocol after the protocol 8 upgrade', async () => {
    const server = await startServer();
    const roomCode = await createRoom(server, 2);
    const client = await TestClient.connect(`${server.wsUrl}/rooms/${roomCode}`);
    client.send({ type: 'join', requestId: 'join-old-protocol', protocolVersion: 3, dataHash: ONLINE_DATA_HASH, playerName: 'Old client', organizationName: 'Old org' });
    const error = await client.waitFor((message) => message.type === 'error');
    expect(error).toMatchObject({ type: 'error', code: 'PROTOCOL_MISMATCH' });
  });

  it('resumes within the TTL and migrates the host to the oldest connected participant', async () => {
    const server = await startServer();
    const roomCode = await createRoom(server, 2);
    const host = await TestClient.connect(`${server.wsUrl}/rooms/${roomCode}`);
    const second = await TestClient.connect(`${server.wsUrl}/rooms/${roomCode}`);
    host.send({ type: 'join', requestId: 'join-host', protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, playerName: 'Host player', organizationName: 'Host org' });
    const hostAck = await host.waitFor((message) => message.type === 'ack' && message.requestId === 'join-host');
    second.send({ type: 'join', requestId: 'join-second', protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, playerName: 'Second player', organizationName: 'Second org' });
    await second.waitFor((message) => message.type === 'ack' && message.requestId === 'join-second');
    host.socket.close();
    const migrated = await second.waitFor((message) => message.type === 'snapshot' && message.snapshot.participants.some((participant) => participant.organizationName === 'Second org' && participant.host));
    expect(migrated.type).toBe('snapshot');

    if (hostAck.type !== 'ack' || !hostAck.resumeToken) throw new Error('Missing resume token');
    const resumed = await TestClient.connect(`${server.wsUrl}/rooms/${roomCode}`);
    resumed.send({ type: 'resume', requestId: 'resume-0001', protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, resumeToken: hostAck.resumeToken });
    const resumeAck = await resumed.waitFor((message) => message.type === 'ack' && message.requestId === 'resume-0001');
    expect(resumeAck.type).toBe('ack');
  });

  it('assigns host to the first participant who resumes an entirely disconnected room', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(DEFAULT_ROOM_CONFIG, 10_000);
    const first = manager.join(code, 'First player', 'First org', 10_000);
    const second = manager.join(code, 'Second player', 'Second org', 10_001);
    manager.disconnect(code, first.participantId, 11_000);
    manager.disconnect(code, second.participantId, 11_001);
    expect(manager.getSnapshot(code, first.participantId, 11_001).hostParticipantId).toBeNull();

    manager.resume(code, first.resumeToken, 12_000);
    expect(manager.getSnapshot(code, first.participantId, 12_000).hostParticipantId).toBe(first.participantId);
  });

  it('accepts reconnection before the TTL and rejects it at the exact expiration boundary', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(DEFAULT_ROOM_CONFIG, 10_000);
    const participant = manager.join(code, 'Player name', 'Organization', 10_000);
    manager.disconnect(code, participant.participantId, 11_000);
    expect(manager.resume(code, participant.resumeToken, 11_000 + RESUME_TTL_MS - 1).participantId).toBe(participant.participantId);

    manager.disconnect(code, participant.participantId, 20_000 + RESUME_TTL_MS);
    expect(() => manager.resume(code, participant.resumeToken, 20_000 + RESUME_TTL_MS * 2))
      .toThrowError(expect.objectContaining({ code: 'RESUME_EXPIRED' }));
  });

  it('preserves five PRO picks after three seconds and across reconnection while waiting for atomic roles and maps', () => {
    const manager = new RoomManager();
    const startedAt = 20_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, mode: 'pro', capacity: 2, draftDeadlineSeconds: 60 }, startedAt);
    const host = manager.join(code, 'PRO host', 'PRO org', startedAt);
    manager.join(code, 'PRO guest', 'Guest org', startedAt + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-pro-fix' }, startedAt + 2);

    for (let index = 0; index < 5; index += 1) {
      manager.execute(code, host.participantId, { type: 'draw-team', requestId: `pro-draw-${index}` }, startedAt + 10 + index * 2);
      const offerId = manager.getSnapshot(code, host.participantId, startedAt + 10 + index * 2).self?.rolledTeamId;
      const player = players.find((candidate) => candidate.teamId === offerId);
      if (!player) throw new Error('Expected a PRO offer player');
      manager.execute(code, host.participantId, { type: 'pick-player', requestId: `pro-pick-${index}`, playerId: player.id }, startedAt + 11 + index * 2);
    }
    const picked = manager.getSnapshot(code, host.participantId, startedAt + 20).self?.proPickedPlayerIds ?? [];
    manager.tick(startedAt + 3_000);
    expect(manager.getSnapshot(code, host.participantId, startedAt + 3_000).self?.proPickedPlayerIds).toEqual(picked);
    expect(manager.getSnapshot(code, host.participantId, startedAt + 3_000).self?.lineup).toEqual([]);

    const selected = picked.map((id) => players.find((player) => player.id === id)!).filter(Boolean);
    const assignments = findBestProAssignments(selected);
    manager.execute(code, host.participantId, { type: 'configure-pro', requestId: 'configure-pro-atomic', style: 'tactical', assignments }, startedAt + 3_010);
    manager.execute(code, host.participantId, {
      type: 'submit-map-preferences', requestId: 'submit-pro-maps', mapPreferences: getDefaultMapSelection(selected, teams)
    }, startedAt + 3_020);
    manager.disconnect(code, host.participantId, startedAt + 3_030);
    manager.resume(code, host.resumeToken, startedAt + 3_040);
    const resumed = manager.getSnapshot(code, host.participantId, startedAt + 3_040);
    expect(resumed.self?.proPickedPlayerIds).toEqual(picked);
    expect(resumed.self?.proRoleAssignments).toEqual(assignments);
    expect(resumed.self?.mapPreferences).toHaveLength(3);

    manager.tick(startedAt + 61_000);
    const afterDeadline = manager.getSnapshot(code, host.participantId, startedAt + 61_000);
    expect(afterDeadline.phase).toBe('draft');
    expect(afterDeadline.self?.proPickedPlayerIds).toEqual(picked);
    expect(afterDeadline.self?.proRoleAssignments).toEqual(assignments);
  });

  it('recalculates readiness after an incomplete disconnected participant expires', () => {
    const manager = new RoomManager();
    const now = 40_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 3, draftDeadlineSeconds: 60 }, now);
    const host = manager.join(code, 'Host', 'Host org', now);
    const readyGuest = manager.join(code, 'Ready', 'Ready org', now + 1);
    const staleGuest = manager.join(code, 'Stale', 'Stale org', now + 2);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-ttl-ready' }, now + 3);
    manager.tick(now + 61_000);
    confirmManagerMaps(manager, code, [host.participantId, readyGuest.participantId], now + 61_000);
    expect(manager.getSnapshot(code, host.participantId, now + 61_010).phase).toBe('draft');
    manager.disconnect(code, staleGuest.participantId, now + 61_020);
    manager.tick(now + 61_020 + RESUME_TTL_MS);
    const started = manager.getSnapshot(code, host.participantId, now + 61_020 + RESUME_TTL_MS);
    expect(started.participants).toHaveLength(2);
    expect(started.phase).toBe('playoffs');
  });

  it('rejects a mismatched dataset before joining', async () => {
    const server = await startServer();
    const roomCode = await createRoom(server, 2);
    const client = await TestClient.connect(`${server.wsUrl}/rooms/${roomCode}`);
    client.send({ type: 'join', requestId: 'join-wrong', protocolVersion: PROTOCOL_VERSION, dataHash: '00000000', playerName: 'Player name', organizationName: 'Organization' });
    const error = await client.waitFor((message) => message.type === 'error');
    expect(error).toMatchObject({ type: 'error', code: 'DATA_MISMATCH' });
  });

  it('returns a draft to the lobby when fewer than two participants remain', () => {
    const manager = new RoomManager();
    const now = 50_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 2, draftDeadlineSeconds: 60 }, now);
    const host = manager.join(code, 'Host player', 'Host org', now);
    const guest = manager.join(code, 'Guest player', 'Guest org', now + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-lobby-return' }, now + 2);
    manager.disconnect(code, guest.participantId, now + 3);
    expect(manager.getSnapshot(code, host.participantId, now + 4).phase).toBe('draft');

    manager.tick(now + 3 + RESUME_TTL_MS);
    const snapshot = manager.getSnapshot(code, host.participantId, now + 3 + RESUME_TTL_MS);
    expect(snapshot.phase).toBe('lobby');
    expect(snapshot.deadlineAt).toBeNull();
    expect(snapshot.participants).toHaveLength(1);
    expect(manager.join(code, 'New guest', 'New org', now + 5 + RESUME_TTL_MS).participantId).toBeTruthy();
  });

  it('opens a confirmation window after the pick deadline and then fills missing PRO roles and maps', () => {
    const manager = new RoomManager();
    const startedAt = 70_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, mode: 'pro', capacity: 2, draftDeadlineSeconds: 60 }, startedAt);
    const host = manager.join(code, 'PRO host', 'PRO org', startedAt);
    const guest = manager.join(code, 'PRO guest', 'Guest org', startedAt + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-confirmation' }, startedAt + 2);

    manager.tick(startedAt + 61_000);
    const afterPicks = manager.getSnapshot(code, host.participantId, startedAt + 61_000);
    expect(afterPicks.phase).toBe('draft');
    expect(afterPicks.deadlineStage).toBe('confirmation');
    expect(afterPicks.deadlineAt).toBe(startedAt + 61_000 + CONFIRMATION_GRACE_MS);
    expect(afterPicks.self?.proPickedPlayerIds).toHaveLength(5);
    expect(afterPicks.self?.lineup).toEqual([]);
    expect(afterPicks.participants.find((participant) => participant.id === guest.participantId)?.mapsConfirmed).toBe(false);

    const picked = afterPicks.self?.proPickedPlayerIds ?? [];
    const selected = picked.map((id) => players.find((player) => player.id === id)!).filter(Boolean);
    const assignments = findBestProAssignments(selected);
    manager.execute(code, host.participantId, { type: 'configure-pro', requestId: 'configure-pro-host', style: 'aggressive', assignments }, startedAt + 62_000);

    manager.tick(startedAt + 61_000 + CONFIRMATION_GRACE_MS);
    const started = manager.getSnapshot(code, host.participantId, startedAt + 61_000 + CONFIRMATION_GRACE_MS);
    expect(started.phase).not.toBe('draft');
    expect(started.tournament).not.toBeNull();
    expect(started.deadlineAt).toBeNull();
    expect(started.self?.proRoleAssignments).toEqual(assignments);
    expect(started.self?.style).toBe('aggressive');
    expect(started.self?.mapPreferences).toHaveLength(3);
    const guestView = manager.getSnapshot(code, guest.participantId, startedAt + 61_000 + CONFIRMATION_GRACE_MS);
    expect(guestView.self?.lineup).toHaveLength(5);
    expect(new Set(Object.values(guestView.self?.proRoleAssignments ?? {})).size).toBe(5);
    expect(guestView.self?.mapPreferences).toHaveLength(3);
  });

  it('hides other participants map preferences while exposing confirmation state', () => {
    const manager = new RoomManager();
    const now = 90_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 2, draftDeadlineSeconds: 60 }, now);
    const host = manager.join(code, 'Host player', 'Host org', now);
    const guest = manager.join(code, 'Guest player', 'Guest org', now + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-privacy' }, now + 2);
    manager.tick(now + 61_000);
    const hostView = manager.getSnapshot(code, host.participantId, now + 61_000);
    const selected = (hostView.self?.lineup ?? []).map((pick) => players.find((player) => player.id === pick.playerId)!);
    manager.execute(code, host.participantId, { type: 'submit-map-preferences', requestId: 'maps-privacy', mapPreferences: getDefaultMapSelection(selected, teams) }, now + 62_000);
    const guestView = manager.getSnapshot(code, guest.participantId, now + 62_000);
    const hostAsSeenByGuest = guestView.participants.find((participant) => participant.id === host.participantId);
    expect(hostAsSeenByGuest?.mapsConfirmed).toBe(true);
    expect(hostAsSeenByGuest?.mapPreferences).toEqual([]);
    expect(manager.getSnapshot(code, host.participantId, now + 62_000).participants.find((participant) => participant.id === host.participantId)?.mapPreferences).toHaveLength(3);
  });

  it('re-executes a retried command whose first attempt failed instead of acknowledging a duplicate', () => {
    const manager = new RoomManager();
    const now = 100_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 2 }, now);
    const host = manager.join(code, 'Host player', 'Host org', now);
    expect(() => manager.execute(code, host.participantId, { type: 'start', requestId: 'start-retry' }, now + 1)).toThrow(RoomError);
    manager.join(code, 'Guest player', 'Guest org', now + 2);
    expect(manager.execute(code, host.participantId, { type: 'start', requestId: 'start-retry' }, now + 3)).toEqual({ duplicate: false });
    expect(manager.getSnapshot(code, host.participantId, now + 3).phase).toBe('draft');
    expect(manager.execute(code, host.participantId, { type: 'start', requestId: 'start-retry' }, now + 4)).toEqual({ duplicate: true });
  });

  it('answers room lookups so clients can distinguish a missing room from an unreachable server', async () => {
    const server = await startServer();
    const roomCode = await createRoom(server, 2);
    const found = await fetch(`${server.baseUrl}/rooms/${roomCode.toLowerCase()}`, { headers: { origin: 'http://localhost:5173' } });
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ ok: true, roomCode });
    const missing = await fetch(`${server.baseUrl}/rooms/ZZZZZZZZ`, { headers: { origin: 'http://localhost:5173' } });
    expect(missing.status).toBe(404);
  });
  it('brings secret players into Resenha lineups and lets Vargão Academy pick three of them', () => {
    const manager = new RoomManager();
    const startedAt = 9_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, mode: 'fun', entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, startedAt);
    const host = manager.join(code, 'Midowz', 'Org A', startedAt);
    const guest = manager.join(code, 'Guest', 'Vargão Academy', startedAt + 1);
    expect(manager.getSnapshot(code, host.participantId, startedAt).capabilities.secretPlayers).toBe(true);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-secret' }, startedAt + 2);

    // The host's alias is already in the lineup; the Academy starts empty with three secret picks to spend.
    const hostSelf = manager.getSnapshot(code, host.participantId, startedAt + 3).self!;
    expect(hostSelf.lineup).toEqual([{ playerId: 'secret-midowz', selectedSlotRole: 'lurker' }]);
    expect(hostSelf.secretPicksLeft).toBe(0);
    expect(manager.getSnapshot(code, host.participantId, startedAt + 3).participants.find((participant) => participant.id === host.participantId)?.picksCompleted).toBe(1);
    expect(() => manager.execute(code, host.participantId, { type: 'pick-secret', requestId: 'host-secret', alias: 'Vargas', role: 'igl' }, startedAt + 4)).toThrow(RoomError);
    const guestSelf = manager.getSnapshot(code, guest.participantId, startedAt + 3).self!;
    expect(guestSelf.lineup).toEqual([]);
    expect(guestSelf.secretPicksLeft).toBe(3);
    manager.execute(code, guest.participantId, { type: 'set-style', requestId: 'guest-style', style: 'balanced' }, startedAt + 4);
    manager.execute(code, guest.participantId, { type: 'pick-secret', requestId: 'guest-secret-1', alias: 'Vargas', role: 'igl' }, startedAt + 5);
    manager.execute(code, guest.participantId, { type: 'pick-secret', requestId: 'guest-secret-2', alias: 'Raf4Moon', role: 'rifler' }, startedAt + 6);
    manager.execute(code, guest.participantId, { type: 'pick-secret', requestId: 'guest-secret-3', alias: 'H1ro', role: 'awper' }, startedAt + 7);
    expect(() => manager.execute(code, guest.participantId, { type: 'pick-secret', requestId: 'guest-secret-4', alias: 'Gveds', role: 'lurker' }, startedAt + 8)).toThrow(RoomError);
    expect(manager.getSnapshot(code, guest.participantId, startedAt + 8).self?.lineup.map((pick) => pick.playerId)).toEqual(['secret-vargas', 'secret-raf4moon', 'secret-h1ro']);
    expect(manager.getSnapshot(code, guest.participantId, startedAt + 8).self?.secretPicksLeft).toBe(0);

    // The deadline autocompletes around the secret players and the run finishes with them in the statistics.
    manager.tick(startedAt + 61_000);
    for (const id of [host.participantId, guest.participantId]) {
      const lineup = manager.getSnapshot(code, id, startedAt + 61_000).self!.lineup;
      expect(lineup).toHaveLength(5);
      expect(lineup.filter((pick) => pick.playerId.startsWith('secret-')).length).toBe(id === host.participantId ? 1 : 3);
    }
    confirmManagerMaps(manager, code, [host.participantId, guest.participantId], startedAt + 61_000);
    let now = startedAt + 61_000;
    let snapshot = manager.getSnapshot(code, host.participantId, now);
    for (let index = 0; index < 4_000 && snapshot.phase !== 'completed'; index += 1) {
      now += 200;
      manager.tick(now);
      snapshot = manager.getSnapshot(code, host.participantId, now);
    }
    expect(snapshot.phase).toBe('completed');
    expect(snapshot.selfResult?.stats).toHaveLength(5);
    expect(snapshot.selfResult?.stats.some((stat) => stat.playerId === 'secret-midowz')).toBe(true);

    // PolexTV starts with its whole hidden team and only has to pick maps.
    const polexRoom = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, mode: 'max_fun', entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: 60 }, startedAt);
    const polexHost = manager.join(polexRoom, 'Streamer', 'PolexTV', startedAt);
    manager.join(polexRoom, 'Guest', 'Org B', startedAt + 1);
    manager.execute(polexRoom, polexHost.participantId, { type: 'start', requestId: 'start-polex' }, startedAt + 2);
    const polexSelf = manager.getSnapshot(polexRoom, polexHost.participantId, startedAt + 3).self!;
    expect(polexSelf.lineup.map((pick) => pick.playerId)).toEqual(['secret-polex', 'secret-caps', 'secret-paulinhho', 'secret-nerdzito', 'secret-breitan']);
    expect(polexSelf.secretPicksLeft).toBe(0);
    expect(manager.getSnapshot(polexRoom, polexHost.participantId, startedAt + 3).participants.find((participant) => participant.id === polexHost.participantId)?.picksCompleted).toBe(5);

    // Outside the Resenha queues the same names mean nothing.
    const plain = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: 60 }, startedAt);
    const plainHost = manager.join(plain, 'Midowz', 'Org A', startedAt);
    manager.join(plain, 'Guest', 'Vargão Academy', startedAt + 1);
    manager.execute(plain, plainHost.participantId, { type: 'start', requestId: 'start-plain' }, startedAt + 2);
    expect(manager.getSnapshot(plain, plainHost.participantId, startedAt + 3).self?.lineup).toEqual([]);
  });
});

/** Both humans joined through sockets and the tournament paired: only `resync`, ticks and decisions remain. */
async function startPairedTournament(options: Partial<OnlineServerOptions>, seed: string) {
  const manager = new RoomManager();
  const server = await startServer({ ...options, manager });
  const startedAt = 5_000;
  const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, startedAt, seed);
  const host = await TestClient.connect(`${server.wsUrl}/rooms/${code}`);
  const guest = await TestClient.connect(`${server.wsUrl}/rooms/${code}`);
  host.send({ type: 'join', requestId: 'join-host-00001', protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, playerName: 'Host player', organizationName: 'Host org' });
  await host.waitFor((message) => message.type === 'ack' && message.requestId === 'join-host-00001');
  guest.send({ type: 'join', requestId: 'join-guest-0001', protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, playerName: 'Guest player', organizationName: 'Guest org' });
  await guest.waitFor((message) => message.type === 'ack' && message.requestId === 'join-guest-0001');
  host.send({ type: 'start', requestId: 'start-live-00001' });
  await host.waitFor((message) => message.type === 'ack' && message.requestId === 'start-live-00001');
  const hostId = (await host.waitFor((message) => message.type === 'snapshot' && message.snapshot.phase === 'draft') as { snapshot: RoomSnapshot }).snapshot.self!.participantId;
  const guestId = (await guest.waitFor((message) => message.type === 'snapshot' && message.snapshot.phase === 'draft') as { snapshot: RoomSnapshot }).snapshot.self!.participantId;
  server.advance(61_000);
  await host.waitFor((message) => message.type === 'snapshot' && message.snapshot.deadlineStage === 'confirmation');
  confirmManagerMaps(manager, code, [hostId, guestId], server.now());
  const paired = await host.waitFor((message) => message.type === 'snapshot' && message.snapshot.tournament !== null);
  await guest.waitFor((message) => message.type === 'snapshot' && message.snapshot.tournament !== null);
  return { manager, server, code, host, guest, hostId, guestId, paired: paired as { type: 'snapshot'; snapshot: RoomSnapshot } };
}

const isLive = (message: ServerMessage): message is { type: 'live'; live: import('../src/lib/game/online/contracts').LiveUpdate } => message.type === 'live';

/** Moves the fake clock in steps, letting the real 100 ms tick run between them, until the client saw what it waits for. */
async function advanceUntil(server: RunningServer, client: TestClient, predicate: (message: ServerMessage) => boolean, stepMs: number, maxSteps = 60): Promise<ServerMessage> {
  for (let step = 0; step < maxSteps; step += 1) {
    const match = client.received().find(predicate);
    if (match) return match;
    server.advance(stepMs);
    await TestClient.settle(120);
  }
  return client.waitFor(predicate, 1_000);
}

describe('live updates over the socket', () => {
  it('streams live updates between snapshots once the tournament runs and answers resync with a snapshot', async () => {
    const { server, host, guest, paired } = await startPairedTournament({}, seedWhereHumans(8, false));
    const before = host.received().length;
    const started = await advanceUntil(server, host, (message) => isLive(message) && message.live.cursor.status === 'live', ROUND_GAP_MS + 100, 5);
    expect(isLive(started) && started.live.version).toBeGreaterThan(paired.snapshot.version);
    // Rounds are played at ultra speed (decisions against bots expire on the clock): each one arrives as a live update, never as a snapshot.
    const played = await advanceUntil(server, host, (message) => isLive(message) && (message.live.cursor.primarySeries?.visibleRounds ?? 0) >= 3, 2_000);
    const upToPlayed = host.received().slice(before, host.received().indexOf(played) + 1);
    expect(upToPlayed.filter(isLive).length).toBeGreaterThanOrEqual(2);
    expect(upToPlayed.filter((message) => message.type === 'snapshot')).toHaveLength(0);
    const playedPrimary = isLive(played) ? played.live.cursor.primarySeries! : null;
    expect(playedPrimary?.series.maps[playedPrimary.activeMap]?.details?.length).toBeGreaterThan(0);
    expect(playedPrimary?.series.teamA.power).toBe(0);

    // The kill feed arrives without gaps across the live updates of the same map.
    const numbers = new Set<number>();
    for (const message of upToPlayed) {
      if (!isLive(message) || !message.live.cursor.primarySeries) continue;
      const primary = message.live.cursor.primarySeries;
      if (primary.activeMap !== playedPrimary!.activeMap) continue;
      for (const detail of primary.series.maps[primary.activeMap]?.details ?? []) numbers.add(detail.number);
    }
    const lastRound = playedPrimary!.visibleRounds;
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: lastRound }, (_, index) => index + 1));

    // A resync brings the whole room back to the one who asked, and nobody else.
    const guestSnapshots = guest.received().filter((message) => message.type === 'snapshot').length;
    host.send({ type: 'resync', requestId: 'resync-000001' });
    const ack = await host.waitFor((message) => message.type === 'ack' && message.requestId === 'resync-000001');
    const resynced = await host.waitFor((message) => message.type === 'snapshot' && message.snapshot.version >= (ack as { version: number }).version);
    const resyncedPrimary = resynced.type === 'snapshot' ? resynced.snapshot.tournament?.liveCursor?.primarySeries ?? null : null;
    expect(resyncedPrimary?.series.maps[resyncedPrimary.activeMap]?.details?.length).toBeGreaterThanOrEqual(1);
    await TestClient.settle(250);
    expect(guest.received().filter((message) => message.type === 'snapshot')).toHaveLength(guestSnapshots);
  }, 20_000);

  it('skips live updates while the socket is backed up, never skips snapshots, and delivers the pending decision once it drains', async () => {
    let buffered = 0;
    const { server, host, guest, hostId } = await startPairedTournament({ liveBackpressureBytes: 1_024, bufferedAmountOf: () => buffered }, seedWhereHumans(8, true));
    buffered = 4_096;
    const beforeLaunch = host.received().length;
    server.advance(ROUND_GAP_MS + 100);
    await TestClient.settle(400);
    expect(host.received().slice(beforeLaunch).filter(isLive)).toHaveLength(0);

    // A state change still reaches everybody as a snapshot, no matter how backed up the socket is.
    host.send({ type: 'configure-simulation', requestId: 'speed-fast-0001', simulationSpeed: 'fast' });
    const snapshot = await host.waitFor((message) => message.type === 'snapshot' && message.snapshot.config.simulationSpeed === 'fast');
    await guest.waitFor((message) => message.type === 'snapshot' && message.snapshot.config.simulationSpeed === 'fast');
    expect(snapshot.type === 'snapshot' && snapshot.snapshot.tournament?.liveCursor?.status).toBe('live');
    expect(snapshot.type === 'snapshot' && snapshot.snapshot.self?.pendingDecision?.kind).toBe('veto');
    expect(host.received().slice(beforeLaunch).filter(isLive)).toHaveLength(0);

    // Once the socket drains, the next tick delivers the current state including the decision the host owes.
    host.send({ type: 'veto-action', requestId: 'veto-live-00001', seriesId: snapshot.type === 'snapshot' ? snapshot.snapshot.self!.pendingDecision!.seriesId : '', action: 'ban', mapId: snapshot.type === 'snapshot' ? snapshot.snapshot.tournament!.liveCursor!.primarySeries!.veto!.available[0] : 'mirage' });
    await host.waitFor((message) => message.type === 'ack' && message.requestId === 'veto-live-00001');
    await TestClient.settle(300);
    expect(host.received().slice(beforeLaunch).filter(isLive)).toHaveLength(0);
    buffered = 0;
    const drained = await guest.waitFor((message) => isLive(message) && message.live.pendingDecision?.kind === 'veto');
    expect(isLive(drained) && drained.live.cursor.primarySeries?.veto?.steps).toHaveLength(1);
    expect(isLive(drained) && drained.live.cursor.primarySeries?.veto?.turnTeamId).not.toBe(hostId);
    const hostLive = await host.waitFor(isLive);
    expect(isLive(hostLive) && hostLive.live.pendingDecision).toBeNull();
  }, 20_000);
});
