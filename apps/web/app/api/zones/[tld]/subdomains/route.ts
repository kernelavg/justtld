import { ApiError, normalizeTld, validateTldFormat } from '@justtld/shared';
import { getZoneByTld, listSubdomainsByZone, refreshExpiredSubdomainStatuses } from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';
import { subdomainsEnabled } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

/**
 * Поддомены зоны.
 *
 * Источник истины — контракт JustTLDSubdomains; здесь отдаём кэш индексатора.
 * Если контракт поддоменов не подключён, честно отвечаем 501, а не пустым списком.
 */
export const GET = route(
  async (request, context) => {
    if (!subdomainsEnabled()) {
      throw new ApiError(
        501,
        'SUBDOMAINS_DISABLED',
        'Контракт поддоменов не подключён (deployments/<сеть>.subdomains.json)',
      );
    }
    const params = await (context as unknown as { params: Promise<{ tld: string }> }).params;
    const tld = normalizeTld(params.tld);
    if (!validateTldFormat(tld).ok) {
      throw ApiError.badRequest('INVALID_TLD', 'Некорректная зона в URL');
    }

    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50),
    );

    await refreshExpiredSubdomainStatuses().catch(() => 0);
    const zone = await getZoneByTld(tld).catch(() => null);
    const list = await listSubdomainsByZone(tld, { page, limit });

    return jsonResponse({ tld, zoneOwner: zone?.ownerAddress ?? null, ...list });
  },
  { limit: 'read', bucket: 'subdomains-list' },
);
