import type { Pool } from '../db/pool.js';
import { pgErrorCode, withTransaction } from '../db/pool.js';
import type { OpeningHours } from '../domain/rules.js';
import { NotFoundError, RuleError } from '../domain/errors.js';
import { timeToMinutes, minutesToTime, type Clock } from '../domain/time.js';
import type { NotificationService } from './notificationService.js';

export interface Equipment {
  code: string;
  nameHu: string;
  nameEn: string;
}

export interface Building {
  id: number;
  name: string;
}

export interface Room {
  id: number;
  code: string;
  name: string;
  floor: string;
  capacity: number;
  active: boolean;
  buildingId: number;
  buildingName: string;
  equipment: Equipment[];
  hours: OpeningHours[];
}

export interface RoomFilter {
  buildingId?: number;
  minCapacity?: number;
  equipment?: string[];
}

export interface RoomInput {
  code: string;
  name: string;
  buildingId: number;
  floor: string;
  capacity: number;
  equipment: string[];
  hours: OpeningHours[];
}

export class RoomService {
  constructor(
    private readonly db: Pool,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  /** FR-03: aktív termek szűrése; minden megadott feltételnek teljesülnie kell (AC-03.2). */
  async search(filter: RoomFilter = {}): Promise<Room[]> {
    const eq = filter.equipment ?? [];
    const { rows } = await this.db.query<{ id: number }>(
      `SELECT r.id FROM rooms r
       WHERE r.active
         AND ($1::bigint IS NULL OR r.building_id = $1)
         AND ($2::int IS NULL OR r.capacity >= $2)
         AND (cardinality($3::text[]) = 0 OR (
               SELECT count(DISTINCT e.code) FROM room_equipment re JOIN equipment e ON e.id = re.equipment_id
               WHERE re.room_id = r.id AND e.code = ANY ($3::text[])) = cardinality($3::text[]))
       ORDER BY r.code`,
      [filter.buildingId ?? null, filter.minCapacity ?? null, eq],
    );
    return this.load(rows.map((r) => r.id));
  }

  async listAll(): Promise<Room[]> {
    const { rows } = await this.db.query<{ id: number }>('SELECT id FROM rooms ORDER BY active DESC, code');
    return this.load(rows.map((r) => r.id));
  }

  async get(id: number): Promise<Room | null> {
    if (!Number.isSafeInteger(id)) return null;
    return (await this.load([id]))[0] ?? null;
  }

  async listBuildings(): Promise<Building[]> {
    return (await this.db.query<Building>('SELECT id, name FROM buildings ORDER BY name')).rows;
  }

  async listEquipment(): Promise<Equipment[]> {
    return (
      await this.db.query<Equipment>('SELECT code, name_hu AS "nameHu", name_en AS "nameEn" FROM equipment ORDER BY id')
    ).rows;
  }

  async create(input: RoomInput): Promise<number> {
    return this.save(null, input);
  }

  async update(id: number, input: RoomInput): Promise<void> {
    await this.save(id, input);
  }

  async countFutureBookings(roomId: number): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*) AS n FROM bookings WHERE room_id = $1 AND status = 'active' AND lower(period) > $2`,
      [roomId, this.clock()],
    );
    return rows[0]?.n ?? 0;
  }

  /**
   * AC-09.2: a terem inaktiválása; a jövőbeli foglalásait lemondjuk (status = cancelled, ADR-0001),
   * és az érintett hallgatóknak értesítést küldünk. A lemondott foglalások számát adja vissza.
   */
  async deactivate(roomId: number): Promise<number> {
    const now = this.clock();
    const cancelled = await withTransaction(this.db, async (c) => {
      const r = await c.query('UPDATE rooms SET active = FALSE WHERE id = $1', [roomId]);
      if (r.rowCount === 0) throw new NotFoundError();
      const { rows } = await c.query<{ id: number }>(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = $2
         WHERE room_id = $1 AND status = 'active' AND lower(period) > $2 RETURNING id`,
        [roomId, now],
      );
      return rows.map((x) => x.id);
    });
    await this.notifications.roomDeactivated(cancelled);
    return cancelled.length;
  }

  async activate(roomId: number): Promise<void> {
    const r = await this.db.query('UPDATE rooms SET active = TRUE WHERE id = $1', [roomId]);
    if (r.rowCount === 0) throw new NotFoundError();
  }

  private async save(id: number | null, input: RoomInput): Promise<number> {
    try {
      return await withTransaction(this.db, async (c) => {
        let roomId = id;
        if (roomId === null) {
          const { rows } = await c.query<{ id: number }>(
            `INSERT INTO rooms (building_id, code, name, floor, capacity) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [input.buildingId, input.code, input.name, input.floor, input.capacity],
          );
          roomId = rows[0]!.id;
        } else {
          const r = await c.query(
            `UPDATE rooms SET building_id = $2, code = $3, name = $4, floor = $5, capacity = $6 WHERE id = $1`,
            [roomId, input.buildingId, input.code, input.name, input.floor, input.capacity],
          );
          if (r.rowCount === 0) throw new NotFoundError();
          await c.query('DELETE FROM room_equipment WHERE room_id = $1', [roomId]);
          await c.query('DELETE FROM opening_hours WHERE room_id = $1', [roomId]);
        }
        await c.query(
          `INSERT INTO room_equipment (room_id, equipment_id)
           SELECT $1, id FROM equipment WHERE code = ANY ($2::text[])`,
          [roomId, input.equipment],
        );
        for (const h of input.hours) {
          await c.query('INSERT INTO opening_hours (room_id, weekday, opens, closes) VALUES ($1, $2, $3, $4)', [
            roomId,
            h.weekday,
            minutesToTime(h.opensMin),
            minutesToTime(h.closesMin),
          ]);
        }
        return roomId;
      });
    } catch (err) {
      const code = pgErrorCode(err);
      if (code === '23505') throw new RuleError('error.room_code_taken');
      if (code === '23503') throw new RuleError('error.bad_request');
      throw err;
    }
  }

  private async load(ids: number[]): Promise<Room[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.db.query<Omit<Room, 'equipment' | 'hours'>>(
      `SELECT r.id, r.code, r.name, r.floor, r.capacity, r.active, r.building_id AS "buildingId", b.name AS "buildingName"
       FROM rooms r JOIN buildings b ON b.id = r.building_id WHERE r.id = ANY ($1::bigint[])`,
      [ids],
    );
    const eq = await this.db.query<Equipment & { roomId: number }>(
      `SELECT re.room_id AS "roomId", e.code, e.name_hu AS "nameHu", e.name_en AS "nameEn"
       FROM room_equipment re JOIN equipment e ON e.id = re.equipment_id
       WHERE re.room_id = ANY ($1::bigint[]) ORDER BY e.id`,
      [ids],
    );
    const hours = await this.db.query<{ roomId: number; weekday: number; opens: string; closes: string }>(
      `SELECT room_id AS "roomId", weekday, opens::text AS opens, closes::text AS closes
       FROM opening_hours WHERE room_id = ANY ($1::bigint[]) ORDER BY weekday`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.id, { ...r, equipment: [] as Equipment[], hours: [] as OpeningHours[] }]));
    for (const e of eq.rows) byId.get(e.roomId)?.equipment.push({ code: e.code, nameHu: e.nameHu, nameEn: e.nameEn });
    for (const h of hours.rows) {
      byId.get(h.roomId)?.hours.push({ weekday: h.weekday, opensMin: timeToMinutes(h.opens), closesMin: timeToMinutes(h.closes) });
    }
    return ids.map((id) => byId.get(id)).filter((r): r is Room => r !== undefined);
  }
}
