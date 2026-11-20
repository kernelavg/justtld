import { z } from 'zod';
import { blacklistWordSchema, ApiError } from '@justtld/shared';
import { insertAuditEntry } from '@justtld/db';
import { getClientIp, jsonResponse, readJson, route } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/auth';
import { buildUnsignedTx, simulateRegistryCall } from '@/lib/server/tx';
import { getAdminLists } from '@/lib/server/chain';

export const dynamic = 'force-dynamic';

const schema = z.object({
  word: blacklistWordSchema.shape.word,
  action: z.enum(['add', 'remove']),
});

export const POST = route(
  async (request) => {
    const session = await requireAdmin(request);
    const { word, action } = await readJson(request, schema);
    const { blacklist } = await getAdminLists();
    const exists = blacklist.includes(word);

    if (action === 'add' && exists)
      throw ApiError.conflict('WORD_EXISTS', 'Слово уже в чёрном списке');
    if (action === 'remove' && !exists) throw ApiError.notFound('Слова нет в чёрном списке');

    const functionName = action === 'add' ? 'addBlacklistedWord' : 'removeBlacklistedWord';
    await simulateRegistryCall({
      functionName,
      args: [word],
      account: session.address as `0x${string}`,
    });

    const tx = buildUnsignedTx({ functionName, args: [word], sender: session.address });
    const audit = await insertAuditEntry({
      actorAddress: session.address,
      action: action === 'add' ? 'blacklist-add' : 'blacklist-remove',
      target: word,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
    return jsonResponse({ tx, auditId: audit.id, word, action }, { status: 201 });
  },
  { limit: 'admin', bucket: 'admin-blacklist' },
);
