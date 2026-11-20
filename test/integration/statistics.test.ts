import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from '../../src/db/pool.js';
import { at, createRoom, createUser, resetDb, setupDb, testServices } from '../helpers/db.js';
import { agentFor, createTestApp } from '../helpers/app.js';

let pool: Pool;
beforeAll(async () => {
  pool = await setupDb();
});
afterAll(async () => {
  await pool.end();
});

/** Foglalás közvetlenül az adatbázisba, hogy múltbeli időpont is beírható legyen. */
async function book(roomId: number, userId: number, start: string, end: string, status = 'active') {
  await pool.query(
    `INSERT INTO bookings (room_id, user_id, period, status) VALUES ($1, $2, tstzrange($3, $4, '[)'), $5)`,
    [roomId, userId, at(start), at(end), status],
  );
}

describe('StatisticsService.utilization (FR-10, AC-10.1)', () => {
  let ctx: ReturnType<typeof testServices>;
  let reka: number;

  beforeEach(async () => {
    await resetDb(pool);
    ctx = testServices(pool);
    reka = await createUser(pool);
  });

  it('a foglalt és a nyitvatartási órák arányát adja, a lemondott foglalás kimarad', async () => {
    // Hétköznap 8–20 (12 óra), az előző héten 5 × 12 = 60 nyitvatartási óra
    const room = await createRoom(pool, { code: 'A/104', hours: [1, 2, 3, 4, 5].map((d) => [d, '08:00', '20:00']) });
    await book(room, reka, '2030-01-07T10:00', '2030-01-07T13:00'); // 3 óra
    await book(room, reka, '2030-01-08T10:00', '2030-01-08T13:00'); // 3 óra
    await book(room, reka, '2030-01-09T10:00', '2030-01-09T13:00', 'cancelled'); // nem számít

    const report = await ctx.services.statistics.utilization('2030-01-07', '2030-01-13');
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ code: 'A/104', openMinutes: 3600, bookedMinutes: 360, bookings: 2, percent: 10 });
    expect(report.totals).toMatchObject({ openMinutes: 3600, bookedMinutes: 360, bookings: 2, percent: 10 });
  });

  it('az időszak határán átnyúló foglalásból csak a metszet számít (helyi idő szerint)', async () => {
    const room = await createRoom(pool); // minden nap 0–24
    await book(room, reka, '2030-01-06T23:00', '2030-01-07T01:00'); // vasárnap 23 → hétfő 1
    await book(room, reka, '2030-01-13T23:30', '2030-01-14T00:30'); // vasárnap 23:30 → hétfő 0:30
    const [row] = (await ctx.services.statistics.utilization('2030-01-07', '2030-01-13')).rows;
    expect(row!.bookedMinutes).toBe(60 + 30);
    expect(row!.openMinutes).toBe(7 * 24 * 60);
  });

  it('a zárva tartó napok nem számítanak bele a nyitvatartásba, és rendez kihasználtság szerint', async () => {
    const mondayOnly = await createRoom(pool, { code: 'H/1', hours: [[1, '08:00', '12:00']] });
    const weekdays = await createRoom(pool, { code: 'W/1', hours: [1, 2, 3, 4, 5].map((d) => [d, '08:00', '12:00']) });
    await createRoom(pool, { code: 'Z/1', hours: [[7, '10:00', '12:00']] }); // csak vasárnap: nem jelenik meg hétköznapra
    await book(mondayOnly, reka, '2030-01-07T08:00', '2030-01-07T10:00'); // 2/4 óra = 50%
    await book(weekdays, reka, '2030-01-07T08:00', '2030-01-07T10:00'); // 2/20 óra = 10%
    const report = await ctx.services.statistics.utilization('2030-01-07', '2030-01-11');
    expect(report.rows.map((r) => [r.code, r.openMinutes, r.percent])).toEqual([
      ['H/1', 240, 50],
      ['W/1', 1200, 10],
    ]);
  });
});

describe('Statisztika oldal és CSV-export (AC-10.1, AC-10.2)', () => {
  let t: ReturnType<typeof createTestApp>;
  let reka: number;
  let admin: number;

  beforeEach(async () => {
    await resetDb(pool);
    t = createTestApp(pool);
    reka = await createUser(pool, 'kovacs.reka@nye.hu');
    admin = await createUser(pool, 'szabo.marta@nye.hu', 'admin');
    const room = await createRoom(pool, { code: 'A/104', hours: [1, 2, 3, 4, 5].map((d) => [d, '08:00', '20:00']) });
    await book(room, reka, '2030-01-07T10:00', '2030-01-07T13:00');
  });

  it('hallgatónak 403 az oldal és az export is', async () => {
    const { agent } = await agentFor(t.app, reka);
    await agent.get('/admin/stats').expect(403);
    await agent.get('/admin/stats.csv').expect(403);
  });

  it('adminnak megjeleníti az előző hét kihasználtságát', async () => {
    const { agent } = await agentFor(t.app, admin);
    const res = await agent.get('/admin/stats').expect(200);
    expect(res.text).toContain('A/104');
    expect(res.text).toContain('5%'); // 3 / 60 óra
    expect(res.text).toContain('href="/admin/stats.csv?preset=prevweek&amp;from=2030-01-07&amp;to=2030-01-13"');
  });

  it('hibás egyéni időszakra 422 és érthető üzenet', async () => {
    const { agent } = await agentFor(t.app, admin);
    const res = await agent.get('/admin/stats?preset=custom&from=2030-01-10&to=2030-01-01').expect(422);
    expect(res.text).toContain('A záró dátum nem lehet korábbi a kezdő dátumnál.');
  });

  it('a CSV letöltésként érkezik, a megjelenített adatokkal', async () => {
    const { agent } = await agentFor(t.app, admin);
    const res = await agent.get('/admin/stats.csv?preset=custom&from=2030-01-07&to=2030-01-13').expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toContain('studyroom_kihasznaltsag_2030-01-07_2030-01-13.csv');
    expect(res.text).toContain('A/104;A/104 terem;A épület;60;3;1;5,0');
  });
});
