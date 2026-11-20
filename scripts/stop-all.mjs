#!/usr/bin/env node
/**
 * JustTLD — остановка системы.
 *   npm run stop:all              # indexer и веб-приложение
 *   npm run stop:all -- --chain   # плюс локальная EVM-сеть
 *   npm run stop:all -- --db      # плюс PostgreSQL
 *   npm run stop:all -- --all     # всё, включая сеть и БД
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIDS = path.join(ROOT, 'data/pids');
const args = process.argv.slice(2);
const stopAll = args.includes('--all');
const stopChain = stopAll || args.includes('--chain');
const stopDb = stopAll || args.includes('--db');

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopPidFile(name) {
  const file = path.join(PIDS, `${name}.pid`);
  if (!fs.existsSync(file)) {
    console.log(`[stop] ${name}: pid-файл не найден (сервис не запускался этим скриптом)`);
    return;
  }
  const pid = Number(fs.readFileSync(file, 'utf8').trim());
  if (!isAlive(pid)) {
    fs.rmSync(file, { force: true });
    console.log(`[stop] ${name}: процесс уже завершён`);
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    process.kill(pid, 'SIGTERM');
  }
  console.log(`[stop] ${name}: отправлен SIGTERM (pid ${pid})`);
  fs.rmSync(file, { force: true });
}

console.log('[stop] остановка JustTLD');
stopPidFile('web');
stopPidFile('indexer');

if (stopChain) stopPidFile('chain');

if (stopDb) {
  console.log('[stop] остановка PostgreSQL');
  spawnSync('bash', ['scripts/db.sh', 'stop'], { cwd: ROOT, stdio: 'inherit' });
}

console.log('[stop] готово. Перезапуск: npm run start:all');
