import { appendFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createOnlineServer, type OnlineServerOptions } from '../server/app';
import { ONLINE_DATA_HASH } from '../server/data';
import { CONFIRMATION_GRACE_MS, ROUND_GAP_MS, RoomManager } from '../server/room-manager';
import { DEFAULT_ROOM_CONFIG, PROTOCOL_VERSION, type ServerMessage } from '../src/lib/game/online/contracts';

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

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('extended socket audit', () => {
  it.each([4, 8, 16].flatMap(count => [0, 1].map(repeat => ({count, repeat}))))('commands, resync and reconnect %j', async ({count, repeat}) => {
    const manager = new RoomManager();
    const server = await startServer({manager});
    const roomCode = manager.createRoom({...DEFAULT_ROOM_CONFIG, capacity:count, draftDeadlineSeconds:60, simulationSpeed:'ultra'}, server.now(), `socket-audit-${count}-${repeat}`);
    const clients: TestClient[] = [];
    const tokens: string[] = [];
    for(let index=0;index<count;index++) {
      const client = await TestClient.connect(`${server.wsUrl}/rooms/${roomCode}`);
      clients.push(client);
      client.send({type:'join',requestId:`audit-join-${index}`,protocolVersion:PROTOCOL_VERSION,dataHash:ONLINE_DATA_HASH,playerName:`Player ${index}`,organizationName:`Org ${index}`});
      const ack = await client.waitFor(m=>m.type==='ack' && m.requestId===`audit-join-${index}`);
      tokens.push(ack.type==='ack' ? ack.resumeToken! : '');
    }
    clients[0].send({type:'start',requestId:'audit-start'});
    await clients[0].waitFor(m=>m.type==='ack'&&m.requestId==='audit-start');
    server.advance(61_000); manager.tick(server.now());
    server.advance(CONFIRMATION_GRACE_MS+100); manager.tick(server.now());
    const initial = await Promise.all(clients.map(c=>c.waitFor(m=>m.type==='snapshot'&&m.snapshot.phase==='swiss')));
    expect(initial.every(m=>m.type==='snapshot'&&m.snapshot.participants.length===count)).toBe(true);
    server.advance(ROUND_GAP_MS+100); manager.tick(server.now());
    await Promise.all(clients.map(c=>c.waitFor(m=>m.type==='live'&&m.live.cursor.status==='live')));
    const latencies: number[] = [];
    for(let index=0;index<20;index++) {
      const requestId=`audit-speed-${index}`;
      const simulationSpeed=index%2 ? 'fast':'normal';
      const start=performance.now();
      clients[0].send({type:'configure-simulation',requestId,simulationSpeed});
      const ack=await clients[0].waitFor(m=>m.type==='ack'&&m.requestId===requestId);
      latencies.push(performance.now()-start);
      if(ack.type!=='ack')throw new Error('Missing ack');
      const snapshots=await Promise.all(clients.map(c=>c.waitFor(m=>m.type==='snapshot'&&m.snapshot.version===ack.version)));
      expect(snapshots.every(m=>m.type==='snapshot'&&m.snapshot.config.simulationSpeed===simulationSpeed)).toBe(true);
    }
    const peerSnapshots=clients[1].received().filter(m=>m.type==='snapshot').length;
    const ownSnapshots=clients[0].received().filter(m=>m.type==='snapshot').length;
    clients[0].send({type:'resync',requestId:'audit-resync'});
    await clients[0].waitFor(m=>m.type==='ack'&&m.requestId==='audit-resync');
    await TestClient.settle(150);
    expect(clients[0].received().filter(m=>m.type==='snapshot').length).toBe(ownSnapshots+1);
    expect(clients[1].received().filter(m=>m.type==='snapshot').length).toBe(peerSnapshots);
    const guest=clients[count-1];
    guest.socket.close();
    await new Promise<void>(resolve=>guest.socket.once('close',()=>resolve()));
    const resumed=await TestClient.connect(`${server.wsUrl}/rooms/${roomCode}`);
    resumed.send({type:'resume',requestId:'audit-resume',protocolVersion:PROTOCOL_VERSION,dataHash:ONLINE_DATA_HASH,resumeToken:tokens[count-1]});
    await resumed.waitFor(m=>m.type==='ack'&&m.requestId==='audit-resume');
    const restored=await resumed.waitFor(m=>m.type==='snapshot'&&m.snapshot.phase==='swiss');
    expect(restored.type==='snapshot'&&restored.snapshot.participants.every(p=>p.connected)).toBe(true);
    expect(clients.flatMap(c=>c.received()).filter(m=>m.type==='error')).toEqual([]);
    latencies.sort((a,b)=>a-b);
    if(process.env.ONLINE_SOCKET_REPORT)appendFileSync(process.env.ONLINE_SOCKET_REPORT,JSON.stringify({count,repeat,commands:latencies.length,p50Ms:latencies[10],p95Ms:latencies[18],maxMs:latencies.at(-1)})+'\n');
  },30_000);
});
