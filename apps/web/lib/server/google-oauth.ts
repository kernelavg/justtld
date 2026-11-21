import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appUrl, sessionSecret } from './config';

export const GOOGLE_STATE_COOKIE = 'justtld_google_state';

export function resolvePublicOrigin(request: Request): string {
  const configured = appUrl().trim();
  if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
    try {
      return new URL(configured).origin;
    } catch {
      // fallback to request headers
    }
  }
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export function sanitizeNextPath(raw: string | null | undefined, fallback = '/store'): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }
  return trimmed;
}

function signState(payloadB64: string): string {
  return createHmac('sha256', sessionSecret()).update(payloadB64).digest('base64url');
}

export function createGoogleStateCookieValue(nextPath: string): {
  state: string;
  cookieValue: string;
} {
  const state = randomBytes(24).toString('hex');
  const payloadB64 = Buffer.from(
    JSON.stringify({ state, next: sanitizeNextPath(nextPath), exp: Date.now() + 10 * 60_000 }),
    'utf8',
  ).toString('base64url');
  const sig = signState(payloadB64);
  return { state, cookieValue: `${payloadB64}.${sig}` };
}

export function verifyGoogleStateCookieValue(
  cookieValue: string | null,
  returnedState: string | null,
): { next: string } | null {
  if (!cookieValue || !returnedState) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = signState(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      state?: string;
      next?: string;
      exp?: number;
    };
    if (!parsed.state || !parsed.exp || Date.now() > parsed.exp) return null;
    const s1 = Buffer.from(parsed.state);
    const s2 = Buffer.from(returnedState);
    if (s1.length !== s2.length || !timingSafeEqual(s1, s2)) return null;
    return { next: sanitizeNextPath(parsed.next) };
  } catch {
    return null;
  }
}
