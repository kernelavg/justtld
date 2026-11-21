import { ApiError, normalizeTld, validateTldFormat, type ZoneDto } from '@justtld/shared';
import {
  countSubdomainsByZone,
  getCustody,
  getZoneByTld,
  listCustodySubdomainsByTld,
  listTransfersForZone,
  refreshExpiredStatuses,
} from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';
import { readChainZone } from '@/lib/server/chain';
import {
  chainId,
  explorerTxUrlTemplate,
  subdomainsAddress,
  subdomainsEnabled,
} from '@/lib/server/config';

export const dynamic = 'force-dynamic';

const GRACE_PERIOD_DAYS = 30;

export const GET = route(
  async (request, context) => {
    const params = await (context as unknown as { params: Promise<{ tld: string }> }).params;
    const tld = normalizeTld(params.tld);
    if (!validateTldFormat(tld).ok) {
      throw ApiError.badRequest('INVALID_TLD', 'Некорректная зона в URL');
    }

    await refreshExpiredStatuses().catch(() => 0);
    const [rawZone, chain, subdomainsCount, custody, custodySubdomains] = await Promise.all([
      getZoneByTld(tld),
      readChainZone(tld),
      subdomainsEnabled() ? countSubdomainsByZone(tld).catch(() => 0) : Promise.resolve(0),
      getCustody(tld, '').catch(() => null),
      listCustodySubdomainsByTld(tld).catch(() => []),
    ]);

    if (!rawZone && !chain && !custody) {
      throw ApiError.notFound('Зона не найдена ни в кэше, ни в блокчейне');
    }

    const nowMs = Date.now();
    const zone: ZoneDto | null =
      rawZone ??
      (custody
        ? {
            id: `custody-${custody.tld}`,
            tld: custody.tld,
            ownerAddress: custody.ownerAddress,
            status: new Date(custody.expiresAt).getTime() > nowMs ? 'active' : 'expired',
            registeredAt: custody.createdAt,
            expiresAt: custody.expiresAt,
            metadata: JSON.stringify({
              description: 'Зона платформы JustTLD',
            }),
            transactionHash: 'platform-custody',
            blockNumber: 0,
            createdAt: custody.createdAt,
            updatedAt: custody.updatedAt,
          }
        : null);

    const consistent =
      !rawZone && !chain && custody
        ? true
        : !rawZone || !chain
          ? false
          : rawZone.ownerAddress === chain.owner &&
            Math.abs(new Date(rawZone.expiresAt).getTime() / 1000 - chain.expiresAt) < 2 &&
            rawZone.metadata === chain.metadata &&
            (rawZone.status === 'blocked') === chain.blocked;

    const transfers = rawZone ? await listTransfersForZone(rawZone.id, 5).catch(() => []) : [];
    const expiresSource = chain
      ? new Date(chain.expiresAt * 1000).toISOString()
      : zone?.expiresAt ?? null;
    const graceEndsAt = expiresSource
      ? new Date(new Date(expiresSource).getTime() + GRACE_PERIOD_DAYS * 86_400_000).toISOString()
      : null;

    return jsonResponse({
      zone,
      chain,
      custody,
      consistent,
      subdomainsCount: subdomainsCount + custodySubdomains.length,
      custodySubdomainsCount: custodySubdomains.length,
      subdomainsEnabled: subdomainsEnabled(),
      subdomainsContract: subdomainsEnabled() ? subdomainsAddress() : null,
      gracePeriodDays: GRACE_PERIOD_DAYS,
      graceEndsAt,
      explorer: {
        confirmedAt: new Date().toISOString(),
        chainId: chainId(),
        txUrlTemplate: explorerTxUrlTemplate(),
      },
      transfers,
    });
  },
  { limit: 'read', bucket: 'zone-detail' },
);
