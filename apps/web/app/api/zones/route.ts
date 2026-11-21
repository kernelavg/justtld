import {
  zonesQuerySchema,
  type ZoneCustodyDto,
  type ZoneDto,
  type ZoneStatus,
} from '@justtld/shared';
import {
  listAllCustody,
  listCustodyByOwner,
  listZones,
  refreshExpiredStatuses,
} from '@justtld/db';
import { jsonResponse, readQuery, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const query = readQuery(request, zonesQuerySchema);
    await refreshExpiredStatuses().catch(() => 0);
    const result = await listZones(query);

    if (!query.page || query.page === 1) {
      const custodyList: ZoneCustodyDto[] = query.owner
        ? await listCustodyByOwner(query.owner).catch(() => [])
        : await listAllCustody(100).catch(() => []);

      const existingTlds = new Set(result.items.map((z) => z.tld.toLowerCase()));
      const nowMs = Date.now();

      const extraZones: ZoneDto[] = custodyList
        .filter((c) => c.subLabel === '' && !existingTlds.has(c.tld.toLowerCase()))
        .filter((c) => !query.q || c.tld.toLowerCase().includes(query.q.toLowerCase()))
        .map((c) => ({
          id: `custody-${c.tld}`,
          tld: c.tld,
          ownerAddress: c.ownerAddress,
          status: (new Date(c.expiresAt).getTime() > nowMs ? 'active' : 'expired') as ZoneStatus,
          registeredAt: c.createdAt,
          expiresAt: c.expiresAt,
          metadata: JSON.stringify({
            description: 'Зона платформы JustTLD',
          }),
          transactionHash: 'platform-custody',
          blockNumber: 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }))
        .filter((z) => !query.status || query.status === 'all' || z.status === query.status);

      if (extraZones.length > 0) {
        result.items = [...extraZones, ...result.items];
        result.total += extraZones.length;
      }
    }

    return jsonResponse(result);
  },
  { limit: 'read', bucket: 'zones-list' },
);
