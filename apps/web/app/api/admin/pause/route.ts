import { insertAuditEntry } from '@justtld/db';
import { getClientIp, jsonResponse, route } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/auth';
import { buildUnsignedTx, simulateRegistryCall } from '@/lib/server/tx';
import { isPaused } from '@/lib/server/chain';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const session = await requireAdmin(request);
    if (await isPaused()) return jsonResponse({ alreadyPaused: true, tx: null });

    await simulateRegistryCall({
      functionName: 'pause',
      account: session.address as `0x${string}`,
    });
    const tx = buildUnsignedTx({ functionName: 'pause', sender: session.address });
    const audit = await insertAuditEntry({
      actorAddress: session.address,
      action: 'pause',
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
    return jsonResponse({ tx, auditId: audit.id }, { status: 201 });
  },
  { limit: 'admin', bucket: 'admin-pause' },
);
