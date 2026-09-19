import { claimMission, listMissions } from '../collection/missions';
import { CollectionError } from '../collection/service';
import type { Db } from '../db/client';
import { HttpError, route, type Handler, type Route } from './router';

const toHttp = (error: unknown): never => {
  if (error instanceof CollectionError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

export function createMissionRoutes(db: Db, withAuth: (handler: Handler) => Handler): Route[] {
  return [
    route('GET', /^\/missions$/, withAuth(async ({ userId, now }) => ({ ok: true, ...(await listMissions(db, userId!, now)) }))),
    route('POST', /^\/missions\/([a-z0-9_]{1,40})\/claim$/, withAuth(async ({ params, userId, now }) => ({ ok: true, ...(await claimMission(db, userId!, params[0], now).catch(toHttp)) })))
  ];
}
