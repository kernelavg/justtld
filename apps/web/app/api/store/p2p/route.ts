import {
  createP2pListing,
  deleteStoreListing,
  getStoreListingById,
  getStorePricing,
  listAllSellerEarnings,
  listSellerEarnings,
  markSellerEarningPaid,
  requestSellerPayout,
} from '@justtld/db';
import {
  ApiError,
  p2pListingCreateSchema,
  sellerPayoutRequestSchema,
} from '@justtld/shared';
import { getSessionFromRequest } from '@/lib/server/auth';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { requireAssetOwner } from '@/lib/server/ownership';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return jsonResponse({
        earnings: [],
        allEarnings: [],
        totals: { availableRub: 0, requestedRub: 0, paidRub: 0 },
      });
    }
    const url = new URL(request.url);
    const earnings = await listSellerEarnings(session.address);
    const totals = earnings.reduce(
      (acc, e) => {
        if (e.status === 'available') acc.availableRub += e.netRub;
        if (e.status === 'requested') acc.requestedRub += e.netRub;
        if (e.status === 'paid') acc.paidRub += e.netRub;
        return acc;
      },
      { availableRub: 0, requestedRub: 0, paidRub: 0 },
    );
    const allEarnings =
      url.searchParams.get('all') === '1' && session.role === 'admin'
        ? await listAllSellerEarnings(100)
        : [];
    return jsonResponse({ earnings, allEarnings, totals });
  },
  { limit: 'read', bucket: 'p2p-read' },
);

export const POST = route(
  async (request) => {
    const body = await readJson(request, p2pListingCreateSchema);
    const { session } = await requireAssetOwner(request, body.tld, body.subLabel);

    const pricing = await getStorePricing();
    const rubPerUsdt =
      pricing.customZonePriceUsdt > 0
        ? pricing.customZonePriceRub / pricing.customZonePriceUsdt
        : 95;
    const priceUsdt = Number(Math.max(1, body.priceRub / rubPerUsdt).toFixed(2));

    const listing = await createP2pListing({
      tld: body.tld,
      subLabel: body.subLabel,
      title: body.title,
      description: body.description,
      priceRub: body.priceRub,
      priceUsdt,
      sellerAddress: session.address,
      feePercent: 10,
    });

    return jsonResponse({ listing }, { status: 201 });
  },
  { limit: 'write', bucket: 'p2p-write' },
);

export const PATCH = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Требуется вход в аккаунт');
    const url = new URL(request.url);
    const markPaidId = url.searchParams.get('markPaid');
    if (markPaidId) {
      if (session.role !== 'admin') {
        throw ApiError.forbidden('Только администратор может подтвердить выплату');
      }
      const updated = await markSellerEarningPaid(markPaidId);
      if (!updated) throw ApiError.notFound('Начисление не найдено');
      return jsonResponse({ earning: updated });
    }

    const body = await readJson(request, sellerPayoutRequestSchema);
    const count = await requestSellerPayout(session.address, body.destination);
    if (count === 0) {
      throw ApiError.badRequest('NO_EARNINGS', 'Нет доступных средств для вывода');
    }
    return jsonResponse({ requestedCount: count });
  },
  { limit: 'write', bucket: 'p2p-write' },
);

export const DELETE = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Требуется вход в аккаунт');
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) throw ApiError.badRequest('MISSING_ID', 'Укажите id лота');

    const listing = await getStoreListingById(id);
    if (!listing) throw ApiError.notFound('Лот не найден');
    if (listing.status !== 'available') {
      throw ApiError.conflict('ALREADY_SOLD', 'Нельзя снять уже проданный лот');
    }
    if (
      session.role !== 'admin' &&
      listing.sellerAddress?.toLowerCase() !== session.address.toLowerCase()
    ) {
      throw ApiError.forbidden('Вы можете снять только свой лот');
    }

    await deleteStoreListing(id);
    return jsonResponse({ deleted: true });
  },
  { limit: 'write', bucket: 'p2p-write' },
);
