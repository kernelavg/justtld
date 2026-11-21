import type { SubdomainDto, ZoneStatus } from '@justtld/shared';
import { getPublicClient } from './chain';
import { subdomainsEnabled, subdomainsAddress } from './config';

/**
 * Чтение поддоменов напрямую из контракта (источник истины) и приведение к DTO кэша.
 * Поддомены живут в отдельном контракте JustTLDSubdomains — см. docs/SUBDOMAINS.md.
 */

export type ChainSubdomain = {
  owner: string;
  zoneOwner: string;
  registeredAt: number;
  expiresAt: number;
  updatedAt: number;
  blocked: boolean;
  metadata: string;
};

function statusFromChain(
  sub: ChainSubdomain,
  nowSeconds = Math.floor(Date.now() / 1000),
): ZoneStatus {
  if (sub.blocked) return 'blocked';
  if (sub.expiresAt <= nowSeconds) return 'expired';
  return 'active';
}

/** Читает поддомен по зоне и метке. null — записи нет или контракт не подключён. */
export async function readChainSubdomain(
  tld: string,
  label: string,
): Promise<ChainSubdomain | null> {
  if (!subdomainsEnabled()) return null;
  try {
    const result = (await getPublicClient().readContract({
      address: subdomainsAddress(),
      abi: (await import('@justtld/shared/generated/subdomains'))
        .SUBDOMAINS_ABI as unknown as readonly unknown[],
      functionName: 'getSubdomain',
      args: [tld, label],
    })) as unknown as {
      owner: string;
      zoneOwner: string;
      registeredAt: bigint;
      expiresAt: bigint;
      updatedAt: bigint;
      blocked: boolean;
      metadata: string;
    };
    return {
      owner: result.owner.toLowerCase(),
      zoneOwner: result.zoneOwner.toLowerCase(),
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

/** Фактический владелец поддомена (0x0, если он истёк/заблокирован/зона сменила хозяина). */
export async function readChainSubdomainOwner(tld: string, label: string): Promise<string | null> {
  if (!subdomainsEnabled()) return null;
  try {
    const owner = (await getPublicClient().readContract({
      address: subdomainsAddress(),
      abi: (await import('@justtld/shared/generated/subdomains'))
        .SUBDOMAINS_ABI as unknown as readonly unknown[],
      functionName: 'subdomainOwner',
      args: [tld, label],
    })) as string;
    return owner.toLowerCase();
  } catch {
    return null;
  }
}

/** Приводит состояние контракта к DTO, совместимому с кэшем (без id). */
export function chainSubdomainToDto(tld: string, label: string, sub: ChainSubdomain): SubdomainDto {
  return {
    id: `${label}.${tld.replace(/^\./, '')}`,
    name: `${label}.${tld.replace(/^\./, '')}`,
    tld,
    label,
    ownerAddress: sub.owner,
    zoneOwnerAddress: sub.zoneOwner,
    status: statusFromChain(sub),
    registeredAt: new Date(sub.registeredAt * 1000).toISOString(),
    expiresAt: new Date(sub.expiresAt * 1000).toISOString(),
    updatedAt: new Date(sub.updatedAt * 1000).toISOString(),
    metadata: sub.metadata,
    transactionHash: '',
    blockNumber: 0,
  };
}

/** Полное имя поддомена: blog + .femboy → blog.femboy. */
export function subdomainName(tld: string, label: string): string {
  return `${label}.${tld.replace(/^\./, '')}`;
}
