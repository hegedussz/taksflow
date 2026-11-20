import { Router } from 'express';
import { requireUser } from '../../auth/guards.js';
import { BadRequestError, NotFoundError } from '../../domain/errors.js';
import type { Clock } from '../../domain/time.js';
import type { Services } from '../../services/index.js';
import type { Booking } from '../../services/bookingService.js';
import { ah, intParam } from './util.js';

interface Deps {
  services: Services;
  clock: Clock;
}

const parseDate = (v: unknown): Date | undefined => {
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const toJson = (b: Booking) => ({
  id: b.id,
  roomId: b.roomId,
  roomCode: b.roomCode,
  start: b.start.toISOString(),
  end: b.end.toISOString(),
  status: b.status,
  lateCancellation: b.lateCancellation,
});

/**
 * JSON API a szekvenciadiagram szerint: POST /api/bookings → 201 / 409 / 422.
 * A hibákat az app közös hibakezelője alakítja { error, message } válasszá.
 */
export function apiRoutes({ services }: Deps): Router {
  const { bookings, rooms } = services;
  const r = Router();
  r.use(requireUser);

  r.post(
    '/bookings',
    ah(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const roomId = typeof body.roomId === 'number' ? body.roomId : intParam(body.roomId);
      const start = parseDate(body.start);
      const end = parseDate(body.end);
      if (roomId === undefined || !start || !end) throw new BadRequestError();
      const b = await bookings.create(req.user!.id, roomId, start, end);
      res.status(201).json(toJson(b));
    }),
  );

  r.delete(
    '/bookings/:id',
    ah(async (req, res) => {
      const result = await bookings.cancel(req.user!.id, Number(req.params.id));
      res.json(result);
    }),
  );

  r.get(
    '/me/bookings',
    ah(async (req, res) => {
      res.json((await bookings.upcoming(req.user!.id)).map(toJson));
    }),
  );

  // A terem foglaltsága egy időszakra; más foglalóját nem adjuk ki, csak azt, hogy saját-e.
  r.get(
    '/rooms/:id/bookings',
    ah(async (req, res) => {
      const room = await rooms.get(Number(req.params.id));
      if (!room || !room.active) throw new NotFoundError();
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      if (!from || !to || to <= from || to.getTime() - from.getTime() > 31 * 86_400_000) throw new BadRequestError();
      const slots = await bookings.slots(room.id, from, to);
      res.json(slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), mine: s.userId === req.user!.id })));
    }),
  );

  return r;
}
