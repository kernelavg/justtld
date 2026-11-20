import { jsonResponse, route } from '@/lib/server/http';
import { getSessionFromRequest } from '@/lib/server/auth';
import { adminAddress } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    return jsonResponse({ session, adminAddress: adminAddress() });
  },
  { limit: 'read', bucket: 'auth-session' },
);
