import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { buildWeekGrid } from '../../src/web/calendar.js';
import { ZONE } from '../../src/domain/time.js';

const monday = DateTime.fromISO('2030-01-14', { zone: ZONE });
const local = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
const hours = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensMin: 480, closesMin: 1200 }));
const now = local('2030-01-15T09:40');

describe('buildWeekGrid', () => {
  const grid = buildWeekGrid(
    hours,
    monday,
    [
      { start: local('2030-01-16T10:00'), end: local('2030-01-16T11:00'), userId: 2 },
      { start: local('2030-01-16T14:00'), end: local('2030-01-16T15:00'), userId: 1 },
    ],
    now,
    1,
    { start: DateTime.fromISO('2030-01-16T12:00', { zone: ZONE }), minutes: 90 },
  );
  const cell = (day: number, time: string) => grid.rows.find((r) => r.time === time)!.cells[day]!;

  it('a nyitvatartás szerint 8:00-tól 20:00-ig 24 félórás sort ad', () => {
    expect(grid.rows).toHaveLength(24);
    expect(grid.rows[0]!.time).toBe('8:00');
  });

  it('jelöli a mai napot és a zárva tartó hétvégét (AC-04.3)', () => {
    expect(grid.days.map((d) => d.isToday)).toEqual([false, true, false, false, false, false, false]);
    expect(cell(5, '10:00').state).toBe('closed');
    expect(cell(6, '10:00').state).toBe('closed');
  });

  it('megkülönbözteti a foglalt, a saját, az elmúlt és a szabad sávot (AC-04.1)', () => {
    expect(cell(2, '10:00')).toMatchObject({ state: 'busy', first: true, last: false });
    expect(cell(2, '10:30')).toMatchObject({ state: 'busy', first: false, last: true });
    expect(cell(2, '14:00').state).toBe('mine');
    expect(cell(1, '9:00').state).toBe('past');
    expect(cell(1, '10:00').state).toBe('free');
  });

  it('a kijelölést 12:00-tól 13:30-ig jelöli', () => {
    expect(cell(2, '12:00').selected).toBe(true);
    expect(cell(2, '13:00').selected).toBe(true);
    expect(cell(2, '13:30').selected).toBe(false);
  });
});
