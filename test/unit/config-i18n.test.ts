import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { t } from '../../src/web/i18n.js';
import { parseRoomForm } from '../../src/web/routes/admin.js';

const base = {
  DATABASE_URL: 'postgres://x',
  SESSION_SECRET: 'x'.repeat(32),
  SAML_IDP_SSO_URL: 'https://idp.example/sso',
  SAML_IDP_CERT: 'MIIC',
};

describe('loadConfig', () => {
  it('alapértékek és listák', () => {
    const c = loadConfig({ ...base, ADMIN_EPPNS: ' Admin@NYE.hu , b@nye.hu', BASE_URL: 'https://studyroom.nye.hu/' });
    expect(c.allowedScopes).toEqual(['nye.hu']);
    expect(c.adminEppns).toEqual(['admin@nye.hu', 'b@nye.hu']);
    expect(c.saml.spEntityId).toBe('https://studyroom.nye.hu/saml/metadata');
    expect(c.saml.callbackUrl).toBe('https://studyroom.nye.hu/saml/acs');
  });

  it('hiányzó IdP-tanúsítványnál és rövid titoknál hibát dob', () => {
    expect(() => loadConfig({ ...base, SAML_IDP_CERT: undefined })).toThrow(/SAML_IDP_CERT/);
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'rövid' })).toThrow(/SESSION_SECRET/);
  });
});

describe('t', () => {
  it('behelyettesíti a paramétereket mindkét nyelven', () => {
    expect(t('hu', 'booking.quota', { n: 1, max: 2 })).toBe('Aktív jövőbeli foglalásaid: 1 / 2');
    expect(t('en', 'booking.quota', { n: 1, max: 2 })).toBe('Your active future bookings: 1 / 2');
    expect(t('hu', 'nincs.ilyen')).toBe('nincs.ilyen');
  });
});

describe('parseRoomForm', () => {
  const valid = { code: 'C/201', name: 'Új terem', buildingId: '1', floor: '2. emelet', capacity: '10', equipment: ['tv'], open_1: 'on', opens_1: '08:00', closes_1: '20:00' };

  it('érvényes űrlapból RoomInput-ot készít', () => {
    const { input } = parseRoomForm(valid);
    expect(input).toMatchObject({ code: 'C/201', capacity: 10, equipment: ['tv'], hours: [{ weekday: 1, opensMin: 480, closesMin: 1200 }] });
  });

  it('jelzi a hibás mezőket', () => {
    const { input, errors } = parseRoomForm({ ...valid, code: '', capacity: '500', opens_1: '20:00', closes_1: '08:00' });
    expect(input).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(['capacity', 'code', 'hours']);
  });
});
