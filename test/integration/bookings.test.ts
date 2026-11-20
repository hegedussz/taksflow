import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from '../../src/db/pool.js';
import { BookingLimitError, ForbiddenError, RuleError, SlotUnavailableError } from '../../src/domain/errors.js';
import { at, createRoom, createUser, resetDb, setupDb, testServices } from '../helpers/db.js';

let pool: Pool;
beforeAll(async () => {
  pool = await setupDb();
});
afterAll(async () => {
  await pool.end();
});

describe('BookingService – ütközések és korlátok (ADR-0001, FR-05)', () => {
  let ctx: ReturnType<typeof testServices>;
  let roomId: number;
  let reka: number;

  beforeEach(async () => {
    await resetDb(pool);
    ctx = testServices(pool);
    roomId = await createRoom(pool);
    reka = await createUser(pool, 'kovacs.reka@nye.hu');
  });

  it('elmenti a foglalást és visszaigazoló e-mailt küld (AC-05.1)', async () => {
    const b = await ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:30'));
    expect(b).toMatchObject({ roomId, userId: reka, status: 'active' });
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.sent[0]!.subject).toContain('Foglalás visszaigazolása');
  });

  it('N párhuzamos kérésből ugyanarra a sávra pontosan 1 sikeres, a többi ütközik (AC-05.2)', async () => {
    const N = 10;
    const users = await Promise.all(Array.from({ length: N }, (_, i) => createUser(pool, `hallgato${i}@nye.hu`)));
    const results = await Promise.allSettled(
      users.map((u) => ctx.services.bookings.create(u, roomId, at('2030-01-16T10:00'), at('2030-01-16T12:00'))),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter((r) => r.status === 'rejected' && r.reason instanceof SlotUnavailableError);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(N - 1);
    const { rows } = await pool.query(`SELECT count(*) AS n FROM bookings WHERE status = 'active'`);
    expect(rows[0].n).toBe(1);
  });

  it('a szomszédos sávok (10–11 és 11–12) nem ütköznek, a részben átfedők igen', async () => {
    const other = await createUser(pool, 'nagy.bence@nye.hu');
    await ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    await expect(
      ctx.services.bookings.create(other, roomId, at('2030-01-16T11:00'), at('2030-01-16T12:00')),
    ).resolves.toBeTruthy();
    const third = await createUser(pool, 'harmadik@nye.hu');
    await expect(
      ctx.services.bookings.create(third, roomId, at('2030-01-16T10:30'), at('2030-01-16T11:30')),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it('a lemondott foglalás idősávja újra foglalható', async () => {
    const other = await createUser(pool, 'nagy.bence@nye.hu');
    const b = await ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    await ctx.services.bookings.cancel(reka, b.id);
    await expect(
      ctx.services.bookings.create(other, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00')),
    ).resolves.toBeTruthy();
  });

  it('a 3 óránál hosszabb foglalást a szolgáltatás és az adatbázis is elutasítja (AC-05.3)', async () => {
    await expect(
      ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T13:30')),
    ).rejects.toMatchObject({ code: 'error.max_duration' });
    await expect(
      pool.query(`INSERT INTO bookings (room_id, user_id, period) VALUES ($1, $2, tstzrange($3, $4, '[)'))`, [
        roomId,
        reka,
        at('2030-01-16T10:00'),
        at('2030-01-16T13:30'),
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('a harmadik aktív jövőbeli foglalást elutasítja (AC-05.4)', async () => {
    await ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    await ctx.services.bookings.create(reka, roomId, at('2030-01-17T10:00'), at('2030-01-17T11:00'));
    await expect(
      ctx.services.bookings.create(reka, roomId, at('2030-01-18T10:00'), at('2030-01-18T11:00')),
    ).rejects.toBeInstanceOf(BookingLimitError);
  });

  it('ugyanannak a felhasználónak a párhuzamos kérései sem lépik túl a korlátot', async () => {
    const rooms = await Promise.all([1, 2, 3, 4].map((i) => createRoom(pool, { code: `T/${i}` })));
    const results = await Promise.allSettled(
      rooms.map((r) => ctx.services.bookings.create(reka, r, at('2030-01-16T10:00'), at('2030-01-16T11:00'))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof BookingLimitError)).toHaveLength(2);
  });

  it('a már lezajlott foglalás nem számít bele a korlátba', async () => {
    await pool.query(`INSERT INTO bookings (room_id, user_id, period) VALUES ($1, $2, tstzrange($3, $4, '[)'))`, [
      roomId,
      reka,
      at('2030-01-14T10:00'),
      at('2030-01-14T11:00'),
    ]);
    await ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    await expect(
      ctx.services.bookings.create(reka, roomId, at('2030-01-17T10:00'), at('2030-01-17T11:00')),
    ).resolves.toBeTruthy();
  });

  it('inaktív teremre és nyitvatartáson kívülre nem foglal', async () => {
    const closed = await createRoom(pool, { code: 'B/1', hours: [[1, '08:00', '20:00']] });
    await expect(
      ctx.services.bookings.create(reka, closed, at('2030-01-16T10:00'), at('2030-01-16T11:00')),
    ).rejects.toMatchObject({ code: 'error.closed_day' });
    await pool.query('UPDATE rooms SET active = FALSE WHERE id = $1', [roomId]);
    await expect(
      ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00')),
    ).rejects.toBeInstanceOf(RuleError);
  });
});

describe('BookingService – lemondás és lista (FR-06, FR-07)', () => {
  let ctx: ReturnType<typeof testServices>;
  let roomId: number;
  let reka: number;

  beforeEach(async () => {
    await resetDb(pool);
    ctx = testServices(pool);
    roomId = await createRoom(pool);
    reka = await createUser(pool, 'kovacs.reka@nye.hu');
  });

  it('több mint 1 órával a kezdés előtt normál lemondás (AC-06.1)', async () => {
    const b = await ctx.services.bookings.create(reka, roomId, at('2030-01-15T11:00'), at('2030-01-15T12:00'));
    expect(await ctx.services.bookings.cancel(reka, b.id)).toEqual({ late: false });
    expect(await ctx.services.bookings.get(b.id)).toMatchObject({ status: 'cancelled', lateCancellation: false });
  });

  it('1 órán belül késői lemondásként rögzíti (AC-06.2)', async () => {
    const b = await ctx.services.bookings.create(reka, roomId, at('2030-01-15T10:00'), at('2030-01-15T11:00'));
    expect(await ctx.services.bookings.cancel(reka, b.id)).toEqual({ late: true });
    expect(await ctx.services.bookings.get(b.id)).toMatchObject({ lateCancellation: true });
  });

  it('más foglalását nem mondhatja le (AC-06.3)', async () => {
    const other = await createUser(pool, 'nagy.bence@nye.hu');
    const b = await ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    await expect(ctx.services.bookings.cancel(other, b.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('közelgő foglalások kezdés szerint, előzmények az elmúlt 90 napból (AC-07.1, AC-07.2)', async () => {
    const later = await ctx.services.bookings.create(reka, roomId, at('2030-01-17T10:00'), at('2030-01-17T11:00'));
    const sooner = await ctx.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    const insert = (s: string, e: string) =>
      pool.query(`INSERT INTO bookings (room_id, user_id, period) VALUES ($1, $2, tstzrange($3, $4, '[)'))`, [
        roomId,
        reka,
        at(s),
        at(e),
      ]);
    await insert('2030-01-10T10:00', '2030-01-10T11:00'); // 5 napja
    await insert('2029-09-01T10:00', '2029-09-01T11:00'); // 90 napnál régebbi
    expect((await ctx.services.bookings.upcoming(reka)).map((b) => b.id)).toEqual([sooner.id, later.id]);
    const history = await ctx.services.bookings.history(reka);
    expect(history).toHaveLength(1);
    expect(history[0]!.start).toEqual(at('2030-01-10T10:00'));
  });
});
