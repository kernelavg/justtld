/**
 * Проверка резолвера имён: поддомен → зона.
 *
 * Middleware смотрит на заголовок Host и, если это `<зона>.<RESOLVER_DOMAIN>`, отдаёт
 * страницу зоны. Скрипт подставляет Host вручную, поэтому работает и на localhost.
 *
 *   PORT=3300 RESOLVER_DOMAIN=localtest.dev DATABASE_URL=<любая база с зонами> npm start
 *   node scripts/test-resolver.mjs [http://127.0.0.1:3300] [localtest.dev]
 */
import http from 'node:http';
import https from 'node:https';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3300';
const DOMAIN = process.argv[3] ?? 'localtest.dev';
const baseUrl = new URL(BASE);
// Если проверяем настоящий домен (DNS настроен), идём прямо по адресам поддоменов.
// Локально DNS нет — тогда тот же сервер вызывается с подменённым заголовком Host.
const viaDns = baseUrl.hostname === DOMAIN || baseUrl.hostname.endsWith(`.${DOMAIN}`);

let failures = 0;

/**
 * fetch() в Node запрещает подменять заголовок Host, поэтому идём через http.request —
 * он позволяет выставить любой host, как будто запрос пришёл на другой домен.
 */
function fetchHost(host, path = '/') {
  if (viaDns) {
    return fetch(`${baseUrl.protocol}//${host}${path}`, { redirect: 'manual' }).then(
      async (response) => ({
        status: response.status,
        location: response.headers.get('location') ?? undefined,
        body: await response.text(),
      }),
    );
  }
  const url = baseUrl;
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        host: url.hostname,
        port: url.port,
        path,
        method: 'GET',
        headers: { host, accept: 'text/html' },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            location: response.headers.location,
            body,
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

function check(label, condition, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

// 1. Базовая страница сайта на основном домене работает как обычно.
const root = await fetchHost(DOMAIN);
check(`главная на ${DOMAIN}`, root.status === 200 && !root.body.includes('JustTLD resolver'));

// 2. Существующая зона показывает карточку с владельцем.
const zone = await fetchHost(`myzone.${DOMAIN}`);
check(
  `зона myzone.${DOMAIN}`,
  zone.status === 200 && zone.body.includes('JustTLD resolver') && zone.body.includes('.myzone'),
);

// 3. Свободное имя предлагает регистрацию.
const free = await fetchHost(`free-${Date.now().toString(36)}.${DOMAIN}`);
check(
  `свободное имя на ${DOMAIN}`,
  free.status === 200 && (free.body.includes('Зона свободна') || free.body.includes('Свободна')),
);

// 4. Служебные поддомены не перехватываются резолвером.
for (const label of ['www', 'api', 'admin']) {
  const service = await fetchHost(`${label}.${DOMAIN}`);
  check(
    `служебный ${label}.${DOMAIN} не резолвится как зона`,
    !service.body.includes('JustTLD resolver'),
  );
}

// 5. Зона с адресом сайта в метаданных уводит редиректом.
const redirectZone = await fetchHost(`justtld-demo.${DOMAIN}`);
check(
  'зона с url в метаданных отдаёт редирект',
  redirectZone.status >= 300 && redirectZone.status < 400 && Boolean(redirectZone.location),
  `HTTP ${redirectZone.status} → ${redirectZone.location ?? '—'}`,
);

console.log(failures === 0 ? '\nРезолвер работает.' : `\nПровалено проверок: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
