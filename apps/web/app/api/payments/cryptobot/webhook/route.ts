import { getPaymentOrderByExternalId } from '@justtld/db';
import { ApiError } from '@justtld/shared';
import { jsonResponse, route } from '@/lib/server/http';
import { fulfillPaymentOrder, verifyCryptoBotWebhookSignature } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const rawBody = await request.text();
    const signature = request.headers.get('crypto-pay-api-signature');
    if (!verifyCryptoBotWebhookSignature(rawBody, signature)) {
      throw ApiError.forbidden('Некорректная подпись CryptoBot webhook');
    }

    let payload: {
      update_type?: string;
      payload?: { invoice_id?: number | string; status?: string; payload?: string };
    };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      throw ApiError.badRequest('INVALID_JSON', 'Некорректный JSON в webhook CryptoBot');
    }

    if (payload.update_type !== 'invoice_paid') {
      return jsonResponse({ ok: true, ignored: payload.update_type ?? 'unknown' });
    }

    const invoice = payload.payload;
    let orderId = (invoice?.payload ?? '').trim();
    if (orderId.startsWith('{')) {
      try {
        const parsed = JSON.parse(orderId) as { orderId?: string };
        orderId = parsed.orderId ?? '';
      } catch {
        // оставляем пустым
      }
    }

    if (!orderId && invoice?.invoice_id != null) {
      const found = await getPaymentOrderByExternalId('cryptobot', String(invoice.invoice_id));
      if (found) orderId = found.id;
    }

    if (!orderId) {
      return jsonResponse({ ok: true, skipped: 'order_not_found' });
    }

    const order = await fulfillPaymentOrder(orderId, {
      externalId: invoice?.invoice_id != null ? String(invoice.invoice_id) : undefined,
    });
    return jsonResponse({ ok: true, orderId: order.id, status: order.status });
  },
  { limit: 'write', bucket: 'cryptobot-webhook', skipOriginCheck: true },
);
