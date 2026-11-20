/**
 * Keep-alive: не даёт бесплатному инстансу PaaS «уснуть» из-за простоя.
 *
 * Render засыпает после ~15 минут без входящих запросов, поэтому раз в 14 минут 30 секунд
 * контейнер сам запрашивает свой ПУБЛИЧНЫЙ адрес — запрос проходит через балансировщик
 * Render и считается входящим трафиком. Пинг на 127.0.0.1 не годится: локальный запрос
 * не выходит наружу и не сбрасывает таймер простоя.
 *
 * Переменные окружения:
 *   KEEP_ALIVE_ENABLED=true          включить (по умолчанию выключено)
 *   KEEP_ALIVE_INTERVAL_SECONDS=870  14 мин 30 с
 *   KEEP_ALIVE_URL=<адрес>           по умолчанию RENDER_EXTERNAL_URL, иначе локальный /api/health
 */
import fs from 'node:fs';
import process from 'node:process';

const enabled = (process.env.KEEP_ALIVE_ENABLED ?? 'false').toLowerCase() === 'true';
const intervalSeconds = Number.parseInt(process.env.KEEP_ALIVE_INTERVAL_SECONDS ?? '870', 10);
const baseUrl = (process.env.KEEP_ALIVE_URL ?? process.env.RENDER_EXTERNAL_URL ?? '').replace(
  /\/+$/,
  '',
);

if (!enabled) {
  console.log('[keep-alive] выключен (KEEP_ALIVE_ENABLED != true)');
  process.exit(0);
}

if (!baseUrl) {
  console.log('[keep-alive] нет публичного адреса — жду KEEP_ALIVE_URL или RENDER_EXTERNAL_URL');
  process.exit(0);
}

const intervalMs = Math.max(60, intervalSeconds) * 1000;
const target = `${baseUrl}/api/health`;
const heartbeatFile = process.env.KEEP_ALIVE_HEARTBEAT_FILE ?? '/tmp/justtld-keep-alive.json';

const heartbeat = {
  enabled: true,
  target,
  intervalSeconds: Math.round(intervalMs / 1000),
  startedAt: new Date().toISOString(),
  lastPingAt: null,
  lastStatus: null,
  lastLatencyMs: null,
  lastError: null,
  pings: 0,
  failures: 0,
};

function writeHeartbeat() {
  try {
    fs.writeFileSync(heartbeatFile, JSON.stringify(heartbeat));
  } catch {
    // файл — только для диагностики через /api/health, его отсутствие не критично
  }
}

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

async function ping() {
  const startedAt = Date.now();
  try {
    const response = await fetch(target, {
      headers: { 'user-agent': 'justtld-keep-alive/1.0' },
      signal: AbortSignal.timeout(90_000),
    });
    const latency = Date.now() - startedAt;
    let summary = `HTTP ${response.status}`;
    if (response.ok) {
      const health = await response.json().catch(() => null);
      if (health?.status) {
        const lag = health?.checks?.indexer?.lag;
        summary += `, status=${health.status}${lag === undefined ? '' : `, lag=${lag}`}`;
      }
    }
    console.log(`[keep-alive ${stamp()}] ${target} → ${summary} за ${latency} мс`);
    heartbeat.lastPingAt = new Date().toISOString();
    heartbeat.lastStatus = response.status;
    heartbeat.lastLatencyMs = latency;
    heartbeat.lastError = null;
    heartbeat.pings += 1;
    if (!response.ok) heartbeat.failures += 1;
    writeHeartbeat();
    return response.ok;
  } catch (error) {
    console.log(`[keep-alive ${stamp()}] ${target} → ошибка: ${error?.message ?? error}`);
    heartbeat.lastPingAt = new Date().toISOString();
    heartbeat.lastStatus = null;
    heartbeat.lastError = String(error?.message ?? error);
    heartbeat.failures += 1;
    writeHeartbeat();
    return false;
  }
}

console.log(
  `[keep-alive] включён: ${target}, интервал ${Math.round(intervalMs / 1000)} с ` +
    `(${(intervalMs / 60000) | 0 ? `${(intervalMs / 60000).toFixed(1)} мин` : 'меньше минуты'})`,
);

writeHeartbeat();

for (;;) {
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
  await ping();
}
