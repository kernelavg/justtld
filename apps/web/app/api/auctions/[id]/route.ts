import { getAuctionById, listAuctionBids } from '@justtld/db';
import { ApiError } from '@justtld/shared';
import { jsonResponse, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (_request, context) => {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;
    const auction = await getAuctionById(id);
    if (!auction) throw ApiError.notFound('Аукцион не найден');
    const bids = await listAuctionBids(auction.id, 50);
    return jsonResponse({ auction, bids });
  },
  { limit: 'read', bucket: 'auctions-detail' },
);
