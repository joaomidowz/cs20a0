import { describe, expect, it } from 'vitest';
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
function simulateTournament(skipEveryOtherLive: boolean) {
  const manager = new RoomManager();
  let now = 1_000_000;
  let requests = 0;
  const requestId = () => `traffic-${(requests++).toString().padStart(10, '0')}`;
  const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'stage3', capacity: 4, draftDeadlineSeconds: 60, simulationMode: 'automatic', simulationSpeed: 'ultra' }, now);
  const ids = Array.from({ length: 4 }, (_, index) => manager.join(code, `Player ${index}`, `Org ${index}`, now + index).participantId);
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
    const key = feedKey(primary.series.id, primary.activeMap);
    const numbers = stats.feed.get(key) ?? new Set<number>();
    for (const detail of primary.series.maps[primary.activeMap]?.details ?? []) numbers.add(detail.number);
    stats.feed.set(key, numbers);
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
  while (manager.getVersions(code).phase !== 'completed' && ticks < 40_000) {
    ticks += 1;
    now += 100;
    manager.tick(now);
    for (const id of ids) answerDecision(id);
    const versions = manager.getVersions(code);
    for (const id of ids) {
      const state = delivery.get(id)!;
      const buffered = skipEveryOtherLive && ticks % 2 === 1 ? BACKPRESSURE_LIMIT + 1 : 0;
      const plan = planBroadcast(state, versions, buffered, BACKPRESSURE_LIMIT);
      if (plan === 'none') continue;
      if (plan === 'skip') {
        traffic.get(id)!.skipped += 1;
        continue;
      }
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
    }
  }
  expect(manager.getVersions(code).phase).toBe('completed');
  const final = manager.getSnapshot(code, ids[0], now);
  return { ids, traffic, final, ticks };
}

describe('online traffic per player', () => {
  it.each([false, true])('stays small for a whole tournament and never loses a kill-feed round (slow connection: %s)', (slow) => {
    const { ids, traffic, final } = simulateTournament(slow);
    const rounds = final.tournament!.rounds;
    expect(rounds.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      const stats = traffic.get(id)!;
      // Before the delta protocol the largest message was ~2.2 MB and a player received ~1.3 GB per tournament.
      expect(stats.largest).toBeLessThan(300 * KB);
      expect(stats.bytes).toBeLessThan(20 * KB * KB);
      expect(stats.lives).toBeGreaterThan(stats.snapshots * 10);
      if (slow) expect(stats.skipped).toBeGreaterThan(0);
      // Every round of every map the player played reached them, even when half of the updates were skipped.
      const own = rounds.flatMap((round) => round.series).filter((series) => series.teamA.id === id || series.teamB.id === id);
      expect(own.length).toBeGreaterThanOrEqual(3);
      for (const series of own) {
        series.maps.forEach((map, index) => {
          const received = stats.feed.get(feedKey(series.id, index)) ?? new Set<number>();
          const missing = Array.from({ length: map.rounds.length }, (_, round) => round + 1).filter((round) => !received.has(round));
          expect({ series: series.id, map: index, missing }).toEqual({ series: series.id, map: index, missing: [] });
        });
      }
    }
  });
});
