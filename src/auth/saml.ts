import { Strategy as SamlStrategy, type Profile, type VerifyWithoutRequest } from '@node-saml/passport-saml';
import type { Config } from '../config.js';
import type { UserService } from '../services/userService.js';
import { NotAllowedError, mapProfile } from './attributes.js';

/** A PEM-fejlécek és sortörések nélküli base64 tanúsítványt is elfogadjuk. */
export const normalizeCert = (cert: string): string =>
  cert.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');

/**
 * SAML2 Service Provider az eduID.hu föderációhoz (ADR-0003).
 * Fejlesztéskor a docker compose SimpleSAMLphp teszt-IdP-jével működik.
 */
export function createSamlStrategy(config: Config, users: UserService): SamlStrategy {
  const s = config.saml;
  return new SamlStrategy(
    {
      entryPoint: s.idpSsoUrl,
      issuer: s.spEntityId,
      callbackUrl: s.callbackUrl,
      idpCert: normalizeCert(s.idpCert),
      idpIssuer: s.idpEntityId,
      audience: s.spEntityId,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: s.wantResponseSigned,
      identifierFormat: null,
      disableRequestedAuthnContext: true,
      acceptedClockSkewMs: 5000,
      ...(s.spPrivateKey ? { privateKey: s.spPrivateKey, decryptionPvk: s.spPrivateKey } : {}),
    },
    ((profile: Profile | null, done) => {
      if (!profile) {
        done(null, undefined, { message: 'invalid' });
        return;
      }
      const attrs = { ...profile, ...((profile.attributes as Record<string, unknown> | undefined) ?? {}) };
      let identity;
      try {
        identity = mapProfile(attrs, config.allowedScopes);
      } catch (err) {
        if (err instanceof NotAllowedError) {
          done(null, undefined, { message: err.reason });
          return;
        }
        done(err as Error);
        return;
      }
      users
        .upsertFromSaml(identity, config.adminEppns.includes(identity.eppn))
        .then((user) => done(null, { id: user.id }))
        .catch((err: Error) => done(err));
    }) satisfies VerifyWithoutRequest,
    ((_profile, done) => done(null, undefined)) satisfies VerifyWithoutRequest,
  );
}
