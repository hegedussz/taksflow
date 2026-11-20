import { DateTime } from 'luxon';
import type { Pool } from '../db/pool.js';
import { RuleError } from '../domain/errors.js';
import { ZONE } from '../domain/time.js';

export const MAX_STATS_DAYS = 92;

export type StatsPreset = 'prevweek' | 'last30' | 'custom';

export interface StatsRange {
  preset: StatsPreset;
  from: string; // ISO dátum (helyi nap), beleértve
  to: string; // ISO dátum (helyi nap), beleértve
}

export interface RoomUtilization {
  roomId: number;
  code: string;
  name: string;
  buildingName: string;
  active: boolean;
  openMinutes: number;
  bookedMinutes: number;
  bookings: number;
  percent: number;
}

export interface UtilizationReport {
  from: string;
  to: string;
  rows: RoomUtilization[];
  totals: { openMinutes: number; bookedMinutes: number; bookings: number; percent: number };
}

const pct = (booked: number, open: number) => (open > 0 ? (booked / open) * 100 : 0);

/**
 * Az időszak meghatározása (AC-10.1): előre megadott („Előző hét”, „Elmúlt 30 nap”) vagy egyéni.
 * Hibás egyéni időszaknál RuleError-t dob, amelynek kódja a felhasználónak megjelenő üzenet.
 */
export function resolveRange(preset: unknown, from: unknown, to: unknown, now: Date): StatsRange {
  const today = DateTime.fromJSDate(now, { zone: ZONE }).startOf('day');
  if (preset === 'last30') {
    return { preset, from: today.minus({ days: 30 }).toISODate()!, to: today.minus({ days: 1 }).toISODate()! };
  }
  if (preset !== 'custom') {
    const monday = today.startOf('week');
    return { preset: 'prevweek', from: monday.minus({ weeks: 1 }).toISODate()!, to: monday.minus({ days: 1 }).toISODate()! };
  }
  const f = typeof from === 'string' ? DateTime.fromISO(from, { zone: ZONE }) : null;
  const t = typeof to === 'string' ? DateTime.fromISO(to, { zone: ZONE }) : null;
  if (!f?.isValid || !t?.isValid || from!.toString().length !== 10 || to!.toString().length !== 10) {
    throw new RuleError('error.stats_range_invalid');
  }
  if (t < f) throw new RuleError('error.stats_range_order');
  if (t.diff(f, 'days').days + 1 > MAX_STATS_DAYS) throw new RuleError('error.stats_range_too_long');
  return { preset: 'custom', from: f.toISODate()!, to: t.toISODate()! };
}

/** StatisztikaService (osztálydiagram): kihasználtság és CSV-export (FR-10). */
export class StatisticsService {
  constructor(private readonly db: Pool) {}

  /**
   * Termenként a foglalt és a nyitvatartási percek az időszakban, egyetlen SQL-aggregációval (NFR-01).
   * Csak az aktív foglalások számítanak, és az időszak határán átnyúló foglalásból csak a metszet.
   */
  async utilization(from: string, to: string): Promise<UtilizationReport> {
    const { rows } = await this.db.query<Omit<RoomUtilization, 'percent'>>(
      `WITH win AS (
         SELECT tstzrange(($1::date)::timestamp AT TIME ZONE '${ZONE}',
                          (($2::date + 1)::timestamp) AT TIME ZONE '${ZONE}', '[)') AS r
       ),
       open AS (
         SELECT oh.room_id, sum(extract(epoch FROM (oh.closes - oh.opens)) / 60) AS minutes
         FROM generate_series($1::date, $2::date, interval '1 day') AS d (day)
         JOIN opening_hours oh ON oh.weekday = extract(isodow FROM d.day)
         GROUP BY oh.room_id
       ),
       booked AS (
         SELECT b.room_id, count(*) AS n,
                sum(extract(epoch FROM (upper(b.period * win.r) - lower(b.period * win.r))) / 60) AS minutes
         FROM bookings b CROSS JOIN win
         WHERE b.status = 'active' AND b.period && win.r
         GROUP BY b.room_id
       )
       SELECT r.id AS "roomId", r.code, r.name, bl.name AS "buildingName", r.active,
              coalesce(o.minutes, 0)::int AS "openMinutes",
              coalesce(bk.minutes, 0)::int AS "bookedMinutes",
              coalesce(bk.n, 0)::int AS bookings
       FROM rooms r
       JOIN buildings bl ON bl.id = r.building_id
       LEFT JOIN open o ON o.room_id = r.id
       LEFT JOIN booked bk ON bk.room_id = r.id
       WHERE coalesce(o.minutes, 0) > 0 OR coalesce(bk.n, 0) > 0
       ORDER BY r.code`,
      [from, to],
    );
    const withPct = rows
      .map((r) => ({ ...r, percent: pct(r.bookedMinutes, r.openMinutes) }))
      .sort((a, b) => b.percent - a.percent || a.code.localeCompare(b.code));
    const openMinutes = withPct.reduce((s, r) => s + r.openMinutes, 0);
    const bookedMinutes = withPct.reduce((s, r) => s + r.bookedMinutes, 0);
    return {
      from,
      to,
      rows: withPct,
      totals: {
        openMinutes,
        bookedMinutes,
        bookings: withPct.reduce((s, r) => s + r.bookings, 0),
        percent: pct(bookedMinutes, openMinutes),
      },
    };
  }
}

/** Szám egy tizedesjegyre, tizedesvesszővel; egész számnál tizedesjegy nélkül. */
export const huDecimal = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

const csvField = (v: string | number): string => {
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** AC-10.2: UTF-8 BOM, pontosvessző, tizedesvessző – a magyar Excel így nyitja meg helyesen. */
export function formatUtilizationCsv(report: UtilizationReport): string {
  const header = 'terem_kod;terem_neve;epulet;nyitvatartas_ora;foglalt_ora;foglalasok_szama;kihasznaltsag_szazalek';
  const lines = report.rows.map((r) =>
    [
      r.code,
      r.name,
      r.buildingName,
      huDecimal(r.openMinutes / 60),
      huDecimal(r.bookedMinutes / 60),
      r.bookings,
      r.percent.toFixed(1).replace('.', ','),
    ]
      .map(csvField)
      .join(';'),
  );
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

export const csvFilename = (report: Pick<UtilizationReport, 'from' | 'to'>) =>
  `studyroom_kihasznaltsag_${report.from}_${report.to}.csv`;
