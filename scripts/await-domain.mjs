/**
 * Часовой домена: ждёт, пока NS домена переедут на Cloudflare, и дальше всё делает сам.
 *
 *   CF_API_TOKEN=... RENDER_API_KEY=... DOMAIN=justtld.online RENDER_SERVICE_ID=srv-... \
 *   node scripts/await-domain.mjs
 *
 * Шаги после переключения NS:
 *  1. ждёт, пока зона Cloudflare станет active;
 *  2. проверяет четыре записи;
 *  3. ставит в Render NEXT_PUBLIC_APP_URL и запускает сборку;
 *  4. ждёт деплой и статусы custom domains;
 *  5. прогоняет живые проверки резолвера (домен, зона, свободное имя, редирект).
 *
 * Опции: --once (одна проверка без ожидания), --skip-render (только DNS и HTTP).
 */
import dns from 'node:dns/promises';

const DOMAIN = (process.env.DOMAIN ?? '').trim().toLowerCase();
const CF_TOKEN = (process.env.CF_API_TOKEN ?? '').trim();
const RENDER_KEY = (process.env.RENDER_API_KEY ?? '').trim();
const SERVICE_ID = (process.env.RENDER_SERVICE_ID ?? '').trim();
const args = process.argv.slice(2);
const once = args.includes('--once');
const skipRender = args.includes('--skip-render');
const POLL_MS = 60_000;
const MAX_POLLS = 180; // ~3 часа

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

async function nameservers(domain) {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
    { headers: { accept: 'application/dns-json' } },
  );
  const body = await response.json().catch(() => ({}));
  return (body.Answer ?? []).map((answer) => String(answer.data).replace(/\.$/, ''));
}

async function cf(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
  });
  return response.json();
}

async function renderApi(path, init = {}) {
  const response = await fetch(`https://api.render.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${RENDER_KEY}`, 'Content-Type': 'application/json' },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function http(url, options = {}) {
  try {
    const response = await fetch(url, { redirect: 'manual', ...options });
    const text = await response.text();
    return { status: response.status, location: response.headers.get('location'), text };
  } catch (error) {
    return { status: 0, location: null, text: String(error) };
  }
}

async function main() {
  log(`слежу за ${DOMAIN}; жду NS Cloudflare`);
  for (let attempt = 1; attempt <= (once ? 1 : MAX_POLLS); attempt += 1) {
    const ns = await nameservers(DOMAIN);
    const onCloudflare = ns.some((server) => server.includes('cloudflare'));
    log(`попытка ${attempt}: NS = ${ns.length ? ns.join(', ') : 'нет ответа'}`);
    if (onCloudflare) {
      log('NS переехали на Cloudflare — начинаю настройку');
      break;
    }
    if (attempt === (once ? 1 : MAX_POLLS)) {
      log('NS так и не переключились; выходим');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  // Зона должна стать active — сертификат и записи имеют смысл только тогда.
  let zoneId = null;
  if (CF_TOKEN) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const zones = await cf(`/zones?name=${encodeURIComponent(DOMAIN)}`);
      const zone = zones?.result?.[0];
      zoneId = zone?.id ?? null;
      log(`зона: ${zone?.status ?? 'не найдена'} (${zone?.name ?? '—'})`);
      if (zone?.status === 'active') break;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    if (zoneId) {
      const records = await cf(`/zones/${zoneId}/dns_records?per_page=100`);
      for (const record of records?.result ?? []) {
        log(`запись: ${record.type} ${record.name} → ${record.content}`);
      }
    }
  } else {
    log('CF_API_TOKEN не задан — пропускаю проверку зоны');
  }

  if (!skipRender && RENDER_KEY && SERVICE_ID) {
    const env = await renderApi(`/services/${SERVICE_ID}/env-vars/NEXT_PUBLIC_APP_URL`, {
      method: 'PUT',
      body: JSON.stringify({ value: `https://${DOMAIN}` }),
    });
    log(`NEXT_PUBLIC_APP_URL: ${env.status === 200 ? 'обновлён' : `ошибка ${env.status}`}`);

    const deploy = await renderApi(`/services/${SERVICE_ID}/deploys`, {
      method: 'POST',
      body: JSON.stringify({ clearCache: 'do_not_clear' }),
    });
    const deployId = deploy.body?.id ?? null;
    log(`деплой запущен: ${deployId ?? `ошибка ${deploy.status}`}`);

    if (deployId) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        const status = await renderApi(`/services/${SERVICE_ID}/deploys/${deployId}`);
        log(`деплой: ${status.body?.status ?? '?'}`);
        if (['live', 'build_failed', 'canceled'].includes(status.body?.status)) break;
      }
    }

    const domains = await renderApi(`/services/${SERVICE_ID}/custom-domains`);
    for (const item of Array.isArray(domains.body) ? domains.body : []) {
      const cd = item.customDomain ?? item;
      log(`домен в Render: ${cd.name} — ${cd.verificationStatus}`);
    }
  }

  log('── живые проверки ──');
  const checks = [
    ['главная', `https://${DOMAIN}/`, (result) => result.status === 200],
    ['резолвер: зона', `https://myzone.${DOMAIN}/`, (result) => result.text.includes('.myzone')],
    [
      'резолвер: свободное имя',
      `https://freename.${DOMAIN}/`,
      (result) => result.text.includes('Зона свободна'),
    ],
    [
      'резолвер: редирект из метаданных',
      `https://justtld-demo.${DOMAIN}/`,
      (result) => result.status >= 300 && result.status < 400,
    ],
  ];
  for (const [label, url, predicate] of checks) {
    const result = await http(url);
    const ok = predicate(result);
    console.log(
      `${ok ? '✅' : '❌'} ${label}: ${url} → HTTP ${result.status}${result.location ? ` → ${result.location}` : ''}`,
    );
  }
}

dns.setServers(['1.1.1.1', '8.8.8.8']);
main().catch((error) => {
  console.error(`ошибка: ${error.message}`);
  process.exit(1);
});
