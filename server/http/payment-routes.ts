import { z } from 'zod';
import { PaymentError, createCheckout, handlePaymentNotification, listProducts, reconcileUser, verifySignature, type PaymentsConfig } from '../payments/mercadopago';
import type { Db } from '../db/client';
import { HttpError, readBody, readJsonBody, route, sendJson, type Handler, type Route } from './router';

const checkoutSchema = z.object({ productId: z.string().min(1).max(64) });

const toHttp = (error: unknown): never => {
  if (error instanceof PaymentError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

/**
 * Public, read-only coin catalog. It answers even with payments off (`enabled: false`), so the Store can show the
 * prices; it never creates a purchase. The checkout below only exists when Mercado Pago is configured.
 */
export function createCatalogRoutes(db: Db, enabled: boolean): Route[] {
  return [route('GET', /^\/shop\/products$/, async () => ({ ok: true, enabled, products: await listProducts(db) }))];
}

export function createPaymentRoutes(config: PaymentsConfig, withAuth: (handler: Handler) => Handler): Route[] {
  return [
    route('POST', /^\/shop\/checkout$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, checkoutSchema);
      return { ok: true, ...(await createCheckout(config, userId!, body.productId).catch(toHttp)) };
    })),
    /** The buyer's browser calls this on the way back from the checkout; it only ever touches the caller's own purchases. */
    route('POST', /^\/shop\/reconcile$/, withAuth(async ({ userId }) => ({ ok: true, ...(await reconcileUser(config, userId!).catch(toHttp)) }))),
    /** Mercado Pago calls this; answers 200 fast even for events it ignores, 401 when the signature does not match. */
    route('POST', /^\/payments\/webhook$/, async ({ request, response, url }) => {
      const body = await readJsonBody(request) as { type?: string; data?: { id?: string | number } };
      const dataId = String(url.searchParams.get('data.id') ?? body.data?.id ?? '');
      const signature = request.headers['x-signature'];
      const requestId = request.headers['x-request-id'];
      if (!verifySignature(config.webhookSecret, Array.isArray(signature) ? signature[0] : signature, Array.isArray(requestId) ? requestId[0] : requestId, dataId)) {
        sendJson(response, 401, { ok: false });
        return;
      }
      const type = url.searchParams.get('type') ?? body.type;
      if (type !== 'payment' || !dataId) return { ok: true, result: 'ignored' };
      return { ok: true, result: await handlePaymentNotification(config, dataId).catch(toHttp) };
    })
  ];
}
