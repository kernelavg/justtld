import { zonesQuerySchema } from '@justtld/shared';
import { listZones, refreshExpiredStatuses } from '@justtld/db';
import { jsonResponse, readQuery, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const query = readQuery(request, zonesQuerySchema);
    await refreshExpiredStatuses().catch(() => 0);
    const result = await listZones(query);
    return jsonResponse(result);
  },
  { limit: 'read', bucket: 'zones-list' },
);
