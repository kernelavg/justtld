import { subdomainsQuerySchema } from '@justtld/shared';
import { listSubdomains, refreshExpiredSubdomainStatuses } from '@justtld/db';
import { jsonResponse, readQuery, route } from '@/lib/server/http';
import { subdomainsAddress, subdomainsEnabled } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

/** Общий каталог поддоменов с фильтрами по владельцу, зоне, статусу и поиску. */
export const GET = route(
  async (request) => {
    if (!subdomainsEnabled()) {
      return jsonResponse({
        enabled: false,
        contract: null,
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        pages: 1,
      });
    }
    const query = readQuery(request, subdomainsQuerySchema);
    await refreshExpiredSubdomainStatuses().catch(() => 0);
    const result = await listSubdomains(query);
    return jsonResponse({
      enabled: true,
      contract: subdomainsAddress(),
      ...result,
    });
  },
  { limit: 'read', bucket: 'subdomains-catalog' },
);
