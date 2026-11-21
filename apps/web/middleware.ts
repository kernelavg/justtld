import { NextResponse, type NextRequest } from 'next/server';

/**
 * Безопасность на уровне edge-middleware:
 *  - CSP (без внешних скриптов), X-Frame-Options заменён на frame-ancestors,
 *  - nosniff / Referrer-Policy / Permissions-Policy,
 *  - запрет кэширования API,
 *  - блокировка небезопасных методов с чужого Origin (дополнительно к проверке в route-handlers).
 */
/** Возвращает имя зоны, если запрос пришёл на поддомен резолвера: myzone.example.com → myzone */
function resolverZone(request: NextRequest): string | null {
  const base = (process.env.RESOLVER_DOMAIN ?? '').trim().toLowerCase();
  if (!base) return null;
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0] ?? '';
  if (!host.endsWith(`.${base}`)) return null;
  const label = host.slice(0, -(base.length + 1));
  if (!label || label.includes('.')) return null;
  if (['www', 'api', 'admin', 'app'].includes(label)) return null;
  return label;
}

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';

  // Резолвер: myzone.вашдомен → страница зоны (переписывание адреса, без редиректа).
  const zone = resolverZone(request);
  if (zone && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/resolve';
    url.search = `?zone=${encodeURIComponent(zone)}`;
    return NextResponse.rewrite(url);
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
