import { route } from '@/lib/server/http';
import { issueSession } from '@/lib/server/auth';
import {
  resolvePublicOrigin,
  sanitizeNextPath,
  verifyAppAuthTicket,
} from '@/lib/server/google-oauth';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const url = new URL(request.url);
    const origin = resolvePublicOrigin(request);
    const nextPath = sanitizeNextPath(url.searchParams.get('next'), '/store');
    const verified = verifyAppAuthTicket(url.searchParams.get('ticket'));

    if (!verified) {
      const target = new URL(nextPath, origin);
      target.searchParams.set('auth_error', 'google_invalid_state');
      return Response.redirect(target.toString(), 302);
    }

    const issued = await issueSession(verified.address);
    const target = new URL(nextPath, origin);
    target.searchParams.set('auth', 'google');

    const headers = new Headers();
    headers.set('Location', target.toString());
    headers.set('Cache-Control', 'no-store');
    for (const cookie of issued.cookies) headers.append('set-cookie', cookie);

    return new Response(null, { status: 302, headers });
  },
  { limit: 'auth', bucket: 'auth-app-session' },
);
