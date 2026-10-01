import { z } from 'zod';
import { DAILY_BASIC_PACKS, PACK_PRICES, PACK_SLOTS } from '../../src/lib/game/online/collection-rules';
import { CollectionError, buyLineupSlot, buyPack, buyPromo, listPromos, getCollection, getLineups, openDailyPack, openFreePack, openMajorPack, saveLineup, sellPlayer, sellPlayers, setActiveLineup } from '../collection/service';
import { boostState, buyBoost, runBoost } from '../collection/boost';
import { claimLenda, deliverLenda, getContractState, runTradeUp } from '../collection/card-contracts';
import type { Db } from '../db/client';
import type { PreparedLineup } from '../room-manager';
import { preparedFor as preparedLineup } from './room-routes';
import { HttpError, readBody, route, type Handler, type Route } from './router';

const roleSchema = z.enum(['igl', 'awper', 'entry', 'lurker', 'support', 'rifler', 'awper-igl', 'igl-support']);
const packRoleSchema = z.enum(['igl', 'awper', 'entry', 'lurker', 'support', 'rifler']);
const buySchema = z.object({ tier: z.enum(['funcao', 'coach', 'time', 'prata', 'ouro', 'era', 'diamante', 'icone']), year: z.number().int().min(2013).max(2030).optional(), role: packRoleSchema.optional(), organization: z.string().min(1).max(80).optional() });
const freeSchema = z.object({ tier: z.enum(['prata', 'ouro']) });
const promoSchema = z.object({ tier: z.enum(['promo_elite', 'promo_superstar', 'promo_legend', 'promo_coach']) });
const sellSchema = z.object({ playerId: z.string().min(1).max(80) });
const sellBatchSchema = z.object({ items: z.array(z.object({ cardId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(999) })).min(1).max(250) });
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
const boostSchema = z.object({ field: z.enum(['random', 'champions']).default('random') });
const boostBuySchema = z.object({ quantity: z.number().int().min(1).max(50) });
// Trade-Up de cartas: 5 repetidas da mesma raridade; entregas parciais da Lenda aceitam de 1 a 50.
const contractRunSchema = z.object({ inputs: z.array(z.string().min(1).max(80)).length(5), clientSeed: z.string().min(1).max(64) });
const contractDeliverSchema = z.object({ contractId: z.string().min(1).max(40), donors: z.array(z.string().min(1).max(80)).min(1).max(50) });
const contractClaimSchema = z.object({ contractId: z.string().min(1).max(40) });

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
    route('POST', /^\/packs\/major$/, withAuth(async ({ userId }) => ({ ok: true, ...(await openMajorPack(db, userId!).catch(toHttp)) }))),
    route('POST', /^\/packs\/buy$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, buySchema);
      return { ok: true, ...(await buyPack(db, userId!, body.tier, now, body.year, body.role, body.organization).catch(toHttp)) };
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
    route('POST', /^\/collection\/sell-batch$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, sellBatchSchema);
      return { ok: true, ...(await sellPlayers(db, userId!, body.items).catch(toHttp)) };
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
    route('POST', /^\/lineup\/slots\/buy$/, withAuth(async ({ userId }) => ({ ok: true, ...(await buyLineupSlot(db, userId!).catch(toHttp)) }))),
    // Boost de farm: item consumível da loja — 1 item resolve 10 majors solo instantâneas (zero pontos), teto diário de uso.
    route('GET', /^\/boost$/, withAuth(async ({ userId, now }) => ({ ok: true, ...(await boostState(db, userId!, now)) }))),
    route('POST', /^\/boost\/buy$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, boostBuySchema);
      const bought = await buyBoost(db, userId!, body.quantity, now).catch(toHttp);
      return { ok: true, ...bought };
    })),
    route('POST', /^\/boost\/run$/, withAuth(async ({ request, userId, now }) => {
      const body = await readBody(request, boostSchema);
      const prepared = await preparedLineup(db, userId!).catch(toHttp);
      const summary = await runBoost(db, userId!, prepared, body.field, now).catch(toHttp);
      const state = await boostState(db, userId!, now);
      const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId!]);
      return { ok: true, ...summary, ...state, wallet: wallet?.coins ?? 0 };
    })),
    // Contratos de cartas duplicadas: trade-up com cópias reais e Lendas com entrega parcial.
    route('GET', /^\/contracts$/, withAuth(async ({ userId }) => ({ ok: true, ...(await getContractState(db, userId!)) }))),
    route('GET', /^\/contracts\/fair$/, withAuth(async ({ userId }) => {
      const state = await getContractState(db, userId!);
      return { ok: true, ...state.fair };
    })),
    route('POST', /^\/contracts\/tradeup$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, contractRunSchema);
      const run = await runTradeUp(db, userId!, body.inputs, body.clientSeed).catch(toHttp);
      const state = await getContractState(db, userId!);
      return { ok: true, ...run, cards: state.cards, progress: state.progress };
    })),
    route('POST', /^\/contracts\/deliver$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, contractDeliverSchema);
      // `progress` é sempre o mapa das Lendas; o resultado da entrega vai aninhado para não colidir.
      const delivery = await deliverLenda(db, userId!, body.contractId, body.donors).catch(toHttp);
      const state = await getContractState(db, userId!);
      return { ok: true, delivery, cards: state.cards, progress: state.progress };
    })),
    route('POST', /^\/contracts\/claim$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, contractClaimSchema);
      const claim = await claimLenda(db, userId!, body.contractId).catch(toHttp);
      const state = await getContractState(db, userId!);
      return { ok: true, targetId: claim.targetId, cards: state.cards, progress: state.progress };
    }))
  ];
}
