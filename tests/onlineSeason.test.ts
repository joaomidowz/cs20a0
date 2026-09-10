import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { RoomError, RoomManager, VETO_STEP_DEADLINE_MS } from '../server/room-manager';
import { DEFAULT_ROOM_CONFIG, REMATCH_WINDOW_MS, seasonPointsFor, type RoomConfig, type RoomSnapshot } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';

const DRAFT_SECONDS = 60;
const SEASON_CONFIG: RoomConfig = { ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: DRAFT_SECONDS, simulationSpeed: 'ultra', seasonRuns: 2 };

let requestCounter = 0;
const requestId = (label: string) => `${label}-${(requestCounter += 1).toString().padStart(8, '0')}`;

/** Ticks the room until the run ends; each tick covers the longest decision deadline so every series moves one step. */
function runToCompletion(manager: RoomManager, code: string, participantId: string, now: number): { snapshot: RoomSnapshot; now: number } {
  let snapshot = manager.getSnapshot(code, participantId, now);
  for (let index = 0; index < 5_000 && snapshot.phase !== 'completed'; index += 1) {
    now += VETO_STEP_DEADLINE_MS;
    manager.tick(now);
    snapshot = manager.getSnapshot(code, participantId, now);
  }
  expect(snapshot.phase).toBe('completed');
  return { snapshot, now };
}

/** The room is in the draft phase: lets the pick deadline fill the lineups, confirms maps and plays the run to its end. */
function playRun(manager: RoomManager, code: string, participantIds: string[], now: number) {
  expect(manager.getSnapshot(code, participantIds[0], now).phase).toBe('draft');
  now += DRAFT_SECONDS * 1_000 + 1_000;
  manager.tick(now);
  for (const participantId of participantIds) {
    const lineup = manager.getSnapshot(code, participantId, now).self?.lineup ?? [];
    const selected = lineup.map((pick) => players.find((player) => player.id === pick.playerId)!).filter(Boolean);
    manager.execute(code, participantId, { type: 'submit-map-preferences', requestId: requestId('maps'), mapPreferences: getDefaultMapSelection(selected, teams) }, now);
  }
  expect(manager.getSnapshot(code, participantIds[0], now).tournament).not.toBeNull();
  return runToCompletion(manager, code, participantIds[0], now);
}

function createSeasonRoom(startedAt: number) {
  const manager = new RoomManager();
  // A fixed room seed keeps the human seeds (and therefore the pairings) the same on every run.
  const code = manager.createRoom(SEASON_CONFIG, startedAt, 'season-room');
  const host = manager.join(code, 'Host player', 'Host org', startedAt);
  const guest = manager.join(code, 'Guest player', 'Guest org', startedAt + 1);
  manager.execute(code, host.participantId, { type: 'start', requestId: requestId('start') }, startedAt + 2);
  return { manager, code, host, guest, ids: [host.participantId, guest.participantId] };
}

const stage3WinsOf = (snapshot: RoomSnapshot, participantId: string) =>
  (snapshot.tournament?.rounds ?? []).flatMap((round) => round.series).filter((series) => series.phase === 'stage3' && series.winnerId === participantId).length;

describe('online season and rematch', () => {
  it('scores the first run, opens the rematch window and hands out the awards of the whole field', () => {
    const { manager, code, host, guest, ids } = createSeasonRoom(1_000);
    expect(() => manager.execute(code, host.participantId, { type: 'rematch-vote', requestId: requestId('early'), accept: true }, 2_000)).toThrowError(RoomError);
    expect(manager.getSnapshot(code, host.participantId, 2_000).season).toBeNull();

    const { snapshot, now } = playRun(manager, code, ids, 1_002);
    const season = snapshot.season;
    expect(season).toMatchObject({ number: 1, run: 1, totalRuns: 2, championName: null });
    expect(season?.rematch).toEqual({ deadlineAt: now + REMATCH_WINDOW_MS, accepted: [], declined: [] });
    expect(season?.standings).toHaveLength(2);
    for (const participantId of ids) {
      const standing = season?.standings.find((candidate) => candidate.participantId === participantId);
      const campaign = snapshot.tournament?.campaigns?.find((candidate) => candidate.organizationId === participantId);
      expect(campaign).toBeDefined();
      const expectedPoints = seasonPointsFor(campaign!.placement, stage3WinsOf(snapshot, participantId));
      expect(standing?.runs).toEqual([{ run: 1, placement: campaign!.placement, points: expectedPoints, champion: snapshot.tournament?.championId === participantId }]);
      expect(standing?.points).toBe(expectedPoints);
      expect(standing?.points).toBeGreaterThan(0);
    }
    expect(season?.standings[0].points).toBeGreaterThanOrEqual(season!.standings[1].points);
    expect(season?.standings.map((standing) => standing.organizationName).sort()).toEqual(['Guest org', 'Host org']);

    const awards = snapshot.tournament?.awards;
    expect(awards?.mvp?.rating).toBeGreaterThan(0);
    expect(awards?.mvp?.rounds).toBeGreaterThan(0);
    expect(awards?.topTeam?.rating).toBeGreaterThan(0);
    // Eight organizations played, so the team ranking covers the whole field, not only the two humans.
    expect(awards?.teams).toHaveLength(8);
    expect(manager.getSnapshot(code, guest.participantId, now).tournament?.awards).toEqual(awards);
  });

  it('restarts the room with everybody who accepted and sums the points of the season', () => {
    const { manager, code, host, guest, ids } = createSeasonRoom(10_000);
    const first = playRun(manager, code, ids, 10_002);
    const firstOrganizations = first.snapshot.organizations?.map((organization) => organization.id);
    const firstStandings = first.snapshot.season!.standings;
    let now = first.now + 1_000;

    manager.execute(code, host.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: true }, now);
    expect(manager.getSnapshot(code, host.participantId, now).season?.rematch).toMatchObject({ accepted: [host.participantId], declined: [] });
    // A vote can be changed while the window is open; the last one counts.
    manager.execute(code, guest.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: false }, now);
    manager.execute(code, guest.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: true }, now);
    expect(manager.getSnapshot(code, host.participantId, now).season?.rematch?.accepted.sort()).toEqual([...ids].sort());
    expect(manager.getSnapshot(code, host.participantId, now).phase).toBe('completed');

    // Everybody voted: the room restarts before the deadline.
    now += 500;
    expect(now).toBeLessThan(first.now + REMATCH_WINDOW_MS);
    manager.tick(now);
    const restarted = manager.getSnapshot(code, host.participantId, now);
    expect(restarted.phase).toBe('draft');
    expect(restarted.deadlineAt).toBe(now + DRAFT_SECONDS * 1_000);
    expect(restarted.deadlineStage).toBe('picks');
    expect(restarted.participants.map((participant) => participant.id).sort()).toEqual([...ids].sort());
    expect(restarted.hostParticipantId).toBe(host.participantId);
    expect(restarted.tournament).toBeNull();
    expect(restarted).not.toHaveProperty('organizations');
    expect(restarted).not.toHaveProperty('selfResult');
    expect(restarted.self?.lineup).toEqual([]);
    expect(restarted.self?.watchedSeriesId).toBeNull();
    expect(restarted.season).toMatchObject({ number: 1, run: 1, championName: null, rematch: null });
    expect(restarted.season?.standings).toEqual(firstStandings);
    expect(manager.getSnapshot(code, guest.participantId, now).self?.participantId).toBe(guest.participantId);

    const second = playRun(manager, code, ids, now);
    // A new seed: the bot field is shuffled differently.
    expect(second.snapshot.organizations?.map((organization) => organization.id)).not.toEqual(firstOrganizations);
    const season = second.snapshot.season;
    expect(season).toMatchObject({ number: 1, run: 2, totalRuns: 2 });
    expect(season?.rematch).toEqual({ deadlineAt: second.now + REMATCH_WINDOW_MS, accepted: [], declined: [] });
    for (const participantId of ids) {
      const standing = season?.standings.find((candidate) => candidate.participantId === participantId);
      const previous = firstStandings.find((candidate) => candidate.participantId === participantId)!;
      const campaign = second.snapshot.tournament?.campaigns?.find((candidate) => candidate.organizationId === participantId)!;
      const secondPoints = seasonPointsFor(campaign.placement, stage3WinsOf(second.snapshot, participantId));
      expect(standing?.runs.map((run) => run.run)).toEqual([1, 2]);
      expect(standing?.runs[1]).toMatchObject({ placement: campaign.placement, points: secondPoints });
      expect(standing?.points).toBe(previous.points + secondPoints);
    }
    expect(season?.championName).toBe(season?.standings[0].organizationName);
    expect(season?.standings[0].points).toBeGreaterThanOrEqual(season!.standings[1].points);

    // The season is over: accepting again opens a fresh season with an empty table.
    for (const participantId of ids) manager.execute(code, participantId, { type: 'rematch-vote', requestId: requestId('again'), accept: true }, second.now + 1);
    manager.tick(second.now + 2);
    const fresh = manager.getSnapshot(code, host.participantId, second.now + 2);
    expect(fresh.phase).toBe('draft');
    expect(fresh.participants).toHaveLength(2);
    expect(fresh.season).toEqual({ number: 2, run: 0, totalRuns: 2, standings: [], championName: null, rematch: null });
  });

  it('keeps the room completed when fewer than two participants accept before the deadline', () => {
    const { manager, code, host, guest, ids } = createSeasonRoom(20_000);
    const { snapshot, now } = playRun(manager, code, ids, 20_002);
    const deadlineAt = snapshot.season!.rematch!.deadlineAt;
    manager.execute(code, host.participantId, { type: 'rematch-vote', requestId: requestId('solo'), accept: true }, now + 1_000);
    manager.tick(deadlineAt - 1);
    expect(manager.getSnapshot(code, host.participantId, deadlineAt - 1)).toMatchObject({ phase: 'completed', season: { rematch: { accepted: [host.participantId] } } });

    manager.tick(deadlineAt);
    const closed = manager.getSnapshot(code, host.participantId, deadlineAt);
    expect(closed.phase).toBe('completed');
    expect(closed.season?.rematch).toBeNull();
    expect(closed.season?.run).toBe(1);
    expect(closed.participants.map((participant) => participant.id).sort()).toEqual([...ids].sort());
    expect(closed.tournament?.awards?.mvp).toBeTruthy();
    expect(() => manager.execute(code, guest.participantId, { type: 'rematch-vote', requestId: requestId('late'), accept: true }, deadlineAt + 1))
      .toThrowError(expect.objectContaining({ code: 'REMATCH_CLOSED' }));
  });

  it('drops whoever declined and hands the host to the earliest accepted participant', () => {
    const manager = new RoomManager();
    const startedAt = 30_000;
    const code = manager.createRoom({ ...SEASON_CONFIG, capacity: 3 }, startedAt);
    const host = manager.join(code, 'Host player', 'Host org', startedAt);
    const second = manager.join(code, 'Second player', 'Second org', startedAt + 1);
    const third = manager.join(code, 'Third player', 'Third org', startedAt + 2);
    manager.execute(code, host.participantId, { type: 'start', requestId: requestId('start') }, startedAt + 3);
    const ids = [host.participantId, second.participantId, third.participantId];
    const { now } = playRun(manager, code, ids, startedAt + 3);

    manager.execute(code, host.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: false }, now + 1);
    manager.execute(code, second.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: true }, now + 2);
    manager.execute(code, third.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: true }, now + 3);
    manager.tick(now + 4);
    const restarted = manager.getSnapshot(code, second.participantId, now + 4);
    expect(restarted.phase).toBe('draft');
    expect(restarted.participants.map((participant) => participant.id).sort()).toEqual([second.participantId, third.participantId].sort());
    expect(restarted.hostParticipantId).toBe(second.participantId);
    expect(manager.getSnapshot(code, host.participantId, now + 4).self).toBeNull();
    // The organization that left keeps its line in the table, without a participant behind it.
    const hostLine = restarted.season?.standings.find((standing) => standing.organizationName === 'Host org');
    expect(hostLine?.participantId).toBeNull();
    expect(hostLine?.runs).toHaveLength(1);
    expect(restarted.season?.standings.filter((standing) => standing.participantId !== null)).toHaveLength(2);
  });

  it('keeps the rematch window open for every participant who finished the run, including disconnected players', () => {
    const manager = new RoomManager();
    const startedAt = 35_000;
    const code = manager.createRoom({ ...SEASON_CONFIG, capacity: 3 }, startedAt);
    const host = manager.join(code, 'Host player', 'Host org', startedAt);
    const second = manager.join(code, 'Second player', 'Second org', startedAt + 1);
    const third = manager.join(code, 'Third player', 'Third org', startedAt + 2);
    const ids = [host.participantId, second.participantId, third.participantId];
    manager.execute(code, host.participantId, { type: 'start', requestId: requestId('start') }, startedAt + 3);
    const completed = playRun(manager, code, ids, startedAt + 3);

    manager.disconnect(code, third.participantId, completed.now + 1);
    manager.execute(code, host.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: true }, completed.now + 2);
    manager.execute(code, second.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: true }, completed.now + 3);
    manager.tick(completed.now + 4);

    // The disconnected third participant still owns the rest of the 10-second acceptance window.
    const waiting = manager.getSnapshot(code, host.participantId, completed.now + 4);
    expect(waiting.phase).toBe('completed');
    expect(waiting.season?.rematch?.deadlineAt).toBe(completed.now + REMATCH_WINDOW_MS);
    expect(waiting.season?.rematch?.accepted.sort()).toEqual([host.participantId, second.participantId].sort());

    manager.resume(code, third.resumeToken, completed.now + 5);
    manager.execute(code, third.participantId, { type: 'rematch-vote', requestId: requestId('vote'), accept: true }, completed.now + 6);
    manager.tick(completed.now + 7);
    const restarted = manager.getSnapshot(code, third.participantId, completed.now + 7);
    expect(restarted.phase).toBe('draft');
    expect(restarted.participants.map((participant) => participant.id).sort()).toEqual(ids.sort());
    expect(restarted.participants.every((participant) => participant.connected)).toBe(true);
  });

  it('rejects a vote at or after the exact rematch deadline even before the timer tick closes the window', () => {
    const { manager, code, host, ids } = createSeasonRoom(37_000);
    const completed = playRun(manager, code, ids, 37_002);
    const deadlineAt = completed.snapshot.season!.rematch!.deadlineAt;

    expect(() => manager.execute(code, host.participantId, {
      type: 'rematch-vote', requestId: requestId('late'), accept: true
    }, deadlineAt)).toThrowError(expect.objectContaining({ code: 'REMATCH_CLOSED' }));
    expect(manager.getSnapshot(code, host.participantId, deadlineAt).season?.rematch?.accepted).toEqual([]);
  });

  it('lets a participant watch another live series while keeping their own pending decision', () => {
    const { manager, code, host, ids } = createSeasonRoom(40_000);
    let now = 40_002 + DRAFT_SECONDS * 1_000 + 1_000;
    manager.tick(now);
    for (const participantId of ids) {
      const lineup = manager.getSnapshot(code, participantId, now).self?.lineup ?? [];
      const selected = lineup.map((pick) => players.find((player) => player.id === pick.playerId)!).filter(Boolean);
      manager.execute(code, participantId, { type: 'submit-map-preferences', requestId: requestId('maps'), mapPreferences: getDefaultMapSelection(selected, teams) }, now);
    }
    now = manager.getSnapshot(code, host.participantId, now).tournament!.liveCursor!.nextRoundAt!;
    manager.tick(now);
    const cursor = manager.getSnapshot(code, host.participantId, now).tournament!.liveCursor!;
    expect(cursor.status).toBe('live');
    const ownSeriesId = cursor.primarySeries!.series.id;
    expect(cursor.primarySeries?.series.userMatch).toBe(true);
    const otherSeriesId = cursor.overviewSeries.find((series) => series.id !== ownSeriesId)!.id;

    manager.execute(code, host.participantId, { type: 'watch-match', requestId: requestId('watch'), seriesId: otherSeriesId }, now);
    const watching = manager.getSnapshot(code, host.participantId, now);
    expect(watching.self?.watchedSeriesId).toBe(otherSeriesId);
    expect(watching.tournament?.liveCursor?.primarySeries?.series.id).toBe(otherSeriesId);
    expect(watching.tournament?.liveCursor?.primarySeries?.series.userMatch).toBe(false);

    // The host's own series keeps asking for their decisions even while they watch somebody else.
    let snapshot = watching;
    for (let index = 0; index < 80 && !snapshot.self?.pendingDecision; index += 1) {
      now += 100;
      manager.tick(now);
      snapshot = manager.getSnapshot(code, host.participantId, now);
    }
    expect(snapshot.self?.pendingDecision?.seriesId).toBe(ownSeriesId);
    expect(snapshot.tournament?.liveCursor?.primarySeries?.series.id).toBe(otherSeriesId);
    expect(snapshot.tournament?.liveCursor?.primarySeries?.series.userMatch).toBe(false);
    expect(snapshot.tournament?.liveCursor?.primarySeries?.series.teamA.id).toBe(snapshot.tournament?.liveCursor?.overviewSeries.find((series) => series.id === otherSeriesId)?.teamA.id);

    manager.execute(code, host.participantId, { type: 'watch-match', requestId: requestId('watch'), seriesId: null }, now);
    const own = manager.getSnapshot(code, host.participantId, now);
    expect(own.self?.watchedSeriesId).toBeNull();
    expect(own.tournament?.liveCursor?.primarySeries?.series.id).toBe(ownSeriesId);
    expect(own.tournament?.liveCursor?.primarySeries?.series.userMatch).toBe(true);
    expect(own.tournament?.liveCursor?.primarySeries?.series.teamA.id).toBe(host.participantId);
    expect(own.self?.pendingDecision?.seriesId).toBe(ownSeriesId);
  });
});
