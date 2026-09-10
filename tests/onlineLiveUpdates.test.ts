import { describe, expect, it } from 'vitest';
import { feedKey } from '../server/broadcast';
import { players, teams } from '../server/data';
import { ROUND_GAP_MS, RoomError, RoomManager } from '../server/room-manager';
import { DEFAULT_ROOM_CONFIG, type LiveUpdate, type PublicPendingDecision } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';

let requests = 0;
const requestId = () => `live-${(requests++).toString().padStart(10, '0')}`;

/** Two humans in a playoffs room at ultra speed, with the tournament already paired and waiting for its first round. */
function createLiveRoom() {
  const manager = new RoomManager();
  let now = 500_000;
  const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, now);
  const host = manager.join(code, 'Host player', 'Host org', now).participantId;
  const guest = manager.join(code, 'Guest player', 'Guest org', now + 1).participantId;
  manager.execute(code, host, { type: 'start', requestId: requestId() }, now);
  now += 61_000;
  manager.tick(now);
  for (const participantId of [host, guest]) {
    const lineup = manager.getSnapshot(code, participantId, now).self?.lineup ?? [];
    const selected = lineup.map((pick) => players.find((player) => player.id === pick.playerId)!).filter(Boolean);
    manager.execute(code, participantId, { type: 'submit-map-preferences', requestId: requestId(), mapPreferences: getDefaultMapSelection(selected, teams) }, now);
  }
  expect(manager.getVersions(code).phase).toBe('playoffs');
  return { manager, code, host, guest, now };
}

/** Answers whatever decision waits on the participant, the way the automation gear does. */
function answerDecision(manager: RoomManager, code: string, participantId: string, now: number, live: LiveUpdate) {
  const decision: PublicPendingDecision | null = live.cursor.primarySeries?.decision ?? null;
  if (!live.pendingDecision || !decision || decision.teamId !== participantId) return;
  const seriesId = live.pendingDecision.seriesId;
  if (decision.kind === 'veto') manager.execute(code, participantId, { type: 'veto-action', requestId: requestId(), seriesId, action: decision.action, mapId: decision.available[0], step: decision.step }, now);
  else if (decision.kind === 'side') manager.execute(code, participantId, { type: 'pick-side', requestId: requestId(), seriesId, side: 'ct' }, now);
  else manager.execute(code, participantId, { type: 'eco-call', requestId: requestId(), seriesId, call: 'force' }, now);
}

/** Ticks every 100 ms (answering decisions) until the predicate holds; returns the clock. */
function runUntil(room: ReturnType<typeof createLiveRoom>, predicate: () => boolean, maxTicks = 5_000): number {
  let { now } = room;
  for (let tick = 0; tick < maxTicks && !predicate(); tick += 1) {
    now += 100;
    room.manager.tick(now);
    for (const participantId of [room.host, room.guest]) {
      answerDecision(room.manager, room.code, participantId, now, room.manager.getLiveUpdate(room.code, participantId, now));
    }
  }
  expect(predicate()).toBe(true);
  room.now = now;
  return now;
}

const detailNumbers = (live: LiveUpdate) => {
  const primary = live.cursor.primarySeries!;
  return (primary.series.maps[primary.activeMap]?.details ?? []).map((detail) => detail.number);
};

describe('live updates and the public history', () => {
  it('sends the kill feed of the live map only past the cursor of the connection, in full to a fresh one', () => {
    const room = createLiveRoom();
    const { manager, code, host } = room;
    const now = runUntil(room, () => (manager.getLiveUpdate(code, host, room.now).cursor.primarySeries?.visibleRounds ?? 0) >= 5);
    const full = manager.getLiveUpdate(code, host, now, null);
    const primary = full.cursor.primarySeries!;
    const played = primary.visibleRounds;
    expect(primary.series.teamA.id).toBe(host);
    expect(primary.series.userMatch).toBe(true);
    expect(detailNumbers(full)).toEqual(Array.from({ length: played }, (_, index) => index + 1));
    expect((primary.series.maps[primary.activeMap]?.details ?? []).every((detail) => detail.momentum === undefined)).toBe(true);

    const key = feedKey(primary.series.id, primary.activeMap);
    const partial = manager.getLiveUpdate(code, host, now, { key, round: 3 });
    expect(detailNumbers(partial)).toEqual(Array.from({ length: played - 3 }, (_, index) => index + 4));
    expect(partial.cursor.primarySeries?.visibleRounds).toBe(played);
    expect(partial.cursor.primarySeries?.series.maps[primary.activeMap]?.rounds).toHaveLength(played);

    const upToDate = manager.getLiveUpdate(code, host, now, { key, round: played });
    expect(detailNumbers(upToDate)).toEqual([]);

    const otherMap = manager.getLiveUpdate(code, host, now, { key: feedKey(primary.series.id, primary.activeMap + 1), round: 3 });
    expect(detailNumbers(otherMap)).toHaveLength(played);

    // A snapshot always carries the whole live map, so a reconnecting client starts complete.
    const snapshot = manager.getSnapshot(code, host, now);
    const snapshotPrimary = snapshot.tournament!.liveCursor!.primarySeries!;
    expect(snapshotPrimary.series.maps[snapshotPrimary.activeMap]?.details).toHaveLength(played);
    expect(full.pendingDecision).toEqual(snapshot.self?.pendingDecision ?? null);
    expect(full.version).toBe(snapshot.version);
  });

  it('keeps the public history free of kill feed, hidden ratings and per-round decisions', () => {
    const room = createLiveRoom();
    const { manager, code, host } = room;
    runUntil(room, () => (manager.getSnapshot(code, host, room.now).tournament?.rounds.length ?? 0) >= 1);
    const snapshot = manager.getSnapshot(code, host, room.now);
    const series = snapshot.tournament!.rounds[0].series;
    expect(series.length).toBe(4);
    for (const item of series) {
      expect(item.winnerId).toBeTruthy();
      expect(item.teamA.power).toBe(0);
      expect(item.teamB.power).toBe(0);
      expect('lineup' in item.teamA).toBe(false);
      expect(item.decisions).toBeUndefined();
      expect(item.maps.length).toBeGreaterThanOrEqual(2);
      for (const map of item.maps) {
        expect(map.winnerId).toBeTruthy();
        expect(map.rounds.length).toBeGreaterThanOrEqual(13);
        expect(map.details).toBeUndefined();
        expect(map.halves).toBeUndefined();
        expect(map.decisions).toBeUndefined();
        expect(map.comeback).toBeUndefined();
      }
    }
    // The history is reused between calls until the state version moves.
    expect(manager.getSnapshot(code, host, room.now).tournament?.standings).toBe(snapshot.tournament?.standings);
    expect(JSON.stringify(snapshot).length).toBeLessThan(120 * 1024);
  });

  it('bumps the state version only for events outside the live cursor', () => {
    const room = createLiveRoom();
    const { manager, code, host, guest } = room;
    const paired = manager.getVersions(code);
    runUntil(room, () => manager.getLiveUpdate(code, host, room.now).cursor.status === 'live');
    const live = manager.getVersions(code);
    expect(live.version).toBeGreaterThan(paired.version);
    expect(live.stateVersion).toBe(paired.stateVersion);

    // Decisions, watching another series and rounds being played are all live-only.
    runUntil(room, () => (manager.getLiveUpdate(code, host, room.now).cursor.primarySeries?.visibleRounds ?? 0) >= 3);
    const other = manager.getLiveUpdate(code, host, room.now).cursor.overviewSeries.find((series) => series.teamA.id !== host && series.teamB.id !== host)!;
    manager.execute(code, host, { type: 'watch-match', requestId: requestId(), seriesId: other.id }, room.now);
    manager.execute(code, host, { type: 'watch-match', requestId: requestId(), seriesId: null }, room.now);
    expect(manager.getVersions(code).stateVersion).toBe(paired.stateVersion);

    // A round closing joins the history: state.
    runUntil(room, () => (manager.getSnapshot(code, host, room.now).tournament?.rounds.length ?? 0) >= 1);
    const closed = manager.getVersions(code);
    expect(closed.stateVersion).toBeGreaterThan(paired.stateVersion);

    manager.execute(code, host, { type: 'configure-simulation', requestId: requestId(), simulationSpeed: 'fast' }, room.now);
    expect(manager.getVersions(code).stateVersion).toBe(closed.stateVersion + 1);
    manager.disconnect(code, guest, room.now);
    expect(manager.getVersions(code).stateVersion).toBe(closed.stateVersion + 2);
    expect(manager.getVersions(code).version).toBe(manager.getVersion(code));
  });

  it('only lets a participant watch a series of the current round', () => {
    const manager = new RoomManager();
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 2 }, 1_000);
    const host = manager.join(code, 'Host player', 'Host org', 1_000).participantId;
    expect(() => manager.execute(code, host, { type: 'watch-match', requestId: requestId(), seriesId: 'nope' }, 1_000)).toThrowError(RoomError);
    expect(() => manager.execute(code, host, { type: 'watch-match', requestId: requestId(), seriesId: 'nope' }, 1_000)).toThrowError(/not started/);

    const room = createLiveRoom();
    expect(() => room.manager.execute(room.code, room.host, { type: 'watch-match', requestId: requestId(), seriesId: 'not-a-series' }, room.now)).toThrowError(/current round/);
    const overview = room.manager.getLiveUpdate(room.code, room.host, room.now).cursor.overviewSeries;
    expect(() => room.manager.execute(room.code, room.host, { type: 'watch-match', requestId: requestId(), seriesId: overview[1].id }, room.now)).not.toThrow();
    expect(room.manager.getLiveUpdate(room.code, room.host, room.now).cursor.primarySeries?.series.id).toBe(overview[1].id);
    expect(() => manager.getLiveUpdate(code, host, 1_000)).toThrowError(/not started/);
    expect(room.manager.getLiveUpdate(room.code, room.host, room.now + ROUND_GAP_MS).serverTime).toBe(room.now + ROUND_GAP_MS);
  });
});
