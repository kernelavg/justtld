import { adminListSchema } from '@justtld/shared';
import { listAuditEntries } from '@justtld/db';
import { jsonResponse, readQuery, route } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    await requireAdmin(request);
    const query = readQuery(request, adminListSchema);
    const audit = await listAuditEntries(query);
    return jsonResponse(audit);
  },
  { limit: 'admin', bucket: 'admin-audit' },
);
