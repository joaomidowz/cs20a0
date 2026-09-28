import { getDefaultMapSelection } from '../../src/lib/game/maps';
import type { Player } from '../../src/lib/game/types';
import { getLineup } from '../collection/service';
import { soloStartSchema } from '../../src/lib/game/online/contracts';
import { toSelectedPlayer } from '../../src/lib/game/online/collection-lineup';
import { awardsOf, currentStandings, lastSeasonPodium, majorResult, publicProfile, roomRewards } from '../collection/seasons';
import { onlineUserCount, PRESENCE_WINDOW_SECONDS } from '../auth/service';
import { collectionPlayerById as playerById, collectionTeams as teams } from '../../src/lib/game/online/collection-pool';
import type { Db } from '../db/client';
import { RoomError, type PreparedLineup, type RoomManager } from '../room-manager';
import { QUEUE_ROOM_CONFIG, type Queue } from '../queue';
import { z } from 'zod';
import { HttpError, readBody, route, type Handler, type Route } from './router';

const leaveSchema = z.object({ reason: z.enum(['hidden', 'user']).optional() });

/** The saved lineup as the room needs it; throws when the collection team is missing or incomplete. */
export async function preparedFor(db: Db, userId: string): Promise<PreparedLineup> {
  const lineup = await getLineup(db, userId);
  if (!lineup) throw new HttpError(409, 'NO_LINEUP', 'Monte e salve seu time na coleção primeiro');
  const selected = lineup.playerIds.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
  if (selected.length !== 5) throw new HttpError(409, 'INVALID_LINEUP', 'Time incompleto');
  return {
    userId,
    lineup: lineup.playerIds.map((playerId, index) => toSelectedPlayer(playerId, lineup.roles[index])),
    style: lineup.style,
    starPlayerId: lineup.starEffective ? lineup.starPlayerId : null,
    coachId: lineup.coachId,
    mapPreferences: [...(lineup.mapPreferences ?? getDefaultMapSelection(selected, teams))]
  };
}

export function createRoomRoutes(db: Db, manager: RoomManager, withAuth: (handler: Handler) => Handler, queue: Queue): Route[] {
  return [
    route('POST', /^\/queue\/join$/, withAuth(async ({ userId }) => ({ ok: true, ...queue.join(userId!, await preparedFor(db, userId!)) }))),
    route('POST', /^\/queue\/leave$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, leaveSchema);
      queue.leave(userId!, body.reason === 'hidden' ? 'hidden' : undefined);
      return { ok: true, ...queue.status(userId!) };
    })),
    route('GET', /^\/queue\/status$/, withAuth(async ({ userId }) => ({ ok: true, ...queue.status(userId!) }))),
    /** Who is around: recent activity for "online", connected players by room phase for the dropdown. Queue waiters count as lobby. */
    route('GET', /^\/presence$/, withAuth(async ({ userId }) => {
      const breakdown = manager.presenceBreakdown();
      const queuedByMe = queue.status(userId!).state === 'waiting';
      return {
        ok: true,
        online: await onlineUserCount(db, PRESENCE_WINDOW_SECONDS),
        playing: breakdown.playing,
        lobby: breakdown.lobby + queue.size(),
        queue: queue.size(),
        queuedByMe,
        final: breakdown.final
      };
    })),
    /** Registers the saved lineup for a room; the ticket goes in the `join` command and skips the draft. */
    route('POST', /^\/rooms\/([A-Z2-9]{8})\/lineup$/i, withAuth(async ({ params, userId, now }) => {
      const prepared = await preparedFor(db, userId!);
      try {
        return { ok: true, lineupTicket: manager.prepareLineup(params[0].toUpperCase(), prepared, now) };
      } catch (error) {
        if (error instanceof RoomError) throw new HttpError(error.code === 'ROOM_NOT_FOUND' ? 404 : 409, error.code, error.message);
        throw error;
      }
    })),
    /** Solo contra bots com o time salvo: nunca competitivo; 'champions' monta o campo com campeões de Major. */
    route('POST', /^\/solo$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, soloStartSchema);
      const prepared = await preparedFor(db, userId!);
      const roomCode = manager.createRoom({ ...QUEUE_ROOM_CONFIG, simulationMode: body.simulationMode, simulationSpeed: body.simulationSpeed }, now, undefined, { origin: 'solo', field: body.field });
      return { ok: true, roomCode, lineupTicket: manager.prepareLineup(roomCode, prepared, now) };
    })),
    /** Public board of the ranked Majors being played right now. */
    route('GET', /^\/live$/, async ({ now }) => ({ ok: true, rooms: manager.liveQueueRooms(now) })),
    route('GET', /^\/seasons\/current$/, async ({ request, now }) => {
      const bearer = request.headers.authorization;
      const me = bearer ? await withAuthUserId(withAuth, request) : null;
      return { ok: true, ...(await currentStandings(db, now, me)), lastSeason: await lastSeasonPodium(db) };
    }),
    route('GET', /^\/players\/([0-9a-f-]{36})$/i, async ({ params, now }) => {
      const profile = await publicProfile(db, params[0], now);
      if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Jogador não encontrado');
      return { ok: true, profile };
    }),
    route('GET', /^\/me\/awards$/, withAuth(async ({ userId }) => ({ ok: true, awards: await awardsOf(db, userId!) }))),
    route('GET', /^\/me\/majors\/([A-Z2-9]{8})$/i, withAuth(async ({ params, userId }) => ({ ok: true, result: await majorResult(db, userId!, params[0].toUpperCase()), room: await roomRewards(db, params[0].toUpperCase()) })))
  ];
}

/** Resolves the user id behind a Bearer header without failing the request when there is none. */
async function withAuthUserId(withAuth: (handler: Handler) => Handler, request: import('node:http').IncomingMessage): Promise<string | null> {
  let resolved: string | null = null;
  const probe = withAuth(({ userId }) => { resolved = userId ?? null; return null; });
  try {
    await probe({ request, response: undefined as never, url: new URL('http://x/'), origin: undefined, params: [], address: '', now: Date.now() });
  } catch {
    resolved = null;
  }
  return resolved;
}
