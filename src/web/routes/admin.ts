import { Router } from 'express';
import { requireAdmin } from '../../auth/guards.js';
import { AppError, NotFoundError } from '../../domain/errors.js';
import type { OpeningHours } from '../../domain/rules.js';
import { SLOT_MINUTES, minutesToTime, timeToMinutes } from '../../domain/time.js';
import type { Services } from '../../services/index.js';
import type { Room, RoomInput } from '../../services/roomService.js';
import { ah, arrayParam, intParam } from './util.js';

interface Deps {
  services: Services;
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const TIME_RE = /^([01]\d|2[0-4]):([0-5]\d)$/;

export interface RoomFormValues {
  code: string;
  name: string;
  buildingId: string;
  floor: string;
  capacity: string;
  equipment: string[];
  days: { weekday: number; open: boolean; opens: string; closes: string }[];
}

/** FR-09: termek kezelése (K-12, K-13). Minden útvonal adminisztrátori jogot kér (AC-09.3). */
export function adminRoutes({ services }: Deps): Router {
  const { rooms } = services;
  const r = Router();
  r.use(requireAdmin);

  r.get(
    '/rooms',
    ah(async (req, res) => {
      res.render('admin/rooms.njk', {
        rooms: await rooms.listAll(),
        saved: req.query.saved,
        deactivated: req.query.deactivated,
        activated: req.query.activated,
      });
    }),
  );

  const renderForm = async (res: import('express').Response, values: RoomFormValues, id: number | null, errors = {}, status = 200) =>
    res.status(status).render('admin/room-form.njk', {
      values,
      id,
      errors,
      buildings: await rooms.listBuildings(),
      equipment: await rooms.listEquipment(),
    });

  r.get(
    '/rooms/new',
    ah(async (_req, res) => {
      await renderForm(res, emptyValues(), null);
    }),
  );

  r.get(
    '/rooms/:id/edit',
    ah(async (req, res) => {
      const room = await rooms.get(Number(req.params.id));
      if (!room) throw new NotFoundError();
      await renderForm(res, valuesFromRoom(room), room.id);
    }),
  );

  const save = (id: number | null) =>
    ah(async (req, res) => {
      const { values, input, errors } = parseRoomForm(req.body as Record<string, unknown>);
      if (!input) return renderForm(res, values, id, errors, 422);
      try {
        if (id === null) await rooms.create(input);
        else await rooms.update(id, input);
      } catch (err) {
        if (err instanceof AppError && err.code === 'error.room_code_taken') {
          return renderForm(res, values, id, { code: err.code }, 422);
        }
        throw err;
      }
      res.redirect(303, `/admin/rooms?saved=${encodeURIComponent(input.code)}`);
    });

  r.post('/rooms', save(null));
  r.post('/rooms/:id', (req, res, next) => save(Number(req.params.id))(req, res, next));

  r.get(
    '/rooms/:id/deactivate',
    ah(async (req, res) => {
      const room = await rooms.get(Number(req.params.id));
      if (!room) throw new NotFoundError();
      res.render('admin/room-deactivate.njk', { room, count: await rooms.countFutureBookings(room.id) });
    }),
  );

  r.post(
    '/rooms/:id/deactivate',
    ah(async (req, res) => {
      const n = await rooms.deactivate(Number(req.params.id));
      res.redirect(303, `/admin/rooms?deactivated=${n}`);
    }),
  );

  r.post(
    '/rooms/:id/activate',
    ah(async (req, res) => {
      await rooms.activate(Number(req.params.id));
      res.redirect(303, '/admin/rooms?activated=1');
    }),
  );

  return r;
}

function emptyValues(): RoomFormValues {
  return {
    code: '',
    name: '',
    buildingId: '',
    floor: '',
    capacity: '',
    equipment: [],
    days: WEEKDAYS.map((weekday) => ({ weekday, open: weekday <= 5, opens: '08:00', closes: '20:00' })),
  };
}

function valuesFromRoom(room: Room): RoomFormValues {
  return {
    code: room.code,
    name: room.name,
    buildingId: String(room.buildingId),
    floor: room.floor,
    capacity: String(room.capacity),
    equipment: room.equipment.map((e) => e.code),
    days: WEEKDAYS.map((weekday) => {
      const h = room.hours.find((x) => x.weekday === weekday);
      return {
        weekday,
        open: Boolean(h),
        opens: minutesToTime(h?.opensMin ?? 480),
        closes: minutesToTime(h?.closesMin ?? 1200),
      };
    }),
  };
}

export function parseRoomForm(body: Record<string, unknown>): {
  values: RoomFormValues;
  input?: RoomInput;
  errors: Record<string, string>;
} {
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
  const values: RoomFormValues = {
    code: str('code'),
    name: str('name'),
    buildingId: str('buildingId'),
    floor: str('floor'),
    capacity: str('capacity'),
    equipment: arrayParam(body.equipment),
    days: WEEKDAYS.map((weekday) => ({
      weekday,
      open: body[`open_${weekday}`] === 'on',
      opens: str(`opens_${weekday}`) || '08:00',
      closes: str(`closes_${weekday}`) || '20:00',
    })),
  };
  const errors: Record<string, string> = {};
  if (!values.code || values.code.length > 20) errors.code = 'admin.error.code';
  if (!values.name || values.name.length > 100) errors.name = 'admin.error.name';
  if (values.floor.length > 50) errors.floor = 'admin.error.floor';
  const buildingId = intParam(values.buildingId);
  if (buildingId === undefined) errors.buildingId = 'admin.error.building';
  const capacity = intParam(values.capacity);
  if (capacity === undefined || capacity < 1 || capacity > 200) errors.capacity = 'admin.error.capacity';

  const hours: OpeningHours[] = [];
  for (const d of values.days) {
    if (!d.open) continue;
    if (!TIME_RE.test(d.opens) || !TIME_RE.test(d.closes)) {
      errors.hours = 'admin.error.hours';
      continue;
    }
    const opensMin = timeToMinutes(d.opens);
    const closesMin = timeToMinutes(d.closes);
    if (opensMin >= closesMin || closesMin > 1440 || opensMin % SLOT_MINUTES || closesMin % SLOT_MINUTES) {
      errors.hours = 'admin.error.hours';
      continue;
    }
    hours.push({ weekday: d.weekday, opensMin, closesMin });
  }
  if (Object.keys(errors).length) return { values, errors };
  return {
    values,
    errors,
    input: {
      code: values.code,
      name: values.name,
      buildingId: buildingId!,
      floor: values.floor,
      capacity: capacity!,
      equipment: values.equipment,
      hours,
    },
  };
}
