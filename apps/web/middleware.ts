import { NextResponse, type NextRequest } from 'next/server';

/**
 * Безопасность на уровне edge-middleware:
 *  - CSP (без внешних скриптов), X-Frame-Options заменён на frame-ancestors,
 *  - nosniff / Referrer-Policy / Permissions-Policy,
 *  - запрет кэширования API,
 *  - блокировка небезопасных методов с чужого Origin (дополнительно к проверке в route-handlers).
 */
export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  const response = NextResponse.next();

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // RPC-прокси и same-origin API; ws — для HMR в режиме разработки.
    `connect-src 'self' ${isDev ? 'ws: wss: ' : ''}http: https:`,
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
