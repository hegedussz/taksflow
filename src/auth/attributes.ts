/**
 * Az eduID (SAML2) által átadott attribútumok leképezése.
 * Az eduID.hu föderáció az attribútumokat urn:oid névvel adja át; a barátságos nevet is elfogadjuk.
 */
export const ATTR = {
  eppn: ['urn:oid:1.3.6.1.4.1.5923.1.1.1.6', 'eduPersonPrincipalName'],
  mail: ['urn:oid:0.9.2342.19200300.100.1.3', 'mail', 'email'],
  displayName: ['urn:oid:2.16.840.1.113730.3.1.241', 'displayName'],
  cn: ['urn:oid:2.5.4.3', 'cn'],
  givenName: ['urn:oid:2.5.4.42', 'givenName'],
  sn: ['urn:oid:2.5.4.4', 'sn'],
} as const;

export interface SamlIdentity {
  eppn: string;
  email: string;
  displayName: string;
}

export class NotAllowedError extends Error {
  constructor(public readonly reason: 'missing_eppn' | 'scope_not_allowed') {
    super(reason);
  }
}

function first(profile: Record<string, unknown>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const raw = profile[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** Igaz, ha a scope (az eppn @ utáni része) megegyezik egy engedélyezettel vagy annak aldomainje. */
export function scopeAllowed(scope: string, allowed: string[]): boolean {
  const s = scope.toLowerCase();
  return allowed.some((a) => s === a || s.endsWith(`.${a}`));
}

export function mapProfile(profile: Record<string, unknown>, allowedScopes: string[]): SamlIdentity {
  const eppn = first(profile, ATTR.eppn)?.toLowerCase();
  if (!eppn || !eppn.includes('@')) throw new NotAllowedError('missing_eppn');
  const scope = eppn.slice(eppn.lastIndexOf('@') + 1);
  if (!scopeAllowed(scope, allowedScopes)) throw new NotAllowedError('scope_not_allowed');

  const email = (first(profile, ATTR.mail) ?? eppn).toLowerCase();
  const given = first(profile, ATTR.givenName);
  const sn = first(profile, ATTR.sn);
  // Magyar névsorrend: vezetéknév, utónév
  const composed = sn && given ? `${sn} ${given}` : undefined;
  const displayName = first(profile, ATTR.displayName) ?? first(profile, ATTR.cn) ?? composed ?? email;
  return { eppn, email, displayName };
}
