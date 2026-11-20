import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL nincs megadva');
  process.exit(1);
}
const pool = createPool(url);
try {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `Lefutott migrációk: ${applied.join(', ')}` : 'Nincs új migráció.');
} finally {
  await pool.end();
}
