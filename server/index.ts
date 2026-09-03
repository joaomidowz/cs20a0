import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createOnlineServer } from './app';

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

const { server } = createOnlineServer({ allowedOrigins });
server.listen(port, '0.0.0.0', () => {
  // Intentionally logs only service metadata, never room or participant content.
  console.info(`online-server listening on port ${port}`);
});
