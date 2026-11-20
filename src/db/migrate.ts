import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from './pool.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const SEED_FILE = fileURLToPath(new URL('../../seeds/demo.sql', import.meta.url));
const LOCK_ID = 727_001;

/** A még le nem futott migrációkat névsorrendben, egyenként tranzakcióban alkalmazza. */
export async function runMigrations(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(`${dir}/${file}`, 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`A(z) ${file} migráció sikertelen: ${(err as Error).message}`, { cause: err });
      }
      applied.push(file);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    client.release();
  }
  return applied;
}

/** Demóadatok betöltése, de csak üres adatbázisba. */
export async function seedDemoData(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query<{ n: number }>('SELECT count(*) AS n FROM rooms');
  if ((rows[0]?.n ?? 0) > 0) return false;
  await pool.query(await readFile(SEED_FILE, 'utf8'));
  return true;
}
