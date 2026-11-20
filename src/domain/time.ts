import { DateTime } from 'luxon';

/** Az időpontokat UTC-ben tároljuk, és ebben az időzónában jelenítjük meg (ADR-0001). */
export const ZONE = 'Europe/Budapest';
export const SLOT_MINUTES = 30;
export const MIN_BOOKING_MINUTES = 30;
export const MAX_BOOKING_MINUTES = 180;
export const MAX_ACTIVE_BOOKINGS = 2;
export const LATE_CANCELLATION_MINUTES = 60;
export const REMINDER_MINUTES = 30;
export const HISTORY_DAYS = 90;

export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export const toLocal = (d: Date): DateTime => DateTime.fromJSDate(d, { zone: ZONE });

/** Helyi idő szerinti ISO dátum/időpont értelmezése; érvénytelen bemenetre null. */
export function parseLocal(value: unknown): DateTime | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const dt = DateTime.fromISO(value, { zone: ZONE });
  return dt.isValid ? dt : null;
}

/** "08:00:00" vagy "24:00:00" → percek éjfél óta. */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const minutesToTime = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const minuteOfDay = (dt: DateTime): number => dt.hour * 60 + dt.minute;

/** A hét hétfője (helyi idő, 0:00). */
export const weekStartOf = (dt: DateTime): DateTime => dt.setZone(ZONE).startOf('week');
