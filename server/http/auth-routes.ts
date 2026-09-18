import { z } from 'zod';
import { AuthError, getSession, logout, requestMagicLink, setProfile, verifyMagicLink, type AuthDeps } from '../auth/service';
import { normalizeEmail } from '../auth/tokens';
import { createSlidingLimiter } from './rate-limit';
import { HttpError, bearerOf, readBody, route, type Handler, type HttpContext, type Route } from './router';

const requestSchema = z.object({ email: z.string().min(3).max(254) });
const verifySchema = z.object({ token: z.string().min(16).max(256) });
const profileSchema = z.object({ displayName: z.string().trim().min(2).max(24), teamName: z.string().trim().min(2).max(24) });

const toHttp = (error: unknown): never => {
  if (error instanceof AuthError) {
    const status = error.code === 'UNAUTHORIZED' ? 401 : error.code === 'INVALID_TOKEN' ? 410 : 400;
    throw new HttpError(status, error.code, error.message);
  }
  throw error;
};

export function createAuthRoutes(deps: AuthDeps, now: () => number) {
  const perEmail = createSlidingLimiter(3, 15 * 60_000, now);
  const perIp = createSlidingLimiter(10, 15 * 60_000, now);

  /** Resolves the bearer session or answers 401; handlers behind it always get `context.userId`. */
  const withAuth = (handler: Handler): Handler => async (context: HttpContext) => {
    const token = bearerOf(context.request);
    const user = token ? await getSession(deps, token) : null;
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Faça login');
    return handler({ ...context, userId: user.id });
  };

  /** The logged user when a valid bearer comes along, otherwise null (public routes that still know who is asking). */
  const currentUser = async (context: HttpContext) => {
    const token = bearerOf(context.request);
    const user = token ? await getSession(deps, token) : null;
    return user ? { id: user.id, email: user.email } : null;
  };

  const routes: Route[] = [
    route('POST', /^\/auth\/request$/, async ({ request, address }) => {
      const body = await readBody(request, requestSchema);
      const key = normalizeEmail(body.email) ?? body.email.toLowerCase();
      if (!perIp.hit(`ip:${address}`) || !perEmail.hit(`email:${key}`)) throw new HttpError(429, 'RATE_LIMITED', 'Muitas tentativas; aguarde alguns minutos');
      const result = await requestMagicLink(deps, body.email, address).catch(toHttp);
      return { ok: true, ...result };
    }),
    route('POST', /^\/auth\/verify$/, async ({ request }) => {
      const body = await readBody(request, verifySchema);
      const result = await verifyMagicLink(deps, body.token).catch(toHttp);
      return { ok: true, ...result };
    }),
    route('POST', /^\/auth\/logout$/, async ({ request }) => {
      const token = bearerOf(request);
      if (token) await logout(deps, token);
      return { ok: true };
    }),
    route('GET', /^\/me$/, withAuth(async ({ request }) => {
      const user = await getSession(deps, bearerOf(request)!);
      return { ok: true, user };
    })),
    route('PUT', /^\/me\/profile$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, profileSchema);
      await setProfile(deps, userId!, body);
      return { ok: true };
    }))
  ];

  return { routes, withAuth, currentUser, prune: () => { perEmail.prune(); perIp.prune(); } };
}
