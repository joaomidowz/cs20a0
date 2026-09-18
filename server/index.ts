import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createOnlineServer } from './app';
import { createDevMailer, createResendMailer } from './auth/mailer';
import { createDb } from './db/client';
import { runMigrations } from './db/migrations';

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
  const mailer = db
    ? process.env.AUTH_DEV_LINK === '1' || !process.env.RESEND_API_KEY
      ? createDevMailer()
      : createResendMailer(process.env.RESEND_API_KEY, process.env.AUTH_FROM ?? 'cs13a0 <login@cs13a0.com>')
    : undefined;
  if (db && mailer?.devLink && process.env.NODE_ENV === 'production') console.warn('AUTH_DEV_LINK active in production: magic links are returned in responses');

  const { server } = createOnlineServer({ allowedOrigins, db, mailer, siteUrl: process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173' });
  server.listen(port, '0.0.0.0', () => {
    // Intentionally logs only service metadata, never room or participant content.
    console.info(`online-server listening on port ${port}`);
  });
}

main().catch((error) => {
  console.error('online-server failed to start', error instanceof Error ? error.message : error);
  process.exit(1);
});
