import { getCustody, getPaymentOrderById } from '@justtld/db';
import { ApiError } from '@justtld/shared';
import { getSessionFromRequest } from '@/lib/server/auth';
import { paymentsSandbox } from '@/lib/server/config';
import { jsonResponse, route } from '@/lib/server/http';
import { fulfillPaymentOrder, syncCryptoBotOrderStatus } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = route(
  async (request, context) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Войдите в кабинет');

    const { id } = await (context as Params).params;
    const order = await getPaymentOrderById(id);
    if (!order) throw ApiError.notFound('Заказ не найден');

    if (
      order.buyerAddress.toLowerCase() !== session.address.toLowerCase() &&
      session.role !== 'admin'
    ) {
      throw ApiError.forbidden('Нет доступа к этому заказу');
    }

    const updated =
      order.status === 'pending' && order.provider === 'cryptobot'
        ? await syncCryptoBotOrderStatus(order)
        : order;

    return jsonResponse({ order: updated });
  },
  { limit: 'read', bucket: 'store-order-status' },
);

export const POST = route(
  async (request, context) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Войдите в кабинет');

    const { id } = await (context as Params).params;
    const order = await getPaymentOrderById(id);
    if (!order) throw ApiError.notFound('Заказ не найден');

    const isAdmin = session.role === 'admin';
    const isBuyer = order.buyerAddress.toLowerCase() === session.address.toLowerCase();
    if (!isAdmin && !isBuyer) {
      throw ApiError.forbidden('Нет доступа к этому заказу');
    }

    if (!isAdmin && (!paymentsSandbox() || order.provider !== 'sandbox')) {
      throw ApiError.forbidden(
        'Подтверждение оплаты вручную доступно только администратору или в тестовом режиме sandbox',
      );
    }

    const updated = await fulfillPaymentOrder(order.id, {
      externalId: order.externalId ?? 'sandbox-confirmed',
    });
    const custody = await getCustody(updated.tld, updated.subLabel);
    return jsonResponse({ ok: true, order: updated, custody });
  },
  { limit: 'write', bucket: 'store-order-confirm' },
);
