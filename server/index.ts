import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createOnlineServer } from './app';
import { createDevMailer, createResendMailer } from './auth/mailer';
import { createDb } from './db/client';
import { runMigrations } from './db/migrations';
import { closeFinishedSeasons } from './collection/seasons';

// Local development reads the same .env the frontend uses; variables already set in the process always win.
try {
  const parsed = parseEnv(readFileSync('.env', 'utf8'));
  for (const [key, value] of Object.entries(parsed)) if (process.env[key] === undefined) process.env[key] = value;
} catch {
  // No .env file: rely on the process environment.
}

const port = Number(process.env.PORT ?? 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,https://cs13a0.com,https://www.cs13a0.com')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const db = databaseUrl ? createDb(databaseUrl) : undefined;
  if (db) {
    const applied = await runMigrations(db);
    console.info(`database ready${applied.length ? ` (migrations ${applied.join(', ')})` : ''}`);
  } else {
    console.info('DATABASE_URL absent: accounts and collection disabled, rooms only');
  }
  // Production never returns the magic link in the response: without a mail provider, accounts stay off.
  const production = process.env.NODE_ENV === 'production';
  const mailer = !db
    ? undefined
    : process.env.RESEND_API_KEY
      ? createResendMailer(process.env.RESEND_API_KEY, process.env.AUTH_FROM ?? 'cs13a0 <login@cs13a0.com>')
      : process.env.AUTH_DEV_LINK === '1' && !production
        ? createDevMailer()
        : undefined;
  if (db && !mailer) console.warn('no RESEND_API_KEY (and AUTH_DEV_LINK is only honoured outside production): accounts disabled');

  if (db) {
    // Month turned over: last season's podium gets its awards and coins. Hourly is plenty; the close itself is idempotent.
    const closeSeasons = () => closeFinishedSeasons(db, Date.now())
      .then((closed) => { for (const season of closed) console.info(`season ${season.month} closed (${season.awarded} awards)`); })
      .catch((error) => console.error('closeFinishedSeasons failed', error instanceof Error ? error.message : error));
    void closeSeasons();
    setInterval(closeSeasons, 60 * 60_000).unref();
  }

  const siteUrl = process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173';
  // Real money only with both Mercado Pago secrets and the public URL the webhook is posted to.
  const payments = process.env.MP_ACCESS_TOKEN && process.env.MP_WEBHOOK_SECRET && process.env.PUBLIC_SERVER_URL
    ? { accessToken: process.env.MP_ACCESS_TOKEN, webhookSecret: process.env.MP_WEBHOOK_SECRET, serverUrl: process.env.PUBLIC_SERVER_URL, siteUrl }
    : undefined;
  const supportTo = process.env.SUPPORT_EMAIL?.trim() || 'contato@cs13a0.com';
  const trustProxy = Boolean(process.env.RAILWAY_ENVIRONMENT) || process.env.TRUST_PROXY === '1';
  const { server } = createOnlineServer({ allowedOrigins, db, mailer, siteUrl, payments, supportTo, trustProxy });
  server.listen(port, '0.0.0.0', () => {
    // Intentionally logs only service metadata, never room or participant content.
    console.info(`online-server listening on port ${port}`);
  });
}

main().catch((error) => {
  console.error('online-server failed to start', error instanceof Error ? error.message : error);
  process.exit(1);
});
