import { ApiError } from '@justtld/shared';
import { jsonResponse, route } from '@/lib/server/http';
import { fulfillPaymentOrder, verifyYooMoneyNotificationSignature } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    const get = (k: string) => params.get(k) ?? '';

    const valid = verifyYooMoneyNotificationSignature({
      notification_type: get('notification_type'),
      operation_id: get('operation_id'),
      amount: get('amount'),
      currency: get('currency'),
      datetime: get('datetime'),
      sender: get('sender'),
      codepro: get('codepro'),
      label: get('label'),
      sha1_hash: get('sha1_hash'),
    });

    if (!valid) {
      throw ApiError.forbidden('Некорректная подпись уведомления ЮMoney');
    }

    if (get('unaccepted') === 'true') {
      return jsonResponse({ ok: true, skipped: 'unaccepted' });
    }

    const orderId = get('label').trim();
    if (!orderId) {
      return jsonResponse({ ok: true, skipped: 'missing_label' });
    }

    const order = await fulfillPaymentOrder(orderId, {
      externalId: get('operation_id') || undefined,
    });
    return jsonResponse({ ok: true, orderId: order.id, status: order.status });
  },
  { limit: 'write', bucket: 'yoomoney-webhook', skipOriginCheck: true },
);
