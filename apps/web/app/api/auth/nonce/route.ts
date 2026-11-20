import { authNonceSchema } from '@justtld/shared';
import { ensureUser } from '@justtld/db';
import { withTransaction } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { createNonceFor } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const { address } = await readJson(request, authNonceSchema);
    await withTransaction(async (client) => ensureUser(client, address));
    const nonce = await createNonceFor(address);
    return jsonResponse(nonce);
  },
  { limit: 'auth', bucket: 'auth-nonce' },
);
