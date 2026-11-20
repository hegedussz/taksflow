import { describe, expect, it } from 'vitest';
import {
  csvFilename,
  formatUtilizationCsv,
  resolveRange,
  type UtilizationReport,
} from '../../src/services/statisticsService.js';

const now = new Date('2030-01-15T08:40:00Z'); // kedd

describe('resolveRange (AC-10.1)', () => {
  it('alapértelmezésben az előző hét hétfőtől vasárnapig', () => {
    expect(resolveRange(undefined, undefined, undefined, now)).toEqual({ preset: 'prevweek', from: '2030-01-07', to: '2030-01-13' });
  });

  it('elmúlt 30 nap a mai nap nélkül', () => {
    expect(resolveRange('last30', undefined, undefined, now)).toEqual({ preset: 'last30', from: '2029-12-16', to: '2030-01-14' });
  });

  it('egyéni időszak, legfeljebb 92 nap', () => {
    expect(resolveRange('custom', '2030-01-01', '2030-01-31', now)).toMatchObject({ from: '2030-01-01', to: '2030-01-31' });
    expect(resolveRange('custom', '2030-01-01', '2030-04-02', now).to).toBe('2030-04-02'); // 92 nap
    expect(() => resolveRange('custom', '2030-01-01', '2030-04-03', now)).toThrow('error.stats_range_too_long');
  });

  it('a záró dátum nem lehet korábbi, és a dátumnak érvényesnek kell lennie', () => {
    expect(() => resolveRange('custom', '2030-01-10', '2030-01-09', now)).toThrow('error.stats_range_order');
    expect(() => resolveRange('custom', '2030-02-30', '2030-03-01', now)).toThrow('error.stats_range_invalid');
    expect(() => resolveRange('custom', undefined, '2030-03-01', now)).toThrow('error.stats_range_invalid');
  });
});

describe('formatUtilizationCsv (AC-10.2)', () => {
  const report: UtilizationReport = {
    from: '2030-01-07',
    to: '2030-01-13',
    rows: [
      { roomId: 1, code: 'A/104', name: 'Csendes; "nagy" terem', buildingName: 'A épület', active: true, openMinutes: 3600, bookedMinutes: 2310, bookings: 21, percent: 64.1666 },
      { roomId: 2, code: 'B/112', name: 'Kis csoportszoba', buildingName: 'B épület', active: false, openMinutes: 3000, bookedMinutes: 0, bookings: 0, percent: 0 },
    ],
    totals: { openMinutes: 6600, bookedMinutes: 2310, bookings: 21, percent: 35 },
  };
  const csv = formatUtilizationCsv(report);

  it('UTF-8 BOM-mal, pontosvesszővel és CRLF sorvégekkel készül', () => {
    expect(csv.startsWith('﻿terem_kod;terem_neve;epulet;nyitvatartas_ora;foglalt_ora;foglalasok_szama;kihasznaltsag_szazalek\r\n')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('tizedesvesszőt használ, és idézőjelbe teszi a pontosvesszőt tartalmazó mezőt', () => {
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toBe('A/104;"Csendes; ""nagy"" terem";A épület;60;38,5;21;64,2');
    expect(lines[2]).toBe('B/112;Kis csoportszoba;B épület;50;0;0;0,0');
  });

  it('a fájlnév tartalmazza az időszakot', () => {
    expect(csvFilename(report)).toBe('studyroom_kihasznaltsag_2030-01-07_2030-01-13.csv');
  });
});
