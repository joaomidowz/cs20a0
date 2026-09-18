import { getDefaultMapSelection } from '../../src/lib/game/maps';
import type { Player } from '../../src/lib/game/types';
import { getLineup } from '../collection/service';
import { awardsOf, currentStandings } from '../collection/seasons';
import { playerById, teams } from '../data';
import type { Db } from '../db/client';
import { RoomError, type RoomManager } from '../room-manager';
import { HttpError, route, type Handler, type Route } from './router';

export function createRoomRoutes(db: Db, manager: RoomManager, withAuth: (handler: Handler) => Handler): Route[] {
  return [
    /** Registers the saved lineup for a room; the ticket goes in the `join` command and skips the draft. */
    route('POST', /^\/rooms\/([A-Z2-9]{8})\/lineup$/i, withAuth(async ({ params, userId, now }) => {
      const lineup = await getLineup(db, userId!);
      if (!lineup) throw new HttpError(409, 'NO_LINEUP', 'Monte e salve seu time na coleção primeiro');
      const selected = lineup.playerIds.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
      if (selected.length !== 5) throw new HttpError(409, 'INVALID_LINEUP', 'Time incompleto');
      try {
        const ticket = manager.prepareLineup(params[0].toUpperCase(), {
          userId: userId!,
          lineup: lineup.playerIds.map((playerId, index) => ({ playerId, selectedSlotRole: lineup.roles[index] })),
          style: lineup.style,
          starPlayerId: lineup.starEffective ? lineup.starPlayerId : null,
          mapPreferences: [...getDefaultMapSelection(selected, teams)]
        }, now);
        return { ok: true, lineupTicket: ticket };
      } catch (error) {
        if (error instanceof RoomError) throw new HttpError(error.code === 'ROOM_NOT_FOUND' ? 404 : 409, error.code, error.message);
        throw error;
      }
    })),
    route('GET', /^\/seasons\/current$/, async ({ request, now }) => {
      const bearer = request.headers.authorization;
      const me = bearer ? await withAuthUserId(withAuth, request) : null;
      return { ok: true, ...(await currentStandings(db, now, me)) };
    }),
    route('GET', /^\/me\/awards$/, withAuth(async ({ userId }) => ({ ok: true, awards: await awardsOf(db, userId!) })))
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
