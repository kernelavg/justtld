import { searchQuerySchema } from '@justtld/shared';
import { searchZones } from '@justtld/db';
import { jsonResponse, readQuery, route } from '@/lib/server/http';
import { checkRegistrationOnChain } from '@/lib/server/chain';
import { normalizeTld, validateTldFormat } from '@justtld/shared';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const { q, limit } = readQuery(request, searchQuerySchema);
    const results = await searchZones(q, limit);
    const candidate = normalizeTld(q);
    const format = validateTldFormat(candidate);
    const availability = format.ok
      ? await checkRegistrationOnChain(candidate)
      : { ok: false, reason: format.code ?? 'INVALID' };

    return jsonResponse({
      query: q,
      results,
      availability: {
        tld: candidate,
        available: availability.ok,
        reason: availability.reason,
      },
    });
  },
  { limit: 'read', bucket: 'search' },
);
