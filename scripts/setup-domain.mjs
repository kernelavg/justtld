/**
 * Автоматическая настройка домена для резолвера: Cloudflare DNS + Render.
 *
 * Что делает:
 *  1. создаёт в Cloudflare четыре записи (корень, wildcard, ACME-челлендж, валидация Cloudflare);
 *  2. добавляет в Render оба домена — `домен` и `*.домен`;
 *  3. прописывает сервису переменные RESOLVER_DOMAIN и NEXT_PUBLIC_APP_URL;
 *  4. запускает деплой (NEXT_PUBLIC_APP_URL вшивается в бандл при сборке);
 *  5. проверяет, что wildcard реально резолвится.
 *
 * Запуск (токены — только в переменных окружения, не в командной строке):
 *   CF_API_TOKEN=... RENDER_API_KEY=... DOMAIN=justtld.online npm run setup:domain
 *
 * Флаги:
 *   --dry-run   показать план, ничего не меняя
 *   --dns-only  только Cloudflare (без Render)
 *   --render-only  только Render (DNS уже настроен)
 */
import dns from 'node:dns/promises';

const DOMAIN = (process.env.DOMAIN ?? '').trim().toLowerCase();
const CF_TOKEN = (process.env.CF_API_TOKEN ?? '').trim();
const RENDER_KEY = (process.env.RENDER_API_KEY ?? '').trim();
const SERVICE_ID = (process.env.RENDER_SERVICE_ID ?? '').trim();
const RENDER_TARGET = (
  process.env.RENDER_HOST ?? `${SERVICE_ID ? 'justtld' : 'justtld'}.onrender.com`
).trim();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dnsOnly = args.includes('--dns-only');
const renderOnly = args.includes('--render-only');

if (!DOMAIN) {
  console.error('Укажите DOMAIN=ваш.домен');
  process.exit(1);
}

const log = (...parts) => console.log(...parts);

async function cf(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const detail = JSON.stringify(body.errors ?? body).slice(0, 400);
    throw new Error(
      `Cloudflare ${init.method ?? 'GET'} ${path} → HTTP ${response.status}: ${detail}`,
    );
  }
  return body.result;
}

async function renderApi(path, init = {}) {
  const response = await fetch(`https://api.render.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${RENDER_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `Render ${init.method ?? 'GET'} ${path} → HTTP ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  return body;
}

/** Записи, которые требует Render для wildcard-домена. */
function requiredRecords(serviceSubdomain) {
  return [
    { name: '@', type: 'CNAME', content: RENDER_TARGET, comment: 'корень домена → Render' },
    { name: '*', type: 'CNAME', content: RENDER_TARGET, comment: 'все зоны: myzone.домен' },
    {
      name: '_acme-challenge',
      type: 'CNAME',
      content: `${serviceSubdomain}.verify.renderdns.com`,
      comment: 'выпуск wildcard-сертификата',
    },
    {
      name: '_cf-custom-hostname',
      type: 'CNAME',
      content: `${serviceSubdomain}.hostname.renderdns.com`,
      comment: 'подтверждение владения для Cloudflare',
    },
  ];
}

async function setupDns() {
  log(`\n── Cloudflare: ${DOMAIN} ──`);
  if (!CF_TOKEN) {
    for (const record of requiredRecords('justtld')) {
      const fqdn = record.name === '@' ? DOMAIN : `${record.name}.${DOMAIN}`;
      log(`  + ${record.type} ${fqdn} → ${record.content} (${record.comment})`);
    }
    return null;
  }
  const zones = await cf(`/zones?name=${encodeURIComponent(DOMAIN)}`);
  const zone = zones?.[0];
  if (!zone) throw new Error(`зона ${DOMAIN} не найдена в Cloudflare — сначала добавьте сайт`);
  log(`зона найдена: ${zone.id} (${zone.status})`);

  const existing = await cf(`/zones/${zone.id}/dns_records?per_page=100`);
  const byName = new Map(existing.map((record) => [`${record.name}|${record.type}`, record]));

  for (const record of requiredRecords('justtld')) {
    const fqdn = record.name === '@' ? DOMAIN : `${record.name}.${DOMAIN}`;
    const key = `${fqdn}|${record.type}`;
    if (byName.has(key)) {
      log(`  = ${record.type} ${fqdn} уже есть`);
      continue;
    }
    if (dryRun) {
      log(`  + ${record.type} ${fqdn} → ${record.content} (${record.comment})`);
      continue;
    }
    await cf(`/zones/${zone.id}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: record.type,
        name: fqdn,
        content: record.content,
        proxied: false,
        ttl: 300,
        comment: 'JustTLD resolver',
      }),
    });
    log(`  + ${record.type} ${fqdn} → ${record.content}`);
  }
  return zone.id;
}

async function setupRender() {
  log(`\n── Render: сервис ${SERVICE_ID} ──`);
  if (!SERVICE_ID) throw new Error('Укажите RENDER_SERVICE_ID=srv-… (Render → Settings → ID)');
  for (const name of [DOMAIN, `*.${DOMAIN}`]) {
    if (dryRun) {
      log(`  + custom domain ${name}`);
      continue;
    }
    try {
      await renderApi(`/services/${SERVICE_ID}/custom-domains`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      log(`  + custom domain ${name}`);
    } catch (error) {
      if (/HTTP 409/.test(String(error))) log(`  = custom domain ${name} уже добавлен`);
      else throw error;
    }
  }

  const envVars = [
    { key: 'RESOLVER_DOMAIN', value: DOMAIN },
    { key: 'NEXT_PUBLIC_APP_URL', value: `https://${DOMAIN}` },
  ];
  for (const { key, value } of envVars) {
    if (dryRun) {
      log(`  + env ${key}=${value}`);
      continue;
    }
    await renderApi(`/services/${SERVICE_ID}/env-vars/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
    log(`  + env ${key}=${value}`);
  }

  if (dryRun) {
    log('  + деплой (пропущен в dry-run)');
    return;
  }
  const deploy = await renderApi(`/services/${SERVICE_ID}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  log(`  + деплой запущен: ${deploy?.id ?? '(без id)'} — сборка идёт 3–7 минут`);
}

async function verify() {
  log('\n── Проверка DNS ──');
  const probe = `probe-${Date.now().toString(36)}.${DOMAIN}`;
  try {
    const addresses = await dns.resolveCname(probe).catch(() => dns.resolve(probe));
    log(`  ✅ wildcard работает: ${probe} → ${JSON.stringify(addresses)}`);
  } catch (error) {
    log(`  ⏳ пока не резолвится (${error.code ?? error.message}) — DNS расходится до 30 минут`);
  }
  for (const name of [DOMAIN, `_acme-challenge.${DOMAIN}`, `_cf-custom-hostname.${DOMAIN}`]) {
    try {
      const value = await dns.resolveCname(name);
      log(`  ✅ ${name} → ${value.join(', ')}`);
    } catch (error) {
      log(`  ⏳ ${name}: ${error.code ?? error.message}`);
    }
  }
  log(
    `\nКогда DNS разойдётся: Render → Settings → Custom Domains → Verify у ${DOMAIN} и *.${DOMAIN}`,
  );
  log(`Затем: npm run test:resolver -- https://${DOMAIN} ${DOMAIN}`);
}

try {
  if (!renderOnly) {
    if (!CF_TOKEN && !dryRun)
      throw new Error('Нужен CF_API_TOKEN (Cloudflare → My Profile → API Tokens)');
    if (CF_TOKEN || dryRun) await setupDns();
  }
  if (!dnsOnly) {
    if (!RENDER_KEY && !dryRun)
      throw new Error('Нужен RENDER_API_KEY (Render → Account Settings → API Keys)');
    if (RENDER_KEY || dryRun) await setupRender();
  }
  if (!dryRun) await verify();
} catch (error) {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
}
