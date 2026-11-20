import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Pool } from '../../src/db/pool.js';
import { at, createRoom, createUser, resetDb, setupDb } from '../helpers/db.js';
import { agentFor, createTestApp } from '../helpers/app.js';

let pool: Pool;
beforeAll(async () => {
  pool = await setupDb();
});
afterAll(async () => {
  await pool.end();
});

let t: ReturnType<typeof createTestApp>;
let roomId: number;
let reka: number;
let bence: number;
let admin: number;

beforeEach(async () => {
  await resetDb(pool);
  t = createTestApp(pool);
  roomId = await createRoom(pool, { code: 'A/104', equipment: ['whiteboard'] });
  reka = await createUser(pool, 'kovacs.reka@nye.hu');
  bence = await createUser(pool, 'nagy.bence@nye.hu');
  admin = await createUser(pool, 'szabo.marta@nye.hu', 'admin');
});

describe('nyilvános végpontok és SAML', () => {
  it('healthz', async () => {
    await request(t.app).get('/healthz').expect(200, { status: 'ok' });
  });

  it('a nyitóoldal eduID-s belépést kínál, angolul is (NFR-07)', async () => {
    expect((await request(t.app).get('/').expect(200)).text).toContain('Belépés eduID-val');
    expect((await request(t.app).get('/?lang=en').expect(200)).text).toContain('Log in with eduID');
  });

  it('bejelentkezés nélkül a védett oldal a belépésre irányít, az API 401-et ad', async () => {
    await request(t.app).get('/rooms').expect(302).expect('location', '/login');
    await request(t.app).get('/api/me/bookings').expect(401);
  });

  it('a /login SAML AuthnRequesttel az IdP-hez irányít', async () => {
    const res = await request(t.app).get('/login').expect(302);
    const url = new URL(res.headers.location!);
    expect(`${url.origin}${url.pathname}`).toBe(t.config.saml.idpSsoUrl);
    expect(url.searchParams.get('SAMLRequest')).toBeTruthy();
  });

  it('az SP metaadata tartalmazza az entityID-t és az ACS-címet', async () => {
    const res = await request(t.app).get('/saml/metadata').expect(200);
    expect(res.text).toContain('entityID="http://localhost:3000/saml/metadata"');
    expect(res.text).toContain('Location="http://localhost:3000/saml/acs"');
  });

  it('érvénytelen SAML-választ elutasít', async () => {
    const res = await request(t.app).post('/saml/acs').type('form').send({ SAMLResponse: Buffer.from('<x/>').toString('base64') });
    expect(res.status).toBe(403);
    expect(res.text).toContain('A belépés nem sikerült');
  });
});

describe('jogosultságok és CSRF', () => {
  it('hallgató nem éri el a teremkezelést (AC-09.3)', async () => {
    const { agent } = await agentFor(t.app, reka);
    await agent.get('/admin/rooms').expect(403);
  });

  it('CSRF-token nélkül nem lehet foglalni', async () => {
    const { agent } = await agentFor(t.app, reka);
    await agent.post('/bookings').type('form').send({ roomId, start: '2030-01-16T10:00', dur: '60' }).expect(403);
  });

  it('más foglalásának lemondó oldala 403 (AC-06.3)', async () => {
    const b = await t.services.bookings.create(bence, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    const { agent, csrf } = await agentFor(t.app, reka);
    await agent.get(`/bookings/${b.id}/cancel`).expect(403);
    await agent.post(`/bookings/${b.id}/cancel`).type('form').send({ _csrf: csrf }).expect(403);
  });

  it('kijelentkezés után a munkamenet érvénytelen (AC-02.4)', async () => {
    const { agent, csrf } = await agentFor(t.app, reka);
    await agent.post('/logout').type('form').send({ _csrf: csrf }).expect(302).expect('location', '/');
  });
});

describe('foglalási folyamat a felületen (FR-03 – FR-07)', () => {
  it('teremlista szűréssel és üres találat (AC-03.2, AC-03.3)', async () => {
    const { agent } = await agentFor(t.app, reka);
    expect((await agent.get('/rooms').expect(200)).text).toContain('A/104');
    const empty = await agent.get('/rooms?capacity=100').expect(200);
    expect(empty.text).toContain('Nincs a szűrésnek megfelelő terem');
  });

  it('naptár → összefoglaló → megerősítés → visszaigazolás', async () => {
    const { agent, csrf } = await agentFor(t.app, reka);
    const room = await agent.get(`/rooms/${roomId}?week=2030-01-14&start=2030-01-16T10:00&dur=60`).expect(200);
    expect(room.text).toContain('Tovább a foglaláshoz');
    expect(room.text).toContain('class="c-free sel');

    const confirm = await agent.get(`/bookings/new?room=${roomId}&start=2030-01-16T10:00&dur=90`).expect(200);
    expect(confirm.text).toContain('10:00–11:30');

    const saved = await agent
      .post('/bookings')
      .type('form')
      .send({ _csrf: csrf, roomId, start: '2030-01-16T10:00', dur: '90' })
      .expect(303);
    const done = await agent.get(saved.headers.location!).expect(200);
    expect(done.text).toContain('Lefoglaltad.');
    expect(t.mailer.sent).toHaveLength(1);

    const mine = await agent.get('/my/bookings').expect(200);
    expect(mine.text).toContain('A/104');
    expect(mine.text).toContain('Közelgő (1)');
  });

  it('ütközéskor 409 és „Ez az idősáv már nem elérhető” (AC-05.2)', async () => {
    await t.services.bookings.create(bence, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    const { agent, csrf } = await agentFor(t.app, reka);
    const res = await agent
      .post('/bookings')
      .type('form')
      .send({ _csrf: csrf, roomId, start: '2030-01-16T10:00', dur: '60' });
    expect(res.status).toBe(409);
    expect(res.text).toContain('Ez az idősáv már nem elérhető.');
  });

  it('a lemondás megerősítése késői lemondást jelez 1 órán belül (AC-06.2)', async () => {
    const b = await t.services.bookings.create(reka, roomId, at('2030-01-15T10:00'), at('2030-01-15T11:00'));
    const { agent, csrf } = await agentFor(t.app, reka);
    expect((await agent.get(`/bookings/${b.id}/cancel`).expect(200)).text).toContain('késői lemondásként');
    const res = await agent.post(`/bookings/${b.id}/cancel`).type('form').send({ _csrf: csrf }).expect(303);
    expect(res.headers.location).toBe('/my/bookings?cancelled=late');
    const history = await agent.get('/my/bookings?tab=history').expect(200);
    expect(history.text).toContain('Késői lemondás');
  });

  it('a profilban kikapcsolható az emlékeztető (AC-08.2)', async () => {
    const { agent, csrf } = await agentFor(t.app, reka);
    await agent.post('/profile').type('form').send({ _csrf: csrf, lang: 'en' }).expect(303);
    const u = await t.services.users.get(reka);
    expect(u).toMatchObject({ remindersEnabled: false, lang: 'en' });
  });
});

describe('JSON API (szekvenciadiagram)', () => {
  it('201, majd ütközésnél 409, korlátnál 422', async () => {
    const r = await agentFor(t.app, reka);
    const b = await agentFor(t.app, bence);
    const body = (s: string, e: string) => ({ roomId, start: at(s).toISOString(), end: at(e).toISOString() });

    const created = await r.agent.post('/api/bookings').set('x-csrf-token', r.csrf).send(body('2030-01-16T10:00', '2030-01-16T11:00'));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ roomId, status: 'active' });

    const conflict = await b.agent.post('/api/bookings').set('x-csrf-token', b.csrf).send(body('2030-01-16T10:30', '2030-01-16T11:30'));
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: 'error.slot_unavailable', message: 'Ez az idősáv már nem elérhető.' });

    await r.agent.post('/api/bookings').set('x-csrf-token', r.csrf).send(body('2030-01-17T10:00', '2030-01-17T11:00')).expect(201);
    const limit = await r.agent.post('/api/bookings').set('x-csrf-token', r.csrf).send(body('2030-01-18T10:00', '2030-01-18T11:00'));
    expect(limit.status).toBe(422);
    expect(limit.body.error).toBe('error.booking_limit');

    await b.agent.delete(`/api/bookings/${created.body.id}`).set('x-csrf-token', b.csrf).expect(403);
    await r.agent.delete(`/api/bookings/${created.body.id}`).set('x-csrf-token', r.csrf).expect(200, { late: false });
  });
});

describe('teremkezelés (FR-09)', () => {
  it('új terem létrehozása, majd inaktiválás a foglalások lemondásával', async () => {
    const { agent, csrf } = await agentFor(t.app, admin);
    const { rows } = await pool.query<{ id: number }>('SELECT id FROM buildings LIMIT 1');
    const form = {
      _csrf: csrf,
      code: 'C/201',
      name: 'Új csoportszoba',
      buildingId: String(rows[0]!.id),
      floor: '2. emelet',
      capacity: '8',
      equipment: ['tv', 'power'],
      open_3: 'on',
      opens_3: '08:00',
      closes_3: '20:00',
    };
    await agent.post('/admin/rooms').type('form').send(form).expect(303);
    expect((await agent.get('/admin/rooms').expect(200)).text).toContain('Új csoportszoba');

    const invalid = await agent.post('/admin/rooms').type('form').send({ ...form, code: 'C/202', capacity: '0' });
    expect(invalid.status).toBe(422);

    await t.services.bookings.create(reka, roomId, at('2030-01-16T10:00'), at('2030-01-16T11:00'));
    expect((await agent.get(`/admin/rooms/${roomId}/deactivate`).expect(200)).text).toContain('1 jövőbeli foglalás');
    await agent.post(`/admin/rooms/${roomId}/deactivate`).type('form').send({ _csrf: csrf }).expect(303);
    const student = await agentFor(t.app, reka);
    await student.agent.get(`/rooms/${roomId}`).expect(404);
  });
});
