import { z } from 'zod';
import { AuthError, getSession, logout, requestMagicLink, setProfile, verifyMagicCode, verifyMagicLink, type AuthDeps } from '../auth/service';
import { normalizeEmail } from '../auth/tokens';
import { PromoLinkError, createPromoLink, disablePromoLink, getPromoLink, listPromoLinks, redeemPromoLink } from '../promo-links/service';
import { createSlidingLimiter } from './rate-limit';
import { HttpError, bearerOf, readBody, route, type Handler, type HttpContext, type Route } from './router';

const promoField = z.string().trim().max(32).optional();
const requestSchema = z.object({ email: z.string().min(3).max(254), promo: promoField });
const verifySchema = z.union([
  z.object({ token: z.string().min(16).max(256), promo: promoField }),
  z.object({ email: z.string().min(3).max(254), code: z.string().regex(/^\d{6}$/, '6 dígitos'), promo: promoField })
]);
const redeemSchema = z.object({ code: z.string().trim().min(3).max(32) });
const promoAdminSchema = z.object({
  code: z.string().trim().min(3).max(32),
  bonusCoins: z.number().int().min(1).max(1_000_000),
  maxUses: z.number().int().min(1).max(100_000),
  newAccountsOnly: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().optional()
});
const profileSchema = z.object({ displayName: z.string().trim().min(2).max(24), teamName: z.string().trim().min(2).max(24) });

const toHttp = (error: unknown): never => {
  if (error instanceof AuthError) {
    const status = error.code === 'UNAUTHORIZED' ? 401 : error.code === 'INVALID_TOKEN' ? 410 : 400;
    throw new HttpError(status, error.code, error.message);
  }
  if (error instanceof PromoLinkError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

export function createAuthRoutes(deps: AuthDeps, now: () => number) {
  const perEmail = createSlidingLimiter(3, 15 * 60_000, now);
  const perIp = createSlidingLimiter(10, 15 * 60_000, now);
  // Typed codes face online guessing: the 6-digit space with these windows keeps brute force hopeless.
  const codePerEmail = createSlidingLimiter(10, 15 * 60_000, now);
  const codePerIp = createSlidingLimiter(20, 15 * 60_000, now);
  // Links promocionais: consulta pública por IP e resgate por usuário, ambos folgados para o uso real e apertados para varredura de códigos.
  const promoLookupPerIp = createSlidingLimiter(60, 15 * 60_000, now);
  const promoRedeemPerUser = createSlidingLimiter(10, 15 * 60_000, now);

  /** Resolves the bearer session or answers 401; handlers behind it always get `context.userId`. */
  const withAuth = (handler: Handler): Handler => async (context: HttpContext) => {
    const token = bearerOf(context.request);
    const user = token ? await getSession(deps, token) : null;
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Faça login');
    return handler({ ...context, userId: user.id });
  };

  /** Admin by account: the bearer's e-mail has to be in ADMIN_EMAILS; everybody else gets 403. */
  const withAdmin = (handler: Handler): Handler => async (context: HttpContext) => {
    const token = bearerOf(context.request);
    const user = token ? await getSession(deps, token) : null;
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Faça login');
    if (!user.admin) throw new HttpError(403, 'FORBIDDEN', 'Só administradores');
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
      const result = await requestMagicLink(deps, body.email, address, body.promo ?? null).catch(toHttp);
      return { ok: true, ...result };
    }),
    route('POST', /^\/auth\/verify$/, async ({ request, address }) => {
      const body = await readBody(request, verifySchema);
      if ('token' in body) {
        const result = await verifyMagicLink(deps, body.token, body.promo ?? null).catch(toHttp);
        return { ok: true, ...result };
      }
      const key = normalizeEmail(body.email) ?? body.email.toLowerCase();
      if (!codePerIp.hit(`ip:${address}`) || !codePerEmail.hit(`email:${key}`)) throw new HttpError(429, 'RATE_LIMITED', 'Muitas tentativas; aguarde alguns minutos');
      const result = await verifyMagicCode(deps, body.email, body.code, body.promo ?? null).catch(toHttp);
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
    })),
    // Links promocionais: o que o código vale e quantas vagas restam (nunca quem resgatou).
    route('GET', /^\/promo-links\/([A-Za-z0-9_-]{1,40})$/, async ({ params, address }) => {
      if (!promoLookupPerIp.hit(`ip:${address}`)) throw new HttpError(429, 'RATE_LIMITED', 'Muitas tentativas; aguarde alguns minutos');
      const link = await getPromoLink(deps.db, params[0], now());
      if (!link) throw new HttpError(404, 'PROMO_NOT_FOUND', 'Link promocional não encontrado');
      return { ok: true, link };
    }),
    // Resgate por quem já está logado (contas antigas em códigos que aceitam antigas; ou quem voltou do e-mail noutro navegador).
    route('POST', /^\/promo-links\/redeem$/, withAuth(async ({ request, userId }) => {
      if (!promoRedeemPerUser.hit(`user:${userId}`)) throw new HttpError(429, 'RATE_LIMITED', 'Muitas tentativas; aguarde alguns minutos');
      const body = await readBody(request, redeemSchema);
      const promo = await deps.db.tx((tx) => redeemPromoLink(tx, userId!, body.code, now(), { firstLogin: false }));
      return { ok: true, promo };
    })),
    route('GET', /^\/admin\/promo-links$/, withAdmin(async () => ({ ok: true, links: await listPromoLinks(deps.db, now()) }))),
    route('POST', /^\/admin\/promo-links$/, withAdmin(async ({ request, userId }) => {
      const body = await readBody(request, promoAdminSchema);
      const link = await createPromoLink(deps.db, { ...body, expiresAt: body.expiresAt ?? null }, userId!, now()).catch(toHttp);
      return { ok: true, link };
    })),
    route('POST', /^\/admin\/promo-links\/([A-Za-z0-9_-]{1,40})\/disable$/, withAdmin(async ({ params }) => ({ ok: true, disabled: await disablePromoLink(deps.db, params[0], now()) })))
  ];

  return { routes, withAuth, currentUser, prune: () => { perEmail.prune(); perIp.prune(); codePerEmail.prune(); codePerIp.prune(); promoLookupPerIp.prune(); promoRedeemPerUser.prune(); } };
}
