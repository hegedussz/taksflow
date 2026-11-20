import type { Pool } from '../db/pool.js';
import type { SamlIdentity } from '../auth/attributes.js';

export type Role = 'student' | 'admin';
export type Lang = 'hu' | 'en';

export interface User {
  id: number;
  eppn: string;
  email: string;
  displayName: string;
  role: Role;
  remindersEnabled: boolean;
  lang: Lang;
}

const COLUMNS = `id, eppn, email, display_name AS "displayName", role,
  reminders_enabled AS "remindersEnabled", lang`;

export class UserService {
  constructor(private readonly db: Pool) {}

  /** Első belépéskor létrehozza, később frissíti a felhasználót az eduID-adatok alapján. */
  async upsertFromSaml(identity: SamlIdentity, isAdmin: boolean): Promise<User> {
    const { rows } = await this.db.query<User>(
      `INSERT INTO users (eppn, email, display_name, role, last_login_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (eppn) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
             role = EXCLUDED.role, last_login_at = now()
       RETURNING ${COLUMNS}`,
      [identity.eppn, identity.email, identity.displayName, isAdmin ? 'admin' : 'student'],
    );
    return rows[0]!;
  }

  async get(id: number): Promise<User | null> {
    const { rows } = await this.db.query<User>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async updatePreferences(id: number, prefs: { remindersEnabled: boolean; lang: Lang }): Promise<void> {
    await this.db.query('UPDATE users SET reminders_enabled = $2, lang = $3 WHERE id = $1', [
      id,
      prefs.remindersEnabled,
      prefs.lang,
    ]);
  }

  /** NFR-04: a felhasználóról tárolt összes adat exportja. */
  async exportData(id: number): Promise<Record<string, unknown>> {
    const user = await this.get(id);
    const { rows: bookings } = await this.db.query(
      `SELECT b.id, r.code AS room, lower(b.period) AS start, upper(b.period) AS "end", b.status,
              b.late_cancellation AS "lateCancellation", b.created_at AS "createdAt"
       FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.user_id = $1 ORDER BY lower(b.period)`,
      [id],
    );
    return { user, bookings };
  }
}
