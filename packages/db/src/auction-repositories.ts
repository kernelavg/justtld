import type { AuctionBidDto, AuctionDto, AuctionStatus } from '@justtld/shared';
import { getPool, queryOne, queryRows } from './pool';

const iso = (d: Date | string): string =>
  d instanceof Date ? d.toISOString() : new Date(d).toISOString();

type AuctionRow = {
  id: string;
  tld: string;
  title: string;
  description: string;
  start_price_rub: string | number;
  min_step_rub: string | number;
  current_bid_rub: string | number;
  bids_count: number;
  leader_address: string | null;
  leader_label: string | null;
  created_by: string;
  starts_at: Date;
  ends_at: Date;
  status: AuctionStatus;
  settlement_order_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type BidRow = {
  id: string;
  auction_id: string;
  bidder_address: string;
  bidder_label: string;
  amount_rub: string | number;
  created_at: Date;
};

function mapAuction(row: AuctionRow): AuctionDto {
  return {
    id: row.id,
    tld: row.tld,
    title: row.title,
    description: row.description,
    startPriceRub: Number(row.start_price_rub),
    minStepRub: Number(row.min_step_rub),
    currentBidRub: Number(row.current_bid_rub),
    bidsCount: Number(row.bids_count),
    leaderAddress: row.leader_address,
    leaderLabel: row.leader_label,
    createdBy: row.created_by,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    status: row.status,
    settlementOrderId: row.settlement_order_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapBid(row: BidRow): AuctionBidDto {
  return {
    id: row.id,
    auctionId: row.auction_id,
    bidderAddress: row.bidder_address,
    bidderLabel: row.bidder_label,
    amountRub: Number(row.amount_rub),
    createdAt: iso(row.created_at),
  };
}

/** Закрывает истекшие активные аукционы: со ставками -> awaiting_payment, без ставок -> cancelled. */
export async function syncExpiredAuctions(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE zone_auctions
     SET status = CASE WHEN bids_count > 0 THEN 'awaiting_payment' ELSE 'cancelled' END,
         updated_at = now()
     WHERE status = 'active' AND ends_at <= now()`,
  );
}

export async function listAuctions(options?: {
  status?: AuctionStatus | 'all';
  limit?: number;
}): Promise<AuctionDto[]> {
  await syncExpiredAuctions();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  const status = options?.status ?? 'all';
  const rows =
    status === 'all'
      ? await queryRows<AuctionRow>(
          `SELECT * FROM zone_auctions
           ORDER BY
             CASE status
               WHEN 'active' THEN 0
               WHEN 'awaiting_payment' THEN 1
               WHEN 'settled' THEN 2
               ELSE 3
             END,
             ends_at ASC
           LIMIT $1`,
          [limit],
        )
      : await queryRows<AuctionRow>(
          `SELECT * FROM zone_auctions WHERE status = $1 ORDER BY ends_at ASC LIMIT $2`,
          [status, limit],
        );
  return rows.map(mapAuction);
}

export async function countActiveAuctionsByCreator(createdBy: string): Promise<number> {
  await syncExpiredAuctions();
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM zone_auctions
     WHERE created_by = $1 AND status = 'active'`,
    [createdBy.toLowerCase()],
  );
  return Number(row?.count ?? 0);
}

export async function getAuctionById(id: string): Promise<AuctionDto | null> {
  await syncExpiredAuctions();
  const row = await queryOne<AuctionRow>(`SELECT * FROM zone_auctions WHERE id = $1`, [id]);
  return row ? mapAuction(row) : null;
}

export async function getActiveAuctionByTld(tld: string): Promise<AuctionDto | null> {
  await syncExpiredAuctions();
  const row = await queryOne<AuctionRow>(
    `SELECT * FROM zone_auctions
     WHERE tld = $1 AND status IN ('active', 'awaiting_payment')
     LIMIT 1`,
    [tld.toLowerCase()],
  );
  return row ? mapAuction(row) : null;
}

export async function listAuctionBids(auctionId: string, limit = 50): Promise<AuctionBidDto[]> {
  const rows = await queryRows<BidRow>(
    `SELECT * FROM zone_auction_bids
     WHERE auction_id = $1
     ORDER BY amount_rub DESC, created_at DESC
     LIMIT $2`,
    [auctionId, limit],
  );
  return rows.map(mapBid);
}

export async function createAuction(input: {
  tld: string;
  title: string;
  description?: string;
  startPriceRub: number;
  minStepRub: number;
  durationHours: number;
  createdBy: string;
}): Promise<AuctionDto> {
  await syncExpiredAuctions();
  const row = await queryOne<AuctionRow>(
    `INSERT INTO zone_auctions
       (tld, title, description, start_price_rub, min_step_rub, created_by, ends_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 * interval '1 hour'), 'active')
     RETURNING *`,
    [
      input.tld.toLowerCase(),
      input.title,
      input.description ?? '',
      input.startPriceRub,
      input.minStepRub,
      input.createdBy.toLowerCase(),
      input.durationHours,
    ],
  );
  if (!row) throw new Error('createAuction failed');
  return mapAuction(row);
}

/**
 * Делает ставку в транзакции с блокировкой строки.
 * Если до конца < 5 минут, срабатывает анти-снайпинг (+5 минут).
 */
export async function placeAuctionBid(input: {
  auctionId: string;
  bidderAddress: string;
  bidderLabel: string;
  amountRub: number;
}): Promise<{ auction: AuctionDto; bid: AuctionBidDto }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockRes = await client.query<AuctionRow>(
      `SELECT * FROM zone_auctions WHERE id = $1 FOR UPDATE`,
      [input.auctionId],
    );
    const current = lockRes.rows[0];
    if (!current) {
      throw new Error('AUCTION_NOT_FOUND');
    }
    if (current.status !== 'active' || new Date(current.ends_at).getTime() <= Date.now()) {
      if (current.status === 'active') {
        await client.query(
          `UPDATE zone_auctions
           SET status = CASE WHEN bids_count > 0 THEN 'awaiting_payment' ELSE 'cancelled' END,
               updated_at = now()
           WHERE id = $1`,
          [current.id],
        );
      }
      throw new Error('AUCTION_ENDED');
    }

    const normalizedBidder = input.bidderAddress.toLowerCase();
    if (current.leader_address && current.leader_address.toLowerCase() === normalizedBidder) {
      throw new Error('ALREADY_LEADING');
    }

    const startPrice = Number(current.start_price_rub);
    const minStep = Number(current.min_step_rub);
    const curBid = Number(current.current_bid_rub);
    const requiredMin = current.bids_count === 0 ? startPrice : curBid + minStep;

    if (input.amountRub < requiredMin) {
      throw new Error(`BID_TOO_LOW:${requiredMin}`);
    }

    const bidRes = await client.query<BidRow>(
      `INSERT INTO zone_auction_bids (auction_id, bidder_address, bidder_label, amount_rub)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [current.id, normalizedBidder, input.bidderLabel, input.amountRub],
    );

    // Анти-снайпинг: если осталось менее 5 минут, продлеваем до now() + 5 минут.
    const updRes = await client.query<AuctionRow>(
      `UPDATE zone_auctions
       SET current_bid_rub = $2,
           bids_count = bids_count + 1,
           leader_address = $3,
           leader_label = $4,
           ends_at = GREATEST(ends_at, now() + interval '5 minutes'),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [current.id, input.amountRub, normalizedBidder, input.bidderLabel],
    );

    await client.query('COMMIT');
    return {
      auction: mapAuction(updRes.rows[0]!),
      bid: mapBid(bidRes.rows[0]!),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function linkAuctionOrder(auctionId: string, orderId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE zone_auctions SET settlement_order_id = $2, updated_at = now() WHERE id = $1`,
    [auctionId, orderId],
  );
}

export async function markAuctionSettled(
  auctionId: string,
  orderId?: string | null,
): Promise<AuctionDto | null> {
  const row = await queryOne<AuctionRow>(
    `UPDATE zone_auctions
     SET status = 'settled',
         settlement_order_id = COALESCE($2, settlement_order_id),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [auctionId, orderId ?? null],
  );
  return row ? mapAuction(row) : null;
}

export async function cancelAuction(auctionId: string): Promise<AuctionDto | null> {
  const row = await queryOne<AuctionRow>(
    `UPDATE zone_auctions
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND status IN ('active', 'awaiting_payment')
     RETURNING *`,
    [auctionId],
  );
  return row ? mapAuction(row) : null;
}
