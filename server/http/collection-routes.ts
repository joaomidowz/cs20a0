import { z } from 'zod';
import { DAILY_BASIC_PACKS, PACK_PRICES, PACK_SLOTS } from '../../src/lib/game/online/collection-rules';
import { CollectionError, buyLineupSlot, buyPack, buyPromo, listPromos, getCollection, getLineups, openDailyPack, openFreePack, saveLineup, sellPlayer, setActiveLineup } from '../collection/service';
import type { Db } from '../db/client';
import type { PreparedLineup } from '../room-manager';
import { preparedFor as preparedLineup } from './room-routes';
import { HttpError, readBody, route, type Handler, type Route } from './router';

const roleSchema = z.enum(['igl', 'awper', 'entry', 'lurker', 'support', 'rifler', 'awper-igl']);
const packRoleSchema = z.enum(['igl', 'awper', 'entry', 'lurker', 'support', 'rifler']);
const buySchema = z.object({ tier: z.enum(['funcao', 'prata', 'ouro', 'era', 'diamante', 'icone']), year: z.number().int().min(2013).max(2030).optional(), role: packRoleSchema.optional() });
const freeSchema = z.object({ tier: z.enum(['prata', 'ouro']) });
const promoSchema = z.object({ tier: z.enum(['promo_elite', 'promo_superstar', 'promo_legend', 'promo_coach']) });
const sellSchema = z.object({ playerId: z.string().min(1).max(80) });
const lineupSchema = z.object({
  playerIds: z.array(z.string().min(1).max(80)).length(5),
  roles: z.array(roleSchema).length(5),
  starPlayerId: z.string().min(1).max(80).nullable(),
  coachId: z.string().min(1).max(80).nullable().default(null),
  // Os seis planos (contracts.ts `set-style` é a referência): salvar lineup com tempo/reativo/resiliente
  // era rejeitado aqui em 400 e o builder mostrava "Invalid option" (bug de PRD 2026-09-21).
  style: z.enum(['aggressive', 'balanced', 'tactical', 'tempo', 'reativo', 'resiliente']),
  mapPreferences: z.array(z.string().min(1).max(24)).length(3).nullable().optional(),
  /** Which lineup slot to save into; absent means the active one. */
  slot: z.number().int().min(0).max(4).optional()
});
const lineupSlotSchema = z.object({ slot: z.number().int().min(0).max(4) });

const toHttp = (error: unknown): never => {
  if (error instanceof CollectionError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

/** Carries a freshly saved lineup to a run that has not started yet (the room's ticket, the lobby, the queue). */
export type LineupRefresher = (userId: string, prepared: PreparedLineup) => void;

export function createCollectionRoutes(db: Db, withAuth: (handler: Handler) => Handler, onLineupSaved?: LineupRefresher): Route[] {
  return [
    route('GET', /^\/collection$/, withAuth(async ({ userId, now }) => ({ ok: true, ...(await getCollection(db, userId!, now)) }))),
    route('GET', /^\/packs$/, withAuth(async ({ userId, now }) => {
      const view = await getCollection(db, userId!, now);
      return { ok: true, today: view.packsToday, daily: DAILY_BASIC_PACKS, free: view.freePacks, prices: PACK_PRICES, odds: PACK_SLOTS, wallet: view.wallet };
    })),
    route('POST', /^\/packs\/open$/, withAuth(async ({ userId, now }) => ({ ok: true, ...(await openDailyPack(db, userId!, now).catch(toHttp)) }))),
    route('POST', /^\/packs\/free$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, freeSchema);
      return { ok: true, ...(await openFreePack(db, userId!, body.tier, now).catch(toHttp)) };
    })),
    route('POST', /^\/packs\/buy$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, buySchema);
      return { ok: true, ...(await buyPack(db, userId!, body.tier, now, body.year, body.role).catch(toHttp)) };
    })),
    route('GET', /^\/promos$/, withAuth(async ({ userId, now }) => ({ ok: true, ...(await listPromos(db, userId!, now)) }))),
    route('POST', /^\/promos\/buy$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, promoSchema);
      return { ok: true, ...(await buyPromo(db, userId!, body.tier, now).catch(toHttp)) };
    })),
    route('POST', /^\/collection\/sell$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, sellSchema);
      return { ok: true, ...(await sellPlayer(db, userId!, body.playerId).catch(toHttp)) };
    })),
    route('GET', /^\/lineup$/, withAuth(async ({ userId }) => {
      const view = await getLineups(db, userId!);
      // `lineup` (the active one) rides along for older clients.
      return { ok: true, ...view, lineup: view.lineups.find((entry) => entry.slotIndex === view.activeSlot) ?? null };
    })),
    route('PUT', /^\/lineup$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, lineupSchema);
      const lineup = await saveLineup(db, userId!, body, body.slot).catch(toHttp);
      // The team just saved is the team that plays: a run waiting to start swaps to it instead of keeping the one
      // from when the room (or the queue search) began.
      onLineupSaved?.(userId!, await preparedLineup(db, userId!));
      return { ok: true, lineup };
    })),
    route('POST', /^\/lineup\/active$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, lineupSlotSchema);
      const activeSlot = await setActiveLineup(db, userId!, body.slot).catch(toHttp);
      return { ok: true, activeSlot };
    })),
    route('POST', /^\/lineup\/slots\/buy$/, withAuth(async ({ userId }) => ({ ok: true, ...(await buyLineupSlot(db, userId!).catch(toHttp)) })))
  ];
}
