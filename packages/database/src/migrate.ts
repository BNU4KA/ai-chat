import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './pool.ts';

export async function migrate(): Promise<string[]> {
  const pool = getPool();
  await pool.query(`create table if not exists schema_migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  )`);
  await pool.query('revoke all on table schema_migrations from public');
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    const existing = await pool.query('select id from schema_migrations where id = $1', [file]);
    if (existing.rowCount) continue;
    const sql = await readFile(resolve(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (id) values ($1)', [file]);
      await client.query('commit');
      applied.push(file);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  return applied;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  migrate()
    .then((applied) => {
      console.log({ applied });
      return getPool().end();
    })
    .catch((error: unknown) => {
      console.log({ error: error instanceof Error ? error.message : 'migrate failed' });
      process.exit(1);
    });
}
