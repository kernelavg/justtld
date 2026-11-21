// @vitest-environment node
/**
 * Маршрутизация резолвера в middleware — самая хрупкая часть: одна ошибка в разборе
 * хоста, и весь сайт открывается как «зона». Проверяем все включённые формы имени,
 * защиту от подделки X-Forwarded-Host и то, что служебные пути не перехватываются.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

const DOMAIN = 'justtld.online';

process.env.RESOLVER_DOMAIN = DOMAIN;

const { middleware } = await import('@/middleware');

function run(host: string, path = '/', headers: Record<string, string> = {}) {
  const request = new NextRequest(`https://${host}${path}`, {
    headers: { host, ...headers },
  });
  return middleware(request);
}

/** Куда middleware переписал запрос (null — значит не перехватил). */
function rewriteOf(response: Awaited<ReturnType<typeof run>>): URL | null {
  const target = response.headers.get('x-middleware-rewrite');
  return target ? new URL(target) : null;
}

function queryOf(response: Awaited<ReturnType<typeof run>>): Record<string, string> {
  const url = rewriteOf(response);
  if (!url) return {};
  return Object.fromEntries(url.searchParams.entries());
}

describe('резолвер: формы имени', () => {
  beforeEach(() => {
    process.env.RESOLVER_DOMAIN = DOMAIN;
  });

  it('зона по поддомену: justtld-demo.justtld.online', async () => {
    const response = await run('justtld-demo.justtld.online');
    expect(rewriteOf(response)?.pathname).toBe('/resolve');
    expect(queryOf(response)).toEqual({ zone: 'justtld-demo' });
  });

  it('плоский поддомен: blog--justtld-demo.justtld.online', async () => {
    const response = await run('blog--justtld-demo.justtld.online');
    expect(queryOf(response)).toEqual({ zone: 'justtld-demo', label: 'blog' });
  });

  it('поддомен путём на хосте зоны: justtld-demo.justtld.online/blog', async () => {
    const response = await run('justtld-demo.justtld.online', '/blog');
    expect(queryOf(response)).toEqual({ zone: 'justtld-demo', label: 'blog', via: 'path' });
  });

  it('двухуровневый хост через X-Forwarded-Host (запрос пришёл на адрес Render)', async () => {
    const response = await run('justtld.onrender.com', '/', {
      'x-forwarded-host': 'blog.justtld-demo.justtld.online',
    });
    expect(queryOf(response)).toEqual({ zone: 'justtld-demo', label: 'blog' });
  });

  it('игнорирует X-Forwarded-Host с чужого домена', async () => {
    const response = await run('justtld.onrender.com', '/', {
      'x-forwarded-host': 'blog.evil.example',
    });
    expect(rewriteOf(response)).toBeNull();
  });

  it('не путает зону с меткой: дефис в имени не делит имя', async () => {
    const response = await run('my-zone.justtld.online');
    expect(queryOf(response)).toEqual({ zone: 'my-zone' });
  });

  it('служебные хосты не перехватываются', async () => {
    for (const host of [`www.${DOMAIN}`, `api.${DOMAIN}`, `admin.${DOMAIN}`, `app.${DOMAIN}`]) {
      expect(rewriteOf(await run(host))).toBeNull();
    }
  });

  it('сам домен и чужие хосты свободны', async () => {
    expect(rewriteOf(await run(DOMAIN))).toBeNull();
    expect(rewriteOf(await run('justtld.onrender.com'))).toBeNull();
    expect(rewriteOf(await run('example.com'))).toBeNull();
  });

  it('служебные пути на хосте зоны отдают сайт, а не резолвер', async () => {
    for (const path of [
      '/zones',
      '/subdomains',
      '/docs',
      '/explorer',
      '/dashboard',
      '/api/health',
      '/zone',
    ]) {
      expect(rewriteOf(await run('justtld-demo.justtld.online', path))).toBeNull();
    }
    expect(rewriteOf(await run(DOMAIN, '/subdomains'))).toBeNull();
  });

  it('не перехватывает метку с недопустимыми символами', async () => {
    expect(rewriteOf(await run('justtld-demo.justtld.online', '/bad!label'))).toBeNull();
    expect(rewriteOf(await run('justtld.online', '/justtld-demo/blog/post'))).toBeNull();
  });

  it('без RESOLVER_DOMAIN резолвер выключен', async () => {
    process.env.RESOLVER_DOMAIN = '';
    expect(rewriteOf(await run('justtld-demo.justtld.online'))).toBeNull();
    expect(rewriteOf(await run('blog--justtld-demo.justtld.online'))).toBeNull();
  });

  it('кодирует имя зоны в запросе', async () => {
    const response = await run('my--weird.justtld.online');
    expect(queryOf(response).zone).toBe('weird');
    expect(queryOf(response).label).toBe('my');
  });
});

describe('резолвер: формы пути без своего домена', () => {
  it('/justtld-demo → зона', async () => {
    const response = await run(DOMAIN, '/justtld-demo');
    expect(rewriteOf(response)?.pathname).toBe('/resolve');
    expect(queryOf(response)).toEqual({ zone: 'justtld-demo', via: 'path' });
  });

  it('/justtld-demo/blog → поддомен', async () => {
    const response = await run(DOMAIN, '/justtld-demo/blog');
    expect(queryOf(response)).toEqual({ zone: 'justtld-demo', label: 'blog', via: 'path' });
  });
});

describe('middleware: заголовки безопасности', () => {
  it('ставит CSP и запрет кэширования для API', async () => {
    const api = await run(DOMAIN, '/api/health');
    expect(api.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(api.headers.get('cache-control')).toBe('no-store');
    expect(api.headers.get('x-content-type-options')).toBe('nosniff');

    const page = await run(DOMAIN, '/zones');
    expect(page.headers.get('cache-control')).toBeNull();
  });

  it('не перехватывает POST на путь зоны', async () => {
    const request = new NextRequest(`https://${DOMAIN}/justtld-demo`, {
      method: 'POST',
      headers: { host: DOMAIN },
    });
    expect(rewriteOf(await middleware(request))).toBeNull();
  });
});
