import { z } from 'zod';
import { tldSchema, ApiError } from '@justtld/shared';
import { insertAuditEntry } from '@justtld/db';
import { getClientIp, jsonResponse, readJson, route } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/auth';
import { buildUnsignedTx, simulateRegistryCall } from '@/lib/server/tx';
import { getAdminLists } from '@/lib/server/chain';

export const dynamic = 'force-dynamic';

const schema = z.object({
  tld: tldSchema,
  action: z.enum(['add', 'remove']),
});

export const POST = route(
  async (request) => {
    const session = await requireAdmin(request);
    const { tld, action } = await readJson(request, schema);
    const { reserved } = await getAdminLists();
    const exists = reserved.includes(tld);

    if (action === 'add' && exists)
      throw ApiError.conflict('TLD_ALREADY_RESERVED', 'Зона уже зарезервирована');
    if (action === 'remove' && !exists) throw ApiError.notFound('Зона не в списке резервов');

    const functionName = action === 'add' ? 'addReservedTLD' : 'removeReservedTLD';
    await simulateRegistryCall({
      functionName,
      args: [tld],
      account: session.address as `0x${string}`,
    });

    const tx = buildUnsignedTx({ functionName, args: [tld], sender: session.address });
    const audit = await insertAuditEntry({
      actorAddress: session.address,
      action: action === 'add' ? 'reserved-add' : 'reserved-remove',
      target: tld,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
    return jsonResponse({ tx, auditId: audit.id, tld, action }, { status: 201 });
  },
  { limit: 'admin', bucket: 'admin-reserved' },
);
