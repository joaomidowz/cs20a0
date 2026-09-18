import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodType } from 'zod';

export const MAX_PAYLOAD_BYTES = 16 * 1024;

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) {
    super(message);
  }
}

export interface HttpContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  origin: string | undefined;
  params: string[];
  address: string;
  now: number;
  /** Set by the auth wrapper. */
  userId?: string;
}

export type Handler = (context: HttpContext) => Promise<unknown> | unknown;

export interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

export const route = (method: string, pattern: RegExp, handler: Handler): Route => ({ method, pattern, handler });

export const sendJson = (response: ServerResponse, status: number, body: unknown, origin?: string) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {})
  });
  response.end(JSON.stringify(body));
};

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_PAYLOAD_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Invalid JSON');
  }
}

export async function readBody<T>(request: IncomingMessage, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) throw new HttpError(400, 'BAD_REQUEST', parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}

export const bearerOf = (request: IncomingMessage): string | null => {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length >= 16 && token.length <= 256 ? token : null;
};

/** Tries the routes in order; returns false when none matched (the caller answers 404). */
export async function dispatch(routes: Route[], context: Omit<HttpContext, 'params'>): Promise<boolean> {
  for (const candidate of routes) {
    if (candidate.method !== context.request.method) continue;
    const match = candidate.pattern.exec(context.url.pathname);
    if (!match) continue;
    try {
      const body = await candidate.handler({ ...context, params: match.slice(1) });
      if (!context.response.headersSent) sendJson(context.response, 200, body ?? { ok: true }, context.origin);
    } catch (error) {
      if (error instanceof HttpError) sendJson(context.response, error.status, { ok: false, error: error.code, message: error.message }, context.origin);
      else {
        console.error('http handler failed', candidate.pattern.source, error instanceof Error ? error.message : error);
        sendJson(context.response, 500, { ok: false, error: 'INTERNAL' }, context.origin);
      }
    }
    return true;
  }
  return false;
}
