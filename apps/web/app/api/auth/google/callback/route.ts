import { readCookie, route } from '@/lib/server/http';
import {
  googleAuthEnabled,
  googleClientId,
  googleClientSecret,
} from '@/lib/server/config';
import { upsertGoogleAccount } from '@/lib/server/accounts';
import { issueSession } from '@/lib/server/auth';
import {
  createAppAuthTicket,
  GOOGLE_STATE_COOKIE,
  resolvePublicOrigin,
  verifyGoogleStateCookieValue,
} from '@/lib/server/google-oauth';

export const dynamic = 'force-dynamic';

function redirectWithError(
  origin: string,
  path: string,
  code: string,
  appBridge = false,
): Response {
  const location = appBridge
    ? `justtld://auth?error=${encodeURIComponent(code)}&next=${encodeURIComponent(path)}`
    : (() => {
        const target = new URL(path, origin);
        target.searchParams.set('auth_error', code);
        return target.toString();
      })();
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Set-Cookie': `${GOOGLE_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = route(
  async (request) => {
    const url = new URL(request.url);
    const origin = resolvePublicOrigin(request);
    const stateCookie = readCookie(request, GOOGLE_STATE_COOKIE);
    const verifiedState = verifyGoogleStateCookieValue(
      stateCookie,
      url.searchParams.get('state'),
    );
    const nextPath = verifiedState?.next ?? '/store';
    const appBridge = verifiedState?.appBridge ?? false;

    if (!googleAuthEnabled()) {
      return redirectWithError(origin, nextPath, 'google_not_configured', appBridge);
    }

    const oauthError = url.searchParams.get('error');
    if (oauthError) {
      return redirectWithError(origin, nextPath, 'google_cancelled', appBridge);
    }

    const code = url.searchParams.get('code');
    if (!code || !verifiedState) {
      return redirectWithError(origin, nextPath, 'google_invalid_state', appBridge);
    }

    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId(),
        client_secret: googleClientSecret(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      return redirectWithError(origin, nextPath, 'google_token_failed', appBridge);
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      return redirectWithError(origin, nextPath, 'google_token_missing', appBridge);
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileRes.ok) {
      return redirectWithError(origin, nextPath, 'google_profile_failed', appBridge);
    }

    const profile = (await profileRes.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!profile.email || profile.email_verified === false) {
      return redirectWithError(origin, nextPath, 'google_email_unverified', appBridge);
    }

    const account = await upsertGoogleAccount({
      email: profile.email,
      displayName: profile.name ?? null,
    });

    if (appBridge) {
      const ticket = createAppAuthTicket(account.walletAddress);
      const appDeepLink = `justtld://auth?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(nextPath)}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: appDeepLink,
          'Set-Cookie': `${GOOGLE_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const issued = await issueSession(account.walletAddress);

    const target = new URL(nextPath, origin);
    target.searchParams.set('auth', 'google');

    const headers = new Headers();
    headers.set('Location', target.toString());
    headers.set('Cache-Control', 'no-store');
    for (const cookie of issued.cookies) headers.append('set-cookie', cookie);
    headers.append(
      'set-cookie',
      `${GOOGLE_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
    );

    return new Response(null, { status: 302, headers });
  },
  { limit: 'auth', bucket: 'auth-google-callback' },
);
