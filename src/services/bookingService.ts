import { DateTime } from 'luxon';
import type { Pool } from '../db/pool.js';
import { pgErrorCode } from '../db/pool.js';
import {
  BookingLimitError,
  ForbiddenError,
  NotFoundError,
  RuleError,
  SlotUnavailableError,
} from '../domain/errors.js';
import { isLateCancellation, validateBookingWindow } from '../domain/rules.js';
import { HISTORY_DAYS, MAX_ACTIVE_BOOKINGS, ZONE, type Clock } from '../domain/time.js';
import type { NotificationService } from './notificationService.js';
import type { RoomService } from './roomService.js';

export interface Booking {
  id: number;
  roomId: number;
  roomCode: string;
  roomName: string;
  buildingName: string;
  floor: string;
  userId: number;
  start: Date;
  end: Date;
  status: 'active' | 'cancelled';
  lateCancellation: boolean;
}

export interface Slot {
  start: Date;
  end: Date;
  userId: number;
}

const SELECT = `SELECT b.id, b.room_id AS "roomId", r.code AS "roomCode", r.name AS "roomName",
  bl.name AS "buildingName", r.floor, b.user_id AS "userId", lower(b.period) AS start, upper(b.period) AS "end",
  b.status, b.late_cancellation AS "lateCancellation"
  FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id`;

export class BookingService {
  constructor(
    private readonly db: Pool,
    private readonly rooms: RoomService,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  /**
   * FR-05: foglalás létrehozása (szekvenciadiagram: docs/architecture/szekvenciadiagram-foglalas.png).
   * Az átfedést az adatbázis kizárási megkötése akadályozza meg (ADR-0001), a felhasználónkénti
   * korlátot pedig a felhasználó sorának zárolása mellett számoljuk meg (AC-05.4).
   */
  async create(userId: number, roomId: number, start: Date, end: Date): Promise<Booking> {
    const room = await this.rooms.get(roomId);
    if (!room) throw new NotFoundError();
    if (!room.active) throw new RuleError('error.room_inactive');

    const now = this.clock();
    const ruleError = validateBookingWindow(
      DateTime.fromJSDate(start, { zone: ZONE }),
      DateTime.fromJSDate(end, { zone: ZONE }),
      DateTime.fromJSDate(now, { zone: ZONE }),
      room.hours,
    );
    if (ruleError) throw new RuleError(ruleError);

    const client = await this.db.connect();
    let id: number;
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (user.rowCount === 0) throw new NotFoundError();
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*) AS n FROM bookings WHERE user_id = $1 AND status = 'active' AND lower(period) > $2`,
        [userId, now],
      );
      if ((rows[0]?.n ?? 0) >= MAX_ACTIVE_BOOKINGS) throw new BookingLimitError();
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO bookings (room_id, user_id, period) VALUES ($1, $2, tstzrange($3, $4, '[)')) RETURNING id`,
        [roomId, userId, start, end],
      );
      id = inserted.rows[0]!.id;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = pgErrorCode(err);
      if (code === '23P01') throw new SlotUnavailableError();
      if (code === '23514') throw new RuleError('error.max_duration');
      throw err;
    } finally {
      client.release();
    }

    await this.notifications.bookingConfirmed(id);
    return (await this.get(id))!;
  }

  /** FR-06: lemondás; a sort nem töröljük, csak cancelled állapotba tesszük (ADR-0001). */
  async cancel(userId: number, bookingId: number): Promise<{ late: boolean }> {
    const now = this.clock();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ userId: number; status: string; start: Date; end: Date }>(
        `SELECT user_id AS "userId", status, lower(period) AS start, upper(period) AS "end"
         FROM bookings WHERE id = $1 FOR UPDATE`,
        [bookingId],
      );
      const b = rows[0];
      if (!b) throw new NotFoundError();
      if (b.userId !== userId) throw new ForbiddenError(); // AC-06.3
      if (b.status !== 'active') throw new RuleError('error.already_cancelled');
      if (b.end <= now) throw new RuleError('error.booking_finished');
      const late = isLateCancellation(b.start, now); // AC-06.2
      await client.query(
        `UPDATE bookings SET status = 'cancelled', late_cancellation = $2, cancelled_at = $3 WHERE id = $1`,
        [bookingId, late, now],
      );
      await client.query('COMMIT');
      return { late };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async get(id: number): Promise<Booking | null> {
    if (!Number.isSafeInteger(id)) return null;
    const { rows } = await this.db.query<Booking>(`${SELECT} WHERE b.id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** AC-07.1: közelgő (még véget nem ért) aktív foglalások, kezdés szerint. */
  async upcoming(userId: number): Promise<Booking[]> {
    const { rows } = await this.db.query<Booking>(
      `${SELECT} WHERE b.user_id = $1 AND b.status = 'active' AND upper(b.period) > $2 ORDER BY lower(b.period)`,
      [userId, this.clock()],
    );
    return rows;
  }

  /** AC-07.2: az elmúlt 90 nap lezajlott és lemondott foglalásai, a legfrissebb elöl. */
  async history(userId: number): Promise<Booking[]> {
    const now = this.clock();
    const from = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
    const { rows } = await this.db.query<Booking>(
      `${SELECT} WHERE b.user_id = $1 AND lower(b.period) >= $3
         AND (b.status = 'cancelled' OR upper(b.period) <= $2)
       ORDER BY lower(b.period) DESC`,
      [userId, now, from],
    );
    return rows;
  }

  async activeFutureCount(userId: number): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*) AS n FROM bookings WHERE user_id = $1 AND status = 'active' AND lower(period) > $2`,
      [userId, this.clock()],
    );
    return rows[0]?.n ?? 0;
  }

  /** FR-04: egy terem aktív foglalásai a megadott időszakban (a GiST index ezt is gyorsítja). */
  async slots(roomId: number, from: Date, to: Date): Promise<Slot[]> {
    const { rows } = await this.db.query<Slot>(
      `SELECT lower(period) AS start, upper(period) AS "end", user_id AS "userId" FROM bookings
       WHERE room_id = $1 AND status = 'active' AND period && tstzrange($2, $3, '[)')
       ORDER BY lower(period)`,
      [roomId, from, to],
    );
    return rows;
  }
}
