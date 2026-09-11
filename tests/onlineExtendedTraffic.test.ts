import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const baselinePath = process.env.ONLINE_AUDIT_BASELINE;
const BaselineManager = baselinePath ? createRequire(import.meta.url)(baselinePath).RoomManager : null;
const auditReport = process.env.ONLINE_AUDIT_REPORT;
import { advanceFeedCursor, feedKey, initialDelivery, planBroadcast, type DeliveryState } from '../server/broadcast';
import { players, teams } from '../server/data';
import { RoomManager } from '../server/room-manager';
import { DEFAULT_ROOM_CONFIG, type PublicLiveSeries, type ServerMessage } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';

const BACKPRESSURE_LIMIT = 64 * 1024;
const KB = 1024;

interface PlayerTraffic {
  bytes: number;
  largest: number;
  snapshots: number;
  lives: number;
  skipped: number;
  /** Kill-feed round numbers received per `seriesId:map`. */
  feed: Map<string, Set<number>>;
}

/**
 * A whole four-human tournament at ultra speed through the same delivery logic the server uses per connection
 * (`planBroadcast` + `advanceFeedCursor`), counting the JSON bytes each player would receive. With
 * `skipEveryOtherLive` the socket looks backed up on every other tick, as a slow connection would.
 */
function simulateTournament(options: { count: number; slow?: boolean; stall?: boolean; speed?: 'normal' | 'fast' | 'ultra'; repeat?: number; reconnect?: boolean }) {
  const manager = new RoomManager();
  const baseline = BaselineManager ? new BaselineManager() : null;
  let oldBytes = 0, oldLargest = 0, oldMs = 0, newMs = 0, oldMessages = 0;
  let stallKey: string | null = null, stalled = false, recovered = false, resumed = false;
  const oldByPlayer: number[] = Array(options.count).fill(0);
  const skipEveryOtherLive = options.slow ?? false;
  let now = 1_000_000;
  let requests = 0;
  const requestId = () => `traffic-${(requests++).toString().padStart(10, '0')}`;
  const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'stage3', capacity: options.count, draftDeadlineSeconds: 60, simulationMode: 'automatic', simulationSpeed: options.speed ?? 'ultra' }, now, `audit-${options.count}-${options.repeat ?? 0}`);
  const ids = Array.from({ length: options.count }, (_, index) => manager.join(code, `Player ${index}`, `Org ${index}`, now + index).participantId);
  manager.execute(code, ids[0], { type: 'start', requestId: requestId() }, now);
  now += 61_000;
  manager.tick(now);
  for (const participantId of ids) {
    const lineup = manager.getSnapshot(code, participantId, now).self?.lineup ?? [];
    const selected = lineup.map((pick) => players.find((player) => player.id === pick.playerId)!).filter(Boolean);
    manager.execute(code, participantId, { type: 'submit-map-preferences', requestId: requestId(), mapPreferences: getDefaultMapSelection(selected, teams) }, now);
  }
  expect(manager.getVersions(code).phase).toBe('swiss');

  const delivery = new Map<string, DeliveryState>(ids.map((id) => [id, initialDelivery()]));
  const traffic = new Map<string, PlayerTraffic>(ids.map((id) => [id, { bytes: 0, largest: 0, snapshots: 0, lives: 0, skipped: 0, feed: new Map() }]));
  const record = (id: string, message: ServerMessage, primary: PublicLiveSeries | null) => {
    const stats = traffic.get(id)!;
    const size = Buffer.byteLength(JSON.stringify(message));
    stats.bytes += size;
    stats.largest = Math.max(stats.largest, size);
    if (message.type === 'snapshot') stats.snapshots += 1;
    else stats.lives += 1;
    if (!primary) return;
    // Rounds may belong to any map of the series: a catch-up carries the tail of the previous map too.
    primary.series.maps.forEach((map, index) => {
      if (!map.details?.length) return;
      const key = feedKey(primary.series.id, index);
      const numbers = stats.feed.get(key) ?? new Set<number>();
      for (const detail of map.details) numbers.add(detail.number);
      stats.feed.set(key, numbers);
    });
  };
  const answerDecision = (id: string) => {
    const live = manager.getLiveUpdate(code, id, now, null);
    const decision = live.cursor.primarySeries?.decision;
    if (!live.pendingDecision || !decision || decision.teamId !== id) return;
    const seriesId = live.pendingDecision.seriesId;
    if (decision.kind === 'veto') manager.execute(code, id, { type: 'veto-action', requestId: requestId(), seriesId, action: decision.action, mapId: decision.available[0], step: decision.step }, now);
    else if (decision.kind === 'side') manager.execute(code, id, { type: 'pick-side', requestId: requestId(), seriesId, side: 'ct' }, now);
    else manager.execute(code, id, { type: 'eco-call', requestId: requestId(), seriesId, call: 'force' }, now);
  };

  let ticks = 0;
  const flush = (oldBroadcast: boolean) => {
    const versions = manager.getVersions(code);
    if (baseline && oldBroadcast) {
      // Compare the old serializer against the EXACT same authoritative engine/players.
      // A shallow room copy isolates its differently keyed resultCache.
      const room = (manager as any).rooms.get(code);
      baseline.rooms.set(code, { ...room, resultCache: null });
      const start = performance.now();
      for (const [index, id] of ids.entries()) {
        const message = { type: 'snapshot', snapshot: baseline.getSnapshot(code, id, now) };
        const size = Buffer.byteLength(JSON.stringify(message));
        oldBytes += size; oldByPlayer[index] += size; oldLargest = Math.max(oldLargest, size); oldMessages++;
      }
      oldMs += performance.now() - start;
    }
    for (const id of ids) {
      const state = delivery.get(id)!;
      let buffered = skipEveryOtherLive && ticks % 2 === 1 ? BACKPRESSURE_LIMIT + 1 : 0;
      if (options.stall && id === ids[0]) {
        const primary = manager.getLiveUpdate(code, id, now).cursor.primarySeries;
        const key = primary ? feedKey(primary.series.id, primary.activeMap) : '';
        if (!stalled && primary && primary.visibleRounds >= 5) { stalled = true; stallKey = key; }
        if (stalled && key !== stallKey) recovered = true;
        if (stalled && !recovered) buffered = BACKPRESSURE_LIMIT + 1;
      }
      const plan = planBroadcast(state, versions, buffered, BACKPRESSURE_LIMIT);
      if (plan === 'none') continue;
      if (plan === 'skip') { traffic.get(id)!.skipped++; continue; }
      const start = performance.now();
      if (plan === 'snapshot') {
        const snapshot = manager.getSnapshot(code, id, now);
        const primary = snapshot.tournament?.liveCursor?.primarySeries ?? null;
        record(id, { type: 'snapshot', snapshot }, primary);
        delivery.set(id, { sentVersion: snapshot.version, sentStateVersion: versions.stateVersion, feedCursor: advanceFeedCursor(state.feedCursor, primary) });
      } else {
        const live = manager.getLiveUpdate(code, id, now, state.feedCursor);
        record(id, { type: 'live', live }, live.cursor.primarySeries);
        delivery.set(id, { ...state, sentVersion: live.version, feedCursor: advanceFeedCursor(state.feedCursor, live.cursor.primarySeries) });
      }
      newMs += performance.now() - start;
    }
  };
  flush(true);
  while (manager.getVersions(code).phase !== 'completed' && ticks < 100_000) {
    ticks += 1;
    now += 100;
    const changed = manager.tick(now).includes(code);
    flush(changed);
    if (options.reconnect && !resumed && ticks >= 100) {
      const participant = (manager as any).rooms.get(code).participants.get(ids[0]);
      manager.disconnect(code, ids[0], now); flush(true);
      manager.resume(code, participant.resumeToken, now + 1);
      delivery.set(ids[0], initialDelivery()); flush(true); resumed = true;
    }
    for (const id of ids) {
      const before = manager.getVersion(code);
      answerDecision(id);
      if (manager.getVersion(code) !== before) flush(true);
    }
  }
  expect(manager.getVersions(code).phase).toBe('completed');
  const final = manager.getSnapshot(code, ids[0], now);
  return { ids, traffic, final, ticks, oldBytes, oldLargest, oldMs, newMs, oldMessages, oldByPlayer, stalled, recovered, resumed };
}


const scenarios = [
  ...[4, 8, 16].flatMap(count => [0, 1].map(repeat => ({ count, repeat }))),
  ...[4, 8, 16].map(count => ({ count, slow: true })),
  ...[4, 8, 16].map(count => ({ count, stall: true })),
  { count: 4, speed: 'normal' as const },
  { count: 4, speed: 'fast' as const },
  { count: 4, reconnect: true },
  { count: 16, reconnect: true }
];
describe('extended online audit', () => {
  it.each(scenarios)('full tournament %j', (options) => {
    const result = simulateTournament(options);
    const { ids, traffic, final } = result;
    const missing: Array<{ player: number; series: string; map: number; rounds: number[] }> = [];
    for (const [player, id] of ids.entries()) {
      const own = final.tournament!.rounds.flatMap(round => round.series).filter(s => s.teamA.id === id || s.teamB.id === id);
      for (const series of own) series.maps.forEach((map, index) => {
        const received = traffic.get(id)!.feed.get(feedKey(series.id, index)) ?? new Set<number>();
        const absent = Array.from({ length: map.rounds.length }, (_, r) => r + 1).filter(r => !received.has(r));
        if (absent.length) missing.push({player, series:series.id, map:index, rounds:absent});
      });
    }
    const stats = [...traffic.values()];
    const summary = { options, bytes:stats.reduce((n,s)=>n+s.bytes,0), playerMin:Math.min(...stats.map(s=>s.bytes)), playerMax:Math.max(...stats.map(s=>s.bytes)), largest:Math.max(...stats.map(s=>s.largest)), snapshots:stats.reduce((n,s)=>n+s.snapshots,0), lives:stats.reduce((n,s)=>n+s.lives,0), skipped:stats.reduce((n,s)=>n+s.skipped,0), oldBytes:result.oldBytes, oldLargest:result.oldLargest, oldMs:result.oldMs, newMs:result.newMs, oldMessages:result.oldMessages, simulatedSeconds:result.ticks/10, missing, stalled:result.stalled, recovered:result.recovered, resumed:result.resumed };
    if (auditReport) appendFileSync(auditReport, JSON.stringify(summary)+'\n');
    expect(stats.every(s=>s.bytes<30*1024*1024)).toBe(true);
    expect(final.phase).toBe('completed');
    expect(missing).toEqual([]);
  }, 180_000);
});
