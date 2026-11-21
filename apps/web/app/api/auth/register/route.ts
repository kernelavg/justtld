import { accountRegisterSchema } from '@justtld/shared';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { registerEmailAccount } from '@/lib/server/accounts';
import { issueSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const body = await readJson(request, accountRegisterSchema);
    const account = await registerEmailAccount({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
    });
    const issued = await issueSession(account.walletAddress);
    const headers = new Headers();
    for (const cookie of issued.cookies) headers.append('set-cookie', cookie);

    return jsonResponse(
      { ok: true, session: issued.user, account },
      { status: 201, headers },
    );
  },
  { limit: 'auth', bucket: 'auth-register' },
);
