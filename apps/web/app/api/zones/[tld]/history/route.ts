import { historyQuerySchema, normalizeTld } from '@justtld/shared';
import { getZoneByTld, listZoneEvents } from '@justtld/db';
import { ApiError } from '@justtld/shared';
import { jsonResponse, readQuery, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request, context) => {
    const params = await (context as unknown as { params: Promise<{ tld: string }> }).params;
    const tld = normalizeTld(params.tld);
    const query = readQuery(request, historyQuerySchema);
    const zone = await getZoneByTld(tld);
    if (!zone) throw ApiError.notFound('Зона не найдена в кэше индексатора');
    const history = await listZoneEvents(zone.id, query);
    return jsonResponse({ tld, ...history });
  },
  { limit: 'read', bucket: 'zone-history' },
);
