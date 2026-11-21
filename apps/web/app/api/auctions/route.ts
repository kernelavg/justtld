import {
  countActiveAuctionsByCreator,
  createAuction,
  getActiveAuctionByTld,
  getCustody,
  getZoneByTld,
  listAuctions,
  listStoreListings,
} from '@justtld/db';
import {
  ApiError,
  createAuctionSchema,
  normalizeTld,
  validateTldFormat,
} from '@justtld/shared';
import { getSessionFromRequest } from '@/lib/server/auth';
import { checkRegistrationOnChain } from '@/lib/server/chain';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { paymentGatewaysStatus } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status') ?? 'all';
    const status =
      statusParam === 'active' ||
      statusParam === 'awaiting_payment' ||
      statusParam === 'settled' ||
      statusParam === 'cancelled'
        ? statusParam
        : 'all';
    const auctions = await listAuctions({ status, limit: 100 });
    return jsonResponse({
      auctions,
      gateways: paymentGatewaysStatus(),
    });
  },
  { limit: 'read', bucket: 'auctions-list' },
);

export const POST = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Войдите в кабинет, чтобы открыть аукцион');

    const body = await readJson(request, createAuctionSchema);
    const tld = normalizeTld(body.tld);
    const format = validateTldFormat(tld);
    if (!format.ok) {
      throw ApiError.badRequest(format.code ?? 'INVALID_TLD', 'Некорректное имя зоны');
    }

    if (session.role !== 'admin') {
      const activeCount = await countActiveAuctionsByCreator(session.address);
      if (activeCount >= 3) {
        throw ApiError.conflict(
          'AUCTION_LIMIT',
          'Можно одновременно открыть не более 3 аукционов',
        );
      }
    }

    const [onchainCheck, dbZone, custody, activeAuction, listings] = await Promise.all([
      checkRegistrationOnChain(tld).catch(() => ({ ok: true, reason: '' })),
      getZoneByTld(tld),
      getCustody(tld, ''),
      getActiveAuctionByTld(tld),
      listStoreListings(true),
    ]);

    if (!onchainCheck.ok) {
      throw ApiError.conflict(
        'TLD_UNAVAILABLE',
        `Зона ${tld} недоступна (${onchainCheck.reason || 'занята или зарезервирована'})`,
      );
    }
    if (dbZone && dbZone.status === 'active') {
      throw ApiError.conflict('ZONE_TAKEN', `Зона ${tld} уже зарегистрирована`);
    }
    if (custody && new Date(custody.expiresAt).getTime() > Date.now()) {
      throw ApiError.conflict('ZONE_TAKEN', `Зона ${tld} уже занята`);
    }
    if (activeAuction) {
      throw ApiError.conflict('AUCTION_EXISTS', `Аукцион на ${tld} уже идёт`);
    }
    if (listings.some((l) => l.tld === tld && l.subLabel === '' && l.status === 'available')) {
      throw ApiError.conflict(
        'IN_STORE',
        `Зона ${tld} уже продаётся по фиксированной цене в магазине`,
      );
    }

    const auction = await createAuction({
      tld,
      title: body.title?.trim() || `Аукцион зоны ${tld}`,
      description: body.description?.trim() || '',
      startPriceRub: body.startPriceRub,
      minStepRub: body.minStepRub,
      durationHours: body.durationHours,
      createdBy: session.address,
    });

    return jsonResponse({ ok: true, auction }, { status: 201 });
  },
  { limit: 'write', bucket: 'auctions-create' },
);
