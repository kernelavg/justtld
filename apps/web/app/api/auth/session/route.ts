import { getAccountByWallet } from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';
import { getSessionFromRequest } from '@/lib/server/auth';
import { adminAddress, googleAuthEnabled } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    const account = session ? await getAccountByWallet(session.address) : null;
    return jsonResponse({
      session,
      account,
      adminAddress: adminAddress(),
      googleAuthEnabled: googleAuthEnabled(),
    });
  },
  { limit: 'read', bucket: 'auth-session' },
);
