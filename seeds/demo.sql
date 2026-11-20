-- Demóadatok fejlesztéshez (SEED_DEMO_DATA=true esetén, csak üres adatbázisba)

INSERT INTO buildings (name, address) VALUES
    ('A épület', 'Sóstói út 31/B'),
    ('B épület', 'Sóstói út 31/B'),
    ('Könyvtár', 'Sóstói út 31/B');

INSERT INTO rooms (building_id, code, name, floor, capacity) VALUES
    ((SELECT id FROM buildings WHERE name = 'A épület'), 'A/104',  'Csendes tanulószoba',    '1. emelet', 12),
    ((SELECT id FROM buildings WHERE name = 'A épület'), 'A/210',  'Csoportszoba',           '2. emelet', 6),
    ((SELECT id FROM buildings WHERE name = 'A épület'), 'A/015',  'Projektoros terem',      'földszint', 20),
    ((SELECT id FROM buildings WHERE name = 'B épület'), 'B/112',  'Kis csoportszoba',       '1. emelet', 4),
    ((SELECT id FROM buildings WHERE name = 'B épület'), 'B/305',  'Szemináriumi szoba',     '3. emelet', 16),
    ((SELECT id FROM buildings WHERE name = 'Könyvtár'), 'KT-2.1', 'Könyvtári csoportszoba', '2. emelet', 8),
    ((SELECT id FROM buildings WHERE name = 'Könyvtár'), 'KT-2.4', 'Csendes fülke',          '2. emelet', 2);

INSERT INTO room_equipment (room_id, equipment_id)
SELECT r.id, e.id FROM (VALUES
    ('A/104', 'whiteboard'), ('A/104', 'power'),
    ('A/210', 'whiteboard'), ('A/210', 'tv'),
    ('A/015', 'projector'), ('A/015', 'whiteboard'), ('A/015', 'accessible'),
    ('B/112', 'whiteboard'),
    ('B/305', 'projector'), ('B/305', 'power'), ('B/305', 'accessible'),
    ('KT-2.1', 'tv'), ('KT-2.1', 'power'), ('KT-2.1', 'accessible'),
    ('KT-2.4', 'power')
) AS x (room_code, eq_code)
JOIN rooms r ON r.code = x.room_code
JOIN equipment e ON e.code = x.eq_code;

-- Hétköznap 8:00–20:00 (a B/112 18:00-ig), a könyvtár szombaton 9:00–14:00 is nyitva.
INSERT INTO opening_hours (room_id, weekday, opens, closes)
SELECT r.id, d, '08:00', CASE WHEN r.code = 'B/112' THEN '18:00'::time ELSE '20:00'::time END
FROM rooms r CROSS JOIN generate_series(1, 5) AS d;
INSERT INTO opening_hours (room_id, weekday, opens, closes)
SELECT id, 6, '09:00', '14:00' FROM rooms WHERE code LIKE 'KT-%';

-- Egy demófelhasználó foglalásai a következő két hétre, hogy a naptár ne legyen üres.
INSERT INTO users (eppn, email, display_name) VALUES ('demo.foglalo@nye.hu', 'demo.foglalo@student.nye.hu', 'Demó Foglaló');

INSERT INTO bookings (room_id, user_id, period)
SELECT r.id, u.id,
       tstzrange(((current_date + d) + s.t) AT TIME ZONE 'Europe/Budapest',
                 ((current_date + d) + s.t + s.len) AT TIME ZONE 'Europe/Budapest', '[)')
FROM rooms r
CROSS JOIN generate_series(1, 14) AS d
CROSS JOIN (VALUES (time '10:00', interval '2 hours', 0), (time '14:00', interval '90 minutes', 1), (time '16:30', interval '1 hour', 2)) AS s (t, len, k)
JOIN users u ON u.eppn = 'demo.foglalo@nye.hu'
WHERE extract(isodow FROM current_date + d) <= 5
  AND (r.id + d + s.k) % 3 <> 0
  AND (s.t + s.len) <= CASE WHEN r.code = 'B/112' THEN time '18:00' ELSE time '20:00' END;
