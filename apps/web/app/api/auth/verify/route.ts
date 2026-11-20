import { authVerifySchema } from '@justtld/shared';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { issueSession, verifyLogin } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const { address, signature, nonce } = await readJson(request, authVerifySchema);
    const user = await verifyLogin({ address, signature, nonce });
    const session = await issueSession(user.address);
    const headers = new Headers();
    for (const cookie of session.cookies) headers.append('Set-Cookie', cookie);
    return jsonResponse({ user: session.user, csrfToken: session.csrfToken }, { headers });
  },
  { limit: 'auth', bucket: 'auth-verify' },
);
