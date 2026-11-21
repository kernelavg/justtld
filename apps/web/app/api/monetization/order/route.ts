import {
  boostAuction,
  boostStoreListing,
  createAdSlot,
  getAuctionById,
  getStoreListingById,
  setSiteProUnlocked,
} from '@justtld/db';
import { ApiError, monetizationOrderSchema } from '@justtld/shared';
import { getSessionFromRequest } from '@/lib/server/auth';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { requireAssetOwner } from '@/lib/server/ownership';
import { createMonetizationOrder, MONETIZATION_PRICES } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Требуется вход в аккаунт');
    const url = new URL(request.url);
    const adminApply = url.searchParams.get('adminApply') === '1';
    const body = await readJson(request, monetizationOrderSchema);

    if (body.kind === 'site_pro') {
      if (!body.tld) throw ApiError.badRequest('MISSING_TLD', 'Укажите домен');
      await requireAssetOwner(request, body.tld, body.subLabel);
      if (adminApply && session.role === 'admin') {
        const settings = await setSiteProUnlocked(body.tld, body.subLabel, true);
        return jsonResponse({ applied: true, settings });
      }
    } else if (body.kind === 'boost_listing') {
      if (!body.targetId) throw ApiError.badRequest('MISSING_TARGET', 'Укажите id лота');
      const listing = await getStoreListingById(body.targetId);
      if (!listing || listing.status !== 'available') {
        throw ApiError.notFound('Лот не найден или уже продан');
      }
      if (
        session.role !== 'admin' &&
        listing.sellerAddress?.toLowerCase() !== session.address.toLowerCase()
      ) {
        throw ApiError.forbidden('Поднять в ТОП можно только свой лот');
      }
      if (adminApply && session.role === 'admin') {
        const updated = await boostStoreListing(listing.id, 7);
        return jsonResponse({ applied: true, listing: updated });
      }
    } else if (body.kind === 'boost_auction') {
      if (!body.targetId) throw ApiError.badRequest('MISSING_TARGET', 'Укажите id аукциона');
      const auction = await getAuctionById(body.targetId);
      if (!auction || auction.status !== 'active') {
        throw ApiError.notFound('Активный аукцион не найден');
      }
      if (
        session.role !== 'admin' &&
        auction.createdBy.toLowerCase() !== session.address.toLowerCase()
      ) {
        throw ApiError.forbidden('Поднять в ТОП можно только свой аукцион');
      }
      if (adminApply && session.role === 'admin') {
        const updated = await boostAuction(auction.id, 7);
        return jsonResponse({ applied: true, auction: updated });
      }
    } else if (body.kind === 'ad_slot') {
      if (!body.ad) {
        throw ApiError.badRequest('MISSING_AD', 'Заполните данные рекламного блока');
      }
      if (adminApply && session.role === 'admin') {
        const ad = await createAdSlot({
          ...body.ad,
          ownerAddress: session.address,
          days: 30,
          isActive: true,
        });
        return jsonResponse({ applied: true, ad });
      }
    }

    const result = await createMonetizationOrder({
      buyerAddress: session.address,
      buyerEmail: null,
      kind: body.kind,
      tld: body.tld,
      subLabel: body.subLabel,
      targetId: body.targetId,
      ad: body.ad,
      provider: body.provider,
      currency: body.currency,
    });

    return jsonResponse({
      ...result,
      price: MONETIZATION_PRICES[body.kind],
    });
  },
  { limit: 'write', bucket: 'monetization-order' },
);
