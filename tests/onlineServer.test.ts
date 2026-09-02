import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createOnlineServer } from '../server/app';
import { ONLINE_DATA_HASH, players, teams } from '../server/data';
import { RESUME_TTL_MS, RoomError, RoomManager } from '../server/room-manager';
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
}

const servers: RunningServer[] = [];

async function startServer(): Promise<RunningServer> {
  let clock = Date.now();
  const app = createOnlineServer({ allowedOrigins: ['http://localhost:5173'], now: () => clock });
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
    advance: (milliseconds: number) => { clock += milliseconds; }
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

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function confirmManagerMaps(manager: RoomManager, code: string, participantIds: string[], now: number) {
  participantIds.forEach((participantId, index) => {
    const lineup = manager.getSnapshot(code, participantId, now).self?.lineup ?? [];
    const selected = lineup.map((pick) => players.find((player) => player.id === pick.playerId)!).filter(Boolean);
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

  it('reveals one synchronized CS round at a time without leaking the result', () => {
    const manager = new RoomManager();
    const startedAt = 1_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 2, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, startedAt);
    const host = manager.join(code, 'Host player', 'Host org', startedAt);
    const guest = manager.join(code, 'Guest player', 'Guest org', startedAt + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-sync-0001' }, startedAt);

    manager.tick(startedAt + 61_000);
    confirmManagerMaps(manager, code, [host.participantId, guest.participantId], startedAt + 61_000);
    const waiting = manager.getSnapshot(code, host.participantId, startedAt + 61_000);
    expect(waiting.tournament?.rounds).toHaveLength(0);
    expect(waiting.tournament?.liveCursor).toMatchObject({ status: 'waiting', step: 0 });

    manager.tick(startedAt + 61_901);
    manager.tick(startedAt + 62_101);
    const hostSnapshot = manager.getSnapshot(code, host.participantId, startedAt + 62_101);
    const guestSnapshot = manager.getSnapshot(code, guest.participantId, startedAt + 62_101);
    const hostLive = hostSnapshot.tournament?.liveCursor;
    const guestLive = guestSnapshot.tournament?.liveCursor;

    expect(hostLive).toMatchObject({ status: 'live', step: 1 });
    expect(guestLive).toMatchObject({ status: 'live', step: 1 });
    expect(hostLive?.primarySeries?.series.id).toBe(guestLive?.primarySeries?.series.id);
    expect(hostLive?.primarySeries?.visibleRounds).toBe(1);
    expect(guestLive?.primarySeries?.visibleRounds).toBe(1);
    const hostRound = hostLive?.primarySeries?.series.maps[0]?.rounds[0];
    const guestRound = guestLive?.primarySeries?.series.maps[0]?.rounds[0];
    expect(hostRound).toEqual(guestRound ? { a: guestRound.b, b: guestRound.a, overtime: guestRound.overtime } : undefined);
    expect(hostLive?.primarySeries?.series.winnerId).toBe('');
    expect(hostLive?.overviewSeries.every((series) => series.scoreA === 0 && series.scoreB === 0)).toBe(true);
    expect(hostSnapshot.tournament?.rounds).toHaveLength(0);

    let cursorTime = startedAt + 62_100;
    let finishedSnapshot = hostSnapshot;
    for (let index = 0; index < 300 && !finishedSnapshot.tournament?.liveCursor?.primarySeries?.finished; index += 1) {
      cursorTime += 200;
      manager.tick(cursorTime);
      finishedSnapshot = manager.getSnapshot(code, host.participantId, cursorTime);
    }
    expect(finishedSnapshot.tournament?.liveCursor?.primarySeries?.finished).toBe(true);
    expect(finishedSnapshot.tournament?.liveCursor?.primarySeries?.series.winnerId).not.toBe('');
    expect(finishedSnapshot.tournament?.rounds).toHaveLength(0);
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

    expect(manager.getSnapshot(code, guest.participantId, startedAt + 61_000).tournament?.liveCursor).toMatchObject({ status: 'waiting_host', step: 0, nextTickAt: null });
    expect(() => manager.execute(code, guest.participantId, { type: 'advance-round', requestId: 'advance-guest-01' }, startedAt + 61_010)).toThrowError(RoomError);

    manager.execute(code, host.participantId, { type: 'advance-round', requestId: 'advance-host-001' }, startedAt + 61_010);
    const started = manager.getSnapshot(code, guest.participantId, startedAt + 61_010).tournament?.liveCursor;
    expect(started).toMatchObject({ status: 'live', step: 0, nextTickAt: startedAt + 62_210 });
    manager.tick(startedAt + 62_210);
    expect(manager.getSnapshot(code, guest.participantId, startedAt + 62_210).tournament?.liveCursor).toMatchObject({ status: 'live', step: 1 });
  });

  it.each([{ capacity: 2, mode: 'max_fun' }, { capacity: 16, mode: 'fun' }] as const)('keeps $capacity clients on protocol 4 with synchronized valid $mode pools', async ({ capacity, mode }) => {
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
      const message = await client.waitFor((candidate) => candidate.type === 'snapshot' && candidate.snapshot.phase === 'draft' && candidate.snapshot.deadlineAt === null);
      if (message.type !== 'snapshot') throw new Error('Expected snapshot');
      return message.snapshot;
    }));
    expect(snapshots.every((snapshot) => snapshot.version === snapshots[0].version)).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.protocolVersion === 4 && snapshot.config.mode === mode)).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.tournament === null)).toBe(true);
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

  it('rejects protocol 3 after the protocol 4 upgrade', async () => {
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
});
