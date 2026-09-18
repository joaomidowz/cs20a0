import { SupportError, contactSchema, createContactTicket, createRatingTicket, ratingSchema, type SupportDeps } from '../support/service';
import { createSlidingLimiter } from './rate-limit';
import { HttpError, readBody, route, type HttpContext, type Route } from './router';

const toHttp = (error: unknown): never => {
  if (error instanceof SupportError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

/** Public routes: a logged player is identified by the session (their account e-mail wins), anyone else types an e-mail. */
export function createSupportRoutes(deps: SupportDeps, currentUser: (context: HttpContext) => Promise<{ id: string; email: string } | null>, now: () => number) {
  const perIp = createSlidingLimiter(6, 60 * 60_000, now);
  const guard = (context: HttpContext) => {
    if (!perIp.hit(`ip:${context.address}`)) throw new HttpError(429, 'RATE_LIMITED', 'Muitas mensagens; aguarde um pouco');
  };
  const routes: Route[] = [
    route('POST', /^\/support\/contact$/, async (context) => {
      const body = await readBody(context.request, contactSchema);
      guard(context);
      return { ok: true, ...(await createContactTicket(deps, body, await currentUser(context)).catch(toHttp)) };
    }),
    route('POST', /^\/support\/rating$/, async (context) => {
      const body = await readBody(context.request, ratingSchema);
      guard(context);
      return { ok: true, ...(await createRatingTicket(deps, body, await currentUser(context)).catch(toHttp)) };
    })
  ];
  return { routes, prune: () => perIp.prune() };
}
