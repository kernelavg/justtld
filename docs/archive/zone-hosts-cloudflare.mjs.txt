#!/usr/bin/env node
/**
 * Включает настоящие двухуровневые имена: `blog.<зона>.justtld.online`.
 *
 * Зачем отдельные зоны Cloudflare на каждую зону JustTLD:
 *   публичные CA не выдают сертификаты на `*.*.example.com`, а универсальный
 *   сертификат Cloudflare/Render покрывает только один уровень. Зато у каждой
 *   отдельной зоны Cloudflare есть свой универсальный сертификат, и для зоны
 *   `femboy.justtld.online` он покрывает `*.femboy.justtld.online` — ровно то, что нужно.
 *
 * Что делает скрипт для одной зоны:
 *   1. создаёт зону Cloudflare `<зона>.justtld.online` (если её ещё нет);
 *   2. прописывает NS-делегирование этой зоны в родительской зоне justtld.online;
 *   3. в дочерней зоне: apex → Render без прокси (сертификат Render покрывает один уровень),
 *      `*` → Render через прокси Cloudflare (сертификат дочерней зоны);
 *   4. правила дочерней зоны: `X-Forwarded-Host = http.host` и Host → justtld.onrender.com,
 *      чтобы Render принял запрос и приложение увидело исходное имя.
 *
 * Запуск:
 *   node scripts/setup-zone-hosts.mjs justtld-demo
 *   node scripts/setup-zone-hosts.mjs --all
 *   node scripts/setup-zone-hosts.mjs justtld-demo --dry-run
 *
 * Требуется токен Cloudflare с правами: Zone:Read+Edit (все зоны), Zone:Create,
 * Zone Settings/Rulesets:Edit, DNS:Edit. Токен только для DNS текущей зоны не подойдёт.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Мини-загрузчик .env/.env.secrets: скрипт запускается обычным node,
 * поэтому не тянем TS-пакеты (@justtld/shared) — только то, что реально нужно.
 */
function loadEnv() {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  for (const name of ['.env', '.env.secrets']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!key || rawValue === undefined) continue;
      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value === '') continue;
      if (process.env[key] === undefined || name === '.env.secrets') process.env[key] = value;
    }
  }
}

loadEnv();

const API = 'https://api.cloudflare.com/client/v4';
const PARENT_DOMAIN = (process.env.RESOLVER_DOMAIN ?? 'justtld.online').trim().toLowerCase();
const ORIGIN = (process.env.RENDER_ORIGIN ?? 'justtld.onrender.com').trim().toLowerCase();
const TOKEN = (process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN ?? '').trim();
const DRY_RUN = process.argv.includes('--dry-run');
const DRY_ZONE_ID = 'dry-run';
const ALL = process.argv.includes('--all');

function log(message) {
  console.log(`[zone-hosts ${new Date().toISOString().slice(11, 19)}] ${message}`);
}

async function cf(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!payload.success) {
    const details = JSON.stringify(payload.errors ?? payload).slice(0, 300);
    throw new Error(`Cloudflare ${init.method ?? 'GET'} ${path} → ${response.status}: ${details}`);
  }
  return payload.result;
}

async function findZone(name) {
  const zones = await cf(`/zones?name=${encodeURIComponent(name)}&per_page=1`);
  return (zones ?? [])[0] ?? null;
}

async function ensureZone(name, accountId) {
  const existing = await findZone(name);
  if (existing) return existing;
  if (DRY_RUN) {
    log(`(dry-run) создал бы зону ${name}`);
    return {
      id: DRY_ZONE_ID,
      name,
      name_servers: ['ns1.example', 'ns2.example'],
      status: 'pending',
    };
  }
  log(`создаю зону ${name}`);
  const zone = await cf('/zones', {
    method: 'POST',
    body: JSON.stringify({ name, account: { id: accountId }, type: 'full' }),
  });
  log(`зона ${name}: ${zone.id} (${zone.status}), NS ${(zone.name_servers ?? []).join(', ')}`);
  return zone;
}

async function upsertRecord(zoneId, record) {
  const query = `/zones/${zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`;
  const existing = (await cf(query)) ?? [];
  const same = existing.find((item) => item.content === record.content);
  if (same) return same;
  const stale = existing.filter((item) => item.content !== record.content);
  for (const item of stale) {
    if (DRY_RUN) {
      log(`(dry-run) удалил бы ${item.type} ${item.name} → ${item.content}`);
      continue;
    }
    await cf(`/zones/${zoneId}/dns_records/${item.id}`, { method: 'DELETE' });
    log(`удалена устаревшая запись ${item.type} ${item.name} → ${item.content}`);
  }
  if (DRY_RUN) {
    log(
      `(dry-run) создал бы ${record.type} ${record.name} → ${record.content} (proxied ${record.proxied})`,
    );
    return { id: 'dry-run' };
  }
  const created = await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({ ttl: 1, ...record }),
  });
  log(`запись ${record.type} ${record.name} → ${record.content} (proxied ${record.proxied})`);
  return created;
}

/** Правило трансформации запроса: сохранить исходный хост в X-Forwarded-Host. */
async function ensureForwardedHostRule(zoneId) {
  const phase = 'http_request_transform';
  const existing = await cf(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`).catch(
    () => null,
  );
  const rules = (existing?.rules ?? []).filter((rule) =>
    rule.action_parameters?.headers?.['x-forwarded-host'] === undefined ? true : false,
  );
  const rule = {
    action: 'rewrite',
    action_parameters: { headers: { 'x-forwarded-host': { expression: 'http.host' } } },
    expression: 'true',
    description: 'JustTLD: исходный хост в X-Forwarded-Host',
    enabled: true,
  };
  if (DRY_RUN) {
    log('(dry-run) создал бы правило X-Forwarded-Host');
    return;
  }
  await cf(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [...rules, rule] }),
  });
  log('правило X-Forwarded-Host установлено');
}

/** Правило origin: Render принимает запрос только на свой адрес. */
async function ensureOriginHostRule(zoneId) {
  const phase = 'http_request_origin';
  const existing = await cf(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`).catch(
    () => null,
  );
  const rules = (existing?.rules ?? []).filter(
    (rule) => rule.action_parameters?.host_header !== ORIGIN,
  );
  const rule = {
    action: 'route',
    action_parameters: { host_header: ORIGIN },
    expression: 'true',
    description: 'JustTLD: Host на адрес Render',
    enabled: true,
  };
  if (DRY_RUN) {
    log('(dry-run) создал бы правило Host → ' + ORIGIN);
    return;
  }
  await cf(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [...rules, rule] }),
  });
  log(`правило Host → ${ORIGIN} установлено`);
}

async function setupZone(rawZone) {
  const zoneName = rawZone.startsWith('.') ? rawZone.slice(1) : rawZone;
  const childName = `${zoneName}.${PARENT_DOMAIN}`;

  const parent = await findZone(PARENT_DOMAIN);
  if (!parent)
    throw new Error(`Не нашёл родительскую зону ${PARENT_DOMAIN} (нужны права Zone:Read)`);
  const accountId = parent.account?.id;
  if (!accountId) throw new Error('Не удалось определить account id родительской зоны');

  log(`── ${childName} ──`);
  const child = await ensureZone(childName, accountId);

  // Делегирование: NS дочерней зоны прописываем в родительской.
  for (const ns of child.name_servers ?? []) {
    await upsertRecord(parent.id, { type: 'NS', name: child.name, content: ns, proxied: false });
  }

  // В дочерней зоне: apex напрямую в Render (его сертификат покрывает один уровень),
  // wildcard — через прокси Cloudflare (сертификат дочерней зоны покрывает два уровня).
  if (child.id === DRY_ZONE_ID) {
    log(`(dry-run) создал бы CNAME ${childName} → ${ORIGIN} (без прокси)`);
    log(`(dry-run) создал бы CNAME *.${childName} → ${ORIGIN} (через прокси Cloudflare)`);
    log(`(dry-run) создал бы правила X-Forwarded-Host и Host → ${ORIGIN}`);
    return child;
  }

  await upsertRecord(child.id, { type: 'CNAME', name: childName, content: ORIGIN, proxied: false });
  await upsertRecord(child.id, {
    type: 'CNAME',
    name: `*.${childName}`,
    content: ORIGIN,
    proxied: true,
  });

  await ensureForwardedHostRule(child.id);
  await ensureOriginHostRule(child.id);

  log(`готово: поддомены открываются как <метка>.${childName} (сертификат дочерней зоны)`);
  return child;
}

/** Список зон берём из нашего же API: там кэш индексера со всеми зарегистрированными зонами. */
async function zonesFromRegistry() {
  const appUrl = (process.env.APP_URL ?? 'https://justtld.online').replace(/\/+$/, '');
  const response = await fetch(`${appUrl}/api/zones?limit=200`);
  if (!response.ok) throw new Error(`не удалось получить список зон: HTTP ${response.status}`);
  const payload = await response.json();
  const items = payload.items ?? payload.zones ?? [];
  return items.map((item) => item.tld ?? item);
}

async function main() {
  if (!TOKEN) {
    throw new Error('Нет CLOUDFLARE_API_TOKEN (или CF_API_TOKEN) в .env.secrets');
  }
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  let zones = args;
  if (ALL && zones.length === 0) zones = await zonesFromRegistry();
  if (zones.length === 0) {
    throw new Error('Укажите зону: node scripts/setup-zone-hosts.mjs justtld-demo (или --all)');
  }
  if (DRY_RUN) log('режим dry-run: ничего не меняется');
  for (const zone of zones) {
    try {
      await setupZone(zone);
    } catch (error) {
      console.error(`✖ ${zone}: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error('✖', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
