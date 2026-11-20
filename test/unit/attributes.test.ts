import { describe, expect, it } from 'vitest';
import { NotAllowedError, mapProfile, scopeAllowed } from '../../src/auth/attributes.js';

const OID_EPPN = 'urn:oid:1.3.6.1.4.1.5923.1.1.1.6';
const OID_MAIL = 'urn:oid:0.9.2342.19200300.100.1.3';
const OID_DISPLAY = 'urn:oid:2.16.840.1.113730.3.1.241';

describe('mapProfile', () => {
  it('az eduID urn:oid attribútumait képezi le', () => {
    const id = mapProfile(
      { [OID_EPPN]: 'Kovacs.Reka@nye.hu', [OID_MAIL]: ['kovacs.reka@student.nye.hu'], [OID_DISPLAY]: 'Kovács Réka' },
      ['nye.hu'],
    );
    expect(id).toEqual({ eppn: 'kovacs.reka@nye.hu', email: 'kovacs.reka@student.nye.hu', displayName: 'Kovács Réka' });
  });

  it('a barátságos attribútumneveket is elfogadja, és a nevet vezetéknév + utónév sorrendben rakja össze', () => {
    const id = mapProfile({ eduPersonPrincipalName: 'nagy.bence@nye.hu', sn: 'Nagy', givenName: 'Bence' }, ['nye.hu']);
    expect(id.displayName).toBe('Nagy Bence');
    expect(id.email).toBe('nagy.bence@nye.hu');
  });

  it('más intézmény felhasználóját elutasítja', () => {
    expect(() => mapProfile({ [OID_EPPN]: 'kiss.anna@elte.hu' }, ['nye.hu'])).toThrow(NotAllowedError);
  });

  it('eppn nélkül nem enged be', () => {
    expect(() => mapProfile({ [OID_MAIL]: 'valaki@nye.hu' }, ['nye.hu'])).toThrow('missing_eppn');
  });
});

describe('scopeAllowed', () => {
  it('a megadott domaint és aldomainjeit engedi (@*.nye.hu)', () => {
    expect(scopeAllowed('nye.hu', ['nye.hu'])).toBe(true);
    expect(scopeAllowed('student.nye.hu', ['nye.hu'])).toBe(true);
    expect(scopeAllowed('nye.hu.example.com', ['nye.hu'])).toBe(false);
    expect(scopeAllowed('fakenye.hu', ['nye.hu'])).toBe(false);
  });
});
