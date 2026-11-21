export type ZoneStatus = 'active' | 'expired' | 'blocked';
export type TransferStatus = 'pending' | 'completed' | 'failed' | 'cancelled';
export type ZoneEventType =
  'registered' | 'transferred' | 'renewed' | 'metadata_updated' | 'blocked' | 'unblocked';

export type ZoneDto = {
  id: string;
  tld: string;
  ownerAddress: string;
  status: ZoneStatus;
  registeredAt: string;
  expiresAt: string;
  metadata: string;
  transactionHash: string;
  blockNumber: number;
  createdAt: string;
  updatedAt: string;
};

export type ZoneEventDto = {
  id: string;
  zoneId: string;
  eventType: ZoneEventType;
  actorAddress: string;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
  details: Record<string, unknown>;
  createdAt: string;
};

export type TransferRequestDto = {
  id: string;
  zoneId: string;
  fromAddress: string;
  toAddress: string;
  status: TransferStatus;
  transactionHash: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type StatsDto = {
  total: number;
  active: number;
  expired: number;
  blocked: number;
  expiringIn30d: number;
  uniqueOwners: number;
  totalEvents: number;
  lastIndexedBlock: number;
  chainHead: number;
  lag: number;
};

export type ChainZoneSnapshot = {
  owner: string;
  registeredAt: number;
  expiresAt: number;
  updatedAt: number;
  blocked: boolean;
  metadata: string;
};

/** Неподписанная транзакция, которую подписывает кошелёк пользователя. */
export type UnsignedTx = {
  to: string;
  data: string;
  value: string;
  chainId: number;
  from: string;
};

export type HealthDto = {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    database: { ok: boolean; latencyMs: number; error?: string };
    rpc: { ok: boolean; latencyMs: number; chainId?: number; blockNumber?: number; error?: string };
    contract: { ok: boolean; address: string | null; codeSize: number; error?: string };
    indexer: { ok: boolean; lastIndexedBlock: number; lag: number; error?: string };
  };
  version: string;
  timestamp: string;
};

export type AdminAuditEntry = {
  id: string;
  actorAddress: string;
  action: string;
  target: string | null;
  transactionHash: string | null;
  ip: string | null;
  userAgent: string | null;
  details: Record<string, unknown>;
  outcome: string;
  createdAt: string;
};

export type SessionUser = {
  address: string;
  role: 'admin' | 'user';
};

/** Поддомен внутри зоны (`blog.femboy`). */
export type SubdomainDto = {
  id: string;
  /** Полное имя без ведущей точки: `blog.femboy`. */
  name: string;
  /** Родительская зона: `.femboy`. */
  tld: string;
  /** Метка: `blog`. */
  label: string;
  ownerAddress: string;
  /** Владелец зоны, зарегистрировавший поддомен (поколение зоны). */
  zoneOwnerAddress: string;
  status: ZoneStatus;
  registeredAt: string;
  expiresAt: string;
  updatedAt: string;
  metadata: string;
  transactionHash: string;
  blockNumber: number;
};

export type SubdomainEventType =
  'registered' | 'transferred' | 'renewed' | 'metadata_updated' | 'blocked' | 'unblocked';

export type SubdomainEventDto = {
  id: string;
  name: string;
  eventType: SubdomainEventType;
  actorAddress: string;
  transactionHash: string;
  blockNumber: number;
  details: Record<string, unknown>;
  createdAt: string;
};

/* ───────────── Магазин, платежи, хостинг сайтов и DNS ───────────── */

export type AccountDto = {
  id: string;
  email: string;
  walletAddress: string;
  displayName: string | null;
  createdAt: string;
};

export type StoreListingStatus = 'available' | 'sold' | 'hidden';

export type StoreListingDto = {
  id: string;
  tld: string;
  subLabel: string;
  title: string;
  description: string;
  priceRub: number;
  priceUsdt: number;
  periodDays: number;
  status: StoreListingStatus;
  buyerAddress: string | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StorePricingDto = {
  customZoneEnabled: boolean;
  customZonePriceRub: number;
  customZonePriceUsdt: number;
  customSubdomainEnabled: boolean;
  customSubdomainPriceRub: number;
  customSubdomainPriceUsdt: number;
};

export type PaymentProvider = 'yoomoney' | 'cryptobot' | 'sandbox';
export type PaymentStatus = 'pending' | 'paid' | 'fulfilled' | 'expired' | 'failed';
export type OrderKind = 'listing' | 'custom_zone' | 'custom_subdomain' | 'renewal' | 'auction';

export type AuctionStatus = 'active' | 'awaiting_payment' | 'settled' | 'cancelled';

export type AuctionDto = {
  id: string;
  tld: string;
  title: string;
  description: string;
  startPriceRub: number;
  minStepRub: number;
  currentBidRub: number;
  bidsCount: number;
  leaderAddress: string | null;
  leaderLabel: string | null;
  createdBy: string;
  startsAt: string;
  endsAt: string;
  status: AuctionStatus;
  settlementOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuctionBidDto = {
  id: string;
  auctionId: string;
  bidderAddress: string;
  bidderLabel: string;
  amountRub: number;
  createdAt: string;
};

export type PaymentOrderDto = {
  id: string;
  buyerAddress: string;
  buyerEmail: string | null;
  tld: string;
  subLabel: string;
  kind: OrderKind;
  listingId: string | null;
  provider: PaymentProvider;
  currency: string;
  amount: string;
  status: PaymentStatus;
  externalId: string | null;
  payUrl: string | null;
  txHash: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

export type ZoneCustodyDto = {
  id: string;
  tld: string;
  subLabel: string;
  ownerAddress: string;
  source: 'order' | 'admin' | 'onchain';
  orderId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SiteMode = 'redirect' | 'hosting' | 'card';

export type SiteSettingsDto = {
  tld: string;
  subLabel: string;
  mode: SiteMode;
  entryFile: string;
  spaFallback: boolean;
  updatedAt: string;
};

export type SiteFileDto = {
  id: string;
  tld: string;
  subLabel: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  updatedBy: string;
  updatedAt: string;
};

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS';

export type DnsRecordDto = {
  id: string;
  tld: string;
  subLabel: string;
  recordType: DnsRecordType;
  fqdn: string;
  content: string;
  ttl: number;
  priority: number | null;
  cfRecordId: string | null;
  ownerAddress: string;
  createdAt: string;
  updatedAt: string;
};
