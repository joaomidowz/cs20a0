import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/client';

/**
 * Mercado Pago Checkout Pro, server side only. The price always comes from `products`; the client only picks a
 * product id. Coins are credited from the webhook, and only after the payment is re-read from the Mercado Pago API
 * (status, amount and currency checked against the product), once per payment.
 */
export interface PaymentsConfig {
  db: Db;
  accessToken: string;
  webhookSecret: string;
  /** Public URL of this server (webhook target). */
  serverUrl: string;
  /** Public URL of the site (return pages). */
  siteUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Paid purchases a user can make per day. */
export const MAX_PURCHASES_PER_DAY = 10;
/** Checkouts a user can open per day, paid or not (protects the Mercado Pago quota from a click loop). */
export const MAX_CHECKOUTS_PER_DAY = 30;
/** A second click on the same product inside this window reopens the same checkout instead of creating another. */
export const CHECKOUT_REUSE_MS = 30 * 60_000;
/** Unpaid purchases are re-checked against Mercado Pago for this long (a Pix code lives 24 h). */
export const RECONCILE_WINDOW_HOURS = 25;
const API = 'https://api.mercadopago.com';
const PROVIDER_TIMEOUT_MS = 10_000;
const PRODUCTS_CACHE_MS = 60_000;

export class PaymentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string = code) {
    super(message);
  }
}

export interface Product { id: string; coins: number; priceCents: number; currency: string }

const productCache = new WeakMap<Db, { at: number; products: Product[] }>();

export async function listProducts(db: Db, now: number = Date.now()): Promise<Product[]> {
  const cached = productCache.get(db);
  if (cached && now - cached.at < PRODUCTS_CACHE_MS) return cached.products;
  const rows = await db.query<{ id: string; coins: number; price_cents: number; currency: string }>('SELECT id, coins, price_cents, currency FROM products WHERE active ORDER BY price_cents');
  const products = rows.map((row) => ({ id: row.id, coins: row.coins, priceCents: row.price_cents, currency: row.currency }));
  productCache.set(db, { at: now, products });
  return products;
}

const provider = (config: PaymentsConfig, path: string, init: RequestInit = {}) =>
  (config.fetchImpl ?? fetch)(`${API}${path}`, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), headers: { authorization: `Bearer ${config.accessToken}`, ...(init.headers ?? {}) } })
    .catch(() => { throw new PaymentError(502, 'PROVIDER_ERROR', 'Mercado Pago não respondeu'); });

/**
 * Creates the pending purchase and the Checkout Pro preference; returns the URL the browser opens. Coins and price
 * are frozen on the purchase row here, so a later change to `products` never changes what an open checkout pays.
 */
export async function createCheckout(config: PaymentsConfig, userId: string, productId: string): Promise<{ purchaseId: string; checkoutUrl: string }> {
  const [product] = await config.db.query<{ id: string; coins: number; price_cents: number; currency: string }>('SELECT id, coins, price_cents, currency FROM products WHERE id = $1 AND active', [productId]);
  if (!product) throw new PaymentError(404, 'UNKNOWN_PRODUCT', 'Produto indisponível');
  const [usage] = await config.db.query<{ opened: string; paid: string; blocked: boolean }>(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 day')::text AS opened,
            count(*) FILTER (WHERE created_at > now() - interval '1 day' AND status = 'approved')::text AS paid,
            coalesce(bool_or(status = 'charged_back'), false) AS blocked
     FROM purchases WHERE user_id = $1`,
    [userId]
  );
  if (usage.blocked) throw new PaymentError(403, 'PURCHASES_BLOCKED', 'Compras bloqueadas nesta conta');
  const [reusable] = await config.db.query<{ id: string; checkout_url: string }>(
    `SELECT id::text, checkout_url FROM purchases
     WHERE user_id = $1 AND product_id = $2 AND status = 'pending' AND checkout_url IS NOT NULL AND amount_cents = $3 AND coins = $4
       AND created_at > now() - ($5::int * interval '1 millisecond')
     ORDER BY created_at DESC LIMIT 1`,
    [userId, product.id, product.price_cents, product.coins, CHECKOUT_REUSE_MS]
  );
  if (reusable) return { purchaseId: reusable.id, checkoutUrl: reusable.checkout_url };
  if (Number(usage.paid) >= MAX_PURCHASES_PER_DAY || Number(usage.opened) >= MAX_CHECKOUTS_PER_DAY) throw new PaymentError(429, 'PURCHASE_LIMIT', 'Limite diário de compras atingido');
  const [purchase] = await config.db.query<{ id: string }>(
    `INSERT INTO purchases (user_id, product_id, provider, external_id, status, amount_cents, coins) VALUES ($1, $2, 'mercadopago', 'pending:' || gen_random_uuid(), 'pending', $3, $4) RETURNING id::text`,
    [userId, product.id, product.price_cents, product.coins]
  );
  const response = await provider(config, '/checkout/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-idempotency-key': `cs13a0-${purchase.id}` },
    body: JSON.stringify({
      items: [{ id: product.id, title: `cs13a0 · ${product.coins.toLocaleString('pt-BR')} coins`, description: 'Moeda virtual do jogo cs13a0', category_id: 'virtual_goods', quantity: 1, currency_id: product.currency, unit_price: product.price_cents / 100 }],
      external_reference: purchase.id,
      notification_url: `${config.serverUrl.replace(/\/$/, '')}/payments/webhook`,
      back_urls: { success: `${config.siteUrl}/online/colecao?pagamento=ok`, pending: `${config.siteUrl}/online/colecao?pagamento=pendente`, failure: `${config.siteUrl}/online/colecao?pagamento=falhou` },
      auto_return: 'approved',
      payment_methods: { installments: 1 },
      statement_descriptor: 'CS13A0'
    })
  });
  if (!response.ok) {
    await config.db.query(`UPDATE purchases SET status = 'failed' WHERE id = $1::bigint`, [purchase.id]);
    throw new PaymentError(502, 'PROVIDER_ERROR', 'Mercado Pago recusou a criação do pagamento');
  }
  const preference = await response.json() as { id: string; init_point: string };
  await config.db.query('UPDATE purchases SET preference_id = $2, checkout_url = $3 WHERE id = $1::bigint', [purchase.id, preference.id, preference.init_point]);
  return { purchaseId: purchase.id, checkoutUrl: preference.init_point };
}

/** `x-signature: ts=…,v1=…` over `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` with the webhook secret. */
export function verifySignature(secret: string, header: string | undefined, requestId: string | undefined, dataId: string): boolean {
  if (!header || !requestId || !dataId) return false;
  const parts = Object.fromEntries(header.split(',').map((part) => part.trim().split('=') as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`).digest('hex');
  const given = Buffer.from(parts.v1, 'hex');
  const wanted = Buffer.from(expected, 'hex');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

interface MpPayment { id: number; status: string; transaction_amount: number; transaction_amount_refunded?: number; currency_id: string; external_reference: string | null }
export type PaymentOutcome = 'credited' | 'reversed' | 'ignored';

/** Handles one payment notification. The notification only carries an id: the payment itself is re-read from Mercado Pago. */
export async function handlePaymentNotification(config: PaymentsConfig, paymentId: string): Promise<PaymentOutcome> {
  if (!/^\d{1,24}$/.test(paymentId)) return 'ignored';
  const response = await provider(config, `/v1/payments/${paymentId}`);
  if (response.status === 404) return 'ignored';
  if (!response.ok) throw new PaymentError(502, 'PROVIDER_ERROR', 'Não foi possível confirmar o pagamento');
  return applyPayment(config, await response.json() as MpPayment);
}

/**
 * Applies a payment read from Mercado Pago to its purchase. Idempotent under the row lock: a payment credits once, a
 * refund or chargeback debits once. Coins and price come from the purchase row, never from the request.
 */
async function applyPayment(config: PaymentsConfig, payment: MpPayment): Promise<PaymentOutcome> {
  if (!payment.external_reference || !/^\d{1,18}$/.test(payment.external_reference)) return 'ignored';
  return config.db.tx(async (tx) => {
    const [purchase] = await tx.query<{ id: string; user_id: string; credited_at: Date | null; refunded_at: Date | null; external_id: string; coins: number; amount_cents: number; currency: string }>(
      `SELECT p.id::text, p.user_id, p.credited_at, p.refunded_at, p.external_id, p.coins, p.amount_cents, pr.currency
       FROM purchases p JOIN products pr ON pr.id = p.product_id WHERE p.id = $1::bigint AND p.provider = 'mercadopago' FOR UPDATE OF p`,
      [payment.external_reference]
    );
    if (!purchase) return 'ignored';
    const externalId = String(payment.id);
    const amountOk = Math.round(payment.transaction_amount * 100) === purchase.amount_cents && payment.currency_id === purchase.currency;
    const fullyRefunded = payment.status === 'refunded' || payment.status === 'charged_back'
      || (payment.status === 'approved' && Math.round((payment.transaction_amount_refunded ?? 0) * 100) >= purchase.amount_cents);
    if (payment.status === 'approved' && !fullyRefunded) {
      if (purchase.credited_at) return 'ignored';
      if (!amountOk) {
        await tx.query(`UPDATE purchases SET status = 'amount_mismatch', raw = $2, checked_at = now() WHERE id = $1::bigint`, [purchase.id, JSON.stringify(payment)]);
        return 'ignored';
      }
      await tx.query(`UPDATE purchases SET status = 'approved', external_id = $2, raw = $3, credited_at = now(), checked_at = now() WHERE id = $1::bigint`, [purchase.id, externalId, JSON.stringify(payment)]);
      await tx.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [purchase.user_id]);
      await tx.query(`INSERT INTO ledger (user_id, delta, reason, ref_id) VALUES ($1, $2, 'purchase', $3)`, [purchase.user_id, purchase.coins, `mercadopago:${externalId}`]);
      await tx.query('UPDATE wallets SET coins = coins + $2, updated_at = now() WHERE user_id = $1', [purchase.user_id, purchase.coins]);
      return 'credited';
    }
    if (fullyRefunded) {
      // Only the payment that credited this purchase can reverse it.
      if (!purchase.credited_at || purchase.refunded_at || purchase.external_id !== externalId) return 'ignored';
      // Coins already spent cannot be clawed back below zero: take what is left and keep the rest on the purchase row.
      const [wallet] = await tx.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1 FOR UPDATE', [purchase.user_id]);
      const debit = Math.min(wallet?.coins ?? 0, purchase.coins);
      const status = payment.status === 'charged_back' ? 'charged_back' : 'refunded';
      await tx.query(`UPDATE purchases SET status = $2, refunded_at = now(), raw = $3 WHERE id = $1::bigint`, [purchase.id, status, JSON.stringify({ ...payment, unrecovered: purchase.coins - debit })]);
      if (debit > 0) {
        await tx.query(`INSERT INTO ledger (user_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)`, [purchase.user_id, -debit, status === 'refunded' ? 'refund' : 'chargeback', `mercadopago:${externalId}`]);
        await tx.query('UPDATE wallets SET coins = coins - $2, updated_at = now() WHERE user_id = $1', [purchase.user_id, debit]);
      }
      return 'reversed';
    }
    // A rejected attempt does not close the purchase: the buyer can retry with another card on the same checkout.
    await tx.query(`UPDATE purchases SET checked_at = now() WHERE id = $1::bigint AND credited_at IS NULL`, [purchase.id]);
    return 'ignored';
  });
}

/** Looks a purchase up on Mercado Pago by its reference: the safety net for a webhook that never arrived. */
export async function reconcilePurchase(config: PaymentsConfig, purchaseId: string): Promise<PaymentOutcome> {
  const response = await provider(config, `/v1/payments/search?external_reference=${encodeURIComponent(purchaseId)}&sort=date_created&criteria=desc&limit=10`);
  if (!response.ok) throw new PaymentError(502, 'PROVIDER_ERROR', 'Não foi possível consultar o pagamento');
  const { results = [] } = await response.json() as { results?: MpPayment[] };
  await config.db.query('UPDATE purchases SET checked_at = now() WHERE id = $1::bigint', [purchaseId]);
  let outcome: PaymentOutcome = 'ignored';
  for (const payment of results) {
    if (String(payment.external_reference) !== purchaseId) continue;
    const applied = await applyPayment(config, payment);
    if (applied !== 'ignored') outcome = applied;
  }
  return outcome;
}

/** Called by the buyer's browser on the way back from the checkout: re-checks their own open purchases, at most one lookup each per 5 s. */
export async function reconcileUser(config: PaymentsConfig, userId: string): Promise<{ credited: number; coins: number; pending: number }> {
  const open = await config.db.query<{ id: string; coins: number; due: boolean }>(
    `SELECT id::text, coins, (checked_at IS NULL OR checked_at < now() - interval '5 seconds') AS due FROM purchases
     WHERE user_id = $1 AND status = 'pending' AND preference_id IS NOT NULL AND created_at > now() - ($2::int * interval '1 hour')
     ORDER BY created_at DESC LIMIT 5`,
    [userId, RECONCILE_WINDOW_HOURS]
  );
  let credited = 0; let coins = 0; let pending = 0;
  for (const purchase of open) {
    const outcome = purchase.due ? await reconcilePurchase(config, purchase.id).catch(() => 'ignored' as const) : 'ignored';
    if (outcome === 'credited') { credited += 1; coins += purchase.coins; } else pending += 1;
  }
  return { credited, coins, pending };
}

/**
 * Background sweep: unpaid purchases are re-checked with a growing gap (2 min at first, then a quarter of their age),
 * so a fresh Pix is confirmed fast and an abandoned checkout costs a handful of lookups before it expires.
 */
export async function sweepPendingPurchases(config: PaymentsConfig, limit = 10): Promise<number> {
  const due = await config.db.query<{ id: string }>(
    `SELECT id::text FROM purchases
     WHERE provider = 'mercadopago' AND status = 'pending' AND preference_id IS NOT NULL
       AND created_at > now() - ($1::int * interval '1 hour')
       AND coalesce(checked_at, created_at) < now() - greatest(interval '2 minutes', (now() - created_at) / 4)
     ORDER BY coalesce(checked_at, created_at) LIMIT $2`,
    [RECONCILE_WINDOW_HOURS, limit]
  );
  let credited = 0;
  for (const purchase of due) if (await reconcilePurchase(config, purchase.id).catch(() => 'ignored') === 'credited') credited += 1;
  await config.db.query(`UPDATE purchases SET status = 'expired' WHERE provider = 'mercadopago' AND status = 'pending' AND created_at < now() - ($1::int * interval '1 hour')`, [RECONCILE_WINDOW_HOURS]);
  return credited;
}
