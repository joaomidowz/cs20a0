// tests/onlineBotPace.test.ts
// Bot-vs-bot sem espectador resolve na hora do launch (mesmo caminho seeded do tick ao vivo): o round deixa de
// esperar a BO3 simulada mais lenta. Série de bots ASSISTIDA continua round a round.
import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { RoomManager, VETO_STEP_DEADLINE_MS, type PreparedLineup } from '../server/room-manager';
import { primaryRoleOf } from '../src/lib/game/online/collection-lineup';
import { DEFAULT_ROOM_CONFIG, type RoomConfig } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import type { Player } from '../src/lib/game/types';

const CONFIG: RoomConfig = { ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 4, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' };
let counter = 0;
const requestId = () => `req-${(counter += 1).toString().padStart(8, '0')}`;

const distinctByBase = (list: Player[]) => {
  const seen = new Set<string>();
  return list.filter((player) => { const base = player.baseId ?? player.id; if (seen.has(base)) return false; seen.add(base); return true; });
};
function prepared(userId: string, offset: number): PreparedLineup {
  const pool = distinctByBase(players.filter((_, index) => index % 3 === offset));
  const pick = (role: string) => pool.find((player) => primaryRoleOf(player) === role)!;
  const five = [pick('igl'), pick('awper'), pick('entry'), pick('lurker'), pick('support')];
  return {
    userId,
    lineup: five.map((player) => ({ playerId: player.id, selectedSlotRole: primaryRoleOf(player) })),
    style: 'balanced',
    starPlayerId: [...five].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0].id,
    mapPreferences: [...getDefaultMapSelection(five, teams)]
  };
}

/** Two collection players in an 8-team playoffs field: first round has human series and bot-vs-bot ones. */
function startedRoom(now: number) {
  const manager = new RoomManager();
  const code = manager.createRoom(CONFIG, now, 'bot-pace-room');
  const a = manager.join(code, 'Ana', 'Org A', now + 1, manager.prepareLineup(code, prepared('user-a', 0), now));
  manager.join(code, 'Bia', 'Org B', now + 2, manager.prepareLineup(code, prepared('user-b', 1), now));
  manager.execute(code, a.participantId, { type: 'start', requestId: requestId() }, now + 10);
  return { manager, code, participantId: a.participantId, startedAt: now + 10 };
}

describe('ritmo das séries de bots na sala', () => {
  it('bots sem espectador terminam no launch; as séries humanas seguem ao vivo', () => {
    const { manager, code, participantId, startedAt } = startedRoom(1_000);
    // Between start and launch the round is paired (status pending): the matchup list is visible.
    const pending = manager.getSnapshot(code, participantId, startedAt).tournament!.liveCursor!;
    expect(pending.overviewSeries.length).toBeGreaterThan(0);
    const botIds = pending.overviewSeries.filter((series) => series.teamA.id.startsWith('bot-') && series.teamB.id.startsWith('bot-')).map((series) => series.id);
    expect(botIds.length).toBeGreaterThan(0);

    manager.tick(startedAt + 900); // ROUND_GAP_MS: launch.
    const cursor = manager.getSnapshot(code, participantId, startedAt + 900).tournament!.liveCursor!;
    expect(cursor.status).toBe('live');
    for (const series of cursor.overviewSeries) {
      const botsOnly = series.teamA.id.startsWith('bot-') && series.teamB.id.startsWith('bot-');
      expect(series.status).toBe(botsOnly ? 'completed' : 'live');
    }
  });

  it('série de bots assistida continua live; ao perder o último espectador, resolve no tick', () => {
    const { manager, code, participantId, startedAt } = startedRoom(2_000);
    const pending = manager.getSnapshot(code, participantId, startedAt).tournament!.liveCursor!;
    const botSeriesId = pending.overviewSeries.find((series) => series.teamA.id.startsWith('bot-') && series.teamB.id.startsWith('bot-'))!.id;
    manager.execute(code, participantId, { type: 'watch-match', seriesId: botSeriesId, requestId: requestId() }, startedAt + 1);

    manager.tick(startedAt + 900);
    let cursor = manager.getSnapshot(code, participantId, startedAt + 900).tournament!.liveCursor!;
    const watched = cursor.overviewSeries.find((series) => series.id === botSeriesId)!;
    expect(watched.status).toBe('live');

    // The watcher moves on: the series settles on the next tick instead of pacing to the end.
    manager.execute(code, participantId, { type: 'watch-match', seriesId: null, requestId: requestId() }, startedAt + 901);
    manager.tick(startedAt + 900 + VETO_STEP_DEADLINE_MS);
    cursor = manager.getSnapshot(code, participantId, startedAt + 900 + VETO_STEP_DEADLINE_MS).tournament!.liveCursor!;
    expect(cursor.overviewSeries.find((series) => series.id === botSeriesId)!.status).toBe('completed');
  });
});
