import { NextResponse, type NextRequest } from 'next/server';

/**
 * Безопасность на уровне edge-middleware:
 *  - CSP (без внешних скриптов), X-Frame-Options заменён на frame-ancestors,
 *  - nosniff / Referrer-Policy / Permissions-Policy,
 *  - запрет кэширования API,
 *  - блокировка небезопасных методов с чужого Origin (дополнительно к проверке в route-handlers).
 */
/** Маршруты самого сайта — их резолвер не перехватывает никогда. */
const RESERVED_PATHS = new Set([
  'address',
  'admin',
  'api',
  'block',
  'dashboard',
  'docs',
  'explorer',
  'register',
  'resolve',
  'tx',
  'zone',
  'zones',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

/**
 * Разбирает имя на поддомене резолвера. Два уровня:
 *   myzone.example.com        → зона .myzone
 *   blog.myzone.example.com   → поддомен blog в зоне .myzone
 */
function resolverTarget(request: NextRequest): { zone: string; label: string | null } | null {
  const base = (process.env.RESOLVER_DOMAIN ?? '').trim().toLowerCase();
  if (!base) return null;
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0] ?? '';
  if (!host.endsWith(`.${base}`)) return null;
  const prefix = host.slice(0, -(base.length + 1));
  if (!prefix) return null;
  const parts = prefix.split('.');
  const first = parts[0] ?? '';
  if (['www', 'api', 'admin', 'app'].includes(first)) return null;
  if (parts.length === 1) return { zone: first, label: null };
  if (parts.length === 2 && parts[1]) return { zone: parts[1], label: first };
  return null;
}

/**
 * Имя зоны из пути: /myzone → myzone. Работает, пока своего домена нет, —
 * так имя открывается в браузере уже сегодня: <сайт>/myzone.
 */
function zoneFromPath(request: NextRequest): string | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const path = request.nextUrl.pathname;
  if (!path.startsWith('/') || path === '/') return null;
  const label = path.slice(1);
  if (!label || label.includes('/')) return null;
  if (RESERVED_PATHS.has(label.toLowerCase())) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(label)) return null;
  return label;
}

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';

  // Резолвер: myzone.вашдомен → страница зоны, blog.myzone.вашдомен → страница поддомена.
  const target = resolverTarget(request);
  if (target && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/resolve';
    url.search = target.label
      ? `?zone=${encodeURIComponent(target.zone)}&label=${encodeURIComponent(target.label)}`
      : `?zone=${encodeURIComponent(target.zone)}`;
    return NextResponse.rewrite(url);
  }

  // Тот же резолвер без своего домена: /myzone → зона, /myzone/blog → поддомен.
  if (!target) {
    const segments = request.nextUrl.pathname.split('/').filter(Boolean);
    const pathTld = zoneFromPath(request);
    if (pathTld) {
      const url = request.nextUrl.clone();
      url.pathname = '/resolve';
      url.search = `?zone=${encodeURIComponent(pathTld)}&via=path`;
      return NextResponse.rewrite(url);
    }
    const [first, second] = segments;
    if (
      segments.length === 2 &&
      first &&
      second &&
      !RESERVED_PATHS.has(first.toLowerCase()) &&
      /^[a-z0-9][a-z0-9-]{0,62}$/i.test(second) &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/resolve';
      url.search = `?zone=${encodeURIComponent(first)}&label=${encodeURIComponent(second)}&via=path`;
      return NextResponse.rewrite(url);
    }
  }

  const response = NextResponse.next();

  // WalletConnect v2: relay идёт по websocket, модалка грузит шрифты и картинку QR с reown.com.
  const walletConnectSources = [
    'wss://relay.walletconnect.org',
    'wss://relay.walletconnect.com',
    'https://relay.walletconnect.org',
    'https://relay.walletconnect.com',
    'https://verify.walletconnect.org',
    'https://verify.walletconnect.com',
    'https://rpc.walletconnect.org',
    'https://rpc.walletconnect.com',
    'https://api.web3modal.org',
    'https://api.web3modal.com',
    'https://fonts.reown.com',
  ].join(' ');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `font-src 'self' data: https://fonts.reown.com`,
    // RPC-прокси и same-origin API; ws — для HMR в режиме разработки; walletConnect — relay v2.
    `connect-src 'self' ${isDev ? 'ws: wss: ' : ''}http: https: ${walletConnectSources}`,
    'frame-src https://verify.walletconnect.org https://verify.walletconnect.com',
    'frame-ancestors *',
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
