import {
  getAccountByWallet,
  getAuctionById,
  markAuctionSettled,
  upsertCustody,
} from '@justtld/db';
import { ApiError, claimAuctionSchema } from '@justtld/shared';
import { getSessionFromRequest } from '@/lib/server/auth';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { createAuctionSettlementOrder, ensureStarterSite } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request, context) => {
    const session = await getSessionFromRequest(request);
    if (!session) throw ApiError.unauthorized('Войдите для получения выигранной зоны');

    const { id } = await (context as { params: Promise<{ id: string }> }).params;
    const body = await readJson(request, claimAuctionSchema);

    const auction = await getAuctionById(id);
    if (!auction) throw ApiError.notFound('Аукцион не найден');
    if (auction.status === 'settled') {
      throw ApiError.conflict('ALREADY_SETTLED', 'Эта зона уже передана победителю');
    }
    if (auction.status !== 'awaiting_payment' || !auction.leaderAddress) {
      throw ApiError.conflict('NOT_FINISHED', 'Аукцион ещё не завершён или нет ставок');
    }

    const isAdmin = session.role === 'admin';
    const isWinner = auction.leaderAddress.toLowerCase() === session.address.toLowerCase();

    if (body.adminGrant) {
      if (!isAdmin) throw ApiError.forbidden('Выдать без оплаты может только администратор');
      await upsertCustody({
        tld: auction.tld,
        subLabel: '',
        ownerAddress: auction.leaderAddress,
        source: 'admin',
        periodDays: 365,
      });
      await ensureStarterSite(auction.tld, '', auction.leaderAddress);
      const settled = await markAuctionSettled(auction.id, null);
      return jsonResponse({ ok: true, granted: true, auction: settled });
    }

    if (!isWinner && !isAdmin) {
      throw ApiError.forbidden('Забрать зону может только победитель аукциона');
    }

    const account = await getAccountByWallet(auction.leaderAddress);
    const result = await createAuctionSettlementOrder({
      auctionId: auction.id,
      tld: auction.tld,
      amountRub: auction.currentBidRub,
      buyerAddress: auction.leaderAddress,
      buyerEmail: account?.email ?? null,
      provider: body.provider,
      currency: body.currency,
    });

    return jsonResponse({ ok: true, ...result }, { status: 201 });
  },
  { limit: 'write', bucket: 'auctions-claim' },
);
