import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from '../../src/db/pool.js';
import { sendDueReminders } from '../../src/jobs/reminders.js';
import { at, clock, createRoom, createUser, resetDb, setupDb, testServices } from '../helpers/db.js';

let pool: Pool;
beforeAll(async () => {
  pool = await setupDb();
});
afterAll(async () => {
  await pool.end();
});

describe('RoomService (FR-03, FR-09)', () => {
  let ctx: ReturnType<typeof testServices>;

  beforeEach(async () => {
    await resetDb(pool);
    ctx = testServices(pool);
  });

  it('épületre, férőhelyre és felszereltségre szűr; minden feltételnek teljesülnie kell (AC-03.2)', async () => {
    await createRoom(pool, { code: 'A/1', capacity: 4, equipment: ['whiteboard'] });
    await createRoom(pool, { code: 'A/2', capacity: 12, equipment: ['whiteboard', 'projector'] });
    await createRoom(pool, { code: 'K/1', capacity: 20, equipment: ['projector'], building: 'Könyvtár' });
    const codes = async (f: Parameters<typeof ctx.services.rooms.search>[0]) =>
      (await ctx.services.rooms.search(f)).map((r) => r.code);

    expect(await codes({})).toEqual(['A/1', 'A/2', 'K/1']);
    expect(await codes({ minCapacity: 10 })).toEqual(['A/2', 'K/1']);
    expect(await codes({ equipment: ['projector', 'whiteboard'] })).toEqual(['A/2']);
    const [b] = (await ctx.services.rooms.listBuildings()).filter((x) => x.name === 'Könyvtár');
    expect(await codes({ buildingId: b!.id })).toEqual(['K/1']);
    expect(await codes({ minCapacity: 50 })).toEqual([]); // AC-03.3
  });

  it('új terem nyitvatartással és felszereltséggel megjelenik a listában (AC-09.1)', async () => {
    await pool.query(`INSERT INTO buildings (name) VALUES ('C épület')`);
    const [b] = await ctx.services.rooms.listBuildings();
    const id = await ctx.services.rooms.create({
      code: 'C/201',
      name: 'Új terem',
      buildingId: b!.id,
      floor: '2. emelet',
      capacity: 8,
      equipment: ['tv'],
      hours: [{ weekday: 1, opensMin: 480, closesMin: 1440 }],
    });
    const room = await ctx.services.rooms.get(id);
    expect(room).toMatchObject({ code: 'C/201', equipment: [{ code: 'tv' }], hours: [{ weekday: 1, opensMin: 480, closesMin: 1440 }] });
    await expect(ctx.services.rooms.create({ ...room!, hours: [], equipment: [] })).rejects.toMatchObject({
      code: 'error.room_code_taken',
    });
  });

  it('inaktiváláskor a jövőbeli foglalások lemondva, a hallgatók értesítést kapnak (AC-09.2)', async () => {
    const roomId = await createRoom(pool);
    const reka = await createUser(pool, 'kovacs.reka@nye.hu');
    const bence = await createUser(pool, 'nagy.bence@nye.hu');
    await ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    await ctx.services.bookings.create(bence, roomId, at('2030-01-17T10:00'), at('2030-01-17T11:00'));
    ctx.mailer.sent.length = 0;

    expect(await ctx.services.rooms.countFutureBookings(roomId)).toBe(2);
    expect(await ctx.services.rooms.deactivate(roomId)).toBe(2);
    expect(await ctx.services.rooms.search({})).toEqual([]);
    const { rows } = await pool.query(`SELECT count(*) AS n FROM bookings WHERE status = 'cancelled'`);
    expect(rows[0].n).toBe(2);
    expect(ctx.mailer.sent.map((m) => m.to).sort()).toEqual(['kovacs.reka@nye.hu', 'nagy.bence@nye.hu']);
  });
});

describe('Emlékeztetők (FR-08)', () => {
  let ctx: ReturnType<typeof testServices>;
  let roomId: number;

  beforeEach(async () => {
    await resetDb(pool);
    ctx = testServices(pool);
    roomId = await createRoom(pool);
  });

  it('a 30 percen belül kezdődő foglalásra egyszer küld emlékeztetőt (AC-08.1)', async () => {
    const reka = await createUser(pool, 'kovacs.reka@nye.hu');
    await ctx.services.bookings.create(reka, roomId, at('2030-01-15T10:00'), at('2030-01-15T11:00')); // 20 perc múlva
    await ctx.services.bookings.create(reka, roomId, at('2030-01-15T11:00'), at('2030-01-15T12:00')); // 80 perc múlva
    ctx.mailer.sent.length = 0;

    expect(await sendDueReminders(pool, ctx.services.notifications, clock)).toBe(1);
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.sent[0]!.subject).toMatch(/^Emlékeztető/);
    expect(await sendDueReminders(pool, ctx.services.notifications, clock)).toBe(0);
  });

  it('kikapcsolt emlékeztetőnél nem küld (AC-08.2)', async () => {
    const reka = await createUser(pool, 'kovacs.reka@nye.hu');
    await ctx.services.users.updatePreferences(reka, { remindersEnabled: false, lang: 'hu' });
    await ctx.services.bookings.create(reka, roomId, at('2030-01-15T10:00'), at('2030-01-15T11:00'));
    ctx.mailer.sent.length = 0;
    expect(await sendDueReminders(pool, ctx.services.notifications, clock)).toBe(0);
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it('az angol nyelvű felhasználó angol levelet kap', async () => {
    const reka = await createUser(pool, 'kovacs.reka@nye.hu');
    await ctx.services.users.updatePreferences(reka, { remindersEnabled: true, lang: 'en' });
    await ctx.services.bookings.create(reka, roomId, at('2030-01-15T10:00'), at('2030-01-15T11:00'));
    expect(ctx.mailer.sent[0]!.subject).toMatch(/^Booking confirmation/);
  });
});
