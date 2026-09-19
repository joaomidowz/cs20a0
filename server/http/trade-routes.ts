import { z } from 'zod';
import { CollectionError } from '../collection/service';
import { TRADE_MAX_COINS, acceptTrade, closeTrade, listTrades, proposeTrade, tradePartner } from '../collection/trades';
import type { Db } from '../db/client';
import { HttpError, readBody, route, type Handler, type Route } from './router';

const card = z.string().min(1).max(80);
const proposeSchema = z.object({ teamName: z.string().trim().min(1).max(40), offeredCard: card, requestedCard: card, coins: z.number().int().min(0).max(TRADE_MAX_COINS).default(0) });

const toHttp = (error: unknown): never => {
  if (error instanceof CollectionError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

export function createTradeRoutes(db: Db, withAuth: (handler: Handler) => Handler): Route[] {
  return [
    route('GET', /^\/trades$/, withAuth(async ({ userId, now }) => ({ ok: true, ...(await listTrades(db, userId!, now)) }))),
    route('GET', /^\/trades\/partner$/, withAuth(async ({ url, userId }) => {
      const teamName = (url.searchParams.get('teamName') ?? '').trim();
      if (!teamName || teamName.length > 40) throw new HttpError(400, 'BAD_REQUEST', 'teamName');
      return { ok: true, ...(await tradePartner(db, userId!, teamName).catch(toHttp)) };
    })),
    route('POST', /^\/trades$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, proposeSchema);
      return { ok: true, ...(await proposeTrade(db, userId!, body, now).catch(toHttp)) };
    })),
    route('POST', /^\/trades\/(\d{1,18})\/accept$/, withAuth(async ({ params, userId, now }) => ({ ok: true, ...(await acceptTrade(db, userId!, params[0], now).catch(toHttp)) }))),
    route('POST', /^\/trades\/(\d{1,18})\/(decline|cancel)$/, withAuth(async ({ params, userId, now }) => {
      await closeTrade(db, userId!, params[0], params[1] as 'decline' | 'cancel', now).catch(toHttp);
      return { ok: true };
    }))
  ];
}
