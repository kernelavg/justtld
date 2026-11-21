import { getAccountByWallet, placeAuctionBid } from '@justtld/db';
import { ApiError, placeAuctionBidSchema, shortenAddress } from '@justtld/shared';
import { getSessionFromRequest } from '@/lib/server/auth';
import { jsonResponse, readJson, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request, context) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Войдите, чтобы сделать ставку');

    const { id } = await (context as { params: Promise<{ id: string }> }).params;
    const body = await readJson(request, placeAuctionBidSchema);

    const account = await getAccountByWallet(session.address);
    const bidderLabel = account?.displayName || account?.email || shortenAddress(session.address);

    try {
      const result = await placeAuctionBid({
        auctionId: id,
        bidderAddress: session.address,
        bidderLabel,
        amountRub: body.amountRub,
      });
      return jsonResponse({ ok: true, ...result }, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'AUCTION_NOT_FOUND') throw ApiError.notFound('Аукцион не найден');
      if (msg === 'AUCTION_ENDED') throw ApiError.conflict('AUCTION_ENDED', 'Аукцион уже завершён');
      if (msg === 'ALREADY_LEADING') {
        throw ApiError.conflict('ALREADY_LEADING', 'Ваша ставка уже лидирует');
      }
      if (msg.startsWith('BID_TOO_LOW:')) {
        const min = msg.split(':')[1];
        throw ApiError.badRequest('BID_TOO_LOW', `Минимальная ставка: ${min} ₽`);
      }
      throw err;
    }
  },
  { limit: 'write', bucket: 'auctions-bid' },
);
