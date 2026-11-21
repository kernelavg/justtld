import type { PoolClient } from 'pg';
import type {
  AdminAuditEntry,
  Paginated,
  StatsDto,
  SubdomainDto,
  SubdomainEventDto,
  SubdomainEventType,
  SubdomainsQuery,
  TransferRequestDto,
  ZoneDto,
  ZoneEventDto,
  ZoneEventType,
  ZoneStatus,
} from '@justtld/shared';
import { queryOne, queryRows } from './pool';

/* ------------------------------------------------------------------ */
/*                            Row mapping                              */
/* ------------------------------------------------------------------ */

type ZoneRow = {
  id: string;
  tld: string;
  owner_address: string;
  status: ZoneStatus;
  registered_at: Date;
  expires_at: Date;
  metadata: string;
  transaction_hash: string;
  block_number: string | number;
  created_at: Date;
  updated_at: Date;
};

type ZoneEventRow = {
  id: string;
  zone_id: string;
  event_type: ZoneEventType;
  actor_address: string;
  transaction_hash: string;
  block_number: string | number;
  log_index: number;
  details: Record<string, unknown>;
  created_at: Date;
};

type TransferRow = {
  id: string;
  zone_id: string;
  from_address: string;
  to_address: string;
  status: TransferRequestDto['status'];
  transaction_hash: string | null;
  created_at: Date;
  completed_at: Date | null;
};

type AuditRow = {
  id: string;
  actor_address: string;
  action: string;
  target: string | null;
  transaction_hash: string | null;
  ip: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  outcome: string;
  created_at: Date;
};

const toZoneDto = (row: ZoneRow): ZoneDto => ({
  id: row.id,
  tld: row.tld,
  ownerAddress: row.owner_address,
  status: row.status,
  registeredAt: row.registered_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  metadata: row.metadata,
  transactionHash: row.transaction_hash,
  blockNumber: Number(row.block_number),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const toEventDto = (row: ZoneEventRow): ZoneEventDto => ({
  id: row.id,
  zoneId: row.zone_id,
  eventType: row.event_type,
  actorAddress: row.actor_address,
  transactionHash: row.transaction_hash,
  blockNumber: Number(row.block_number),
  logIndex: row.log_index,
  details: row.details ?? {},
  createdAt: row.created_at.toISOString(),
});

const toTransferDto = (row: TransferRow): TransferRequestDto => ({
  id: row.id,
  zoneId: row.zone_id,
  fromAddress: row.from_address,
  toAddress: row.to_address,
  status: row.status,
  transactionHash: row.transaction_hash,
  createdAt: row.created_at.toISOString(),
  completedAt: row.completed_at ? row.completed_at.toISOString() : null,
});

const toAuditDto = (row: AuditRow): AdminAuditEntry => ({
  id: row.id,
  actorAddress: row.actor_address,
  action: row.action,
  target: row.target,
  transactionHash: row.transaction_hash,
  ip: row.ip,
  userAgent: row.user_agent,
  details: row.details ?? {},
  outcome: row.outcome,
  createdAt: row.created_at.toISOString(),
});

const ZONE_COLUMNS = `id, tld, owner_address, status, registered_at, expires_at, metadata,
  transaction_hash, block_number, created_at, updated_at`;

type SubdomainRow = {
  id: string;
  name: string;
  tld: string;
  label: string;
  owner_address: string;
  zone_owner_address: string;
  status: ZoneStatus;
  registered_at: Date;
  expires_at: Date;
  metadata: string;
  transaction_hash: string;
  block_number: string | number;
  created_at: Date;
  updated_at: Date;
};

type SubdomainEventRow = {
  id: string;
  subdomain_id: string;
  name: string;
  event_type: SubdomainEventType;
  actor_address: string;
  transaction_hash: string;
  block_number: string | number;
  log_index: number;
  details: Record<string, unknown>;
  created_at: Date;
};

const SUBDOMAIN_COLUMNS = `id, name, tld, label, owner_address, zone_owner_address, status,
  registered_at, expires_at, metadata, transaction_hash, block_number, created_at, updated_at`;

const toSubdomainDto = (row: SubdomainRow): SubdomainDto => ({
  id: row.id,
  name: row.name,
  tld: row.tld,
  label: row.label,
  ownerAddress: row.owner_address,
  zoneOwnerAddress: row.zone_owner_address,
  status: row.status,
  registeredAt: row.registered_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  metadata: row.metadata,
  transactionHash: row.transaction_hash,
  blockNumber: Number(row.block_number),
});

const toSubdomainEventDto = (row: SubdomainEventRow): SubdomainEventDto => ({
  id: row.id,
  name: row.name,
  eventType: row.event_type,
  actorAddress: row.actor_address,
  transactionHash: row.transaction_hash,
  blockNumber: Number(row.block_number),
  details: row.details ?? {},
  createdAt: row.created_at.toISOString(),
});

/* ------------------------------------------------------------------ */
/*                               users                                */
/* ------------------------------------------------------------------ */

export async function ensureUser(
  client: PoolClient,
  walletAddress: string,
  displayName?: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO users (wallet_address, display_name)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE
       SET display_name = COALESCE(EXCLUDED.display_name, users.display_name)`,
    [walletAddress.toLowerCase(), displayName ?? null],
  );
}

export async function getUser(walletAddress: string) {
  return queryOne<{
    id: string;
    wallet_address: string;
    display_name: string | null;
    created_at: Date;
  }>('SELECT id, wallet_address, display_name, created_at FROM users WHERE wallet_address = $1', [
    walletAddress.toLowerCase(),
  ]);
}

export async function countUsers(): Promise<number> {
  const row = await queryOne<{ count: string }>('SELECT count(*)::text AS count FROM users');
  return Number(row?.count ?? 0);
}

/* ------------------------------------------------------------------ */
/*                               zones                                */
/* ------------------------------------------------------------------ */

export async function getZoneByTld(tld: string): Promise<ZoneDto | null> {
  const row = await queryOne<ZoneRow>(`SELECT ${ZONE_COLUMNS} FROM zones WHERE tld = $1`, [
    tld.toLowerCase(),
  ]);
  return row ? toZoneDto(row) : null;
}

export async function getZoneById(id: string): Promise<ZoneDto | null> {
  const row = await queryOne<ZoneRow>(`SELECT ${ZONE_COLUMNS} FROM zones WHERE id = $1`, [id]);
  return row ? toZoneDto(row) : null;
}

const SORT_MAP: Record<string, string> = {
  newest: 'registered_at DESC',
  oldest: 'registered_at ASC',
  tld: 'tld ASC',
  expires_soon: 'expires_at ASC',
};

export type ListZonesParams = {
  page: number;
  limit: number;
  status?: 'all' | ZoneStatus;
  owner?: string;
  q?: string;
  sort?: keyof typeof SORT_MAP;
};

export async function listZones(params: ListZonesParams): Promise<Paginated<ZoneDto>> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.status && params.status !== 'all') {
    values.push(params.status);
    clauses.push(`status = $${values.length}`);
  }
  if (params.owner) {
    values.push(params.owner.toLowerCase());
    clauses.push(`owner_address = $${values.length}`);
  }
  if (params.q) {
    values.push(`%${params.q.toLowerCase()}%`);
    clauses.push(`(tld ILIKE $${values.length} OR metadata ILIKE $${values.length})`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const order = SORT_MAP[params.sort ?? 'newest'] ?? SORT_MAP.newest;
  const offset = (params.page - 1) * params.limit;

  const totalRow = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM zones ${where}`,
    values,
  );
  const total = Number(totalRow?.count ?? 0);

  const rows = await queryRows<ZoneRow>(
    `SELECT ${ZONE_COLUMNS} FROM zones ${where} ORDER BY ${order}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, params.limit, offset],
  );

  return {
    items: rows.map(toZoneDto),
    total,
    page: params.page,
    limit: params.limit,
    pages: Math.max(1, Math.ceil(total / params.limit)),
  };
}

export async function searchZones(q: string, limit = 10): Promise<ZoneDto[]> {
  const like = `%${q.toLowerCase()}%`;
  const rows = await queryRows<ZoneRow>(
    `SELECT ${ZONE_COLUMNS} FROM zones
     WHERE tld ILIKE $1 OR owner_address ILIKE $1 OR metadata ILIKE $1
     ORDER BY (tld ILIKE $1) DESC, registered_at DESC
     LIMIT $2`,
    [like, limit],
  );
  return rows.map(toZoneDto);
}

export type ZoneSnapshot = {
  tld: string;
  ownerAddress: string;
  status: ZoneStatus;
  registeredAt: Date;
  expiresAt: Date;
  metadata: string;
  transactionHash: string;
  blockNumber: number;
};

/**
 * Идемпотентный upsert снапшота зоны из блокчейна.
 * Вызывается indexer'ом после чтения getTLD() — блокчейн остаётся источником истины.
 */
export async function upsertZoneSnapshot(
  client: PoolClient,
  snapshot: ZoneSnapshot,
): Promise<ZoneDto> {
  const { rows } = await client.query<ZoneRow>(
    `INSERT INTO zones (tld, owner_address, status, registered_at, expires_at, metadata,
                        transaction_hash, block_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tld) DO UPDATE SET
       owner_address = EXCLUDED.owner_address,
       status = EXCLUDED.status,
       registered_at = EXCLUDED.registered_at,
       expires_at = EXCLUDED.expires_at,
       metadata = EXCLUDED.metadata,
       transaction_hash = CASE
         WHEN zones.block_number <= EXCLUDED.block_number THEN EXCLUDED.transaction_hash
         ELSE zones.transaction_hash END,
       block_number = GREATEST(zones.block_number, EXCLUDED.block_number),
       updated_at = now()
     RETURNING ${ZONE_COLUMNS}`,
    [
      snapshot.tld.toLowerCase(),
      snapshot.ownerAddress.toLowerCase(),
      snapshot.status,
      snapshot.registeredAt,
      snapshot.expiresAt,
      snapshot.metadata,
      snapshot.transactionHash,
      snapshot.blockNumber,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertZoneSnapshot: пустой RETURNING');
  return toZoneDto(row);
}

export async function setZoneStatus(tld: string, status: ZoneStatus): Promise<void> {
  await queryRows('UPDATE zones SET status = $2, updated_at = now() WHERE tld = $1', [
    tld.toLowerCase(),
    status,
  ]);
}

/** Пересчитывает статусы истёкших зон (вызывается indexer'ом и API перед ответом). */
export async function refreshExpiredStatuses(): Promise<number> {
  const rows = await queryRows<{ count: string }>(
    `WITH updated AS (
       UPDATE zones SET status = 'expired', updated_at = now()
       WHERE status = 'active' AND expires_at <= now()
       RETURNING 1
     )
     SELECT count(*)::text AS count FROM updated`,
  );
  const refreshed = await queryRows<{ count: string }>(
    `WITH updated AS (
       UPDATE zones SET status = 'active', updated_at = now()
       WHERE status = 'expired' AND expires_at > now()
       RETURNING 1
     )
     SELECT count(*)::text AS count FROM updated`,
  );
  return Number(rows[0]?.count ?? 0) + Number(refreshed[0]?.count ?? 0);
}

export async function getStats(chainHead = 0, lastIndexedBlock = 0): Promise<StatsDto> {
  const row = await queryOne<{
    total: string;
    active: string;
    expired: string;
    blocked: string;
    expiring: string;
    owners: string;
  }>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE status = 'active')::text AS active,
       count(*) FILTER (WHERE status = 'expired')::text AS expired,
       count(*) FILTER (WHERE status = 'blocked')::text AS blocked,
       count(*) FILTER (WHERE status <> 'blocked' AND expires_at > now()
                        AND expires_at <= now() + interval '30 days')::text AS expiring,
       count(DISTINCT owner_address)::text AS owners
     FROM zones`,
  );
  const eventsRow = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM zone_events',
  );
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    expired: Number(row?.expired ?? 0),
    blocked: Number(row?.blocked ?? 0),
    expiringIn30d: Number(row?.expiring ?? 0),
    uniqueOwners: Number(row?.owners ?? 0),
    totalEvents: Number(eventsRow?.count ?? 0),
    lastIndexedBlock,
    chainHead,
    lag: Math.max(0, chainHead - lastIndexedBlock),
  };
}

/* ------------------------------------------------------------------ */
/*                            zone_events                             */
/* ------------------------------------------------------------------ */

export type ZoneEventInput = {
  zoneId: string;
  eventType: ZoneEventType;
  actorAddress: string;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
  details?: Record<string, unknown>;
};

/** Вставка события в историю; дубликаты (tx, logIndex) игнорируются. */
export async function insertZoneEvent(client: PoolClient, event: ZoneEventInput): Promise<boolean> {
  const { rowCount } = await client.query(
    `INSERT INTO zone_events (zone_id, event_type, actor_address, transaction_hash,
                              block_number, log_index, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (transaction_hash, log_index) DO NOTHING`,
    [
      event.zoneId,
      event.eventType,
      event.actorAddress.toLowerCase(),
      event.transactionHash,
      event.blockNumber,
      event.logIndex,
      JSON.stringify(event.details ?? {}),
    ],
  );
  return (rowCount ?? 0) > 0;
}

export async function listZoneEvents(
  zoneId: string,
  params: { page: number; limit: number; type?: ZoneEventType },
): Promise<Paginated<ZoneEventDto>> {
  const values: unknown[] = [zoneId];
  let filter = '';
  if (params.type) {
    values.push(params.type);
    filter = `AND event_type = $${values.length}`;
  }
  const totalRow = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM zone_events WHERE zone_id = $1 ${filter}`,
    values,
  );
  const rows = await queryRows<ZoneEventRow>(
    `SELECT id, zone_id, event_type, actor_address, transaction_hash, block_number,
            log_index, details, created_at
     FROM zone_events
     WHERE zone_id = $1 ${filter}
     ORDER BY block_number DESC, log_index DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, params.limit, (params.page - 1) * params.limit],
  );
  const total = Number(totalRow?.count ?? 0);
  return {
    items: rows.map(toEventDto),
    total,
    page: params.page,
    limit: params.limit,
    pages: Math.max(1, Math.ceil(total / params.limit)),
  };
}

export async function listRecentActivity(limit = 10): Promise<ZoneEventDto[]> {
  const rows = await queryRows<ZoneEventRow>(
    `SELECT id, zone_id, event_type, actor_address, transaction_hash, block_number,
            log_index, details, created_at
     FROM zone_events ORDER BY block_number DESC, log_index DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toEventDto);
}

/* ------------------------------------------------------------------ */
/*                         transfer_requests                          */
/* ------------------------------------------------------------------ */

export async function createTransferRequest(input: {
  zoneId: string;
  fromAddress: string;
  toAddress: string;
}): Promise<TransferRequestDto> {
  // Отменяем прошлые незавершённые намерения по этой зоне.
  await queryRows(
    `UPDATE transfer_requests SET status = 'cancelled'
     WHERE zone_id = $1 AND status = 'pending'`,
    [input.zoneId],
  );
  const row = await queryOne<TransferRow>(
    `INSERT INTO transfer_requests (zone_id, from_address, to_address, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, zone_id, from_address, to_address, status, transaction_hash, created_at, completed_at`,
    [input.zoneId, input.fromAddress.toLowerCase(), input.toAddress.toLowerCase()],
  );
  if (!row) throw new Error('createTransferRequest: insert failed');
  return toTransferDto(row);
}

export async function completePendingTransfers(
  client: PoolClient,
  zoneId: string,
  toAddress: string,
  transactionHash: string,
): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE transfer_requests
     SET status = 'completed', transaction_hash = $3, completed_at = now()
     WHERE zone_id = $1 AND status = 'pending' AND to_address = $2`,
    [zoneId, toAddress.toLowerCase(), transactionHash],
  );
  return rowCount ?? 0;
}

export async function cancelPendingTransfers(client: PoolClient, zoneId: string): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE transfer_requests SET status = 'cancelled'
     WHERE zone_id = $1 AND status = 'pending'`,
    [zoneId],
  );
  return rowCount ?? 0;
}

export async function listTransfersForZone(
  zoneId: string,
  limit = 5,
): Promise<TransferRequestDto[]> {
  const rows = await queryRows<TransferRow>(
    `SELECT id, zone_id, from_address, to_address, status, transaction_hash, created_at, completed_at
     FROM transfer_requests WHERE zone_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [zoneId, limit],
  );
  return rows.map(toTransferDto);
}

export async function listTransferRequests(params: {
  page: number;
  limit: number;
  status?: TransferRequestDto['status'];
}): Promise<Paginated<TransferRequestDto>> {
  const values: unknown[] = [];
  let filter = '';
  if (params.status) {
    values.push(params.status);
    filter = `WHERE status = $${values.length}`;
  }
  const totalRow = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM transfer_requests ${filter}`,
    values,
  );
  const rows = await queryRows<TransferRow>(
    `SELECT id, zone_id, from_address, to_address, status, transaction_hash, created_at, completed_at
     FROM transfer_requests ${filter}
     ORDER BY created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, params.limit, (params.page - 1) * params.limit],
  );
  const total = Number(totalRow?.count ?? 0);
  return {
    items: rows.map(toTransferDto),
    total,
    page: params.page,
    limit: params.limit,
    pages: Math.max(1, Math.ceil(total / params.limit)),
  };
}

/* ------------------------------------------------------------------ */
/*                             audit log                              */
/* ------------------------------------------------------------------ */

export type AuditInput = {
  actorAddress: string;
  action: string;
  target?: string | null;
  transactionHash?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
  outcome?: 'success' | 'failure';
};

export async function insertAuditEntry(input: AuditInput): Promise<AdminAuditEntry> {
  const row = await queryOne<AuditRow>(
    `INSERT INTO admin_audit_log (actor_address, action, target, transaction_hash, ip, user_agent, details, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, actor_address, action, target, transaction_hash, ip, user_agent, details, outcome, created_at`,
    [
      input.actorAddress.toLowerCase(),
      input.action,
      input.target ?? null,
      input.transactionHash ?? null,
      input.ip ?? null,
      input.userAgent?.slice(0, 512) ?? null,
      JSON.stringify(input.details ?? {}),
      input.outcome ?? 'success',
    ],
  );
  if (!row) throw new Error('insertAuditEntry failed');
  return toAuditDto(row);
}

export async function listAuditEntries(params: {
  page: number;
  limit: number;
}): Promise<Paginated<AdminAuditEntry>> {
  const totalRow = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM admin_audit_log',
  );
  const rows = await queryRows<AuditRow>(
    `SELECT id, actor_address, action, target, transaction_hash, ip, user_agent, details, outcome, created_at
     FROM admin_audit_log ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [params.limit, (params.page - 1) * params.limit],
  );
  const total = Number(totalRow?.count ?? 0);
  return {
    items: rows.map(toAuditDto),
    total,
    page: params.page,
    limit: params.limit,
    pages: Math.max(1, Math.ceil(total / params.limit)),
  };
}

/* ------------------------------------------------------------------ */
/*                        indexer: checkpoint                         */
/* ------------------------------------------------------------------ */

export type Checkpoint = {
  lastBlock: number;
  lastBlockHash: string;
  chainId: number;
  contractAddress: string;
  updatedAt: string | null;
};

export async function getCheckpoint(): Promise<Checkpoint | null> {
  const row = await queryOne<{
    last_block: string;
    last_block_hash: string;
    chain_id: string;
    contract_address: string;
    updated_at: Date;
  }>(
    'SELECT last_block, last_block_hash, chain_id, contract_address, updated_at FROM indexer_checkpoints WHERE id = 1',
  );
  if (!row) return null;
  return {
    lastBlock: Number(row.last_block),
    lastBlockHash: row.last_block_hash,
    chainId: Number(row.chain_id),
    contractAddress: row.contract_address,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function saveCheckpoint(
  client: PoolClient,
  data: { lastBlock: number; lastBlockHash: string; chainId: number; contractAddress: string },
): Promise<void> {
  await client.query(
    `INSERT INTO indexer_checkpoints (id, last_block, last_block_hash, chain_id, contract_address, updated_at)
     VALUES (1, $1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET
       last_block = EXCLUDED.last_block,
       last_block_hash = EXCLUDED.last_block_hash,
       chain_id = EXCLUDED.chain_id,
       contract_address = EXCLUDED.contract_address,
       updated_at = now()`,
    [data.lastBlock, data.lastBlockHash, data.chainId, data.contractAddress.toLowerCase()],
  );
}

/** Отмечает лог как обработанный. false — лог уже был обработан ранее (идемпотентность). */
export async function markLogProcessed(
  client: PoolClient,
  log: {
    transactionHash: string;
    logIndex: number;
    blockNumber: number;
    blockHash: string;
    eventName: string;
  },
): Promise<boolean> {
  const { rowCount } = await client.query(
    `INSERT INTO processed_logs (transaction_hash, log_index, block_number, block_hash, event_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (transaction_hash, log_index) DO NOTHING`,
    [log.transactionHash, log.logIndex, log.blockNumber, log.blockHash, log.eventName],
  );
  return (rowCount ?? 0) > 0;
}

export async function isLogProcessed(transactionHash: string, logIndex: number): Promise<boolean> {
  const row = await queryOne<{ ok: number }>(
    'SELECT 1 AS ok FROM processed_logs WHERE transaction_hash = $1 AND log_index = $2',
    [transactionHash, logIndex],
  );
  return row !== null;
}

export async function countProcessedLogs(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM processed_logs',
  );
  return Number(row?.count ?? 0);
}

/** Полная очистка индексных данных (для resync с нуля). */
export async function purgeIndexedData(client: PoolClient): Promise<void> {
  await client.query(
    'TRUNCATE subdomain_events, subdomains, zone_events, transfer_requests, zones, processed_logs RESTART IDENTITY CASCADE',
  );
  await client.query('DELETE FROM indexer_checkpoints');
}

/* ------------------------------------------------------------------ */
/*                              поддомены                              */
/* ------------------------------------------------------------------ */

export type SubdomainSnapshot = {
  name: string;
  tld: string;
  label: string;
  ownerAddress: string;
  zoneOwnerAddress: string;
  status: ZoneStatus;
  registeredAt: Date;
  expiresAt: Date;
  metadata: string;
  transactionHash: string;
  blockNumber: number;
};

/** Вставляет/обновляет поддомен по состоянию контракта. */
export async function upsertSubdomainSnapshot(
  client: PoolClient,
  snapshot: SubdomainSnapshot,
): Promise<SubdomainDto> {
  const { rows } = await client.query<SubdomainRow>(
    `INSERT INTO subdomains (name, tld, label, owner_address, zone_owner_address, status,
                             registered_at, expires_at, metadata, transaction_hash, block_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (name) DO UPDATE SET
       owner_address = EXCLUDED.owner_address,
       zone_owner_address = EXCLUDED.zone_owner_address,
       status = EXCLUDED.status,
       registered_at = EXCLUDED.registered_at,
       expires_at = EXCLUDED.expires_at,
       metadata = EXCLUDED.metadata,
       transaction_hash = CASE
         WHEN subdomains.block_number <= EXCLUDED.block_number THEN EXCLUDED.transaction_hash
         ELSE subdomains.transaction_hash END,
       block_number = GREATEST(subdomains.block_number, EXCLUDED.block_number),
       updated_at = now()
     RETURNING ${SUBDOMAIN_COLUMNS}`,
    [
      snapshot.name.toLowerCase(),
      snapshot.tld.toLowerCase(),
      snapshot.label.toLowerCase(),
      snapshot.ownerAddress.toLowerCase(),
      snapshot.zoneOwnerAddress.toLowerCase(),
      snapshot.status,
      snapshot.registeredAt,
      snapshot.expiresAt,
      snapshot.metadata,
      snapshot.transactionHash,
      snapshot.blockNumber,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertSubdomainSnapshot: пустой RETURNING');
  return toSubdomainDto(row);
}

export async function insertSubdomainEvent(
  client: PoolClient,
  event: {
    subdomainId: string;
    name: string;
    eventType: SubdomainEventType;
    actorAddress: string;
    transactionHash: string;
    blockNumber: number;
    logIndex: number;
    details?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { rowCount } = await client.query(
    `INSERT INTO subdomain_events (subdomain_id, name, event_type, actor_address, transaction_hash,
                                   block_number, log_index, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (transaction_hash, log_index) DO NOTHING`,
    [
      event.subdomainId,
      event.name.toLowerCase(),
      event.eventType,
      event.actorAddress.toLowerCase(),
      event.transactionHash,
      event.blockNumber,
      event.logIndex,
      JSON.stringify(event.details ?? {}),
    ],
  );
  return (rowCount ?? 0) > 0;
}

export async function getSubdomainByName(name: string): Promise<SubdomainDto | null> {
  const row = await queryOne<SubdomainRow>(
    `SELECT ${SUBDOMAIN_COLUMNS} FROM subdomains WHERE name = $1`,
    [name.toLowerCase()],
  );
  return row ? toSubdomainDto(row) : null;
}

export async function listSubdomainsByZone(
  tld: string,
  params: { page: number; limit: number } = { page: 1, limit: 50 },
): Promise<Paginated<SubdomainDto>> {
  const offset = (params.page - 1) * params.limit;
  const totalRow = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM subdomains WHERE tld = $1',
    [tld.toLowerCase()],
  );
  const rows = await queryRows<SubdomainRow>(
    `SELECT ${SUBDOMAIN_COLUMNS} FROM subdomains WHERE tld = $1
     ORDER BY registered_at DESC, name ASC LIMIT $2 OFFSET $3`,
    [tld.toLowerCase(), params.limit, offset],
  );
  const total = Number(totalRow?.count ?? 0);
  return {
    items: rows.map(toSubdomainDto),
    page: params.page,
    limit: params.limit,
    total,
    pages: Math.max(1, Math.ceil(total / params.limit)),
  };
}

export async function listSubdomainsByOwner(
  owner: string,
  params: { page: number; limit: number } = { page: 1, limit: 50 },
): Promise<Paginated<SubdomainDto>> {
  const offset = (params.page - 1) * params.limit;
  const totalRow = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM subdomains WHERE owner_address = $1',
    [owner.toLowerCase()],
  );
  const rows = await queryRows<SubdomainRow>(
    `SELECT ${SUBDOMAIN_COLUMNS} FROM subdomains WHERE owner_address = $1
     ORDER BY registered_at DESC, name ASC LIMIT $2 OFFSET $3`,
    [owner.toLowerCase(), params.limit, offset],
  );
  const total = Number(totalRow?.count ?? 0);
  return {
    items: rows.map(toSubdomainDto),
    page: params.page,
    limit: params.limit,
    total,
    pages: Math.max(1, Math.ceil(total / params.limit)),
  };
}

export async function listSubdomainEvents(
  name: string,
  params: { page: number; limit: number } = { page: 1, limit: 50 },
): Promise<Paginated<SubdomainEventDto>> {
  const offset = (params.page - 1) * params.limit;
  const totalRow = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM subdomain_events WHERE name = $1',
    [name.toLowerCase()],
  );
  const rows = await queryRows<SubdomainEventRow>(
    `SELECT id, subdomain_id, name, event_type, actor_address, transaction_hash, block_number,
            log_index, details, created_at
     FROM subdomain_events WHERE name = $1
     ORDER BY created_at DESC, block_number DESC LIMIT $2 OFFSET $3`,
    [name.toLowerCase(), params.limit, offset],
  );
  const total = Number(totalRow?.count ?? 0);
  return {
    items: rows.map(toSubdomainEventDto),
    page: params.page,
    limit: params.limit,
    total,
    pages: Math.max(1, Math.ceil(total / params.limit)),
  };
}

/** Пересчитывает статусы истёкших поддоменов (по сроку). */
export async function refreshExpiredSubdomainStatuses(): Promise<number> {
  const expired = await queryRows<{ count: string }>(
    `WITH updated AS (
       UPDATE subdomains SET status = 'expired', updated_at = now()
       WHERE status = 'active' AND expires_at <= now()
       RETURNING 1
     )
     SELECT count(*)::text AS count FROM updated`,
  );
  const revived = await queryRows<{ count: string }>(
    `WITH updated AS (
       UPDATE subdomains SET status = 'active', updated_at = now()
       WHERE status = 'expired' AND expires_at > now()
       RETURNING 1
     )
     SELECT count(*)::text AS count FROM updated`,
  );
  return Number(expired[0]?.count ?? 0) + Number(revived[0]?.count ?? 0);
}

export async function countSubdomains(): Promise<number> {
  const row = await queryOne<{ count: string }>('SELECT count(*)::text AS count FROM subdomains');
  return Number(row?.count ?? 0);
}

export async function countSubdomainsByZone(tld: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM subdomains WHERE tld = $1',
    [tld.toLowerCase()],
  );
  return Number(row?.count ?? 0);
}

const SUBDOMAIN_SORT_SQL: Record<SubdomainsQuery['sort'], string> = {
  newest: 'registered_at DESC, name ASC',
  oldest: 'registered_at ASC, name ASC',
  name: 'name ASC',
  expires_soon: 'expires_at ASC, name ASC',
};

export async function listSubdomains(query: SubdomainsQuery): Promise<Paginated<SubdomainDto>> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.status !== 'all') {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.tld && query.tld !== '.') {
    params.push(query.tld.toLowerCase());
    where.push(`tld = $${params.length}`);
  }
  if (query.owner) {
    params.push(query.owner.toLowerCase());
    const idx = `$${params.length}`;
    if (query.scope === 'owner') {
      where.push(`owner_address = ${idx}`);
    } else if (query.scope === 'zone_owner') {
      where.push(`zone_owner_address = ${idx}`);
    } else {
      where.push(`(owner_address = ${idx} OR zone_owner_address = ${idx})`);
    }
  }
  if (query.q && query.q.length > 0) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(`(name ILIKE $${params.length} OR owner_address ILIKE $${params.length})`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = SUBDOMAIN_SORT_SQL[query.sort];
  const offset = (query.page - 1) * query.limit;

  const totalRow = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM subdomains ${whereSql}`,
    params,
  );
  const total = Number(totalRow?.count ?? 0);

  const listParams = [...params, query.limit, offset];
  const rows = await queryRows<SubdomainRow>(
    `SELECT ${SUBDOMAIN_COLUMNS} FROM subdomains ${whereSql}
     ORDER BY ${orderSql} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return {
    items: rows.map(toSubdomainDto),
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

/* ------------------------------------------------------------------ */
/*                     одноразовые intent'ы (prepare-*)               */
/* ------------------------------------------------------------------ */

export async function createIntent(input: {
  action: string;
  sender: string;
  tld?: string | null;
  payload?: Record<string, unknown>;
  ttlSeconds?: number;
}): Promise<{ id: string; expiresAt: string }> {
  const ttl = input.ttlSeconds ?? 600;
  const row = await queryOne<{ id: string; expires_at: Date }>(
    `INSERT INTO tx_intents (action, sender, tld, payload, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)
     RETURNING id, expires_at`,
    [
      input.action,
      input.sender.toLowerCase(),
      input.tld ?? null,
      JSON.stringify(input.payload ?? {}),
      String(ttl),
    ],
  );
  if (!row) throw new Error('createIntent failed');
  return { id: row.id, expiresAt: row.expires_at.toISOString() };
}

/** Атомарно «сжигает» intent: повторное использование невозможно (анти-replay). */
export async function consumeIntent(id: string, sender: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE tx_intents SET consumed_at = now()
     WHERE id = $1 AND sender = $2 AND consumed_at IS NULL AND expires_at > now()
     RETURNING id`,
    [id, sender.toLowerCase()],
  );
  return row !== null;
}

export async function cleanupExpiredIntents(): Promise<void> {
  await queryRows(`DELETE FROM tx_intents WHERE expires_at < now() - interval '1 day'`);
  await queryRows(`DELETE FROM auth_nonces WHERE expires_at < now() - interval '1 day'`);
}

/* ------------------------------------------------------------------ */
/*                    auth nonces (вход по подписи)                   */
/* ------------------------------------------------------------------ */

export async function createAuthNonce(input: {
  address: string;
  nonce: string;
  ttlSeconds?: number;
}): Promise<void> {
  await queryRows(
    `INSERT INTO auth_nonces (nonce, address, expires_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
    [input.nonce, input.address.toLowerCase(), String(input.ttlSeconds ?? 300)],
  );
}

export async function consumeAuthNonce(nonce: string, address: string): Promise<boolean> {
  const row = await queryOne<{ nonce: string }>(
    `UPDATE auth_nonces SET used_at = now()
     WHERE nonce = $1 AND address = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING nonce`,
    [nonce, address.toLowerCase()],
  );
  return row !== null;
}

/* ------------------------------------------------------------------ */
/*                  команды индексатору (resync и т.п.)               */
/* ------------------------------------------------------------------ */

export type IndexerCommand = {
  id: string;
  command: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function createIndexerCommand(
  command: string,
  payload: Record<string, unknown> = {},
): Promise<IndexerCommand> {
  const row = await queryOne<{
    id: string;
    command: string;
    payload: Record<string, unknown>;
    created_at: Date;
  }>(
    `INSERT INTO indexer_commands (command, payload) VALUES ($1, $2)
     RETURNING id, command, payload, created_at`,
    [command, JSON.stringify(payload)],
  );
  if (!row) throw new Error('createIndexerCommand failed');
  return {
    id: row.id,
    command: row.command,
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export async function takePendingIndexerCommands(limit = 5): Promise<IndexerCommand[]> {
  const rows = await queryRows<{
    id: string;
    command: string;
    payload: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, command, payload, created_at FROM indexer_commands
     WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    command: row.command,
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString(),
  }));
}

export async function completeIndexerCommand(id: string, result: string): Promise<void> {
  await queryRows('UPDATE indexer_commands SET processed_at = now(), result = $2 WHERE id = $1', [
    id,
    result.slice(0, 500),
  ]);
}
