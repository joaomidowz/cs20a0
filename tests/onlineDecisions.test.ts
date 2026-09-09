import { describe, expect, it } from 'vitest';
import { RoomManager } from '../server/room-manager';
import { players, teams } from '../server/data';
import { DEFAULT_ROOM_CONFIG } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';

function confirmMaps(manager: RoomManager, code: string, participantId: string, now: number) {
  const lineup = manager.getSnapshot(code, participantId, now).self?.lineup ?? [];
  const selected = lineup.map((pick) => players.find((player) => player.id === pick.playerId)!).filter(Boolean);
  manager.execute(code, participantId, { type: 'submit-map-preferences', requestId: `maps-${participantId}`, mapPreferences: getDefaultMapSelection(selected, teams) }, now);
}

describe('online contextual decisions', () => {
  it('keeps preferences and pending actions private, validates actions and falls back after ten seconds', () => {
    const manager = new RoomManager();
    const start = 1_000;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 2, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, start);
    const host = manager.join(code, 'Host player', 'Host org', start);
    const guest = manager.join(code, 'Guest player', 'Guest org', start + 1);
    manager.execute(code, host.participantId, { type: 'update-preferences', requestId: 'prefs-host-001', automation: { autoMapPicksAndVetos: false, autoPause: false, autoEconomy: false }, visual: 'clean' }, start + 2);
    manager.execute(code, guest.participantId, { type: 'update-preferences', requestId: 'prefs-guest-01', automation: { autoMapPicksAndVetos: true, autoPause: true, autoEconomy: true }, visual: 'complete' }, start + 3);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-room-0001' }, start + 4);
    manager.tick(start + 61_000);
    confirmMaps(manager, code, host.participantId, start + 61_010);
    confirmMaps(manager, code, guest.participantId, start + 61_020);

    let now = start + 61_020;
    let vetoIndex = 0;
    let snapshot = manager.getSnapshot(code, host.participantId, now);
    expect(snapshot.self?.automationPreferences.autoEconomy).toBe(false);
    expect(snapshot.participants.every((participant) => !('automationPreferences' in participant))).toBe(true);
    while (snapshot.self?.pendingDecision?.type === 'veto') {
      const pending = snapshot.self.pendingDecision;
      manager.execute(code, host.participantId, { type: 'submit-veto', requestId: `veto-host-${vetoIndex++}`.padEnd(12, '0'), mapId: pending.recommendation }, now += 1);
      snapshot = manager.getSnapshot(code, host.participantId, now);
    }
    expect(manager.getSnapshot(code, guest.participantId, now).self?.pendingDecision).toBeNull();

    manager.tick(now + 900);
    manager.tick(now + 1_100);
    snapshot = manager.getSnapshot(code, host.participantId, now + 1_100);
    expect(snapshot.self?.pendingDecision).toMatchObject({ type: 'round', deadlineAt: now + 10_900 });
    const pending = snapshot.self?.pendingDecision;
    if (!pending || pending.type !== 'round') throw new Error('Expected a round decision');
    expect(pending.deadlineAt - (now + 900)).toBe(10_000);
    expect(pending.legalBuys).toContain(pending.recommendation.buy);
    manager.execute(code, host.participantId, { type: 'submit-round-decision', requestId: 'round-buy-0001', decision: { buy: pending.legalBuys[0], tacticalPause: false } }, now + 1_101);
    expect(manager.getSnapshot(code, host.participantId, now + 1_101).self?.pendingDecision).toBeNull();
    manager.tick(now + 1_301);

    const nextPending = manager.getSnapshot(code, host.participantId, now + 1_301).self?.pendingDecision;
    if (nextPending) manager.tick(nextPending.deadlineAt);
    const afterTimeout = manager.getSnapshot(code, host.participantId, nextPending?.deadlineAt ?? now + 1_101).self?.pendingDecision;
    expect(afterTimeout?.type === 'round' ? afterTimeout.round : Number.POSITIVE_INFINITY).toBeGreaterThan(nextPending?.type === 'round' ? nextPending.round : 0);
  });
});
