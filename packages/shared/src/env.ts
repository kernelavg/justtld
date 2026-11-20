import fs from 'node:fs';
import path from 'node:path';

const LOADED_FLAG = '__JUSTTLD_ENV_LOADED__';

/**
 * Ищет .env, поднимаясь от cwd вверх по дереву каталогов.
 * Монорепо: команды запускаются и из корня, и из workspace-папок.
 */
export function findEnvFile(startDir = process.cwd(), maxDepth = 6): string | null {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Секреты публичного деплоя (.env.secrets) рядом с .env — не попадают в git.
 * Возвращает список существующих файлов в порядке приоритета.
 */
export function findEnvFiles(startDir = process.cwd(), maxDepth = 6): string[] {
  const files: string[] = [];
  const primary = process.env.JUSTTLD_ENV_FILE ?? findEnvFile(startDir, maxDepth);
  if (primary) {
    files.push(primary);
    const secrets = path.join(path.dirname(primary), '.env.secrets');
    if (fs.existsSync(secrets)) files.push(secrets);
  }
  return files;
}

/** Минимальный парсер .env (KEY=VALUE, кавычки, комментарии, export). */
export function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const hashIndex = value.indexOf(' #');
      if (hashIndex !== -1) value = value.slice(0, hashIndex).trim();
    }
    if (process.env[key] === undefined) result[key] = value;
    else result[key] = process.env[key] as string;
  }
  return result;
}

/** Загружает корневой .env в process.env (не перетирая уже заданные переменные). */
export function loadRootEnv(startDir?: string): void {
  const globalStore = globalThis as Record<string, unknown>;
  if (globalStore[LOADED_FLAG]) return;
  globalStore[LOADED_FLAG] = true;

  // .env — базовые настройки, .env.secrets — приватные значения (перекрывают .env непустым значением).
  for (const envFile of findEnvFiles(startDir)) {
    const fromSecrets = envFile.endsWith('.env.secrets');
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(envFile, 'utf8')))) {
      if (process.env[key] !== undefined && !(fromSecrets && value !== '')) continue;
      if (value === '' && process.env[key] !== undefined) continue;
      process.env[key] = value;
    }
  }
}

export function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envBool(key: string, fallback = false): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value)
    throw new Error(`Не задана обязательная переменная окружения ${key} (см. .env.example)`);
  return value;
}
