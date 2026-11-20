#!/usr/bin/env node
/**
 * JustTLD — единая команда запуска всей системы.
 *
 * Поднимает (в правильном порядке):
 *   1. PostgreSQL (локальный кластер в ./data/pgdata)
 *   2. локальную EVM-сеть Hardhat (:8545)
 *   3. деплой JustTLDRegistry
 *   4. миграции базы
 *   5. indexer (события → PostgreSQL)
 *   6. Next.js (:3000)
 *
 * Уже запущенные сервисы повторно не стартуют — скрипт идемпотентен.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGS = path.join(ROOT, 'logs');
const PIDS = path.join(ROOT, 'data/pids');
const CHAIN_PORT = 8545;
const WEB_PORT = Number(process.env.PORT ?? 3000);

const colors = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m',
};

function log(message) {
  console.log(`${colors.cyan}[justtld]${colors.reset} ${message}`);
}

function warn(message) {
  console.log(`${colors.yellow}[justtld]${colors.reset} ${message}`);
}

function fail(message) {
  console.error(`${colors.red}[justtld]${colors.reset} ${message}`);
  process.exit(1);
}

function ensureDirs() {
  for (const directory of [LOGS, PIDS, path.join(ROOT, 'data')]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function ensureEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(path.join(ROOT, '.env.example'), envPath);
    log('создан .env из .env.example');
  }
  const content = fs.readFileSync(envPath, 'utf8');
  if (/^SESSION_SECRET=.{0,31}$/m.test(content) || !/^SESSION_SECRET=/m.test(content)) {
    const secret = crypto.randomBytes(32).toString('hex');
    const next = /^SESSION_SECRET=/m.test(content)
      ? content.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`)
      : `${content}\nSESSION_SECRET=${secret}\n`;
    fs.writeFileSync(envPath, next);
    log('сгенерирован новый SESSION_SECRET');
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = (rawValue ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function portOpen(port, host = '127.0.0.1', timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForPort(port, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  fail(`${label} не поднялся на порту ${port} за ${Math.round(timeoutMs / 1000)}с`);
  return false;
}

const children = [];

function spawnService(name, command, args, options = {}) {
  const logFile = path.join(LOGS, `${name}.log`);
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  out.write(`\n──── ${new Date().toISOString()} · ${name} ────\n`);

  const child = spawn(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    // detached: true → дочерний процесс становится лидером группы,
    // поэтому при остановке можно погасить всё дерево (npm → sh → tsx/next) одной командой.
    detached: true,
  });

  const prefix = `${colors.dim}[${name}]${colors.reset} `;
  const pipe = (stream, target) => {
    stream.on('data', (chunk) => {
      const text = chunk.toString();
      out.write(text);
      for (const line of text.split('\n')) {
        if (line.trim()) target.write(`${prefix}${line}\n`);
      }
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on('exit', (code) => {
    out.end();
    if (code !== 0 && code !== null)
      warn(`${name} завершился с кодом ${code} (см. logs/${name}.log)`);
    // Если сервисы остановлены извне (`npm run stop:all`), супервизор тоже выходит.
    const index = children.findIndex((entry) => entry.child === child);
    if (index >= 0) children.splice(index, 1);
    fs.rmSync(path.join(PIDS, `${name}.pid`), { force: true });
    if (children.length === 0) {
      log('все сервисы остановлены — выходим');
      setTimeout(() => process.exit(0), 300);
    }
  });

  fs.writeFileSync(path.join(PIDS, `${name}.pid`), String(child.pid));
  children.push({ name, child });
  return child;
}

function runOnce(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: 'inherit',
  });
  if (result.status !== 0) fail(`${name} завершился с кодом ${result.status}`);
}

async function main() {
  ensureDirs();
  const env = ensureEnv();

  console.log('');
  console.log(
    `${colors.magenta}JustTLD${colors.reset} — создай свою зону. Владей своим пространством.`,
  );
  console.log(`${colors.dim}${'═'.repeat(72)}${colors.reset}`);

  // 1. PostgreSQL
  if (await portOpen(Number(env.PGPORT ?? 5432))) {
    log(`PostgreSQL уже слушает порт ${env.PGPORT ?? 5432}`);
  } else {
    log('запуск PostgreSQL…');
    runOnce('postgres', 'bash', ['scripts/setup-db.sh']);
  }

  const targetChainId = Number(env.CHAIN_ID ?? 31337);
  const isLocalChain = targetChainId === 31337;
  const networkName =
    env.DEPLOYMENT_NETWORK ?? (isLocalChain ? 'localhost' : String(targetChainId));

  // 2. Локальная EVM-сеть (для публичной сети не нужна)
  if (!isLocalChain) {
    log(`сеть: ${networkName} (chainId ${targetChainId}) — локальный узел не требуется`);
  } else if (await portOpen(CHAIN_PORT)) {
    log(`EVM-сеть уже слушает порт ${CHAIN_PORT}`);
  } else {
    log('запуск локальной EVM-сети (hardhat node)…');
    spawnService('chain', 'npm', ['run', 'chain'], { env });
    await waitForPort(CHAIN_PORT, 'EVM-сеть', 90_000);
  }

  // 3. Деплой контракта (идемпотентен: переиспользует существующий адрес)
  if (isLocalChain) {
    log('деплой контракта JustTLDRegistry…');
    runOnce('deploy', 'npm', ['run', 'deploy'], { env });
  } else {
    const deploymentFile = path.join(ROOT, 'deployments', `${networkName}.json`);
    if (!fs.existsSync(deploymentFile)) {
      fail(
        `нет ${path.relative(ROOT, deploymentFile)} — сначала выполните npm run deploy:${networkName}`,
      );
    }
    log(
      `контракт: ${JSON.parse(fs.readFileSync(deploymentFile, 'utf8')).address} (${networkName})`,
    );
  }

  // 4. Миграции БД
  log('миграции базы данных…');
  runOnce('migrate', 'npx', ['tsx', 'packages/db/src/migrate.ts'], { env });

  // 5. Indexer
  const indexerPid = path.join(PIDS, 'indexer.pid');
  if (fs.existsSync(indexerPid) && isProcessAlive(Number(fs.readFileSync(indexerPid, 'utf8')))) {
    log('indexer уже запущен');
  } else {
    log('запуск indexer…');
    spawnService('indexer', 'npm', ['run', 'indexer'], { env });
  }

  // 6. Веб-приложение
  if (await portOpen(WEB_PORT)) {
    log(`веб-приложение уже слушает порт ${WEB_PORT}`);
  } else {
    const useProd = process.env.MODE === 'prod' && fs.existsSync(path.join(ROOT, 'apps/web/.next'));
    log(useProd ? 'запуск Next.js (production build)…' : 'запуск Next.js (dev)…');
    spawnService('web', 'npm', useProd ? ['run', 'start'] : ['run', 'dev'], { env });
    await waitForPort(WEB_PORT, 'веб-приложение', 120_000);
  }

  const deploymentPath = path.join(ROOT, 'deployments', `${networkName}.json`);
  const deployment = JSON.parse(
    fs.readFileSync(
      fs.existsSync(deploymentPath)
        ? deploymentPath
        : path.join(ROOT, 'deployments/localhost.json'),
      'utf8',
    ),
  );

  console.log(`${colors.dim}${'═'.repeat(72)}${colors.reset}`);
  console.log(`${colors.green}Система запущена${colors.reset}`);
  console.log(`  Веб-приложение:  http://localhost:${WEB_PORT}`);
  console.log(
    `  RPC URL:         ${env.RPC_URL ?? `http://127.0.0.1:${CHAIN_PORT}`} (chainId ${deployment.chainId})`,
  );
  console.log(`  Сеть:            ${networkName}`);
  console.log(`  Контракт:        ${deployment.address}`);
  console.log(`  Админ (owner):   ${deployment.owner}`);
  console.log(
    `  PostgreSQL:      postgresql://${env.PGUSER ?? 'justtld'}@${env.PGHOST ?? '127.0.0.1'}:${env.PGPORT ?? 5432}/${env.DB_NAME ?? 'justtld'}`,
  );
  console.log(`  Логи:            logs/*.log`);
  console.log(`  Остановка:       Ctrl+C (или npm run stop:all)`);
  console.log(`${colors.dim}${'═'.repeat(72)}${colors.reset}\n`);

  if (children.length === 0) {
    log('все сервисы уже работали — новых процессов не запущено');
    return;
  }

  const shutdown = (signal) => {
    log(`получен ${signal}, останавливаю дочерние процессы…`);
    for (const { name, child } of children) {
      try {
        // Сначала пробуем погасить всю группу процессов, иначе остаются сироты (tsx, next-server).
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {
          /* процесс уже завершён */
        }
      }
      fs.rmSync(path.join(PIDS, `${name}.pid`), { force: true });
    }
    setTimeout(() => process.exit(0), 1200);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Держим процесс живым, пока живы дочерние.
  await new Promise(() => undefined);
}

function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
