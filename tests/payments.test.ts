// tests/payments.test.ts
// Mercado Pago com a API simulada: assinatura do webhook, crédito uma vez, valor divergente, estorno. Pulado sem TEST_DATABASE_URL.
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../server/db/client';
import { runMigrations } from '../server/db/migrations';
import { createCheckout, handlePaymentNotification, verifySignature, type PaymentsConfig } from '../server/payments/mercadopago';
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
  const payments = new Map<string, { status: string; transaction_amount: number; currency_id: string; external_reference: string }>();
  const fakeFetch: typeof fetch = async (input, init) => {
    const target = String(input);
    if (target.endsWith('/checkout/preferences')) {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: `pref-${body.external_reference}`, init_point: `https://mp.test/checkout/${body.external_reference}` }), { status: 201 });
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

  it('limite diário de compras', async () => {
    for (let index = 0; index < 5; index += 1) await createCheckout(config(), userId, 'coins-5k').catch(() => {});
    await expect(createCheckout(config(), userId, 'coins-5k')).rejects.toMatchObject({ code: 'PURCHASE_LIMIT' });
  });
});
