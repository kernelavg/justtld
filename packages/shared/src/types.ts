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
