// tests/onlineAccounts.test.ts
// Conta por magic link e migrations contra um Postgres real (docker-compose.dev.yml). Sem TEST_DATABASE_URL o arquivo é pulado.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOnlineServer } from '../server/app';
import { createDevMailer } from '../server/auth/mailer';
import { hashToken, isDisposable, normalizeEmail } from '../server/auth/tokens';
import { createDb, type Db } from '../server/db/client';
import { MIGRATIONS, runMigrations } from '../server/db/migrations';

const url = process.env.TEST_DATABASE_URL;

describe('normalizeEmail', () => {
  it('normaliza e rejeita formatos inválidos', () => {
    expect(normalizeEmail(' Joao+promo@Gmail.com ')).toBe('joao@gmail.com');
    expect(normalizeEmail('jo.ao@gmail.com')).toBe('joao@gmail.com');
    expect(normalizeEmail('a.b+c@example.org')).toBe('a.b@example.org');
    expect(normalizeEmail('semarroba')).toBeNull();
    expect(normalizeEmail('x@y')).toBeNull();
    expect(isDisposable('x@mailinator.com')).toBe(true);
    expect(isDisposable('x@gmail.com')).toBe(false);
    expect(hashToken('a')).toHaveLength(64);
  });
});

describe.skipIf(!url)('conta e migrations (Postgres)', () => {
  let db: Db;
  let baseUrl = '';
  let close: () => Promise<void> = async () => {};
  let clock = Date.now();

  beforeAll(async () => {
    db = createDb(url!);
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const applied = await runMigrations(db);
    expect(applied).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(await runMigrations(db)).toEqual([]);
    const app = createOnlineServer({ allowedOrigins: ['http://localhost:5173'], now: () => clock, db, mailer: createDevMailer(), siteUrl: 'http://localhost:5173' });
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

  it('pede link, verifica uma vez só, abre sessão e responde /me', async () => {
    const health = await (await fetch(`${baseUrl}/health`)).json();
    expect(health.accounts).toBe(true);

    const requested = await (await post('/auth/request', { email: 'Tester+x@Example.com' })).json();
    expect(requested.ok).toBe(true);
    const token = new URL(requested.devLink).searchParams.get('token')!;
    expect(token.length).toBeGreaterThan(20);

    const verified = await (await post('/auth/verify', { token })).json();
    expect(verified.ok).toBe(true);
    expect(verified.user.email).toBe('tester@example.com');
    expect(verified.sessionToken.length).toBeGreaterThan(20);

    const again = await post('/auth/verify', { token });
    expect(again.status).toBe(410);

    const me = await (await fetch(`${baseUrl}/me`, { headers: { authorization: `Bearer ${verified.sessionToken}` } })).json();
    expect(me.user.id).toBe(verified.user.id);
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [verified.user.id]);
    expect(wallet.coins).toBe(0);

    const anonymous = await fetch(`${baseUrl}/me`);
    expect(anonymous.status).toBe(401);

    expect((await post('/auth/logout', {}, verified.sessionToken)).status).toBe(200);
    expect((await fetch(`${baseUrl}/me`, { headers: { authorization: `Bearer ${verified.sessionToken}` } })).status).toBe(401);
  });

  it('expira o link em 15 minutos, recusa descartável e limita por e-mail', async () => {
    const requested = await (await post('/auth/request', { email: 'late@example.com' })).json();
    const token = new URL(requested.devLink).searchParams.get('token')!;
    clock += 16 * 60_000;
    expect((await post('/auth/verify', { token })).status).toBe(410);

    expect((await post('/auth/request', { email: 'x@mailinator.com' })).status).toBe(400);

    for (let index = 0; index < 3; index += 1) await post('/auth/request', { email: 'limit@example.com' });
    expect((await post('/auth/request', { email: 'LIMIT@example.com' })).status).toBe(429);
  });

  it('o mesmo e-mail com variações continua sendo um usuário só', async () => {
    await post('/auth/request', { email: 'one.two@gmail.com' });
    await post('/auth/request', { email: 'onetwo+z@gmail.com' });
    const rows = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM users WHERE email = 'onetwo@gmail.com'`);
    expect(rows[0].n).toBe('1');
  });
});
