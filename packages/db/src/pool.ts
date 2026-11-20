import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { loadRootEnv } from '@justtld/shared/env';

loadRootEnv();

const DEFAULT_URL = 'postgresql://justtld:justtld@127.0.0.1:5432/justtld';

let pool: Pool | null = null;

/**
 * Managed-хостинги (Neon, Supabase, Render, Railway) требуют TLS.
 * Локальный кластер — без TLS. Определяем по строке подключения или PGSSLMODE/PG_SSL.
 */
export function sslConfig(url = databaseUrl()): false | { rejectUnauthorized: boolean } {
  const mode = (process.env.PGSSLMODE ?? process.env.PG_SSL ?? '').toLowerCase();
  if (mode === 'disable' || mode === 'false' || mode === '0') return false;
  if (mode === 'require' || mode === 'true' || mode === '1') return { rejectUnauthorized: false };
  if (/sslmode=(require|verify-ca|verify-full)/i.test(url)) return { rejectUnauthorized: false };
  if (/neon\.tech|supabase\.co|render\.com|railway\.app|azure|amazonaws\.com/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return false;
}

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL ?? DEFAULT_URL;
  pool = new Pool({
    connectionString,
    ssl: sslConfig(connectionString),
    max: Number.parseInt(process.env.PG_POOL_MAX ?? '10', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'justtld',
  });
  pool.on('error', (error) => {
    console.error('[db] ошибка idle-клиента:', error.message);
  });
  return pool;
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_URL;
}

/** Параметризованный запрос (никакой конкатенации SQL с пользовательскими данными). */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[]);
}

export async function queryRows<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(text, params);
  return rows[0] ?? null;
}

/** Выполняет колбэк в транзакции с автоматическим ROLLBACK при ошибке. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* соединение могло быть разорвано */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  try {
    await query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: (error as Error).message };
  }
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
