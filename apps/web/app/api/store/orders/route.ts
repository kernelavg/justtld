import { listPaymentOrders } from '@justtld/db';
import { ApiError, createOrderSchema } from '@justtld/shared';
import { getSessionFromRequest } from '@/lib/server/auth';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { createCheckoutOrder } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Войдите в кабинет для просмотра заказов');
    const orders = await listPaymentOrders({ buyerAddress: session.address, limit: 50 });
    return jsonResponse({ orders });
  },
  { limit: 'read', bucket: 'store-orders-list' },
);

export const POST = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Войдите в кабинет для оформления заказа');
    const body = await readJson(request, createOrderSchema);
    const result = await createCheckoutOrder({
      buyerAddress: session.address,
      buyerEmail: body.buyerEmail ?? null,
      kind: body.kind,
      listingId: body.listingId,
      tld: body.tld,
      subLabel: body.subLabel,
      provider: body.provider,
      currency: body.currency,
    });
    return jsonResponse(result, { status: 201 });
  },
  { limit: 'write', bucket: 'store-orders-create' },
);
