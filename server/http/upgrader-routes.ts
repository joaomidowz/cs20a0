import { z } from 'zod';
import { UPGRADER_MAX_STAKE } from '../../src/lib/game/online/collection-rules';
import { FAIR_CLIENT_SEED_MAX } from '../../src/lib/game/online/fair';
import { CollectionError } from '../collection/service';
import { getFairState, upgradeCards } from '../collection/upgrader';
import type { Db } from '../db/client';
import { HttpError, readBody, route, type Handler, type Route } from './router';

const upgradeSchema = z.object({
  stake: z.array(z.string().min(1).max(80)).min(1).max(UPGRADER_MAX_STAKE),
  target: z.string().min(1).max(80),
  clientSeed: z.string().min(1).max(FAIR_CLIENT_SEED_MAX)
});

const toHttp = (error: unknown): never => {
  if (error instanceof CollectionError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

export function createUpgraderRoutes(db: Db, withAuth: (handler: Handler) => Handler): Route[] {
  return [
    route('GET', /^\/upgrader\/fair$/, withAuth(async ({ userId }) => ({ ok: true, ...(await getFairState(db, userId!)) }))),
    route('POST', /^\/upgrader$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, upgradeSchema);
      return { ok: true, ...(await upgradeCards(db, userId!, body.stake, body.target, body.clientSeed).catch(toHttp)) };
    }))
  ];
}
