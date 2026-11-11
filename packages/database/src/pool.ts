import pg from 'pg';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '@ai-chat/contracts';

pg.types.setTypeParser(20, (value) => value);
pg.types.setTypeParser(1700, (value) => value);

export type Tx = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<T>>;
};

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Database is not configured');
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: databaseConnectionString(),
      max: 10,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function pingDatabase(): Promise<'ok' | 'unconfigured' | 'unavailable'> {
  if (!process.env.DATABASE_URL) return 'unconfigured';
  try {
    await getPool().query('select 1 as ok');
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

export async function pingQueue(): Promise<'ok' | 'unconfigured' | 'unavailable'> {
  if (!process.env.DATABASE_URL) return 'unconfigured';
  try {
    const found = await getPool().query<{ ns: string | null }>(
      `select to_regnamespace('pgboss') as ns`,
    );
    return found.rows[0]?.ns ? 'ok' : 'unconfigured';
  } catch {
    return 'unavailable';
  }
}

export async function withRole<T>(
  role: 'app_api' | 'app_worker',
  ownerId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    if (ownerId) {
      await client.query(`select set_config('app.owner_id', $1, true)`, [ownerId]);
    }
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* the connection is already unusable */
    }
    throw error;
  } finally {
    client.release();
  }
}

export function withOwner<T>(ownerId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withRole('app_api', ownerId, fn);
}

export function withWorker<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withRole('app_worker', null, fn);
}

export function databaseConnectionString(raw = process.env.DATABASE_URL) {
  if (!raw) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Database is not configured');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (!local) {
    url.searchParams.set('sslmode', 'verify-full');
    url.searchParams.delete('uselibpqcompat');
    const configured = process.env.DATABASE_SSL_CA_FILE;
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const ca = configured
      ? isAbsolute(configured)
        ? configured
        : resolve(root, configured)
      : resolve(root, '.local/supabase-ca.crt');
    if (configured || (!url.searchParams.has('sslrootcert') && existsSync(ca))) {
      url.searchParams.set('sslrootcert', ca);
    }
  }
  return url.toString();
}
