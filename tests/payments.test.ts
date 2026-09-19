// tests/payments.test.ts
// Mercado Pago com a API simulada: assinatura do webhook, crédito uma vez, valor divergente, estorno. Pulado sem TEST_DATABASE_URL.
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../server/db/client';
import { runMigrations } from '../server/db/migrations';
import { createCheckout, handlePaymentNotification, reconcileUser, sweepPendingPurchases, verifySignature, type PaymentsConfig } from '../server/payments/mercadopago';
import { createCatalogRoutes } from '../server/http/payment-routes';
import { createTestDb } from './helpers/testDb';

const url = process.env.TEST_DATABASE_URL;
const SECRET = 'webhook-secret';

describe('assinatura do webhook', () => {
  it('aceita a assinatura certa e recusa qualquer alteração', () => {
    const v1 = createHmac('sha256', SECRET).update('id:123;request-id:req-1;ts:1700;').digest('hex');
    expect(verifySignature(SECRET, `ts=1700,v1=${v1}`, 'req-1', '123')).toBe(true);
    expect(verifySignature(SECRET, `ts=1700,v1=${v1}`, 'req-2', '123')).toBe(false);
    expect(verifySignature(SECRET, `ts=1701,v1=${v1}`, 'req-1', '123')).toBe(false);
    expect(verifySignature('outro', `ts=1700,v1=${v1}`, 'req-1', '123')).toBe(false);
    expect(verifySignature(SECRET, undefined, 'req-1', '123')).toBe(false);
  });
});

describe.skipIf(!url)('checkout e webhook (Postgres, API simulada)', () => {
  let db: Db;
  let userId = '';
  const payments = new Map<string, { status: string; transaction_amount: number; transaction_amount_refunded?: number; currency_id: string; external_reference: string }>();
  const fakeFetch: typeof fetch = async (input, init) => {
    const target = String(input);
    if (target.endsWith('/checkout/preferences')) {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: `pref-${body.external_reference}`, init_point: `https://mp.test/checkout/${body.external_reference}` }), { status: 201 });
    }
    if (target.includes('/v1/payments/search')) {
      const reference = new URL(target).searchParams.get('external_reference');
      const results = [...payments].filter(([, payment]) => payment.external_reference === reference).map(([id, payment]) => ({ id: Number(id), ...payment }));
      return new Response(JSON.stringify({ results }), { status: 200 });
    }
    const id = target.split('/').at(-1)!;
    const payment = payments.get(id);
    return payment ? new Response(JSON.stringify({ id: Number(id), ...payment }), { status: 200 }) : new Response('{}', { status: 404 });
  };
  const config = (): PaymentsConfig => ({ db, accessToken: 'TEST', webhookSecret: SECRET, serverUrl: 'http://srv', siteUrl: 'http://site', fetchImpl: fakeFetch });
  const coins = async () => (await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]))[0].coins;

  beforeAll(async () => {
    db = await createTestDb(url!, 'test_payments');
    await runMigrations(db);
    [{ id: userId }] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('buyer@example.com', now()) RETURNING id`);
    await db.query('INSERT INTO wallets (user_id) VALUES ($1)', [userId]);
    await db.query(`INSERT INTO products (id, coins, price_cents) VALUES ('coins-5k', 5000, 490)`);
  });
  afterAll(async () => { await db?.close(); });

  it('preço vem do produto, crédito só uma vez e só com valor certo', async () => {
    const checkout = await createCheckout(config(), userId, 'coins-5k');
    expect(checkout.checkoutUrl).toContain(checkout.purchaseId);
    await expect(createCheckout(config(), userId, 'nao-existe')).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });

    payments.set('900', { status: 'approved', transaction_amount: 4.9, currency_id: 'BRL', external_reference: checkout.purchaseId });
    expect(await handlePaymentNotification(config(), '900')).toBe('credited');
    expect(await handlePaymentNotification(config(), '900')).toBe('ignored');
    expect(await coins()).toBe(5000);

    const cheap = await createCheckout(config(), userId, 'coins-5k');
    payments.set('901', { status: 'approved', transaction_amount: 0.01, currency_id: 'BRL', external_reference: cheap.purchaseId });
    expect(await handlePaymentNotification(config(), '901')).toBe('ignored');
    expect(await coins()).toBe(5000);
    const [row] = await db.query<{ status: string }>('SELECT status FROM purchases WHERE id = $1::bigint', [cheap.purchaseId]);
    expect(row.status).toBe('amount_mismatch');
  });

  it('estorno tira o que ainda existe e registra o resto', async () => {
    await db.query('UPDATE wallets SET coins = 2000 WHERE user_id = $1', [userId]);
    const [purchase] = await db.query<{ id: string }>(`SELECT id::text FROM purchases WHERE external_id = '900'`);
    payments.set('900', { status: 'refunded', transaction_amount: 4.9, currency_id: 'BRL', external_reference: purchase.id });
    expect(await handlePaymentNotification(config(), '900')).toBe('reversed');
    expect(await handlePaymentNotification(config(), '900')).toBe('ignored');
    expect(await coins()).toBe(0);
    const [row] = await db.query<{ raw: { unrecovered: number } }>(`SELECT raw FROM purchases WHERE id = $1::bigint`, [purchase.id]);
    expect(row.raw.unrecovered).toBe(3000);
  });

  it('produto muda depois do checkout: vale o que estava congelado na compra', async () => {
    await db.query(`INSERT INTO products (id, coins, price_cents) VALUES ('coins-frozen', 1000, 100)`);
    const checkout = await createCheckout(config(), userId, 'coins-frozen');
    await db.query(`UPDATE products SET coins = 999999, price_cents = 1 WHERE id = 'coins-frozen'`);
    const before = await coins();
    payments.set('910', { status: 'approved', transaction_amount: 0.01, currency_id: 'BRL', external_reference: checkout.purchaseId });
    expect(await handlePaymentNotification(config(), '910')).toBe('ignored');
    payments.set('911', { status: 'approved', transaction_amount: 1, currency_id: 'BRL', external_reference: checkout.purchaseId });
    expect(await handlePaymentNotification(config(), '911')).toBe('credited');
    expect(await coins()).toBe(before + 1000);
  });

  it('segundo clique reabre o mesmo checkout; id de pagamento inválido é ignorado', async () => {
    await db.query(`INSERT INTO products (id, coins, price_cents) VALUES ('coins-reuse', 500, 100)`);
    const first = await createCheckout(config(), userId, 'coins-reuse');
    const second = await createCheckout(config(), userId, 'coins-reuse');
    expect(second).toEqual(first);
    expect(await handlePaymentNotification(config(), '../users/me')).toBe('ignored');
    expect(await handlePaymentNotification(config(), '424242')).toBe('ignored');
  });

  it('webhook perdido: a volta do comprador e a varredura creditam uma vez só', async () => {
    await db.query(`INSERT INTO products (id, coins, price_cents) VALUES ('coins-lost', 700, 200)`);
    const checkout = await createCheckout(config(), userId, 'coins-lost');
    const before = await coins();
    expect(await reconcileUser(config(), userId)).toMatchObject({ credited: 0 });
    payments.set('920', { status: 'approved', transaction_amount: 2, currency_id: 'BRL', external_reference: checkout.purchaseId });
    await db.query('UPDATE purchases SET checked_at = NULL WHERE id = $1::bigint', [checkout.purchaseId]);
    expect(await reconcileUser(config(), userId)).toMatchObject({ credited: 1, coins: 700 });
    expect(await reconcileUser(config(), userId)).toMatchObject({ credited: 0 });
    expect(await handlePaymentNotification(config(), '920')).toBe('ignored');
    expect(await coins()).toBe(before + 700);

    const [other] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('other@example.com', now()) RETURNING id`);
    const swept = await createCheckout(config(), other.id, 'coins-lost');
    payments.set('921', { status: 'approved', transaction_amount: 2, currency_id: 'BRL', external_reference: swept.purchaseId });
    await db.query(`UPDATE purchases SET created_at = now() - interval '10 minutes' WHERE id = $1::bigint`, [swept.purchaseId]);
    expect(await sweepPendingPurchases(config())).toBeGreaterThanOrEqual(1);
    expect(await sweepPendingPurchases(config())).toBe(0);
    expect((await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [other.id]))[0].coins).toBe(700);
    // Another account's reconcile never credits or sees this purchase.
    expect(await reconcileUser(config(), userId)).toMatchObject({ credited: 0 });
  });

  it('estorno total marcado como approved reverte; chargeback bloqueia novas compras', async () => {
    await db.query(`INSERT INTO products (id, coins, price_cents) VALUES ('coins-cb', 300, 100)`);
    const [buyer] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('cb@example.com', now()) RETURNING id`);
    const checkout = await createCheckout(config(), buyer.id, 'coins-cb');
    payments.set('930', { status: 'approved', transaction_amount: 1, currency_id: 'BRL', external_reference: checkout.purchaseId });
    expect(await handlePaymentNotification(config(), '930')).toBe('credited');
    // A different payment of the same purchase cannot reverse it.
    payments.set('931', { status: 'refunded', transaction_amount: 1, currency_id: 'BRL', external_reference: checkout.purchaseId });
    expect(await handlePaymentNotification(config(), '931')).toBe('ignored');
    payments.set('930', { status: 'charged_back', transaction_amount: 1, currency_id: 'BRL', external_reference: checkout.purchaseId });
    expect(await handlePaymentNotification(config(), '930')).toBe('reversed');
    expect((await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [buyer.id]))[0].coins).toBe(0);
    await expect(createCheckout(config(), buyer.id, 'coins-cb')).rejects.toMatchObject({ code: 'PURCHASES_BLOCKED' });
  });

  it('limite diário de checkouts abertos', async () => {
    await db.query(`UPDATE purchases SET checkout_url = NULL WHERE user_id = $1`, [userId]);
    for (let index = 0; index < 30; index += 1) { await createCheckout(config(), userId, 'coins-5k').catch(() => {}); await db.query(`UPDATE purchases SET checkout_url = NULL WHERE user_id = $1`, [userId]); }
    await expect(createCheckout(config(), userId, 'coins-5k')).rejects.toMatchObject({ code: 'PURCHASE_LIMIT' });
  });

  it('catálogo público responde com pagamentos desligados, só leitura', async () => {
    const [catalog] = createCatalogRoutes(db, false);
    expect(catalog.method).toBe('GET');
    expect(catalog.pattern.test('/shop/products')).toBe(true);
    const result = await catalog.handler({} as never) as { enabled: boolean; products: Array<{ id: string; priceCents: number }> };
    expect(result.enabled).toBe(false);
    expect(result.products.some((product) => product.id === 'coins_2k' && product.priceCents === 100)).toBe(true);
  });
});
