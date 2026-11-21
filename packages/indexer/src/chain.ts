import { createPublicClient, http, type PublicClient } from 'viem';
import { REGISTRY_ABI } from '@justtld/shared/generated/registry';
import { SUBDOMAINS_ABI } from '@justtld/shared/generated/subdomains';
import type { ZoneStatus } from '@justtld/shared';

export type ChainClient = PublicClient;

export function createChainClient(rpcUrl: string): ChainClient {
  return createPublicClient({
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }),
  }) as ChainClient;
}

export async function getChainHead(client: ChainClient): Promise<number> {
  return Number(await client.getBlockNumber());
}

export async function getBlock(client: ChainClient, blockNumber: number) {
  return client.getBlock({ blockNumber: BigInt(blockNumber) });
}

export type RawLog = {
  address: `0x${string}`;
  blockNumber: bigint | null;
  blockHash: `0x${string}` | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  topics: [`0x${string}`, ...`0x${string}`[]];
  data: `0x${string}`;
};

export async function getContractLogs(
  client: ChainClient,
  params: { address: `0x${string}`; fromBlock: number; toBlock: number },
): Promise<RawLog[]> {
  const logs = await client.getLogs({
    address: params.address,
    fromBlock: BigInt(params.fromBlock),
    toBlock: BigInt(params.toBlock),
  });
  return logs as unknown as RawLog[];
}

export type ChainZone = {
  owner: `0x${string}`;
  registeredAt: number;
  expiresAt: number;
  updatedAt: number;
  blocked: boolean;
  metadata: string;
};

/** Читает зону напрямую из контракта — блокчейн остаётся источником истины. */
export async function readZone(
  client: ChainClient,
  address: `0x${string}`,
  tld: string,
): Promise<ChainZone | null> {
  try {
    const result = (await client.readContract({
      address,
      abi: REGISTRY_ABI,
      functionName: 'getTLD',
      args: [tld],
    })) as unknown as {
      owner: `0x${string}`;
      registeredAt: bigint;
      expiresAt: bigint;
      updatedAt: bigint;
      blocked: boolean;
      metadata: string;
    };
    return {
      owner: result.owner,
      registeredAt: Number(result.registeredAt),
      expiresAt: Number(result.expiresAt),
      updatedAt: Number(result.updatedAt),
      blocked: result.blocked,
      metadata: result.metadata,
    };
  } catch {
    return null;
  }
}

export type ChainSubdomain = {
  owner: `0x${string}`;
  zoneOwner: `0x${string}`;
  registeredAt: number;
  expiresAt: number;
  updatedAt: number;
  blocked: boolean;
  metadata: string;
};

/**
 * Читает поддомен из контракта поддоменов.
 * null — записи нет (или контракт ещё не знает такую метку).
 */
export async function readSubdomain(
  client: ChainClient,
  address: `0x${string}`,
  tld: string,
  label: string,
): Promise<ChainSubdomain | null> {
  try {
    const result = (await client.readContract({
      address,
      abi: SUBDOMAINS_ABI,
      functionName: 'getSubdomain',
      args: [tld, label],
    })) as unknown as {
      owner: `0x${string}`;
      zoneOwner: `0x${string}`;
      registeredAt: bigint;
      expiresAt: bigint;
      updatedAt: bigint;
      blocked: boolean;
      metadata: string;
    };
    return {
      owner: result.owner,
      zoneOwner: result.zoneOwner,
      registeredAt: Number(result.registeredAt),
      expiresAt: Number(result.expiresAt),
      updatedAt: Number(result.updatedAt),
      blocked: result.blocked,
      metadata: result.metadata,
    };
  } catch {
    return null;
  }
}

export function zoneStatusFromChain(
  zone: ChainZone,
  nowSeconds = Math.floor(Date.now() / 1000),
): ZoneStatus {
  if (zone.blocked) return 'blocked';
  if (zone.expiresAt <= nowSeconds) return 'expired';
  return 'active';
}

export async function isContractDeployed(
  client: ChainClient,
  address: `0x${string}`,
): Promise<{ ok: boolean; codeSize: number }> {
  try {
    const code = await client.getCode({ address });
    return { ok: Boolean(code && code !== '0x'), codeSize: code ? (code.length - 2) / 2 : 0 };
  } catch {
    return { ok: false, codeSize: 0 };
  }
}
