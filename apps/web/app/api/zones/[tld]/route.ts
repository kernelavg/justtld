import { normalizeTld, validateTldFormat } from '@justtld/shared';
import {
  countSubdomainsByZone,
  getZoneByTld,
  listTransfersForZone,
  refreshExpiredStatuses,
} from '@justtld/db';
import { ApiError } from '@justtld/shared';
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
    const [zone, chain, subdomainsCount] = await Promise.all([
      getZoneByTld(tld),
      readChainZone(tld),
      subdomainsEnabled() ? countSubdomainsByZone(tld).catch(() => 0) : Promise.resolve(0),
    ]);

    if (!zone && !chain) {
      throw ApiError.notFound('Зона не найдена ни в кэше, ни в блокчейне');
    }

    const consistent =
      !zone || !chain
        ? false
        : zone.ownerAddress === chain.owner &&
          Math.abs(new Date(zone.expiresAt).getTime() / 1000 - chain.expiresAt) < 2 &&
          zone.metadata === chain.metadata &&
          (zone.status === 'blocked') === chain.blocked;

    const transfers = zone ? await listTransfersForZone(zone.id, 5).catch(() => []) : [];
    const expiresSource = chain
      ? new Date(chain.expiresAt * 1000).toISOString()
      : zone?.expiresAt ?? null;
    const graceEndsAt = expiresSource
      ? new Date(new Date(expiresSource).getTime() + GRACE_PERIOD_DAYS * 86_400_000).toISOString()
      : null;

    return jsonResponse({
      zone,
      chain,
      consistent,
      subdomainsCount,
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
