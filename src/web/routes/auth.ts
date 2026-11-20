import { Router } from 'express';
import type passport from 'passport';
import type { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import type { Config } from '../../config.js';
import { requireUser } from '../../auth/guards.js';

interface Deps {
  config: Config;
  saml: SamlStrategy;
  passport: InstanceType<typeof passport.Passport>;
  sessionCookie: string;
}

/** FR-02 (ADR-0003 szerint): belépés és kilépés eduID-val, SAML2 Web Browser SSO profillal. */
export function authRoutes({ config, saml, passport, sessionCookie }: Deps): Router {
  const r = Router();

  r.get('/login', (req, res, next) => {
    if (req.user) return res.redirect('/');
    passport.authenticate('saml', { session: true })(req, res, next);
  });

  r.post('/saml/acs', (req, res, next) => {
    passport.authenticate('saml', (err: Error | null, user: Express.User | false, info?: { message?: string }) => {
      if (err) {
        console.warn('SAML-válasz elutasítva:', err.message);
        return res.status(403).render('pages/login-denied.njk', { reason: 'invalid' });
      }
      if (!user) return res.status(403).render('pages/login-denied.njk', { reason: info?.message ?? 'invalid' });
      req.logIn(user, (e) => (e ? next(e) : res.redirect('/')));
    })(req, res, next);
  });

  // Az SP metaadata, amelyet az eduID.hu föderációba regisztrálni kell.
  r.get('/saml/metadata', (_req, res) => {
    const cert = config.saml.spCert ?? null;
    res.type('application/samlmetadata+xml').send(saml.generateServiceProviderMetadata(cert, cert));
  });

  // AC-02.4: a munkamenet érvénytelenítése, majd vissza a nyitóoldalra.
  r.post('/logout', requireUser, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie(sessionCookie);
        res.redirect('/');
      });
    });
  });

  return r;
}
