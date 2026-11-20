import type { DateTime } from 'luxon';
import {
  LATE_CANCELLATION_MINUTES,
  MAX_BOOKING_MINUTES,
  MIN_BOOKING_MINUTES,
  SLOT_MINUTES,
  ZONE,
  minuteOfDay,
} from './time.js';

export interface OpeningHours {
  weekday: number; // 1 = hétfő … 7 = vasárnap
  opensMin: number;
  closesMin: number;
}

/**
 * A foglalás időablakának ellenőrzése az adatbázis előtt, hogy a felhasználó érthető hibaüzenetet kapjon.
 * Hibakódot ad vissza (fordítási kulcs), vagy null-t, ha minden rendben van.
 */
export function validateBookingWindow(
  start: DateTime,
  end: DateTime,
  now: DateTime,
  hours: OpeningHours[],
): string | null {
  if (!start.isValid || !end.isValid) return 'error.bad_request';
  const minutes = end.diff(start, 'minutes').minutes;
  if (minutes < MIN_BOOKING_MINUTES) return 'error.min_duration';
  if (minutes > MAX_BOOKING_MINUTES) return 'error.max_duration';

  const s = start.setZone(ZONE);
  const e = end.setZone(ZONE);
  if (s.minute % SLOT_MINUTES !== 0 || s.second !== 0 || s.millisecond !== 0 || minutes % SLOT_MINUTES !== 0) {
    return 'error.not_on_grid';
  }
  if (s <= now) return 'error.in_past';

  const day = hours.find((h) => h.weekday === s.weekday);
  if (!day) return 'error.closed_day';
  const startMin = minuteOfDay(s);
  const endMin = e.hasSame(s, 'day') ? minuteOfDay(e) : minuteOfDay(e) === 0 && e.minus({ days: 1 }).hasSame(s, 'day') ? 1440 : -1;
  if (endMin < 0 || startMin < day.opensMin || endMin > day.closesMin) return 'error.outside_opening_hours';
  return null;
}

/** AC-06.2: 1 órán belüli lemondás késői lemondásnak számít. */
export function isLateCancellation(start: Date, now: Date): boolean {
  return start.getTime() - now.getTime() < LATE_CANCELLATION_MINUTES * 60_000;
}
