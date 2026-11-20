import type { Pool } from '../db/pool.js';
import { formatDate, formatRange } from '../web/format.js';
import { t } from '../web/i18n.js';
import type { Lang } from './userService.js';
import type { Mailer } from './mailer.js';

interface MailRow {
  bookingId: number;
  email: string;
  displayName: string;
  lang: Lang;
  roomCode: string;
  roomName: string;
  buildingName: string;
  floor: string;
  start: Date;
  end: Date;
}

/**
 * ÉrtesítésService (osztálydiagram). A levélküldés hibája nem akaszthatja meg a foglalást,
 * ezért a hibákat naplózzuk, de nem dobjuk tovább.
 */
export class NotificationService {
  constructor(
    private readonly db: Pool,
    private readonly mailer: Mailer,
    private readonly baseUrl: string,
  ) {}

  /** AC-05.1: visszaigazoló e-mail. */
  async bookingConfirmed(bookingId: number): Promise<void> {
    await this.sendFor([bookingId], 'confirm');
  }

  /** AC-08.1: emlékeztető 30 perccel a kezdés előtt. */
  async bookingReminders(bookingIds: number[]): Promise<void> {
    await this.sendFor(bookingIds, 'reminder');
  }

  /** AC-09.2: értesítés a terem inaktiválása miatt lemondott foglalásokról. */
  async roomDeactivated(bookingIds: number[]): Promise<void> {
    await this.sendFor(bookingIds, 'room_deactivated');
  }

  private async sendFor(ids: number[], kind: 'confirm' | 'reminder' | 'room_deactivated'): Promise<void> {
    if (ids.length === 0) return;
    try {
      const { rows } = await this.db.query<MailRow>(
        `SELECT b.id AS "bookingId", u.email, u.display_name AS "displayName", u.lang,
                r.code AS "roomCode", r.name AS "roomName", bl.name AS "buildingName", r.floor,
                lower(b.period) AS start, upper(b.period) AS "end"
         FROM bookings b JOIN users u ON u.id = b.user_id JOIN rooms r ON r.id = b.room_id
         JOIN buildings bl ON bl.id = r.building_id WHERE b.id = ANY ($1::bigint[])`,
        [ids],
      );
      for (const row of rows) {
        const params = {
          name: row.displayName,
          room: `${row.roomCode} ${row.roomName}`,
          place: `${row.buildingName}, ${row.floor}`,
          date: formatDate(row.start, row.lang),
          time: formatRange(row.start, row.end),
          url: `${this.baseUrl}/my/bookings`,
          roomsUrl: `${this.baseUrl}/rooms`,
        };
        await this.mailer
          .send({
            to: row.email,
            subject: t(row.lang, `email.${kind}.subject`, params),
            text: t(row.lang, `email.${kind}.body`, params),
          })
          .catch((err: unknown) => console.error(`E-mail-küldési hiba (${row.email}):`, err));
      }
    } catch (err) {
      console.error('Értesítési hiba:', err);
    }
  }
}
