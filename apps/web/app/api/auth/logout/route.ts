import { jsonResponse, route } from '@/lib/server/http';
import { clearSessionCookies } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const POST = route(
  async () => {
    const headers = new Headers();
    for (const cookie of clearSessionCookies()) headers.append('Set-Cookie', cookie);
    return jsonResponse({ ok: true }, { headers });
  },
  { limit: 'auth', bucket: 'auth-logout' },
);
