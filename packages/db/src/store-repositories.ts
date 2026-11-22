import type {
  AccountDto,
  DnsRecordDto,
  DnsRecordType,
  OrderKind,
  PaymentOrderDto,
  PaymentProvider,
  PaymentStatus,
  SiteFileDto,
  SiteMode,
  SiteSettingsDto,
  StoreListingDto,
  StoreListingStatus,
  StorePricingDto,
  ZoneCustodyDto,
} from '@justtld/shared';
import { queryOne, queryRows } from './pool';

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/* ─────────────────────────── accounts ─────────────────────────── */

type AccountRow = {
  id: string;
  email: string;
  password_hash: string;
  wallet_address: string;
  display_name: string | null;
  created_at: Date;
};

export async function createAccount(input: {
  email: string;
  passwordHash: string;
  walletAddress: string;
  displayName?: string | null;
}): Promise<AccountDto> {
  const row = await queryOne<AccountRow>(
    `INSERT INTO accounts (email, password_hash, wallet_address, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, password_hash, wallet_address, display_name, created_at`,
    [
      input.email.toLowerCase(),
      input.passwordHash,
      input.walletAddress.toLowerCase(),
      input.displayName ?? null,
    ],
  );
  if (!row) throw new Error('createAccount failed');
  return {
    id: row.id,
    email: row.email,
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    createdAt: iso(row.created_at),
  };
}

export async function getAccountWithPasswordByEmail(
  email: string,
): Promise<(AccountDto & { passwordHash: string }) | null> {
  const row = await queryOne<AccountRow>(
    `SELECT id, email, password_hash, wallet_address, display_name, created_at
     FROM accounts WHERE email = $1`,
    [email.toLowerCase()],
  );
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    createdAt: iso(row.created_at),
  };
}

export async function getAccountByWallet(walletAddress: string): Promise<AccountDto | null> {
  const row = await queryOne<AccountRow>(
    `SELECT id, email, password_hash, wallet_address, display_name, created_at
     FROM accounts WHERE wallet_address = $1`,
    [walletAddress.toLowerCase()],
  );
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    createdAt: iso(row.created_at),
  };
}

export async function getAccountByEmail(email: string): Promise<AccountDto | null> {
  const row = await queryOne<AccountRow>(
    `SELECT id, email, password_hash, wallet_address, display_name, created_at
     FROM accounts WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    createdAt: iso(row.created_at),
  };
}

/* ─────────────────────────── store pricing ─────────────────────────── */

const DEFAULT_PRICING: StorePricingDto = {
  customZoneEnabled: true,
  customZonePriceRub: 490,
  customZonePriceUsdt: 5,
  customSubdomainEnabled: true,
  customSubdomainPriceRub: 190,
  customSubdomainPriceUsdt: 2,
};

export async function getStorePricing(): Promise<StorePricingDto> {
  const row = await queryOne<{ value: Partial<StorePricingDto> }>(
    `SELECT value FROM store_settings WHERE key = 'pricing'`,
  );
  return { ...DEFAULT_PRICING, ...(row?.value ?? {}) };
}

export async function saveStorePricing(pricing: StorePricingDto): Promise<StorePricingDto> {
  await queryRows(
    `INSERT INTO store_settings (key, value, updated_at)
     VALUES ('pricing', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(pricing)],
  );
  return pricing;
}

/* ─────────────────────────── store listings ─────────────────────────── */

type ListingRow = {
  id: string;
  tld: string;
  sub_label: string;
  title: string;
  description: string;
  price_rub: string;
  price_usdt: string;
  period_days: number;
  status: StoreListingStatus;
  buyer_address: string | null;
  seller_address: string | null;
  fee_percent: number | null;
  is_featured: boolean | null;
  featured_until: Date | null;
  sold_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const toListingDto = (r: ListingRow): StoreListingDto => {
  const featuredActive =
    Boolean(r.is_featured) && (!r.featured_until || r.featured_until.getTime() > Date.now());
  return {
    id: r.id,
    tld: r.tld,
    subLabel: r.sub_label,
    title: r.title,
    description: r.description,
    priceRub: Number(r.price_rub),
    priceUsdt: Number(r.price_usdt),
    periodDays: r.period_days,
    status: r.status,
    buyerAddress: r.buyer_address,
    sellerAddress: r.seller_address ?? null,
    feePercent: r.fee_percent ?? 10,
    isFeatured: featuredActive,
    featuredUntil: r.featured_until ? iso(r.featured_until) : null,
    soldAt: r.sold_at ? iso(r.sold_at) : null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
};

export async function listStoreListings(onlyAvailable = true): Promise<StoreListingDto[]> {
  const rows = await queryRows<ListingRow>(
    onlyAvailable
      ? `SELECT * FROM store_listings
         WHERE status = 'available'
         ORDER BY (is_featured AND (featured_until IS NULL OR featured_until > now())) DESC, created_at DESC`
      : `SELECT * FROM store_listings
         ORDER BY (is_featured AND (featured_until IS NULL OR featured_until > now())) DESC, created_at DESC`,
  );
  return rows.map(toListingDto);
}

export async function getStoreListingById(id: string): Promise<StoreListingDto | null> {
  const row = await queryOne<ListingRow>(`SELECT * FROM store_listings WHERE id = $1`, [id]);
  return row ? toListingDto(row) : null;
}

export async function upsertStoreListing(input: {
  tld: string;
  subLabel?: string;
  title: string;
  description: string;
  priceRub: number;
  priceUsdt: number;
  periodDays: number;
  status: StoreListingStatus;
}): Promise<StoreListingDto> {
  const row = await queryOne<ListingRow>(
    `INSERT INTO store_listings (tld, sub_label, title, description, price_rub, price_usdt, period_days, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tld, sub_label) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       price_rub = EXCLUDED.price_rub,
       price_usdt = EXCLUDED.price_usdt,
       period_days = EXCLUDED.period_days,
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING *`,
    [
      input.tld.toLowerCase(),
      (input.subLabel ?? '').toLowerCase(),
      input.title,
      input.description,
      input.priceRub,
      input.priceUsdt,
      input.periodDays,
      input.status,
    ],
  );
  if (!row) throw new Error('upsertStoreListing failed');
  return toListingDto(row);
}

export async function deleteStoreListing(id: string): Promise<boolean> {
  const rows = await queryRows<{ id: string }>(
    `DELETE FROM store_listings WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

export async function markListingSold(id: string, buyerAddress: string): Promise<void> {
  await queryRows(
    `UPDATE store_listings
     SET status = 'sold', buyer_address = $2, sold_at = now(), updated_at = now()
     WHERE id = $1`,
    [id, buyerAddress.toLowerCase()],
  );
}

export async function createP2pListing(input: {
  tld: string;
  subLabel?: string;
  title: string;
  description: string;
  priceRub: number;
  priceUsdt: number;
  sellerAddress: string;
  feePercent?: number;
}): Promise<StoreListingDto> {
  const row = await queryOne<ListingRow>(
    `INSERT INTO store_listings
       (tld, sub_label, title, description, price_rub, price_usdt, period_days, status, seller_address, fee_percent)
     VALUES ($1, $2, $3, $4, $5, $6, 365, 'available', $7, $8)
     ON CONFLICT (tld, sub_label) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       price_rub = EXCLUDED.price_rub,
       price_usdt = EXCLUDED.price_usdt,
       status = 'available',
       seller_address = EXCLUDED.seller_address,
       fee_percent = EXCLUDED.fee_percent,
       buyer_address = NULL,
       sold_at = NULL,
       updated_at = now()
     RETURNING *`,
    [
      input.tld.toLowerCase(),
      (input.subLabel ?? '').toLowerCase(),
      input.title,
      input.description,
      input.priceRub,
      input.priceUsdt,
      input.sellerAddress.toLowerCase(),
      input.feePercent ?? 10,
    ],
  );
  if (!row) throw new Error('createP2pListing failed');
  return toListingDto(row);
}

export async function boostStoreListing(id: string, days = 7): Promise<StoreListingDto | null> {
  const row = await queryOne<ListingRow>(
    `UPDATE store_listings
     SET is_featured = true,
         featured_until = GREATEST(COALESCE(featured_until, now()), now()) + ($2 || ' days')::interval,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, days],
  );
  return row ? toListingDto(row) : null;
}

/* ─────────────────────────── payment orders ─────────────────────────── */

type OrderRow = {
  id: string;
  buyer_address: string;
  buyer_email: string | null;
  tld: string;
  sub_label: string;
  kind: OrderKind;
  listing_id: string | null;
  provider: PaymentProvider;
  currency: string;
  amount: string;
  status: PaymentStatus;
  external_id: string | null;
  pay_url: string | null;
  tx_hash: string | null;
  meta: Record<string, unknown>;
  created_at: Date;
  paid_at: Date | null;
  fulfilled_at: Date | null;
};

const toOrderDto = (r: OrderRow): PaymentOrderDto => ({
  id: r.id,
  buyerAddress: r.buyer_address,
  buyerEmail: r.buyer_email,
  tld: r.tld,
  subLabel: r.sub_label,
  kind: r.kind,
  listingId: r.listing_id,
  provider: r.provider,
  currency: r.currency,
  amount: r.amount,
  status: r.status,
  externalId: r.external_id,
  payUrl: r.pay_url,
  txHash: r.tx_hash,
  meta: r.meta ?? {},
  createdAt: iso(r.created_at),
  paidAt: r.paid_at ? iso(r.paid_at) : null,
  fulfilledAt: r.fulfilled_at ? iso(r.fulfilled_at) : null,
});

export async function createPaymentOrder(input: {
  id?: string;
  buyerAddress: string;
  buyerEmail?: string | null;
  tld: string;
  subLabel?: string;
  kind: OrderKind;
  listingId?: string | null;
  provider: PaymentProvider;
  currency: string;
  amount: string;
  externalId?: string | null;
  payUrl?: string | null;
  meta?: Record<string, unknown>;
}): Promise<PaymentOrderDto> {
  const row = await queryOne<OrderRow>(
    `INSERT INTO payment_orders (
       id, buyer_address, buyer_email, tld, sub_label, kind, listing_id,
       provider, currency, amount, external_id, pay_url, meta
     )
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     RETURNING *`,
    [
      input.id ?? null,
      input.buyerAddress.toLowerCase(),
      input.buyerEmail ?? null,
      input.tld.toLowerCase(),
      (input.subLabel ?? '').toLowerCase(),
      input.kind,
      input.listingId ?? null,
      input.provider,
      input.currency.toUpperCase(),
      input.amount,
      input.externalId ?? null,
      input.payUrl ?? null,
      JSON.stringify(input.meta ?? {}),
    ],
  );
  if (!row) throw new Error('createPaymentOrder failed');
  return toOrderDto(row);
}

export async function getPaymentOrderById(id: string): Promise<PaymentOrderDto | null> {
  const row = await queryOne<OrderRow>(`SELECT * FROM payment_orders WHERE id = $1`, [id]);
  return row ? toOrderDto(row) : null;
}

export async function getPaymentOrderByExternalId(
  provider: PaymentProvider,
  externalId: string,
): Promise<PaymentOrderDto | null> {
  const row = await queryOne<OrderRow>(
    `SELECT * FROM payment_orders WHERE provider = $1 AND external_id = $2`,
    [provider, externalId],
  );
  return row ? toOrderDto(row) : null;
}

export async function listPaymentOrders(options?: {
  buyerAddress?: string;
  limit?: number;
}): Promise<PaymentOrderDto[]> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
  if (options?.buyerAddress) {
    const rows = await queryRows<OrderRow>(
      `SELECT * FROM payment_orders WHERE buyer_address = $1 ORDER BY created_at DESC LIMIT $2`,
      [options.buyerAddress.toLowerCase(), limit],
    );
    return rows.map(toOrderDto);
  }
  const rows = await queryRows<OrderRow>(
    `SELECT * FROM payment_orders ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toOrderDto);
}

export async function updatePaymentOrder(
  id: string,
  patch: {
    status?: PaymentStatus;
    externalId?: string | null;
    payUrl?: string | null;
    txHash?: string | null;
    paidAt?: boolean;
    fulfilledAt?: boolean;
    meta?: Record<string, unknown>;
  },
): Promise<PaymentOrderDto | null> {
  const current = await getPaymentOrderById(id);
  if (!current) return null;
  const nextMeta = patch.meta ? { ...current.meta, ...patch.meta } : current.meta;
  const row = await queryOne<OrderRow>(
    `UPDATE payment_orders SET
       status = COALESCE($2, status),
       external_id = COALESCE($3, external_id),
       pay_url = COALESCE($4, pay_url),
       tx_hash = COALESCE($5, tx_hash),
       paid_at = CASE WHEN $6 THEN COALESCE(paid_at, now()) ELSE paid_at END,
       fulfilled_at = CASE WHEN $7 THEN COALESCE(fulfilled_at, now()) ELSE fulfilled_at END,
       meta = $8::jsonb
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.status ?? null,
      patch.externalId ?? null,
      patch.payUrl ?? null,
      patch.txHash ?? null,
      Boolean(patch.paidAt),
      Boolean(patch.fulfilledAt),
      JSON.stringify(nextMeta),
    ],
  );
  return row ? toOrderDto(row) : null;
}

/* ─────────────────────────── zone custody ─────────────────────────── */

type CustodyRow = {
  id: string;
  tld: string;
  sub_label: string;
  owner_address: string;
  source: 'order' | 'admin' | 'onchain';
  order_id: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

const toCustodyDto = (r: CustodyRow): ZoneCustodyDto => ({
  id: r.id,
  tld: r.tld,
  subLabel: r.sub_label,
  ownerAddress: r.owner_address,
  source: r.source,
  orderId: r.order_id,
  expiresAt: iso(r.expires_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function getCustody(tld: string, subLabel = ''): Promise<ZoneCustodyDto | null> {
  const row = await queryOne<CustodyRow>(
    `SELECT * FROM zone_custody WHERE tld = $1 AND sub_label = $2`,
    [tld.toLowerCase(), subLabel.toLowerCase()],
  );
  return row ? toCustodyDto(row) : null;
}

export async function listCustodyByOwner(ownerAddress: string): Promise<ZoneCustodyDto[]> {
  const rows = await queryRows<CustodyRow>(
    `SELECT * FROM zone_custody WHERE owner_address = $1 ORDER BY updated_at DESC`,
    [ownerAddress.toLowerCase()],
  );
  return rows.map(toCustodyDto);
}

export async function listAllCustody(limit = 100): Promise<ZoneCustodyDto[]> {
  const rows = await queryRows<CustodyRow>(
    `SELECT * FROM zone_custody ORDER BY updated_at DESC LIMIT $1`,
    [Math.max(1, Math.min(500, limit))],
  );
  return rows.map(toCustodyDto);
}

export async function listCustodySubdomainsByTld(tld: string): Promise<ZoneCustodyDto[]> {
  const rows = await queryRows<CustodyRow>(
    `SELECT * FROM zone_custody WHERE tld = $1 AND sub_label <> '' ORDER BY created_at DESC`,
    [tld.toLowerCase()],
  );
  return rows.map(toCustodyDto);
}

export async function upsertCustody(input: {
  tld: string;
  subLabel?: string;
  ownerAddress: string;
  source: 'order' | 'admin' | 'onchain';
  orderId?: string | null;
  periodDays?: number;
}): Promise<ZoneCustodyDto> {
  const days = input.periodDays ?? 365;
  const row = await queryOne<CustodyRow>(
    `INSERT INTO zone_custody (tld, sub_label, owner_address, source, order_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)
     ON CONFLICT (tld, sub_label) DO UPDATE SET
       owner_address = EXCLUDED.owner_address,
       source = EXCLUDED.source,
       order_id = COALESCE(EXCLUDED.order_id, zone_custody.order_id),
       expires_at = GREATEST(zone_custody.expires_at, now()) + ($6 || ' days')::interval,
       updated_at = now()
     RETURNING *`,
    [
      input.tld.toLowerCase(),
      (input.subLabel ?? '').toLowerCase(),
      input.ownerAddress.toLowerCase(),
      input.source,
      input.orderId ?? null,
      days,
    ],
  );
  if (!row) throw new Error('upsertCustody failed');
  return toCustodyDto(row);
}

/* ─────────────────────────── site hosting & files ─────────────────────────── */

type SiteSettingsRow = {
  tld: string;
  sub_label: string;
  mode: SiteMode;
  entry_file: string;
  spa_fallback: boolean;
  pro_unlocked: boolean | null;
  pro_until: Date | null;
  updated_at: Date;
};

const toSiteSettingsDto = (row: SiteSettingsRow): SiteSettingsDto => ({
  tld: row.tld,
  subLabel: row.sub_label,
  mode: row.mode,
  entryFile: row.entry_file,
  spaFallback: row.spa_fallback,
  proUnlocked: Boolean(row.pro_unlocked) && (!row.pro_until || row.pro_until.getTime() > Date.now()),
  proUntil: row.pro_until ? iso(row.pro_until) : null,
  updatedAt: iso(row.updated_at),
});

export async function getSiteSettings(tld: string, subLabel = ''): Promise<SiteSettingsDto> {
  const row = await queryOne<SiteSettingsRow>(
    `SELECT * FROM site_settings WHERE tld = $1 AND sub_label = $2`,
    [tld.toLowerCase(), subLabel.toLowerCase()],
  );
  if (!row) {
    return {
      tld: tld.toLowerCase(),
      subLabel: subLabel.toLowerCase(),
      mode: 'card',
      entryFile: 'index.html',
      spaFallback: false,
      proUnlocked: false,
      proUntil: null,
      updatedAt: new Date(0).toISOString(),
    };
  }
  return toSiteSettingsDto(row);
}

export async function upsertSiteSettings(input: {
  tld: string;
  subLabel?: string;
  mode: SiteMode;
  entryFile?: string;
  spaFallback?: boolean;
}): Promise<SiteSettingsDto> {
  const row = await queryOne<SiteSettingsRow>(
    `INSERT INTO site_settings (tld, sub_label, mode, entry_file, spa_fallback, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (tld, sub_label) DO UPDATE SET
       mode = EXCLUDED.mode,
       entry_file = EXCLUDED.entry_file,
       spa_fallback = EXCLUDED.spa_fallback,
       updated_at = now()
     RETURNING *`,
    [
      input.tld.toLowerCase(),
      (input.subLabel ?? '').toLowerCase(),
      input.mode,
      input.entryFile ?? 'index.html',
      Boolean(input.spaFallback),
    ],
  );
  if (!row) throw new Error('upsertSiteSettings failed');
  return toSiteSettingsDto(row);
}

export async function setSiteProUnlocked(
  tld: string,
  subLabel = '',
  unlocked = true,
): Promise<SiteSettingsDto> {
  const row = await queryOne<SiteSettingsRow>(
    `INSERT INTO site_settings (tld, sub_label, mode, entry_file, spa_fallback, pro_unlocked, pro_until, updated_at)
     VALUES ($1, $2, 'hosting', 'index.html', false, $3, NULL, now())
     ON CONFLICT (tld, sub_label) DO UPDATE SET
       pro_unlocked = EXCLUDED.pro_unlocked,
       pro_until = NULL,
       updated_at = now()
     RETURNING *`,
    [tld.toLowerCase(), subLabel.toLowerCase(), unlocked],
  );
  if (!row) throw new Error('setSiteProUnlocked failed');
  return toSiteSettingsDto(row);
}

type SiteFileRow = {
  id: string;
  tld: string;
  sub_label: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  updated_by: string;
  updated_at: Date;
};

const toSiteFileDto = (r: SiteFileRow): SiteFileDto => ({
  id: r.id,
  tld: r.tld,
  subLabel: r.sub_label,
  path: r.path,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  updatedBy: r.updated_by,
  updatedAt: iso(r.updated_at),
});

export async function listSiteFiles(tld: string, subLabel = ''): Promise<SiteFileDto[]> {
  const rows = await queryRows<SiteFileRow>(
    `SELECT id, tld, sub_label, path, mime_type, size_bytes, updated_by, updated_at
     FROM site_files WHERE tld = $1 AND sub_label = $2
     ORDER BY path ASC`,
    [tld.toLowerCase(), subLabel.toLowerCase()],
  );
  return rows.map(toSiteFileDto);
}

export async function getSiteStorageStats(
  tld: string,
  subLabel = '',
): Promise<{ files: number; totalBytes: number }> {
  const row = await queryOne<{ count: string; bytes: string }>(
    `SELECT count(*)::text AS count, COALESCE(sum(size_bytes), 0)::text AS bytes
     FROM site_files WHERE tld = $1 AND sub_label = $2`,
    [tld.toLowerCase(), subLabel.toLowerCase()],
  );
  return { files: Number(row?.count ?? 0), totalBytes: Number(row?.bytes ?? 0) };
}

export async function getSiteFile(
  tld: string,
  subLabel: string,
  filePath: string,
): Promise<(SiteFileDto & { content: Buffer }) | null> {
  const row = await queryOne<SiteFileRow & { content: Buffer }>(
    `SELECT * FROM site_files WHERE tld = $1 AND sub_label = $2 AND path = $3`,
    [tld.toLowerCase(), subLabel.toLowerCase(), filePath],
  );
  if (!row) return null;
  return { ...toSiteFileDto(row), content: row.content };
}

export async function upsertSiteFile(input: {
  tld: string;
  subLabel?: string;
  path: string;
  content: Buffer;
  mimeType: string;
  updatedBy: string;
}): Promise<SiteFileDto> {
  const row = await queryOne<SiteFileRow>(
    `INSERT INTO site_files (tld, sub_label, path, content, mime_type, size_bytes, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (tld, sub_label, path) DO UPDATE SET
       content = EXCLUDED.content,
       mime_type = EXCLUDED.mime_type,
       size_bytes = EXCLUDED.size_bytes,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING id, tld, sub_label, path, mime_type, size_bytes, updated_by, updated_at`,
    [
      input.tld.toLowerCase(),
      (input.subLabel ?? '').toLowerCase(),
      input.path,
      input.content,
      input.mimeType,
      input.content.byteLength,
      input.updatedBy.toLowerCase(),
    ],
  );
  if (!row) throw new Error('upsertSiteFile failed');
  return toSiteFileDto(row);
}

export async function deleteSiteFile(
  tld: string,
  subLabel: string,
  filePath: string,
): Promise<boolean> {
  const rows = await queryRows<{ id: string }>(
    `DELETE FROM site_files WHERE tld = $1 AND sub_label = $2 AND path = $3 RETURNING id`,
    [tld.toLowerCase(), subLabel.toLowerCase(), filePath],
  );
  return rows.length > 0;
}

/* ─────────────────────────── dns records ─────────────────────────── */

type DnsRow = {
  id: string;
  tld: string;
  sub_label: string;
  record_type: DnsRecordType;
  fqdn: string;
  content: string;
  ttl: number;
  priority: number | null;
  cf_record_id: string | null;
  owner_address: string;
  created_at: Date;
  updated_at: Date;
};

const toDnsDto = (r: DnsRow): DnsRecordDto => ({
  id: r.id,
  tld: r.tld,
  subLabel: r.sub_label,
  recordType: r.record_type,
  fqdn: r.fqdn,
  content: r.content,
  ttl: r.ttl,
  priority: r.priority,
  cfRecordId: r.cf_record_id,
  ownerAddress: r.owner_address,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function listDnsRecords(tld: string, subLabel?: string): Promise<DnsRecordDto[]> {
  if (subLabel !== undefined) {
    const rows = await queryRows<DnsRow>(
      `SELECT * FROM dns_records WHERE tld = $1 AND sub_label = $2 ORDER BY record_type ASC, created_at DESC`,
      [tld.toLowerCase(), subLabel.toLowerCase()],
    );
    return rows.map(toDnsDto);
  }
  const rows = await queryRows<DnsRow>(
    `SELECT * FROM dns_records WHERE tld = $1 ORDER BY sub_label ASC, record_type ASC, created_at DESC`,
    [tld.toLowerCase()],
  );
  return rows.map(toDnsDto);
}

export async function getDnsRecordById(id: string): Promise<DnsRecordDto | null> {
  const row = await queryOne<DnsRow>(`SELECT * FROM dns_records WHERE id = $1`, [id]);
  return row ? toDnsDto(row) : null;
}

export async function insertDnsRecord(input: {
  tld: string;
  subLabel?: string;
  recordType: DnsRecordType;
  fqdn: string;
  content: string;
  ttl: number;
  priority?: number | null;
  cfRecordId?: string | null;
  ownerAddress: string;
}): Promise<DnsRecordDto> {
  const row = await queryOne<DnsRow>(
    `INSERT INTO dns_records (tld, sub_label, record_type, fqdn, content, ttl, priority, cf_record_id, owner_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.tld.toLowerCase(),
      (input.subLabel ?? '').toLowerCase(),
      input.recordType,
      input.fqdn.toLowerCase(),
      input.content,
      input.ttl,
      input.priority ?? null,
      input.cfRecordId ?? null,
      input.ownerAddress.toLowerCase(),
    ],
  );
  if (!row) throw new Error('insertDnsRecord failed');
  return toDnsDto(row);
}

export async function deleteDnsRecordById(id: string): Promise<boolean> {
  const rows = await queryRows<{ id: string }>(
    `DELETE FROM dns_records WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

export type RootDnsZoneEntry = {
  tld: string;
  zone: string;
  ownerAddress: string;
  mode: string;
};

export type RootDnsSubdomainEntry = {
  tld: string;
  zone: string;
  label: string;
  fqdn: string;
  ownerAddress: string;
};

export type RootDnsSnapshot = {
  generatedAt: string;
  zones: RootDnsZoneEntry[];
  subdomains: RootDnsSubdomainEntry[];
  records: DnsRecordDto[];
};

/** Снимок всех независимых корневых зон (1-го и 2-го уровня) и их DNS-записей для JustTLD Root DNS. */
export async function getRootDnsSnapshot(): Promise<RootDnsSnapshot> {
  const [zoneRows, custodyZoneRows, subRows, custodySubRows, settingsRows, dnsRows] =
    await Promise.all([
      queryRows<{ tld: string; owner_address: string }>(
        `SELECT tld, owner_address FROM zones WHERE status = 'active'`,
      ),
      queryRows<{ tld: string; owner_address: string }>(
        `SELECT tld, owner_address FROM zone_custody WHERE sub_label = '' AND expires_at > now()`,
      ),
      queryRows<{ tld: string; label: string; owner_address: string }>(
        `SELECT tld, label, owner_address FROM subdomains WHERE status = 'active'`,
      ),
      queryRows<{ tld: string; sub_label: string; owner_address: string }>(
        `SELECT tld, sub_label, owner_address FROM zone_custody WHERE sub_label <> '' AND expires_at > now()`,
      ),
      queryRows<{ tld: string; sub_label: string; mode: string }>(
        `SELECT tld, sub_label, mode FROM site_settings`,
      ),
      queryRows<DnsRow>(
        `SELECT * FROM dns_records ORDER BY tld ASC, sub_label ASC, record_type ASC, created_at DESC`,
      ),
    ]);

  const modeMap = new Map<string, string>();
  for (const s of settingsRows) {
    modeMap.set(`${s.tld.toLowerCase()}|${s.sub_label.toLowerCase()}`, s.mode);
  }

  const zoneMap = new Map<string, RootDnsZoneEntry>();
  for (const row of [...zoneRows, ...custodyZoneRows]) {
    const tld = row.tld.toLowerCase();
    const zone = tld.replace(/^\.+/, '');
    if (!zone || zoneMap.has(zone)) continue;
    zoneMap.set(zone, {
      tld,
      zone,
      ownerAddress: row.owner_address.toLowerCase(),
      mode: modeMap.get(`${tld}|`) ?? 'card',
    });
  }

  const subMap = new Map<string, RootDnsSubdomainEntry>();
  for (const row of subRows) {
    const tld = row.tld.toLowerCase();
    const zone = tld.replace(/^\.+/, '');
    const label = row.label.toLowerCase();
    const fqdn = `${label}.${zone}`;
    if (!subMap.has(fqdn)) {
      subMap.set(fqdn, {
        tld,
        zone,
        label,
        fqdn,
        ownerAddress: row.owner_address.toLowerCase(),
      });
    }
  }
  for (const row of custodySubRows) {
    const tld = row.tld.toLowerCase();
    const zone = tld.replace(/^\.+/, '');
    const label = row.sub_label.toLowerCase();
    const fqdn = `${label}.${zone}`;
    if (!subMap.has(fqdn)) {
      subMap.set(fqdn, {
        tld,
        zone,
        label,
        fqdn,
        ownerAddress: row.owner_address.toLowerCase(),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    zones: Array.from(zoneMap.values()).sort((a, b) => a.zone.localeCompare(b.zone)),
    subdomains: Array.from(subMap.values()).sort((a, b) => a.fqdn.localeCompare(b.fqdn)),
    records: dnsRows.map(toDnsDto),
  };
}

export type IcannDirectoryEntry = {
  found: boolean;
  level: 1 | 2;
  fqdn: string;
  tld: string;
  zone: string;
  subLabel: string;
  status: string;
  ownerAddress: string | null;
  source: 'onchain' | 'custody' | 'none';
  registeredAt: string | null;
  expiresAt: string | null;
  nameservers: string[];
  dnsRecords: DnsRecordDto[];
  siteMode: string;
};

/** Карточка домена/TLD для протоколов RDAP (RFC 7483) и WHOIS (:43). */
export async function getIcannDirectoryEntry(rawName: string): Promise<IcannDirectoryEntry> {
  const clean = rawName.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  const parts = clean.split('.').filter(Boolean);
  const level: 1 | 2 = parts.length >= 2 ? 2 : 1;
  const zone = parts.length >= 2 ? (parts[parts.length - 1] ?? clean) : clean;
  const subLabel = parts.length >= 2 ? (parts[0] ?? '') : '';
  const tld = `.${zone}`;
  const fqdn = subLabel ? `${subLabel}.${zone}` : zone;

  const [onchainZone, onchainSub, custody, settings, records] = await Promise.all([
    queryOne<{
      owner_address: string;
      status: string;
      registered_at: Date;
      expires_at: Date;
    }>(`SELECT owner_address, status, registered_at, expires_at FROM zones WHERE tld = $1`, [tld]),
    subLabel
      ? queryOne<{
          owner_address: string;
          status: string;
          registered_at: Date;
          expires_at: Date;
        }>(
          `SELECT owner_address, status, registered_at, expires_at FROM subdomains WHERE name = $1`,
          [`${subLabel}.${zone}`],
        )
      : Promise.resolve(null),
    queryOne<{
      owner_address: string;
      source: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `SELECT owner_address, source, created_at, expires_at FROM zone_custody WHERE tld = $1 AND sub_label = $2`,
      [tld, subLabel],
    ),
    queryOne<{ mode: string }>(
      `SELECT mode FROM site_settings WHERE tld = $1 AND sub_label = $2`,
      [tld, subLabel],
    ),
    listDnsRecords(tld, subLabel),
  ]);

  const nsRecords = records
    .filter((r) => r.recordType === 'NS')
    .map((r) => r.content.trim().toLowerCase().replace(/\.+$/, ''));
  const nameservers =
    nsRecords.length > 0
      ? Array.from(new Set(nsRecords))
      : ['a.root.justtld.online', 'ns1.root.justtld.online'];

  if (subLabel && onchainSub) {
    return {
      found: true,
      level,
      fqdn,
      tld,
      zone,
      subLabel,
      status: onchainSub.status,
      ownerAddress: onchainSub.owner_address.toLowerCase(),
      source: 'onchain',
      registeredAt: iso(onchainSub.registered_at),
      expiresAt: iso(onchainSub.expires_at),
      nameservers,
      dnsRecords: records,
      siteMode: settings?.mode ?? 'card',
    };
  }

  if (!subLabel && onchainZone) {
    return {
      found: true,
      level,
      fqdn,
      tld,
      zone,
      subLabel,
      status: onchainZone.status,
      ownerAddress: onchainZone.owner_address.toLowerCase(),
      source: 'onchain',
      registeredAt: iso(onchainZone.registered_at),
      expiresAt: iso(onchainZone.expires_at),
      nameservers,
      dnsRecords: records,
      siteMode: settings?.mode ?? 'card',
    };
  }

  if (custody) {
    const expired = custody.expires_at.getTime() <= Date.now();
    return {
      found: true,
      level,
      fqdn,
      tld,
      zone,
      subLabel,
      status: expired ? 'expired' : 'active',
      ownerAddress: custody.owner_address.toLowerCase(),
      source: 'custody',
      registeredAt: iso(custody.created_at),
      expiresAt: iso(custody.expires_at),
      nameservers,
      dnsRecords: records,
      siteMode: settings?.mode ?? 'card',
    };
  }

  return {
    found: false,
    level,
    fqdn,
    tld,
    zone,
    subLabel,
    status: 'available',
    ownerAddress: null,
    source: 'none',
    registeredAt: null,
    expiresAt: null,
    nameservers,
    dnsRecords: [],
    siteMode: 'none',
  };
}

/**
 * Пакетно проверяет, какие зоны и поддомены из списка уже заняты в реестре
 * (`zones`, `subdomains`, `zone_custody`). Ключ: `${tld}|${subLabel}`.
 */
export async function getOccupiedAssetsSet(
  items: Array<{ tld: string; subLabel: string }>,
): Promise<Set<string>> {
  const occupied = new Set<string>();
  if (items.length === 0) return occupied;

  const tlds = Array.from(new Set(items.map((i) => i.tld.toLowerCase())));
  const subNames = Array.from(
    new Set(
      items
        .filter((i) => i.subLabel)
        .map((i) => `${i.subLabel.toLowerCase()}.${i.tld.toLowerCase().replace(/^\./, '')}`),
    ),
  );

  const [zoneRows, custodyRows, subRows] = await Promise.all([
    queryRows<{ tld: string }>(
      `SELECT tld FROM zones WHERE tld = ANY($1::text[]) AND status = 'active'`,
      [tlds],
    ),
    queryRows<{ tld: string; sub_label: string }>(
      `SELECT tld, sub_label FROM zone_custody WHERE tld = ANY($1::text[]) AND expires_at > now()`,
      [tlds],
    ),
    subNames.length > 0
      ? queryRows<{ name: string }>(
          `SELECT name FROM subdomains WHERE name = ANY($1::text[]) AND status = 'active'`,
          [subNames],
        )
      : Promise.resolve([]),
  ]);

  for (const r of zoneRows) {
    occupied.add(`${r.tld.toLowerCase()}|`);
  }
  for (const r of custodyRows) {
    occupied.add(`${r.tld.toLowerCase()}|${r.sub_label.toLowerCase()}`);
  }
  for (const r of subRows) {
    const parts = r.name.toLowerCase().split('.');
    if (parts.length === 2 && parts[0] && parts[1]) {
      occupied.add(`.${parts[1]}|${parts[0]}`);
    }
  }

  return occupied;
}



