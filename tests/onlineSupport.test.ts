// tests/onlineSupport.test.ts
// Suporte e reclamação de carta: guarda o protocolo, manda para a caixa com Reply-To do jogador, reenvia se o e-mail falhar,
// limita abuso e usa o IP real atrás do proxy. Pulado sem TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOnlineServer } from '../server/app';
import type { MailMessage, Mailer } from '../server/auth/mailer';
import type { Db } from '../server/db/client';
import { runMigrations } from '../server/db/migrations';
import { MAX_TICKETS_PER_DAY, flushTickets } from '../server/support/service';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { createTestDb } from './helpers/testDb';

const url = process.env.TEST_DATABASE_URL;
const INBOX = 'contato@cs13a0.com';

describe.skipIf(!url)('suporte (Postgres)', () => {
  let db: Db;
  let baseUrl = '';
  let close: () => Promise<void> = async () => {};
  const outbox: MailMessage[] = [];
  let mailDown = false;
  const mailer: Mailer = {
    devLink: true,
    send: async () => {},
    deliver: async (message) => { if (mailDown) throw new Error('down'); outbox.push(message); }
  };
  let hop = 0;
  const post = (path: string, body: unknown, options: { token?: string; ip?: string } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.9, ${options.ip ?? `198.51.100.${(hop += 1) % 250}`}`, ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
      body: JSON.stringify(body)
    });
  const player = collectionPlayers.find((item) => item.year && item.overall && item.teamId)!;

  beforeAll(async () => {
    db = await createTestDb(url!, 'test_support');
    await runMigrations(db);
    const app = createOnlineServer({ allowedOrigins: ['http://localhost:5173'], db, mailer, siteUrl: 'http://localhost:5173', supportTo: INBOX, trustProxy: true });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    close = app.close;
  });
  afterAll(async () => { await close(); await db?.close(); });

  it('contato sem conta exige e-mail, guarda o protocolo e responde direto ao jogador', async () => {
    const missing = await post('/support/contact', { category: 'bug', message: 'O botão de abrir pacote travou.' });
    expect(missing.status).toBe(400);
    const response = await post('/support/contact', { category: 'purchase', email: 'Jogador@Example.com', paymentRef: '179667460764', message: 'Paguei R$ 1 e as coins não caíram.' });
    expect(response.status).toBe(200);
    const { ticketId } = await response.json();
    const mail = outbox.at(-1)!;
    expect(mail.to).toBe(INBOX);
    expect(mail.replyTo).toBe('jogador@example.com');
    expect(mail.subject).toContain(`#${ticketId}`);
    expect(mail.text).toContain('179667460764');
    const [row] = await db.query<{ mailed_at: Date | null }>('SELECT mailed_at FROM support_tickets WHERE id = $1::bigint', [ticketId]);
    expect(row.mailed_at).not.toBeNull();
  });

  it('robô que preenche o campo escondido é recusado; HTML do jogador é escapado', async () => {
    expect((await post('/support/contact', { category: 'other', email: 'bot@example.com', message: 'mensagem qualquer aqui', website: 'spam.example' })).status).toBe(400);
    await post('/support/contact', { category: 'other', email: 'html@example.com', message: '<script>alert(1)</script> teste' });
    expect(outbox.at(-1)!.html).not.toContain('<script>');
    expect(outbox.at(-1)!.html).toContain('&lt;script&gt;');
  });

  it('reclamação de carta: valida jogador e número, traz o valor atual no e-mail', async () => {
    expect((await post('/support/rating', { playerId: 'nao-existe', field: 'overall', suggested: '80', reason: 'Motivo com detalhes suficientes', email: 'a@example.com' })).status).toBe(404);
    expect((await post('/support/rating', { playerId: player.id, field: 'overall', suggested: 'muito', reason: 'Motivo com detalhes suficientes', email: 'a@example.com' })).status).toBe(400);
    const response = await post('/support/rating', { playerId: player.id, field: 'overall', suggested: '91', reason: 'Foi MVP de dois Majors naquele ano.', source: 'https://example.com/stats', email: 'a@example.com' });
    expect(response.status).toBe(200);
    const mail = outbox.at(-1)!;
    expect(mail.subject).toContain(player.nickname ?? player.id);
    expect(mail.text).toContain(`Valor atual: ${player.overall}`);
    expect(mail.text).toContain('Sugerido: 91');
  });

  it('e-mail fora do ar: o protocolo fica salvo e sai no próximo envio', async () => {
    mailDown = true;
    const response = await post('/support/contact', { category: 'account', email: 'late@example.com', message: 'Não recebo o link de login.' });
    expect(response.status).toBe(200);
    const { ticketId } = await response.json();
    const [pending] = await db.query<{ mailed_at: Date | null }>('SELECT mailed_at FROM support_tickets WHERE id = $1::bigint', [ticketId]);
    expect(pending.mailed_at).toBeNull();
    mailDown = false;
    expect(await flushTickets({ db, mailer, to: INBOX })).toBeGreaterThanOrEqual(1);
    expect(outbox.some((mail) => mail.subject.includes(`#${ticketId}`))).toBe(true);
  });

  it('limites: por IP real (atrás do proxy) e por e-mail no dia', async () => {
    const body = { category: 'other', email: 'ip@example.com', message: 'Mensagem de teste de limite.' };
    const statuses: number[] = [];
    for (let index = 0; index < 7; index += 1) statuses.push((await post('/support/contact', { ...body, email: `ip${index}@example.com` }, { ip: '192.0.2.77' })).status);
    expect(statuses.slice(0, 6).every((status) => status === 200)).toBe(true);
    expect(statuses[6]).toBe(429);
    // Another client behind the same proxy is not affected.
    expect((await post('/support/contact', { ...body, email: 'other-ip@example.com' }, { ip: '192.0.2.78' })).status).toBe(200);

    for (let index = 0; index < MAX_TICKETS_PER_DAY; index += 1) await db.query(`INSERT INTO support_tickets (kind, email, payload, mailed_at) VALUES ('contact', 'daily@example.com', '{}', now())`);
    expect((await post('/support/contact', { ...body, email: 'daily@example.com' })).status).toBe(429);
  });
});
