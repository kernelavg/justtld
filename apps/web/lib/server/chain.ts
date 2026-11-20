import { createPublicClient, http, type PublicClient } from 'viem';
import { REGISTRY_ABI } from '@justtld/shared/generated/registry';
import type { ChainZoneSnapshot } from '@justtld/shared';
import { chainId as configuredChainId, registryAddress, rpcUrl } from './config';

let cachedClient: PublicClient | null = null;
let cachedUrl: string | null = null;

export function getPublicClient(): PublicClient {
  const url = rpcUrl();
  if (!cachedClient || cachedUrl !== url) {
    cachedClient = createPublicClient({
      transport: http(url, { timeout: 15_000, retryCount: 1 }),
    }) as PublicClient;
    cachedUrl = url;
  }
  return cachedClient;
}

export async function getChainHead(): Promise<number> {
  return Number(await getPublicClient().getBlockNumber());
}

export async function getRegistryOwner(): Promise<string | null> {
  try {
    return (await getPublicClient().readContract({
      address: registryAddress(),
      abi: REGISTRY_ABI,
      functionName: 'owner',
    })) as string;
  } catch {
    return null;
  }
}

export async function isPaused(): Promise<boolean> {
  try {
    return (await getPublicClient().readContract({
      address: registryAddress(),
      abi: REGISTRY_ABI,
      functionName: 'paused',
    })) as boolean;
  } catch {
    return false;
  }
}

export async function getTotalZones(): Promise<number> {
  try {
    const value = (await getPublicClient().readContract({
      address: registryAddress(),
      abi: REGISTRY_ABI,
      functionName: 'totalZones',
    })) as bigint;
    return Number(value);
  } catch {
    return 0;
  }
}

/** Читает зону из контракта (источник истины). null — зона не существует. */
export async function readChainZone(tld: string): Promise<ChainZoneSnapshot | null> {
  try {
    const result = (await getPublicClient().readContract({
      address: registryAddress(),
      abi: REGISTRY_ABI,
      functionName: 'getTLD',
      args: [tld],
    })) as unknown as {
      owner: string;
      registeredAt: bigint;
      expiresAt: bigint;
      updatedAt: bigint;
      blocked: boolean;
      metadata: string;
    };
    return {
      owner: result.owner.toLowerCase(),
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

export async function chainOwnerOf(tld: string): Promise<string | null> {
  const zone = await readChainZone(tld);
  return zone ? zone.owner : null;
}

export async function checkRegistrationOnChain(
  tld: string,
): Promise<{ ok: boolean; reason: string }> {
  try {
    const result = (await getPublicClient().readContract({
      address: registryAddress(),
      abi: REGISTRY_ABI,
      functionName: 'checkRegistration',
      args: [tld],
    })) as unknown as [boolean, string];
    return { ok: Boolean(result[0]), reason: String(result[1] ?? '') };
  } catch (error) {
    return { ok: false, reason: `CHAIN_ERROR: ${(error as Error).message}` };
  }
}

export async function getAdminLists(): Promise<{ reserved: string[]; blacklist: string[] }> {
  try {
    const [reserved, blacklist] = await Promise.all([
      getPublicClient().readContract({
        address: registryAddress(),
        abi: REGISTRY_ABI,
        functionName: 'reservedTLDs',
      }) as Promise<readonly string[]>,
      getPublicClient().readContract({
        address: registryAddress(),
        abi: REGISTRY_ABI,
        functionName: 'blacklistedWords',
      }) as Promise<readonly string[]>,
    ]);
    return { reserved: [...reserved], blacklist: [...blacklist] };
  } catch {
    return { reserved: [], blacklist: [] };
  }
}

export type ChainHealth = {
  ok: boolean;
  latencyMs: number;
  chainId?: number;
  blockNumber?: number;
  error?: string;
};

export async function pingChain(): Promise<ChainHealth> {
  const startedAt = Date.now();
  try {
    const client = getPublicClient();
    const [id, block] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    const expected = configuredChainId();
    if (id !== expected) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        chainId: id,
        blockNumber: Number(block),
        error: `Ожидался chainId ${expected}, узел вернул ${id}`,
      };
    }
    return { ok: true, latencyMs: Date.now() - startedAt, chainId: id, blockNumber: Number(block) };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: (error as Error).message };
  }
}

export async function getContractCodeInfo(): Promise<{
  ok: boolean;
  address: string | null;
  codeSize: number;
  error?: string;
}> {
  try {
    const address = registryAddress();
    const code = await getPublicClient().getCode({ address });
    return {
      ok: Boolean(code && code !== '0x'),
      address,
      codeSize: code ? (code.length - 2) / 2 : 0,
    };
  } catch (error) {
    return {
      ok: false,
      address: null,
      codeSize: 0,
      error: (error as Error).message,
    };
  }
}
