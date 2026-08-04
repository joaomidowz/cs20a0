import { createOnlineServer } from './app';

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
