import fs from 'node:fs';
import path from 'node:path';
import { loadRootEnv } from '@justtld/shared/env';
import { closePool, databaseUrl, getPool } from './pool';

loadRootEnv();

const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const VERSION = '2026-11-21-justtld-store-sites-dns';

/** Применяет schema.sql (идемпотентно) и фиксирует версию миграции. */
export async function runMigrations(verbose = true): Promise<void> {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [
      VERSION,
    ]);
    if (applied.rowCount === 0) {
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [VERSION]);
      if (verbose) console.log(`[db] миграция применена: ${VERSION}`);
    } else if (verbose) {
      console.log(`[db] миграция уже применена: ${VERSION}`);
    }
    await client.query('COMMIT');
    if (verbose) {
      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`,
      );
      console.log(`[db] таблицы: ${tables.rows.map((row) => row.table_name).join(', ')}`);
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  console.log(`[db] DATABASE_URL = ${databaseUrl().replace(/:[^:@/]+@/, ':***@')}`);
  await runMigrations(true);
  await closePool();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('[db] миграция не удалась:', error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
}
