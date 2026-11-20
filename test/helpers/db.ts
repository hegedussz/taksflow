import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { createPool, type Pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ZONE } from '../../src/domain/time.js';
import { loadConfig, type Config } from '../../src/config.js';
import { buildServices, type Services } from '../../src/services/index.js';
import { MemoryMailer } from '../../src/services/mailer.js';

/** Az integrációs tesztek valódi PostgreSQL-t igényelnek (ADR-0001). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://studyroom:studyroom@localhost:55432/studyroom_test';

/** Rögzített „most”: 2030. január 15., kedd 9:40 budapesti idő szerint. */
export const NOW = new Date('2030-01-15T08:40:00Z');
export const clock = () => NOW;

/** Helyi (Europe/Budapest) idő → Date, pl. at('2030-01-16T10:00'). */
export const at = (iso: string): Date => DateTime.fromISO(iso, { zone: ZONE }).toJSDate();

export async function setupDb(): Promise<Pool> {
  const pool = createPool(TEST_DATABASE_URL);
  await runMigrations(pool);
  return pool;
}

export async function resetDb(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE bookings, opening_hours, room_equipment, rooms, buildings, users, session RESTART IDENTITY CASCADE',
  );
}

export async function createUser(pool: Pool, eppn = 'kovacs.reka@nye.hu', role: 'student' | 'admin' = 'student') {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (eppn, email, display_name, role) VALUES ($1, $1, $1, $2) RETURNING id`,
    [eppn, role],
  );
  return rows[0]!.id;
}

interface RoomOpts {
  code?: string;
  capacity?: number;
  building?: string;
  equipment?: string[];
  /** [weekday, opens, closes]; alapértelmezésben minden nap 0:00–24:00 */
  hours?: [number, string, string][];
}

export async function createRoom(pool: Pool, opts: RoomOpts = {}): Promise<number> {
  const building = opts.building ?? 'A épület';
  await pool.query('INSERT INTO buildings (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [building]);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO rooms (building_id, code, name, capacity)
     VALUES ((SELECT id FROM buildings WHERE name = $1), $2, $3, $4) RETURNING id`,
    [building, opts.code ?? 'A/104', `${opts.code ?? 'A/104'} terem`, opts.capacity ?? 12],
  );
  const id = rows[0]!.id;
  await pool.query(
    `INSERT INTO room_equipment (room_id, equipment_id) SELECT $1, id FROM equipment WHERE code = ANY ($2::text[])`,
    [id, opts.equipment ?? []],
  );
  const hours = opts.hours ?? [1, 2, 3, 4, 5, 6, 7].map((d) => [d, '00:00', '24:00'] as [number, string, string]);
  for (const [d, o, c] of hours) {
    await pool.query('INSERT INTO opening_hours (room_id, weekday, opens, closes) VALUES ($1, $2, $3, $4)', [id, d, o, c]);
  }
  return id;
}

export function testServices(pool: Pool): { services: Services; mailer: MemoryMailer } {
  const mailer = new MemoryMailer();
  return { services: buildServices(pool, mailer, 'http://localhost:3000', clock), mailer };
}

export const DEV_IDP_CERT = readFileSync(new URL('../../dev/idp/idp-signing.crt', import.meta.url), 'utf8');

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    SESSION_SECRET: 'teszt-titok-legalabb-harminckét-karakter-hosszu',
    SAML_IDP_SSO_URL: 'http://localhost:8080/simplesaml/saml2/idp/SSOService.php',
    SAML_IDP_CERT: DEV_IDP_CERT,
    ADMIN_EPPNS: 'szabo.marta@nye.hu',
    ...overrides,
  });
}
