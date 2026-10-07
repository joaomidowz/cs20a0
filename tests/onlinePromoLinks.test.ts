// tests/onlinePromoLinks.test.ts
// Links promocionais (stories): código com bônus para os N primeiros, viajando no magic link; admin pela conta. Sem TEST_DATABASE_URL o arquivo é pulado.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOnlineServer } from '../server/app';
import { createDevMailer } from '../server/auth/mailer';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';
import { MIGRATIONS, runMigrations } from '../server/db/migrations';
import { normalizePromoCode } from '../server/promo-links/service';

const url = process.env.TEST_DATABASE_URL;

describe('normalizePromoCode', () => {
  it('aceita só o alfabeto do código, em maiúsculas', () => {
    expect(normalizePromoCode(' stories10 ')).toBe('STORIES10');
    expect(normalizePromoCode('ab')).toBeNull();
    expect(normalizePromoCode('com espaço')).toBeNull();
    expect(normalizePromoCode('x'.repeat(33))).toBeNull();
  });
});

describe.skipIf(!url)('links promocionais (Postgres)', () => {
  let db: Db;
  let baseUrl = '';
  let close: () => Promise<void> = async () => {};
  let clock = Date.now();

  beforeAll(async () => {
    db = await createTestDb(url!, 'test_promo_links');
    expect(await runMigrations(db)).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(MIGRATIONS[MIGRATIONS.length - 1].id).toBe(38);
    const app = createOnlineServer({ allowedOrigins: ['http://localhost:5173'], now: () => clock, db, mailer: createDevMailer(), siteUrl: 'http://localhost:5173', adminEmails: ['Dono+stories@Example.com'] });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    close = app.close;
  });

  afterAll(async () => {
    await close();
    await db?.close();
  });

  const post = (path: string, body: unknown, token?: string) =>
    fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const get = (path: string, token?: string) => fetch(`${baseUrl}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  /** Login completo por link; `promo` viaja no pedido, como o cliente faz. */
  async function login(email: string, promo?: string) {
    const requested = await (await post('/auth/request', { email, ...(promo ? { promo } : {}) })).json();
    const token = new URL(requested.devLink).searchParams.get('token')!;
    return (await post('/auth/verify', { token })).json();
  }
  const coinsOf = async (userId: string) => (await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]))[0].coins;

  it('admin pela conta: só o e-mail da lista cria links; os outros levam 403', async () => {
    const admin = await login('dono@example.com');
    expect(admin.user.admin).toBe(true);
    const other = await login('alguem@example.com');
    expect(other.user.admin).toBe(false);
    expect((await get('/admin/promo-links', other.sessionToken)).status).toBe(403);
    expect((await get('/admin/promo-links')).status).toBe(401);

    const created = await (await post('/admin/promo-links', { code: 'stories10', bonusCoins: 20_000, maxUses: 2, newAccountsOnly: true }, admin.sessionToken)).json();
    expect(created.ok).toBe(true);
    expect(created.link).toMatchObject({ code: 'STORIES10', coins: 20_000, total: 2, remaining: 2, uses: 0, newAccountsOnly: true, active: true });
    expect((await post('/admin/promo-links', { code: 'STORIES10', bonusCoins: 1, maxUses: 1 }, admin.sessionToken)).status).toBe(409);
    expect((await post('/admin/promo-links', { code: 'x', bonusCoins: 1, maxUses: 1 }, admin.sessionToken)).status).toBe(400);
    await post('/admin/promo-links', { code: 'TODOS', bonusCoins: 5_000, maxUses: 10, newAccountsOnly: false }, admin.sessionToken);
    await post('/admin/promo-links', { code: 'VENCIDO', bonusCoins: 5_000, maxUses: 10, newAccountsOnly: false, expiresAt: new Date(clock + 40 * 60_000).toISOString() }, admin.sessionToken);

    const publicView = await (await get('/promo-links/stories10')).json();
    expect(publicView.link).toEqual({ code: 'STORIES10', coins: 20_000, total: 2, remaining: 2, newAccountsOnly: true, expiresAt: null, active: true });
    expect(JSON.stringify(publicView)).not.toContain('@');
    expect((await get('/promo-links/NAOEXISTE')).status).toBe(404);
  });

  it('os dois primeiros novos levam 10k + 20k; o terceiro fica só com as boas-vindas; relogin não paga de novo', async () => {
    clock += 16 * 60_000; // fora da janela do limitador de pedidos de login por IP
    const first = await login('novo1@example.com', 'STORIES10');
    expect(first.promo).toMatchObject({ status: 'granted', code: 'STORIES10', coins: 20_000, wallet: 30_000 });
    expect(await coinsOf(first.user.id)).toBe(30_000);
    const second = await login('novo2@example.com', 'stories10');
    expect(second.promo.status).toBe('granted');
    const third = await login('novo3@example.com', 'STORIES10');
    expect(third.promo).toEqual({ status: 'sold_out', code: 'STORIES10' });
    expect(await coinsOf(third.user.id)).toBe(10_000);
    const ledger = await db.query<{ delta: number; ref_id: string }>(`SELECT delta, ref_id FROM ledger WHERE reason = 'promo_link' AND user_id = $1`, [first.user.id]);
    expect(ledger).toEqual([{ delta: 20_000, ref_id: 'STORIES10' }]);

    const again = await login('novo1@example.com', 'STORIES10');
    expect(['already', 'not_new', 'sold_out']).toContain(again.promo.status);
    expect(await coinsOf(first.user.id)).toBe(30_000);
    const view = await (await get('/promo-links/STORIES10')).json();
    expect(view.link).toMatchObject({ remaining: 0, active: false });
  });

  it('conta antiga: recusada em código só-novas, resgata uma vez em código aberto, e expirado não paga', async () => {
    clock += 16 * 60_000; // fora da janela do limitador de pedidos de login por IP
    const old = await login('antigo@example.com');
    expect(await coinsOf(old.user.id)).toBe(10_000);
    const notNew = await (await post('/promo-links/redeem', { code: 'STORIES10' }, old.sessionToken)).json();
    expect(notNew.promo.status).toBe('not_new');
    const open = await (await post('/promo-links/redeem', { code: 'todos' }, old.sessionToken)).json();
    expect(open.promo).toMatchObject({ status: 'granted', coins: 5_000, wallet: 15_000 });
    const twice = await (await post('/promo-links/redeem', { code: 'TODOS' }, old.sessionToken)).json();
    expect(twice.promo.status).toBe('already');
    expect(await coinsOf(old.user.id)).toBe(15_000);
    // Quem já tinha conta e volta pelo link de um código aberto também leva pelo login.
    const back = await login('antigo2@example.com');
    const viaLogin = await login('antigo2@example.com', 'TODOS');
    expect(viaLogin.promo.status).toBe('granted');
    expect(await coinsOf(back.user.id)).toBe(15_000);
    expect((await post('/promo-links/redeem', { code: 'x' }, old.sessionToken)).status).toBe(400);
    expect((await post('/promo-links/redeem', { code: 'TODOS' })).status).toBe(401);

    clock += 30 * 60_000;
    const expired = await (await post('/promo-links/redeem', { code: 'VENCIDO' }, old.sessionToken)).json();
    expect(expired.promo.status).toBe('expired');
    const invalid = await (await post('/promo-links/redeem', { code: 'NAOEXISTE' }, old.sessionToken)).json();
    expect(invalid.promo.status).toBe('invalid');
  });

  it('desativar expira o código agora e a lista do admin mostra usos', async () => {
    clock += 16 * 60_000; // fora da janela do limitador de pedidos de login por IP
    const admin = await login('dono@example.com');
    expect((await (await post('/admin/promo-links/TODOS/disable', {}, admin.sessionToken)).json()).disabled).toBe(true);
    const list = await (await get('/admin/promo-links', admin.sessionToken)).json();
    const todos = list.links.find((link: { code: string }) => link.code === 'TODOS');
    expect(todos).toMatchObject({ uses: 2, active: false });
    const stories = list.links.find((link: { code: string }) => link.code === 'STORIES10');
    expect(stories).toMatchObject({ uses: 2, remaining: 0 });
    const old = await login('antigo3@example.com');
    expect((await (await post('/promo-links/redeem', { code: 'TODOS' }, old.sessionToken)).json()).promo.status).toBe('expired');
  });
});
