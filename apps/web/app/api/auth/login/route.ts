import { accountLoginSchema } from '@justtld/shared';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { authenticateEmailAccount } from '@/lib/server/accounts';
import { issueSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const body = await readJson(request, accountLoginSchema);
    const account = await authenticateEmailAccount(body.email, body.password);
    const issued = await issueSession(account.walletAddress);
    const headers = new Headers();
    for (const cookie of issued.cookies) headers.append('set-cookie', cookie);

    return jsonResponse(
      { ok: true, session: issued.user, account },
      { headers },
    );
  },
  { limit: 'auth', bucket: 'auth-login' },
);
