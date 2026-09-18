import { z } from 'zod';
import { PaymentError, createCheckout, handlePaymentNotification, listProducts, verifySignature, type PaymentsConfig } from '../payments/mercadopago';
import { HttpError, readBody, readJsonBody, route, sendJson, type Handler, type Route } from './router';

const checkoutSchema = z.object({ productId: z.string().min(1).max(64) });

const toHttp = (error: unknown): never => {
  if (error instanceof PaymentError) throw new HttpError(error.status, error.code, error.message);
  throw error;
};

export function createPaymentRoutes(config: PaymentsConfig, withAuth: (handler: Handler) => Handler): Route[] {
  return [
    route('GET', /^\/shop\/products$/, async () => ({ ok: true, products: await listProducts(config.db) })),
    route('POST', /^\/shop\/checkout$/, withAuth(async ({ request, userId }) => {
      const body = await readBody(request, checkoutSchema);
      return { ok: true, ...(await createCheckout(config, userId!, body.productId).catch(toHttp)) };
    })),
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
