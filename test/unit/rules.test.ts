import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { isLateCancellation, validateBookingWindow, type OpeningHours } from '../../src/domain/rules.js';
import { ZONE } from '../../src/domain/time.js';

const dt = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });
const now = dt('2030-01-15T09:40'); // kedd
const weekdays: OpeningHours[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensMin: 480, closesMin: 1200 }));
const check = (start: string, end: string, hours = weekdays) => validateBookingWindow(dt(start), dt(end), now, hours);

describe('validateBookingWindow', () => {
  it('elfogad egy nyitvatartáson belüli, félórás rácsra eső foglalást', () => {
    expect(check('2030-01-15T14:00', '2030-01-15T15:30')).toBeNull();
  });

  it('pontosan 3 óra még megengedett, 3,5 óra már nem (AC-05.3)', () => {
    expect(check('2030-01-16T10:00', '2030-01-16T13:00')).toBeNull();
    expect(check('2030-01-16T10:00', '2030-01-16T13:30')).toBe('error.max_duration');
  });

  it('legalább 30 perc', () => {
    expect(check('2030-01-16T10:00', '2030-01-16T10:00')).toBe('error.min_duration');
  });

  it('csak egész vagy fél órakor kezdődhet', () => {
    expect(check('2030-01-16T10:15', '2030-01-16T11:15')).toBe('error.not_on_grid');
  });

  it('elmúlt időpontra nem lehet foglalni', () => {
    expect(check('2030-01-15T09:30', '2030-01-15T10:30')).toBe('error.in_past');
  });

  it('zárva tartó napra (vasárnap) nem lehet foglalni (AC-04.3)', () => {
    expect(check('2030-01-20T10:00', '2030-01-20T11:00')).toBe('error.closed_day');
  });

  it('a nyitvatartáson kívül nem lehet foglalni', () => {
    expect(check('2030-01-16T07:30', '2030-01-16T08:30')).toBe('error.outside_opening_hours');
    expect(check('2030-01-16T19:30', '2030-01-16T20:30')).toBe('error.outside_opening_hours');
    expect(check('2030-01-16T19:00', '2030-01-16T20:00')).toBeNull();
  });

  it('az éjfélig tartó nyitvatartás (24:00) végéig lehet foglalni', () => {
    const allDay: OpeningHours[] = [{ weekday: 3, opensMin: 0, closesMin: 1440 }];
    expect(check('2030-01-16T23:00', '2030-01-17T00:00', allDay)).toBeNull();
    expect(check('2030-01-16T23:30', '2030-01-17T00:30', allDay)).toBe('error.outside_opening_hours');
  });
});

describe('isLateCancellation (AC-06.2)', () => {
  const n = new Date('2030-01-15T08:40:00Z');
  it('1 órán belül késői', () => {
    expect(isLateCancellation(new Date('2030-01-15T09:30:00Z'), n)).toBe(true);
  });
  it('pontosan 1 óra vagy több nem késői', () => {
    expect(isLateCancellation(new Date('2030-01-15T09:40:00Z'), n)).toBe(false);
    expect(isLateCancellation(new Date('2030-01-15T12:00:00Z'), n)).toBe(false);
  });
});
