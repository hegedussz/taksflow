import { Router, type Request, type Response } from 'express';
import { DateTime } from 'luxon';
import { requireUser } from '../../auth/guards.js';
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../../domain/errors.js';
import { validateBookingWindow } from '../../domain/rules.js';
import {
  MAX_ACTIVE_BOOKINGS,
  MAX_BOOKING_MINUTES,
  SLOT_MINUTES,
  ZONE,
  minutesToTime,
  parseLocal,
  toLocal,
  weekStartOf,
  type Clock,
} from '../../domain/time.js';
import type { Services } from '../../services/index.js';
import { isLang } from '../i18n.js';
import { buildWeekGrid, type Selection } from '../calendar.js';
import { ah, arrayParam, currentUser, intParam } from './util.js';

interface Deps {
  services: Services;
  clock: Clock;
}

const MAX_WEEKS_AHEAD = 8;
const DURATIONS = Array.from({ length: MAX_BOOKING_MINUTES / SLOT_MINUTES }, (_, i) => (i + 1) * SLOT_MINUTES);
const isoLocal = (dt: DateTime) => dt.toISO({ suppressMilliseconds: true, suppressSeconds: true, includeOffset: false })!;

export function pageRoutes({ services, clock }: Deps): Router {
  const { rooms, bookings, users } = services;
  const r = Router();

  // Nyitóoldal (vendég) vagy kezdőlap (hallgató), adminisztrátornak a teremkezelés.
  r.get(
    '/',
    ah(async (req, res) => {
      if (!req.user) return res.render('pages/landing.njk');
      if (req.user.role === 'admin') return res.redirect('/admin/rooms');
      const [upcoming, activeCount] = await Promise.all([
        bookings.upcoming(req.user.id),
        bookings.activeFutureCount(req.user.id),
      ]);
      res.render('pages/dashboard.njk', { upcoming, activeCount, maxActive: MAX_ACTIVE_BOOKINGS, now: clock() });
    }),
  );

  // FR-03: termek böngészése és szűrése
  r.get(
    '/rooms',
    requireUser,
    ah(async (req, res) => {
      const filter = {
        buildingId: intParam(req.query.building),
        minCapacity: intParam(req.query.capacity),
        equipment: arrayParam(req.query.equipment).slice(0, 10),
      };
      const [list, buildings, equipment] = await Promise.all([
        rooms.search(filter),
        rooms.listBuildings(),
        rooms.listEquipment(),
      ]);
      const filtered = filter.buildingId !== undefined || filter.minCapacity !== undefined || filter.equipment.length > 0;
      res.render('pages/rooms.njk', { rooms: list, buildings, equipment, filter, filtered });
    }),
  );

  // FR-04 + FR-05: a terem heti naptára és a foglalási panel
  r.get(
    '/rooms/:id',
    requireUser,
    ah(async (req, res) => {
      const selection = selectionFrom(req.query.start, req.query.dur);
      await renderRoom(req, res, { selection });
    }),
  );

  // FR-05 2. lépés: összefoglaló a megerősítés előtt (K-08)
  r.get(
    '/bookings/new',
    requireUser,
    ah(async (req, res) => {
      const roomId = intParam(req.query.room);
      const selection = selectionFrom(req.query.start, req.query.dur);
      const room = roomId !== undefined ? await rooms.get(roomId) : null;
      if (!room || !room.active) throw new NotFoundError();
      if (!selection) throw new BadRequestError();
      const error = await precheck(room.id, room.hours, selection);
      res.render('pages/booking-confirm.njk', {
        room,
        selection,
        start: selection.start.toJSDate(),
        end: selection.start.plus({ minutes: selection.minutes }).toJSDate(),
        reminderAt: selection.start.minus({ minutes: 30 }).toJSDate(),
        startValue: isoLocal(selection.start),
        week: selection.start.startOf('week').toISODate(),
        error,
      });
    }),
  );

  // FR-05 3. lépés: mentés. Ütközésnél 409, korlát túllépésénél 422 (szekvenciadiagram).
  r.post(
    '/bookings',
    requireUser,
    ah(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const roomId = intParam(body.roomId);
      const selection = selectionFrom(body.start, body.dur);
      if (roomId === undefined || !selection) throw new BadRequestError();
      const end = selection.start.plus({ minutes: selection.minutes });
      try {
        const b = await bookings.create(currentUser(req).id, roomId, selection.start.toJSDate(), end.toJSDate());
        res.redirect(303, `/rooms/${roomId}?week=${selection.start.startOf('week').toISODate()}&booked=${b.id}`);
      } catch (err) {
        if (err instanceof AppError && (err.status === 409 || err.status === 422)) {
          req.params.id = String(roomId);
          // Ütközés után a kijelölést elvetjük, hogy a frissített naptárból válasszon újat (AC-05.2).
          await renderRoom(req, res, {
            selection: err.status === 409 ? undefined : selection,
            week: selection.start,
            status: err.status,
            error: err.code,
          });
          return;
        }
        throw err;
      }
    }),
  );

  // FR-06: lemondás megerősítése (K-10) és végrehajtása
  r.get(
    '/bookings/:id/cancel',
    requireUser,
    ah(async (req, res) => {
      const b = await bookings.get(Number(req.params.id));
      if (!b) throw new NotFoundError();
      if (b.userId !== currentUser(req).id) throw new ForbiddenError('error.not_your_booking'); // AC-06.3
      if (b.status !== 'active' || b.end <= clock()) return res.redirect('/my/bookings');
      const minutesLeft = Math.round((b.start.getTime() - clock().getTime()) / 60_000);
      res.render('pages/booking-cancel.njk', { b, minutesLeft, late: minutesLeft < 60 });
    }),
  );

  r.post(
    '/bookings/:id/cancel',
    requireUser,
    ah(async (req, res) => {
      const { late } = await bookings.cancel(currentUser(req).id, Number(req.params.id));
      res.redirect(303, `/my/bookings?cancelled=${late ? 'late' : '1'}`);
    }),
  );

  // FR-07: saját foglalások
  r.get(
    '/my/bookings',
    requireUser,
    ah(async (req, res) => {
      const tab = req.query.tab === 'history' ? 'history' : 'upcoming';
      const id = currentUser(req).id;
      const [upcoming, history, activeCount] = await Promise.all([
        bookings.upcoming(id),
        tab === 'history' ? bookings.history(id) : Promise.resolve([]),
        bookings.activeFutureCount(id),
      ]);
      res.render('pages/my-bookings.njk', {
        tab,
        upcoming,
        history,
        activeCount,
        maxActive: MAX_ACTIVE_BOOKINGS,
        cancelled: req.query.cancelled,
        now: clock(),
      });
    }),
  );

  // Profil: emlékeztetők (AC-08.2), nyelv (NFR-07), adatexport (NFR-04)
  r.get('/profile', requireUser, (req, res) => {
    res.render('pages/profile.njk', { saved: req.query.saved === '1' });
  });

  r.post(
    '/profile',
    requireUser,
    ah(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const lang = isLang(body.lang) ? body.lang : currentUser(req).lang;
      await users.updatePreferences(currentUser(req).id, { remindersEnabled: body.reminders === 'on', lang });
      res.cookie('lang', lang, { maxAge: 365 * 86_400_000, sameSite: 'lax', httpOnly: true });
      res.redirect(303, '/profile?saved=1');
    }),
  );

  r.get(
    '/profile/export',
    requireUser,
    ah(async (req, res) => {
      const data = await users.exportData(currentUser(req).id);
      res.attachment('studyroom-adataim.json').json(data);
    }),
  );

  return r;

  /** A heti naptár és a foglalási panel összeállítása. */
  async function renderRoom(
    req: Request,
    res: Response,
    opts: { selection?: Selection; week?: DateTime; status?: number; error?: string },
  ): Promise<void> {
    const user = currentUser(req);
    const room = await rooms.get(Number(req.params.id));
    if (!room || (!room.active && user.role !== 'admin')) throw new NotFoundError();

    const now = clock();
    const thisWeek = weekStartOf(toLocal(now));
    const requested = opts.week ?? opts.selection?.start ?? parseLocal(req.query.week);
    let week = requested ? weekStartOf(requested) : thisWeek;
    if (week < thisWeek) week = thisWeek;
    const lastWeek = thisWeek.plus({ weeks: MAX_WEEKS_AHEAD });
    if (week > lastWeek) week = lastWeek;

    const slots = await bookings.slots(room.id, week.toJSDate(), week.plus({ weeks: 1 }).toJSDate());
    const grid = buildWeekGrid(room.hours, week, slots, now, user.id, opts.selection);
    const sel = opts.selection;

    let panel = null;
    if (sel) {
      const end = sel.start.plus({ minutes: sel.minutes });
      const overlaps = slots.some((s) => s.start < end.toJSDate() && sel.start.toJSDate() < s.end);
      const ruleError = validateBookingWindow(sel.start, end, toLocal(now), room.hours);
      const day = room.hours.find((h) => h.weekday === sel.start.weekday);
      const startOptions: { value: string; label: string; selected: boolean }[] = [];
      if (day) {
        for (let m = day.opensMin; m < day.closesMin; m += SLOT_MINUTES) {
          const at = sel.start.startOf('day').set({ hour: Math.floor(m / 60), minute: m % 60 });
          if (at.toJSDate() < now) continue;
          startOptions.push({ value: isoLocal(at), label: minutesToTime(m).replace(/^0/, ''), selected: at.equals(sel.start) });
        }
      }
      panel = {
        start: sel.start.toJSDate(),
        end: end.toJSDate(),
        minutes: sel.minutes,
        startValue: isoLocal(sel.start),
        startOptions,
        durations: DURATIONS,
        error: ruleError ?? (overlaps ? 'error.overlaps_existing' : null),
      };
    }

    let booked = null;
    const bookedId = intParam(req.query.booked);
    if (bookedId !== undefined) {
      const b = await bookings.get(bookedId);
      if (b && b.userId === user.id && b.roomId === room.id) booked = b;
    }

    res.status(opts.status ?? 200).render('pages/room.njk', {
      room,
      grid,
      panel,
      booked,
      error: opts.error,
      week: week.toISODate(),
      weekEnd: week.plus({ days: 6 }).toJSDate(),
      weekStart: week.toJSDate(),
      weekNumber: week.weekNumber,
      prevWeek: week > thisWeek ? week.minus({ weeks: 1 }).toISODate() : null,
      nextWeek: week < lastWeek ? week.plus({ weeks: 1 }).toISODate() : null,
      activeCount: await bookings.activeFutureCount(user.id),
      maxActive: MAX_ACTIVE_BOOKINGS,
    });
  }

  async function precheck(roomId: number, hours: Parameters<typeof validateBookingWindow>[3], sel: Selection) {
    const end = sel.start.plus({ minutes: sel.minutes });
    const rule = validateBookingWindow(sel.start, end, toLocal(clock()), hours);
    if (rule) return rule;
    const slots = await bookings.slots(roomId, sel.start.toJSDate(), end.toJSDate());
    return slots.length ? 'error.overlaps_existing' : null;
  }
}

function selectionFrom(start: unknown, dur: unknown): Selection | undefined {
  const s = parseLocal(start);
  if (!s) return undefined;
  const minutes = intParam(dur) ?? 60;
  if (minutes < SLOT_MINUTES || minutes > 24 * 60) return undefined;
  return { start: s.setZone(ZONE), minutes };
}
