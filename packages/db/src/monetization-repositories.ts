import type { AdPlacement, AdSlotDto, SellerEarningDto } from '@justtld/shared';
import { queryOne, queryRows } from './pool';

const iso = (d: Date | string): string =>
  d instanceof Date ? d.toISOString() : new Date(d).toISOString();

/* ─────────────────────────── seller earnings (P2P 10% fee) ─────────────────────────── */

type EarningRow = {
  id: string;
  seller_address: string;
  order_id: string;
  listing_id: string | null;
  tld: string;
  gross_rub: string | number;
  fee_rub: string | number;
  net_rub: string | number;
  status: 'available' | 'requested' | 'paid';
  payout_destination: string | null;
  created_at: Date;
  paid_at: Date | null;
};

const toEarningDto = (r: EarningRow): SellerEarningDto => ({
  id: r.id,
  sellerAddress: r.seller_address,
  orderId: r.order_id,
  listingId: r.listing_id,
  tld: r.tld,
  grossRub: Number(r.gross_rub),
  feeRub: Number(r.fee_rub),
  netRub: Number(r.net_rub),
  status: r.status,
  payoutDestination: r.payout_destination,
  createdAt: iso(r.created_at),
  paidAt: r.paid_at ? iso(r.paid_at) : null,
});

export async function recordSellerEarning(input: {
  sellerAddress: string;
  orderId: string;
  listingId?: string | null;
  tld: string;
  grossRub: number;
  feePercent?: number;
}): Promise<SellerEarningDto> {
  const feePct = input.feePercent ?? 10;
  const feeRub = Number(((input.grossRub * feePct) / 100).toFixed(2));
  const netRub = Number((input.grossRub - feeRub).toFixed(2));

  const row = await queryOne<EarningRow>(
    `INSERT INTO seller_earnings (seller_address, order_id, listing_id, tld, gross_rub, fee_rub, net_rub)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (order_id) DO UPDATE SET tld = EXCLUDED.tld
     RETURNING *`,
    [
      input.sellerAddress.toLowerCase(),
      input.orderId,
      input.listingId ?? null,
      input.tld.toLowerCase(),
      input.grossRub,
      feeRub,
      netRub,
    ],
  );
  if (!row) throw new Error('recordSellerEarning failed');
  return toEarningDto(row);
}

export async function listSellerEarnings(sellerAddress: string): Promise<SellerEarningDto[]> {
  const rows = await queryRows<EarningRow>(
    `SELECT * FROM seller_earnings WHERE seller_address = $1 ORDER BY created_at DESC`,
    [sellerAddress.toLowerCase()],
  );
  return rows.map(toEarningDto);
}

export async function listAllSellerEarnings(limit = 100): Promise<SellerEarningDto[]> {
  const rows = await queryRows<EarningRow>(
    `SELECT * FROM seller_earnings ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(500, limit))],
  );
  return rows.map(toEarningDto);
}

export async function requestSellerPayout(
  sellerAddress: string,
  destination: string,
): Promise<number> {
  const rows = await queryRows<{ id: string }>(
    `UPDATE seller_earnings
     SET status = 'requested', payout_destination = $2
     WHERE seller_address = $1 AND status = 'available'
     RETURNING id`,
    [sellerAddress.toLowerCase(), destination],
  );
  return rows.length;
}

export async function markSellerEarningPaid(id: string): Promise<SellerEarningDto | null> {
  const row = await queryOne<EarningRow>(
    `UPDATE seller_earnings
     SET status = 'paid', paid_at = now()
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  return row ? toEarningDto(row) : null;
}

/* ─────────────────────────── ad slots ─────────────────────────── */

type AdRow = {
  id: string;
  placement: AdPlacement;
  title: string;
  description: string;
  cta_label: string;
  target_url: string;
  badge_text: string;
  owner_address: string | null;
  order_id: string | null;
  is_active: boolean;
  starts_at: Date;
  ends_at: Date;
  clicks_count: number;
  created_at: Date;
};

const toAdDto = (r: AdRow): AdSlotDto => ({
  id: r.id,
  placement: r.placement,
  title: r.title,
  description: r.description,
  ctaLabel: r.cta_label,
  targetUrl: r.target_url,
  badgeText: r.badge_text,
  ownerAddress: r.owner_address,
  isActive: r.is_active,
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  clicksCount: Number(r.clicks_count),
  createdAt: iso(r.created_at),
});

export async function listActiveAdSlots(placement?: AdPlacement): Promise<AdSlotDto[]> {
  const rows = placement
    ? await queryRows<AdRow>(
        `SELECT * FROM ad_slots
         WHERE is_active = true AND ends_at > now() AND placement = $1
         ORDER BY created_at DESC LIMIT 6`,
        [placement],
      )
    : await queryRows<AdRow>(
        `SELECT * FROM ad_slots
         WHERE is_active = true AND ends_at > now()
         ORDER BY created_at DESC LIMIT 20`,
      );
  return rows.map(toAdDto);
}

export async function listAllAdSlots(): Promise<AdSlotDto[]> {
  const rows = await queryRows<AdRow>(
    `SELECT * FROM ad_slots ORDER BY created_at DESC LIMIT 100`,
  );
  return rows.map(toAdDto);
}

export async function createAdSlot(input: {
  placement: AdPlacement;
  title: string;
  description: string;
  ctaLabel: string;
  targetUrl: string;
  badgeText?: string;
  ownerAddress?: string | null;
  orderId?: string | null;
  days?: number;
  isActive?: boolean;
}): Promise<AdSlotDto> {
  const row = await queryOne<AdRow>(
    `INSERT INTO ad_slots
       (placement, title, description, cta_label, target_url, badge_text, owner_address, order_id, is_active, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + ($10 || ' days')::interval)
     RETURNING *`,
    [
      input.placement,
      input.title,
      input.description,
      input.ctaLabel,
      input.targetUrl,
      input.badgeText || 'Реклама',
      input.ownerAddress ? input.ownerAddress.toLowerCase() : null,
      input.orderId ?? null,
      input.isActive ?? true,
      input.days ?? 7,
    ],
  );
  if (!row) throw new Error('createAdSlot failed');
  return toAdDto(row);
}

export async function deleteAdSlot(id: string): Promise<boolean> {
  const rows = await queryRows<{ id: string }>(
    `DELETE FROM ad_slots WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

export async function toggleAdSlot(id: string, isActive: boolean): Promise<AdSlotDto | null> {
  const row = await queryOne<AdRow>(
    `UPDATE ad_slots SET is_active = $2 WHERE id = $1 RETURNING *`,
    [id, isActive],
  );
  return row ? toAdDto(row) : null;
}

export async function incrementAdClick(id: string): Promise<string | null> {
  const row = await queryOne<{ target_url: string }>(
    `UPDATE ad_slots
     SET clicks_count = clicks_count + 1
     WHERE id = $1 AND is_active = true
     RETURNING target_url`,
    [id],
  );
  return row?.target_url ?? null;
}
