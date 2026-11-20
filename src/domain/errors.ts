/**
 * Tartományi hibák. A `code` egyben a felhasználónak megjelenő üzenet fordítási kulcsa,
 * a `status` pedig a HTTP-válaszkód (a szekvenciadiagram szerint 409 és 422).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

/** AC-05.2: az idősávot közben más lefoglalta (PostgreSQL 23P01). */
export class SlotUnavailableError extends AppError {
  constructor() {
    super(409, 'error.slot_unavailable');
  }
}

/** AC-05.4: már 2 aktív jövőbeli foglalás van. */
export class BookingLimitError extends AppError {
  constructor() {
    super(422, 'error.booking_limit');
  }
}

/** Üzleti szabály megsértése (pl. 3 óránál hosszabb foglalás, zárva tartó terem). */
export class RuleError extends AppError {
  constructor(code: string) {
    super(422, code);
  }
}

export class BadRequestError extends AppError {
  constructor(code = 'error.bad_request') {
    super(400, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = 'error.forbidden') {
    super(403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(code = 'error.not_found') {
    super(404, code);
  }
}
