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

export const MAX_PURCHASES_PER_DAY = 5;
const API = 'https://api.mercadopago.com';

export class PaymentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string = code) {
    super(message);
  }
}

export interface Product { id: string; coins: number; priceCents: number; currency: string }

export async function listProducts(db: Db): Promise<Product[]> {
  const rows = await db.query<{ id: string; coins: number; price_cents: number; currency: string }>('SELECT id, coins, price_cents, currency FROM products WHERE active ORDER BY price_cents');
  return rows.map((row) => ({ id: row.id, coins: row.coins, priceCents: row.price_cents, currency: row.currency }));
}

/** Creates the pending purchase and the Checkout Pro preference; returns the URL the browser opens. */
export async function createCheckout(config: PaymentsConfig, userId: string, productId: string): Promise<{ purchaseId: string; checkoutUrl: string }> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const [product] = await config.db.query<{ id: string; coins: number; price_cents: number; currency: string }>('SELECT id, coins, price_cents, currency FROM products WHERE id = $1 AND active', [productId]);
  if (!product) throw new PaymentError(404, 'UNKNOWN_PRODUCT', 'Produto indisponível');
  const [{ n }] = await config.db.query<{ n: string }>(`SELECT count(*)::text AS n FROM purchases WHERE user_id = $1 AND created_at > now() - interval '1 day' AND status IN ('pending', 'approved')`, [userId]);
  if (Number(n) >= MAX_PURCHASES_PER_DAY) throw new PaymentError(429, 'PURCHASE_LIMIT', 'Limite diário de compras atingido');
  const [purchase] = await config.db.query<{ id: string }>(
    `INSERT INTO purchases (user_id, product_id, provider, external_id, status, amount_cents) VALUES ($1, $2, 'mercadopago', 'pending:' || gen_random_uuid(), 'pending', $3) RETURNING id::text`,
    [userId, product.id, product.price_cents]
  );
  const response = await fetchImpl(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/json', 'x-idempotency-key': `cs13a0-${purchase.id}` },
    body: JSON.stringify({
      items: [{ id: product.id, title: `cs13a0 · ${product.coins.toLocaleString('pt-BR')} coins`, quantity: 1, currency_id: product.currency, unit_price: product.price_cents / 100 }],
      external_reference: purchase.id,
      notification_url: `${config.serverUrl.replace(/\/$/, '')}/payments/webhook`,
      back_urls: { success: `${config.siteUrl}/online/colecao?pagamento=ok`, pending: `${config.siteUrl}/online/colecao?pagamento=pendente`, failure: `${config.siteUrl}/online/colecao?pagamento=falhou` },
      auto_return: 'approved'
    })
  });
  if (!response.ok) throw new PaymentError(502, 'PROVIDER_ERROR', 'Mercado Pago recusou a criação do pagamento');
  const preference = await response.json() as { id: string; init_point: string };
  await config.db.query('UPDATE purchases SET preference_id = $2 WHERE id = $1', [purchase.id, preference.id]);
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

interface MpPayment { id: number; status: string; transaction_amount: number; currency_id: string; external_reference: string | null }

/** Handles one payment notification. Idempotent: a payment credits once, a refund or chargeback debits once. */
export async function handlePaymentNotification(config: PaymentsConfig, paymentId: string): Promise<'credited' | 'reversed' | 'ignored'> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(`${API}/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { authorization: `Bearer ${config.accessToken}` } });
  if (!response.ok) throw new PaymentError(502, 'PROVIDER_ERROR', 'Não foi possível confirmar o pagamento');
  const payment = await response.json() as MpPayment;
  if (!payment.external_reference) return 'ignored';
  return config.db.tx(async (tx) => {
    const [purchase] = await tx.query<{ id: string; user_id: string; status: string; credited_at: Date | null; refunded_at: Date | null; coins: number; price_cents: number; currency: string }>(
      `SELECT p.id::text, p.user_id, p.status, p.credited_at, p.refunded_at, pr.coins, pr.price_cents, pr.currency
       FROM purchases p JOIN products pr ON pr.id = p.product_id WHERE p.id = $1::bigint FOR UPDATE OF p`,
      [payment.external_reference]
    );
    if (!purchase) return 'ignored';
    const externalId = String(payment.id);
    const amountOk = Math.round(payment.transaction_amount * 100) === purchase.price_cents && payment.currency_id === purchase.currency;
    if (payment.status === 'approved') {
      if (purchase.credited_at) return 'ignored';
      if (!amountOk) {
        await tx.query(`UPDATE purchases SET status = 'amount_mismatch', raw = $2 WHERE id = $1::bigint`, [purchase.id, JSON.stringify(payment)]);
        return 'ignored';
      }
      await tx.query(`UPDATE purchases SET status = 'approved', external_id = $2, raw = $3, credited_at = now() WHERE id = $1::bigint`, [purchase.id, externalId, JSON.stringify(payment)]);
      await tx.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [purchase.user_id]);
      await tx.query(`INSERT INTO ledger (user_id, delta, reason, ref_id) VALUES ($1, $2, 'purchase', $3)`, [purchase.user_id, purchase.coins, `mercadopago:${externalId}`]);
      await tx.query('UPDATE wallets SET coins = coins + $2, updated_at = now() WHERE user_id = $1', [purchase.user_id, purchase.coins]);
      return 'credited';
    }
    if ((payment.status === 'refunded' || payment.status === 'charged_back') && purchase.credited_at && !purchase.refunded_at) {
      // Coins already spent cannot be clawed back below zero: take what is left and keep the rest on the purchase row.
      const [wallet] = await tx.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1 FOR UPDATE', [purchase.user_id]);
      const debit = Math.min(wallet?.coins ?? 0, purchase.coins);
      await tx.query(`UPDATE purchases SET status = $2, refunded_at = now(), raw = $3 WHERE id = $1::bigint`, [purchase.id, payment.status, JSON.stringify({ ...payment, unrecovered: purchase.coins - debit })]);
      if (debit > 0) {
        await tx.query(`INSERT INTO ledger (user_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)`, [purchase.user_id, -debit, payment.status === 'refunded' ? 'refund' : 'chargeback', `mercadopago:${externalId}`]);
        await tx.query('UPDATE wallets SET coins = coins - $2, updated_at = now() WHERE user_id = $1', [purchase.user_id, debit]);
      }
      return 'reversed';
    }
    await tx.query(`UPDATE purchases SET status = $2 WHERE id = $1::bigint AND credited_at IS NULL`, [purchase.id, payment.status]);
    return 'ignored';
  });
}
