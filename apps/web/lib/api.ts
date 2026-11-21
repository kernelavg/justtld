'use client';

import type {
  Paginated,
  StatsDto,
  SubdomainDto,
  TransferRequestDto,
  UnsignedTx,
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
  adminAddress: string | null;
};

export const getSession = () => apiFetch<SessionResponse>('/api/auth/session');

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
