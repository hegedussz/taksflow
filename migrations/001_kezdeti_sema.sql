-- StudyRoom kezdeti adatbázisséma
-- Tartománymodell: docs/architecture/osztalydiagram.png
-- Foglalási ütközések kizárása: docs/architecture/adr/0001-foglalasi-utkozesek-kezelese.md
-- Bejelentkezés SAML2-vel (eduID), ezért jelszót nem tárolunk: ADR-0003

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE buildings (
    id      BIGSERIAL PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL DEFAULT ''
);

CREATE TABLE equipment (
    id      BIGSERIAL PRIMARY KEY,
    code    TEXT NOT NULL UNIQUE,
    name_hu TEXT NOT NULL,
    name_en TEXT NOT NULL
);

CREATE TABLE rooms (
    id          BIGSERIAL   PRIMARY KEY,
    building_id BIGINT      NOT NULL REFERENCES buildings (id),
    code        TEXT        NOT NULL UNIQUE,
    name        TEXT        NOT NULL,
    floor       TEXT        NOT NULL DEFAULT '',
    capacity    INTEGER     NOT NULL CHECK (capacity BETWEEN 1 AND 200),
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_equipment (
    room_id      BIGINT NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    equipment_id BIGINT NOT NULL REFERENCES equipment (id),
    PRIMARY KEY (room_id, equipment_id)
);

-- Nyitvatartás: weekday az ISO hét napja (1 = hétfő … 7 = vasárnap), helyi (Europe/Budapest) idő szerint.
-- A '24:00' zárás azt jelenti, hogy éjfélig nyitva.
CREATE TABLE opening_hours (
    room_id BIGINT   NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    opens   TIME     NOT NULL,
    closes  TIME     NOT NULL,
    PRIMARY KEY (room_id, weekday),
    CHECK (opens < closes)
);

-- A felhasználót az eduID-ból kapott eduPersonPrincipalName (eppn) azonosítja.
CREATE TABLE users (
    id                    BIGSERIAL   PRIMARY KEY,
    eppn                  TEXT        NOT NULL UNIQUE,
    email                 TEXT        NOT NULL,
    display_name          TEXT        NOT NULL,
    role                  TEXT        NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    reminders_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    lang                  TEXT        NOT NULL DEFAULT 'hu' CHECK (lang IN ('hu', 'en')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at         TIMESTAMPTZ,
    deletion_requested_at TIMESTAMPTZ
);

CREATE TABLE bookings (
    id                BIGSERIAL   PRIMARY KEY,
    room_id           BIGINT      NOT NULL REFERENCES rooms (id),
    user_id           BIGINT      NOT NULL REFERENCES users (id),
    period            TSTZRANGE   NOT NULL,            -- félig nyitott: [kezdés, vége)
    status            TEXT        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'cancelled')),
    late_cancellation BOOLEAN     NOT NULL DEFAULT FALSE,
    cancelled_at      TIMESTAMPTZ,
    reminder_sent_at  TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT bookings_period_bounds
        CHECK (lower_inc(period) AND NOT upper_inc(period) AND NOT lower_inf(period) AND NOT upper_inf(period)),

    -- AC-05.3: legfeljebb 3 óra
    CONSTRAINT bookings_max_duration
        CHECK (upper(period) - lower(period) <= INTERVAL '3 hours'),

    -- AC-05.2: ugyanabban a teremben nem lehet két átfedő aktív foglalás
    CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (room_id WITH =, period WITH &&)
        WHERE (status = 'active')
);

CREATE INDEX bookings_user_status_idx ON bookings (user_id, status);
CREATE INDEX bookings_reminder_idx ON bookings (lower(period)) WHERE status = 'active' AND reminder_sent_at IS NULL;

-- Munkamenetek (connect-pg-simple); kijelentkezéskor a sor törlődik (AC-02.4).
CREATE TABLE session (
    sid    VARCHAR      NOT NULL PRIMARY KEY,
    sess   JSON         NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);

INSERT INTO equipment (code, name_hu, name_en) VALUES
    ('projector',  'Projektor',                'Projector'),
    ('whiteboard', 'Tábla',                    'Whiteboard'),
    ('tv',         'TV-képernyő',              'TV screen'),
    ('power',      'Konnektor az asztaloknál', 'Power outlets at desks'),
    ('accessible', 'Akadálymentes',            'Wheelchair accessible');
