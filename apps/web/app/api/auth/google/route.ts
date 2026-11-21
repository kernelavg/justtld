import { route } from '@/lib/server/http';
import { googleAuthEnabled, googleClientId } from '@/lib/server/config';
import {
  createGoogleStateCookieValue,
  GOOGLE_STATE_COOKIE,
  resolvePublicOrigin,
  sanitizeNextPath,
} from '@/lib/server/google-oauth';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const url = new URL(request.url);
    const nextPath = sanitizeNextPath(url.searchParams.get('next'), '/store');
    const origin = resolvePublicOrigin(request);

    if (!googleAuthEnabled()) {
      const target = new URL(nextPath, origin);
      target.searchParams.set('auth_error', 'google_not_configured');
      return Response.redirect(target.toString(), 302);
    }

    const { state, cookieValue } = createGoogleStateCookieValue(nextPath);
    const redirectUri = `${origin}/api/auth/google/callback`;

    const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleUrl.searchParams.set('client_id', googleClientId());
    googleUrl.searchParams.set('redirect_uri', redirectUri);
    googleUrl.searchParams.set('response_type', 'code');
    googleUrl.searchParams.set('scope', 'openid email profile');
    googleUrl.searchParams.set('state', state);
    googleUrl.searchParams.set('prompt', 'select_account');

    const secure = origin.startsWith('https://') ? '; Secure' : '';
    const cookie = `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(cookieValue)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secure}`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: googleUrl.toString(),
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store',
      },
    });
  },
  { limit: 'auth', bucket: 'auth-google-start' },
);
