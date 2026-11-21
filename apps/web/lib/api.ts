'use client';

import type {
  AccountDto,
  AdPlacement,
  AdSlotDto,
  AuctionBidDto,
  AuctionDto,
  DnsRecordDto,
  DnsRecordType,
  Paginated,
  PaymentOrderDto,
  PaymentProvider,
  SellerEarningDto,
  SiteFileDto,
  SiteSettingsDto,
  StatsDto,
  StoreListingDto,
  StorePricingDto,
  SubdomainDto,
  TransferRequestDto,
  UnsignedTx,
  ZoneCustodyDto,
  ZoneDto,
  ZoneEventDto,
} from '@justtld/shared';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('justtld_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch (error) {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Не удалось связаться с сервером', {
      reason: (error as Error).message,
    });
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const body = payload as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? `HTTP ${response.status}`,
      body?.error?.details,
    );
  }

  return payload as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

/* ───────────────────────────── чтение ───────────────────────────── */

export type ContractsInfo = {
  app: string;
  version: string;
  contract: {
    name: string;
    address: string;
    chainId: number;
    deployBlock: number;
    deployer: string;
    owner: string;
    allowReclaim: boolean;
    abiHash: string | null;
  } | null;
  chain: { id: number; name: string; rpcUrl: string };
  adminAddress: string | null;
  devWalletEnabled: boolean;
  explorer: { txUrlTemplate: string | null };
};

export const getContracts = () => apiFetch<ContractsInfo>('/api/contracts');
export const getStats = () => apiFetch<StatsDto>('/api/stats');
export const getZones = (query: string) => apiFetch<Paginated<ZoneDto>>(`/api/zones?${query}`);
export const getZone = (tld: string) =>
  apiFetch<{
    zone: ZoneDto | null;
    chain: {
      owner: string;
      registeredAt: number;
      expiresAt: number;
      updatedAt: number;
      blocked: boolean;
      metadata: string;
    } | null;
    consistent: boolean;
    subdomainsCount?: number;
    subdomainsEnabled?: boolean;
    subdomainsContract?: string | null;
    gracePeriodDays?: number;
    graceEndsAt?: string | null;
    explorer?: {
      confirmedAt: string;
      chainId: number;
      txUrlTemplate: string | null;
    };
    transfers: TransferRequestDto[];
  }>(`/api/zones/${encodeURIComponent(tld)}`);

export const getSubdomains = (query = '') =>
  apiFetch<Paginated<SubdomainDto> & { enabled: boolean; contract: string | null }>(
    `/api/subdomains${query ? `?${query}` : ''}`,
  );
export const getZoneHistory = (tld: string, query = '') =>
  apiFetch<Paginated<ZoneEventDto> & { tld: string }>(
    `/api/zones/${encodeURIComponent(tld)}/history${query ? `?${query}` : ''}`,
  );
export const searchZones = (q: string) =>
  apiFetch<{
    query: string;
    results: ZoneDto[];
    availability: { tld: string; available: boolean; reason: string };
  }>(`/api/search?q=${encodeURIComponent(q)}`);

export type HealthResponse = {
  status: 'ok' | 'degraded' | 'error';
  checks: Record<
    string,
    { ok: boolean; latencyMs?: number; error?: string; [key: string]: unknown }
  >;
  version: string;
  timestamp: string;
};

export const getHealth = () => apiFetch<HealthResponse>('/api/health');

/* ───────────────────────────── auth ───────────────────────────── */

export type SessionResponse = {
  session: { address: string; role: 'admin' | 'user' } | null;
  account?: AccountDto | null;
  adminAddress: string | null;
  googleAuthEnabled?: boolean;
};

export const getSession = () => apiFetch<SessionResponse>('/api/auth/session');

export const registerWithEmail = (payload: {
  email: string;
  password: string;
  displayName?: string;
}) =>
  postJson<{
    ok: boolean;
    session: NonNullable<SessionResponse['session']>;
    account: AccountDto;
  }>('/api/auth/register', payload);

export const loginWithEmail = (payload: { email: string; password: string }) =>
  postJson<{
    ok: boolean;
    session: NonNullable<SessionResponse['session']>;
    account: AccountDto;
  }>('/api/auth/login', payload);

export async function signInWithWallet(
  address: string,
  signMessage: (message: string) => Promise<string>,
): Promise<SessionResponse['session']> {
  const nonce = await postJson<{ nonce: string; message: string; expiresAt: string }>(
    '/api/auth/nonce',
    { address },
  );
  const signature = await signMessage(nonce.message);
  const result = await postJson<{ user: { address: string; role: 'admin' | 'user' } }>(
    '/api/auth/verify',
    { address, signature, nonce: nonce.nonce },
  );
  return result.user;
}

export const signOut = () => postJson<{ ok: boolean }>('/api/auth/logout', {});

/* ─────────────────────────── prepare tx ─────────────────────────── */

export type PreparedTx = {
  tx: UnsignedTx;
  intentId: string;
  intentExpiresAt: string;
  contract: string;
  chainId: number;
  tld: string;
  [key: string]: unknown;
};

export const prepareRegistration = (payload: { tld: string; metadata: string; sender: string }) =>
  postJson<PreparedTx>('/api/zones/prepare-registration', payload);

export const prepareTransfer = (payload: { tld: string; to: string; sender: string }) =>
  postJson<PreparedTx & { transferRequestId: string | null }>(
    '/api/zones/prepare-transfer',
    payload,
  );

export const prepareRenewal = (payload: { tld: string; sender: string }) =>
  postJson<PreparedTx & { newExpiresAt: string }>('/api/zones/prepare-renewal', payload);

export const prepareMetadata = (payload: { tld: string; metadata: string; sender: string }) =>
  postJson<PreparedTx>('/api/zones/prepare-metadata', payload);

/* ─────────────────────────── поддомены ─────────────────────────── */

export const fetchZoneSubdomains = (tld: string, page = 1, limit = 50) =>
  apiFetch<Paginated<SubdomainDto> & { tld: string; zoneOwner: string | null }>(
    `/api/zones/${encodeURIComponent(tld)}/subdomains?page=${page}&limit=${limit}`,
  );

export const fetchSubdomain = (tld: string, label: string) =>
  apiFetch<{ subdomain: SubdomainDto | null; chain: SubdomainDto | null; events: unknown[] }>(
    `/api/zones/${encodeURIComponent(tld)}/subdomains/${encodeURIComponent(label)}`,
  );

export const prepareSubdomainRegistration = (payload: {
  tld: string;
  label: string;
  metadata?: string;
  sender: string;
}) => postJson<PreparedTx & { name: string }>('/api/subdomains/prepare-registration', payload);

export const prepareSubdomainRenewal = (payload: { tld: string; label: string; sender: string }) =>
  postJson<PreparedTx>('/api/subdomains/prepare-renewal', payload);

export const prepareSubdomainTransfer = (payload: {
  tld: string;
  label: string;
  to: string;
  sender: string;
}) => postJson<PreparedTx>('/api/subdomains/prepare-transfer', payload);

export const prepareSubdomainMetadata = (payload: {
  tld: string;
  label: string;
  metadata: string;
  sender: string;
}) => postJson<PreparedTx>('/api/subdomains/prepare-metadata', payload);

export type ConfirmResponse = {
  status: 'pending' | 'confirmed' | 'failed';
  transactionHash: string;
  blockNumber?: number;
  gasUsed?: string;
  from?: string | null;
  to?: string | null;
  tld?: string | null;
  zone?: ZoneDto | null;
  reason?: string;
};

export const confirmTx = (transactionHash: string, intentId?: string) =>
  postJson<ConfirmResponse>('/api/zones/confirm', { transactionHash, intentId });

/* ───────────────────────────── admin ───────────────────────────── */

export type AdminLists = {
  session: { address: string; role: 'admin' | 'user' };
  adminAddress: string | null;
  chainId: number;
  contractOwner: string | null;
  paused: boolean;
  reserved: string[];
  blacklist: string[];
  indexer: { lastIndexedBlock: number; updatedAt: string | null };
};

export const getAdminLists = () => apiFetch<AdminLists>('/api/admin/lists');
export const getAdminAudit = (page = 1, limit = 20) =>
  apiFetch<
    Paginated<{
      id: string;
      actorAddress: string;
      action: string;
      target: string | null;
      transactionHash: string | null;
      ip: string | null;
      outcome: string;
      createdAt: string;
    }>
  >(`/api/admin/audit?page=${page}&limit=${limit}`);

export const adminBlockZone = (tld: string, reason: string) =>
  postJson<{ tx: UnsignedTx; auditId: string }>(
    `/api/admin/zones/${encodeURIComponent(tld)}/block`,
    { reason },
  );

export const adminUnblockZone = (tld: string) =>
  postJson<{ tx: UnsignedTx; auditId: string }>(
    `/api/admin/zones/${encodeURIComponent(tld)}/unblock`,
    {},
  );

export const adminPause = () =>
  postJson<{ tx: UnsignedTx | null; auditId?: string }>('/api/admin/pause', {});
export const adminUnpause = () =>
  postJson<{ tx: UnsignedTx | null; auditId?: string }>('/api/admin/unpause', {});
export const adminBlacklist = (word: string, action: 'add' | 'remove') =>
  postJson<{ tx: UnsignedTx }>('/api/admin/blacklist', { word, action });
export const adminReserved = (tld: string, action: 'add' | 'remove') =>
  postJson<{ tx: UnsignedTx }>('/api/admin/reserved', { tld, action });
export const adminResync = (purge = true) =>
  postJson<{ queued: boolean }>('/api/admin/resync', { purge });

/* ─────────────────────── dev wallet (только dev) ─────────────────────── */

export type DevWalletAccount = { label: string; address: string; privateKey: string };

export const getDevWallets = () =>
  apiFetch<{ enabled: boolean; warning: string; accounts: DevWalletAccount[] }>('/api/dev/wallets');

/* ─────────────────────── V2: магазин, хостинг, DNS ─────────────────────── */

export type GatewayStatusDto = {
  yoomoneyConfigured: boolean;
  cryptobotConfigured: boolean;
  cloudflareConfigured: boolean;
  sandboxEnabled: boolean;
};

export type StoreCatalogResponse = {
  listings: StoreListingDto[];
  pricing: StorePricingDto;
  gateways: GatewayStatusDto;
  resolverDomain: string;
  myOrders: PaymentOrderDto[];
  myCustody: ZoneCustodyDto[];
};

export const getStoreCatalog = () => apiFetch<StoreCatalogResponse>('/api/store');

export const createStoreOrder = (payload: {
  kind: 'listing' | 'custom_zone' | 'custom_subdomain';
  provider: PaymentProvider;
  currency?: 'RUB' | 'USDT' | 'TON' | 'BTC' | 'ETH';
  listingId?: string;
  tld?: string;
  subLabel?: string;
}) =>
  postJson<{
    order: PaymentOrderDto;
    payUrl: string | null;
    instructions: string;
  }>('/api/store/orders', payload);

export const getStoreOrder = (id: string) =>
  apiFetch<{ order: PaymentOrderDto }>(`/api/store/orders/${encodeURIComponent(id)}`);

export const confirmStoreOrder = (id: string) =>
  postJson<{ ok: boolean; order: PaymentOrderDto; custody: ZoneCustodyDto | null }>(
    `/api/store/orders/${encodeURIComponent(id)}`,
    {},
  );

export const adminGetStore = () =>
  apiFetch<{
    listings: StoreListingDto[];
    pricing: StorePricingDto;
    orders: PaymentOrderDto[];
    custody: ZoneCustodyDto[];
    gateways: GatewayStatusDto;
  }>('/api/admin/store');

export const adminUpsertListing = (listing: {
  id?: string;
  tld: string;
  subLabel?: string;
  title: string;
  description?: string;
  priceRub: number;
  priceUsdt: number;
  periodDays?: number;
  status?: 'available' | 'sold' | 'hidden';
}) =>
  postJson<{ ok: boolean; listing: StoreListingDto }>('/api/admin/store', {
    action: 'upsert_listing',
    listing,
  });

export const adminUpdatePricing = (pricing: StorePricingDto) =>
  postJson<{ ok: boolean; pricing: StorePricingDto }>('/api/admin/store', {
    action: 'update_pricing',
    pricing,
  });

export const adminGrantZone = (payload: {
  tld: string;
  subLabel?: string;
  owner: string;
  periodDays?: number;
}) =>
  postJson<{ ok: boolean; custody: ZoneCustodyDto }>('/api/admin/store', {
    action: 'grant_zone',
    ...payload,
  });

export const adminConfirmOrder = (orderId: string) =>
  postJson<{ ok: boolean; order: PaymentOrderDto; custody: ZoneCustodyDto | null }>(
    '/api/admin/store',
    {
      action: 'confirm_order',
      orderId,
    },
  );

export const adminDeleteListing = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/admin/store?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const getSiteFiles = (tld: string, sub = '') =>
  apiFetch<{
    tld: string;
    subLabel: string;
    ownership: {
      isOwner: boolean;
      isAdmin: boolean;
      ownerAddress: string | null;
      via: 'admin' | 'chain' | 'custody' | 'none';
    };
    settings: SiteSettingsDto;
    files: SiteFileDto[];
    totalBytes: number;
    maxSiteBytes: number;
    maxFileBytes: number;
  }>(`/api/sites/files?tld=${encodeURIComponent(tld)}&sub=${encodeURIComponent(sub)}`);

export const getSiteFileContent = (tld: string, path: string, sub = '') =>
  apiFetch<{
    path: string;
    mimeType: string;
    sizeBytes: number;
    updatedAt: string;
    isText: boolean;
    content: string | null;
    contentBase64: string | null;
  }>(
    `/api/sites/files/content?tld=${encodeURIComponent(tld)}&sub=${encodeURIComponent(sub)}&path=${encodeURIComponent(path)}`,
  );

export const saveSiteFile = (
  tld: string,
  payload: { path: string; content?: string; contentBase64?: string; mimeType?: string },
  sub = '',
) =>
  apiFetch<{ ok: boolean; file: SiteFileDto }>(
    `/api/sites/files?tld=${encodeURIComponent(tld)}&sub=${encodeURIComponent(sub)}`,
    { method: 'PUT', body: JSON.stringify(payload) },
  );

export const updateSiteSettings = (
  tld: string,
  payload: {
    mode: 'card' | 'hosting' | 'redirect';
    entryFile?: string;
    spaFallback?: boolean;
    seedStarter?: boolean;
  },
  sub = '',
) =>
  apiFetch<{ ok: boolean; settings: SiteSettingsDto; files: SiteFileDto[] }>(
    `/api/sites/files?tld=${encodeURIComponent(tld)}&sub=${encodeURIComponent(sub)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );

export const deleteSiteFile = (tld: string, path: string, sub = '') =>
  apiFetch<{ ok: boolean; path: string }>(
    `/api/sites/files?tld=${encodeURIComponent(tld)}&sub=${encodeURIComponent(sub)}&path=${encodeURIComponent(path)}`,
    { method: 'DELETE' },
  );

export const getSiteSubdomains = (tld: string) =>
  apiFetch<{
    tld: string;
    onchain: SubdomainDto[];
    custody: ZoneCustodyDto[];
  }>(`/api/sites/subdomains?tld=${encodeURIComponent(tld)}`);

export const createCustodySubdomain = (payload: {
  tld: string;
  label: string;
  withStarterSite?: boolean;
}) => postJson<{ ok: boolean; custody: ZoneCustodyDto }>('/api/sites/subdomains', payload);

export const getDnsRecords = (tld: string, sub = '') =>
  apiFetch<{
    tld: string;
    subLabel: string;
    fqdn: string;
    resolverDomain: string;
    serverIp: string;
    cloudflareConfigured: boolean;
    cloudflareError: string | null;
    cloudflareRecords: Array<{
      id: string;
      type: string;
      name: string;
      content: string;
      ttl: number;
      proxied?: boolean;
    }>;
    records: DnsRecordDto[];
  }>(`/api/dns?tld=${encodeURIComponent(tld)}&sub=${encodeURIComponent(sub)}`);

export const createDnsRecord = (payload: {
  tld: string;
  subLabel?: string;
  recordType: DnsRecordType;
  content: string;
  ttl?: number;
  priority?: number | null;
}) => postJson<{ ok: boolean; record: DnsRecordDto; synced: boolean }>('/api/dns', payload);

export const deleteDnsRecordApi = (tld: string, id: string, sub = '') =>
  apiFetch<{ ok: boolean; id: string }>(
    `/api/dns?tld=${encodeURIComponent(tld)}&sub=${encodeURIComponent(sub)}&id=${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );

/* ───────────────────────────── auctions ───────────────────────────── */

export type AuctionsListResponse = {
  auctions: AuctionDto[];
  gateways: StoreCatalogResponse['gateways'];
};

export const getAuctions = (status = 'all') =>
  apiFetch<AuctionsListResponse>(`/api/auctions?status=${encodeURIComponent(status)}`);

export const getAuctionDetail = (id: string) =>
  apiFetch<{ auction: AuctionDto; bids: AuctionBidDto[] }>(
    `/api/auctions/${encodeURIComponent(id)}`,
  );

export const openAuction = (payload: {
  tld: string;
  title?: string;
  description?: string;
  startPriceRub?: number;
  minStepRub?: number;
  durationHours?: number;
}) => postJson<{ ok: boolean; auction: AuctionDto }>('/api/auctions', payload);

export const placeAuctionBidApi = (id: string, amountRub: number) =>
  postJson<{ ok: boolean; auction: AuctionDto; bid: AuctionBidDto }>(
    `/api/auctions/${encodeURIComponent(id)}/bid`,
    { amountRub },
  );

export const claimAuctionApi = (
  id: string,
  payload: {
    provider?: PaymentProvider;
    currency?: 'RUB' | 'USDT' | 'TON' | 'BTC' | 'ETH';
    adminGrant?: boolean;
  },
) =>
  postJson<{
    ok: boolean;
    granted?: boolean;
    auction?: AuctionDto;
    order?: PaymentOrderDto;
    payUrl?: string | null;
    instructions?: string;
  }>(`/api/auctions/${encodeURIComponent(id)}/claim`, payload);

export const cancelAuctionApi = (id: string) =>
  postJson<{ ok: boolean; auction: AuctionDto }>(
    `/api/auctions/${encodeURIComponent(id)}/cancel`,
    {},
  );

/* ─────────── монетизация: реклама, P2P-продажи, ТОП-лоты, PRO-сайт ─────────── */

export const getAdSlots = (placement?: AdPlacement, all = false) => {
  const qs = new URLSearchParams();
  if (placement) qs.set('placement', placement);
  if (all) qs.set('all', '1');
  const q = qs.toString();
  return apiFetch<{ ads: AdSlotDto[] }>(`/api/ads${q ? `?${q}` : ''}`);
};

export const createAdminAdSlotApi = (payload: {
  placement: AdPlacement;
  title: string;
  description: string;
  ctaLabel?: string;
  targetUrl: string;
  badgeText?: string;
  days?: number;
  isActive?: boolean;
}) => postJson<{ ad: AdSlotDto }>('/api/ads', payload);

export const toggleAdminAdSlotApi = (id: string, isActive: boolean) =>
  apiFetch<{ ad: AdSlotDto }>('/api/ads', {
    method: 'PATCH',
    body: JSON.stringify({ id, isActive }),
  });

export const deleteAdminAdSlotApi = (id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/ads?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const getP2pEarningsApi = (all = false) =>
  apiFetch<{
    earnings: SellerEarningDto[];
    allEarnings: SellerEarningDto[];
    totals: { availableRub: number; requestedRub: number; paidRub: number };
  }>(`/api/store/p2p${all ? '?all=1' : ''}`);

export const createP2pListingApi = (payload: {
  tld: string;
  subLabel?: string;
  title: string;
  description?: string;
  priceRub: number;
}) => postJson<{ listing: StoreListingDto }>('/api/store/p2p', payload);

export const deleteP2pListingApi = (id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/store/p2p?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const requestP2pPayoutApi = (destination: string) =>
  apiFetch<{ requestedCount: number }>('/api/store/p2p', {
    method: 'PATCH',
    body: JSON.stringify({ destination }),
  });

export const markP2pEarningPaidApi = (id: string) =>
  apiFetch<{ earning: SellerEarningDto }>(`/api/store/p2p?markPaid=${encodeURIComponent(id)}`, {
    method: 'PATCH',
  });

export const createMonetizationOrderApi = (
  payload: {
    kind: 'site_pro' | 'boost_listing' | 'boost_auction' | 'ad_slot';
    provider?: PaymentProvider;
    currency?: 'RUB' | 'USDT' | 'TON' | 'BTC' | 'ETH';
    tld?: string;
    subLabel?: string;
    targetId?: string;
    ad?: {
      placement: AdPlacement;
      title: string;
      description: string;
      ctaLabel?: string;
      targetUrl: string;
      badgeText?: string;
    };
  },
  adminApply = false,
) =>
  postJson<{
    applied?: boolean;
    order?: PaymentOrderDto;
    payUrl?: string | null;
    instructions?: string;
    settings?: SiteSettingsDto;
    listing?: StoreListingDto;
    auction?: AuctionDto;
    ad?: AdSlotDto;
  }>(`/api/monetization/order${adminApply ? '?adminApply=1' : ''}`, payload);

