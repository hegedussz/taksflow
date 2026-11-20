import type { DateTime } from 'luxon';
import type { OpeningHours } from '../domain/rules.js';
import { SLOT_MINUTES, ZONE, minutesToTime } from '../domain/time.js';
import type { Slot } from '../services/bookingService.js';

export type CellState = 'free' | 'busy' | 'mine' | 'past' | 'off' | 'closed';

export interface Cell {
  state: CellState;
  start: string; // helyi ISO időpont, a link paramétere
  first: boolean;
  last: boolean;
  selected: boolean;
  clash: boolean;
}

export interface WeekGrid {
  days: { date: DateTime; isToday: boolean; closed: boolean }[];
  rows: { time: string; fullHour: boolean; cells: Cell[] }[];
}

export interface Selection {
  start: DateTime;
  minutes: number;
}

/** FR-04: heti naptár 30 perces sávokkal (AC-04.1 foglalt, AC-04.3 zárva tartó nap). */
export function buildWeekGrid(
  hours: OpeningHours[],
  weekStart: DateTime,
  slots: Slot[],
  now: Date,
  userId: number,
  selection?: Selection,
): WeekGrid {
  const days = Array.from({ length: 7 }, (_, i) => weekStart.setZone(ZONE).startOf('day').plus({ days: i }));
  const open = days.map((d) => hours.find((h) => h.weekday === d.weekday));
  const present = open.filter((h): h is OpeningHours => h !== undefined);
  const from = present.length ? Math.min(...present.map((h) => h.opensMin)) : 8 * 60;
  const to = present.length ? Math.max(...present.map((h) => h.closesMin)) : 20 * 60;
  const nowMs = now.getTime();
  const selStart = selection?.start.toMillis();
  const selEnd = selection ? selection.start.plus({ minutes: selection.minutes }).toMillis() : undefined;

  const rows: WeekGrid['rows'] = [];
  for (let m = from; m < to; m += SLOT_MINUTES) {
    const cells = days.map((day, i): Cell => {
      const at = day.set({ hour: Math.floor(m / 60), minute: m % 60 });
      const ms = at.toMillis();
      const h = open[i];
      const selected = selStart !== undefined && selEnd !== undefined && ms >= selStart && ms < selEnd;
      const base = { start: at.toISO({ suppressMilliseconds: true, includeOffset: false })!, first: false, last: false, selected, clash: false };
      if (!h) return { ...base, state: 'closed' };
      if (m < h.opensMin || m >= h.closesMin) return { ...base, state: 'off' };
      const slot = slots.find((s) => s.start.getTime() <= ms && ms < s.end.getTime());
      if (slot) {
        return {
          ...base,
          state: slot.userId === userId ? 'mine' : 'busy',
          first: slot.start.getTime() === ms,
          last: slot.end.getTime() === ms + SLOT_MINUTES * 60_000,
          clash: selected,
        };
      }
      if (ms < nowMs) return { ...base, state: 'past' };
      return { ...base, state: 'free' };
    });
    rows.push({ time: minutesToTime(m).replace(/^0/, ''), fullHour: m % 60 === 0, cells });
  }
  const today = toIsoDate(now);
  return {
    days: days.map((date, i) => ({ date, isToday: date.toISODate() === today, closed: !open[i] })),
    rows,
  };
}

function toIsoDate(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE }).format(d);
}
