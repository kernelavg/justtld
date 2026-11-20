import { z } from 'zod';
import { createIndexerCommand, insertAuditEntry } from '@justtld/db';
import { jsonResponse, getClientIp, readJson, route } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/auth';
import { deployment } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

const schema = z.object({
  purge: z.boolean().default(true),
  fromBlock: z.coerce.number().int().min(0).optional(),
});

export const POST = route(
  async (request) => {
    const session = await requireAdmin(request);
    const body = await readJson(request, schema);
    const command = await createIndexerCommand('resync', {
      purge: body.purge,
      fromBlock: body.fromBlock ?? deployment()?.deployBlock ?? 0,
    });
    const audit = await insertAuditEntry({
      actorAddress: session.address,
      action: 'resync',
      target: null,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
      details: { commandId: command.id, purge: body.purge },
    });
    return jsonResponse({ queued: true, command, auditId: audit.id }, { status: 202 });
  },
  { limit: 'admin', bucket: 'admin-resync' },
);
