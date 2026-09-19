import { z } from 'zod';
import { DAILY_BASIC_PACKS, PACK_PRICES, PACK_SLOTS } from '../../src/lib/game/online/collection-rules';
import { CollectionError, buyPack, getCollection, getLineup, openDailyPack, saveLineup, sellPlayer } from '../collection/service';
import type { Db } from '../db/client';
import { HttpError, readBody, route, type Handler, type Route } from './router';

const roleSchema = z.enum(['igl', 'awper', 'entry', 'lurker', 'support', 'rifler']);
const buySchema = z.object({ tier: z.enum(['prata', 'ouro', 'era', 'diamante', 'icone']), year: z.number().int().min(2013).max(2030).optional() });
const sellSchema = z.object({ playerId: z.string().min(1).max(80) });
const lineupSchema = z.object({
  playerIds: z.array(z.string().min(1).max(80)).length(5),
  roles: z.array(roleSchema).length(5),
  starPlayerId: z.string().min(1).max(80).nullable(),
  coachId: z.string().min(1).max(80).nullable().default(null),
  style: z.enum(['aggressive', 'balanced', 'tactical']),
  mapPreferences: z.array(z.string().min(1).max(24)).length(3).nullable().optional()
});

const toHttp = (error: unknown): never => {
  if (error instanceof CollectionError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

export function createCollectionRoutes(db: Db, withAuth: (handler: Handler) => Handler): Route[] {
  return [
    route('GET', /^\/collection$/, withAuth(async ({ userId, now }) => ({ ok: true, ...(await getCollection(db, userId!, now)) }))),
    route('GET', /^\/packs$/, withAuth(async ({ userId, now }) => {
      const view = await getCollection(db, userId!, now);
      return { ok: true, today: view.packsToday, daily: DAILY_BASIC_PACKS, prices: PACK_PRICES, odds: PACK_SLOTS, wallet: view.wallet };
    })),
    route('POST', /^\/packs\/open$/, withAuth(async ({ userId, now }) => ({ ok: true, ...(await openDailyPack(db, userId!, now).catch(toHttp)) }))),
    route('POST', /^\/packs\/buy$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, buySchema);
      return { ok: true, ...(await buyPack(db, userId!, body.tier, now, body.year).catch(toHttp)) };
    })),
    route('POST', /^\/collection\/sell$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, sellSchema);
      return { ok: true, ...(await sellPlayer(db, userId!, body.playerId).catch(toHttp)) };
    })),
    route('GET', /^\/lineup$/, withAuth(async ({ userId }) => ({ ok: true, lineup: await getLineup(db, userId!) }))),
    route('PUT', /^\/lineup$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, lineupSchema);
      return { ok: true, lineup: await saveLineup(db, userId!, body).catch(toHttp) };
    }))
  ];
}
