import { normalizeTld, validateTldFormat } from '@justtld/shared';
import { getZoneByTld, listTransfersForZone, refreshExpiredStatuses } from '@justtld/db';
import { ApiError } from '@justtld/shared';
import { jsonResponse, route } from '@/lib/server/http';
import { readChainZone } from '@/lib/server/chain';
import { chainId, explorerTxUrlTemplate } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request, context) => {
    const params = await (context as unknown as { params: Promise<{ tld: string }> }).params;
    const tld = normalizeTld(params.tld);
    if (!validateTldFormat(tld).ok) {
      throw ApiError.badRequest('INVALID_TLD', 'Некорректная зона в URL');
    }

    await refreshExpiredStatuses().catch(() => 0);
    const [zone, chain] = await Promise.all([getZoneByTld(tld), readChainZone(tld)]);

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

    return jsonResponse({
      zone,
      chain,
      consistent,
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
