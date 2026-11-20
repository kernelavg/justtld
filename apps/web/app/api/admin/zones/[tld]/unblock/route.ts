import { ApiError, normalizeTld } from '@justtld/shared';
import { insertAuditEntry } from '@justtld/db';
import { getClientIp, jsonResponse, route } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/auth';
import { buildUnsignedTx, simulateRegistryCall } from '@/lib/server/tx';
import { readChainZone } from '@/lib/server/chain';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request, context) => {
    const session = await requireAdmin(request);
    const params = await (context as unknown as { params: Promise<{ tld: string }> }).params;
    const tld = normalizeTld(params.tld);

    const chainZone = await readChainZone(tld);
    if (!chainZone) throw ApiError.notFound('Зона не найдена в блокчейне');
    if (!chainZone.blocked) throw ApiError.conflict('ZONE_NOT_BLOCKED', 'Зона не заблокирована');

    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    try {
      await simulateRegistryCall({
        functionName: 'unblockTLD',
        args: [tld],
        account: session.address as `0x${string}`,
      });
    } catch (error) {
      await insertAuditEntry({
        actorAddress: session.address,
        action: 'unblock',
        target: tld,
        ip,
        userAgent,
        outcome: 'failure',
      });
      throw error;
    }

    const tx = buildUnsignedTx({
      functionName: 'unblockTLD',
      args: [tld],
      sender: session.address,
    });
    const audit = await insertAuditEntry({
      actorAddress: session.address,
      action: 'unblock',
      target: tld,
      ip,
      userAgent,
      details: { owner: chainZone.owner },
    });

    return jsonResponse({ tx, auditId: audit.id, tld }, { status: 201 });
  },
  { limit: 'admin', bucket: 'admin-unblock' },
);
