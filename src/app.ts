import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import nunjucks from 'nunjucks';
import passport from 'passport';
import type { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import type { Config } from './config.js';
import type { Pool } from './db/pool.js';
import { AppError, ForbiddenError, NotFoundError } from './domain/errors.js';
import { toLocal, type Clock } from './domain/time.js';
import type { Services } from './services/index.js';
import type { Lang } from './services/userService.js';
import { huDecimal } from './services/statisticsService.js';
import { formatDate, formatDuration, formatRange, formatShortDate, formatTime } from './web/format.js';
import { isLang, t } from './web/i18n.js';
import { authRoutes } from './web/routes/auth.js';
import { pageRoutes } from './web/routes/pages.js';
import { adminRoutes } from './web/routes/admin.js';
import { apiRoutes } from './web/routes/api.js';

export interface AppDeps {
  config: Config;
  pool: Pool;
  services: Services;
  saml: SamlStrategy;
  clock: Clock;
  sessionStore?: session.Store;
  /**
   * Csak tesztekhez: az `x-test-user-id` fejléc alapján bejelentkezett felhasználót állít be.
   * Az éles belépési pont (server.ts) soha nem kapcsolja be.
   */
  testAuth?: boolean;
}

const VIEWS = fileURLToPath(new URL('../views/', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const SESSION_COOKIE = 'sr.sid';

export function createApp(deps: AppDeps): express.Express {
  const { config, services } = deps;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  const env = nunjucks.configure(VIEWS, { autoescape: true, express: app, noCache: config.env === 'development' });
  env.addFilter('date', (d: Date, lang: Lang) => formatDate(d, lang));
  env.addFilter('shortdate', (d: Date, lang: Lang) => formatShortDate(d, lang));
  env.addFilter('time', (d: Date) => formatTime(d));
  env.addFilter('daynum', (d: Date) => toLocal(d).day);
  env.addFilter('monthshort', (d: Date, lang: Lang) => toLocal(d).setLocale(lang).toFormat('LLL').replace('.', ''));
  env.addFilter('weekday', (d: Date, lang: Lang) => toLocal(d).setLocale(lang).toFormat('cccc'));
  env.addFilter('num1', (n: number, lang: Lang) => (lang === 'hu' ? huDecimal(Math.round(n * 10) / 10) : String(Math.round(n * 10) / 10)));
  env.addFilter('barwidth', (n: number) => Math.max(0, Math.min(100, n)).toFixed(1));
  env.addFilter('duration', (m: number, lang: Lang) => formatDuration(m, lang));
  env.addGlobal('timerange', (a: Date, b: Date) => formatRange(a, b));
  app.set('view engine', 'njk');

  app.use(helmet());
  app.use('/static', express.static(PUBLIC, { maxAge: config.env === 'production' ? '7d' : 0 }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use(
    session({
      name: SESSION_COOKIE,
      secret: config.sessionSecret,
      store: deps.sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 8 * 3600_000 },
    }),
  );

  const pp = new passport.Passport();
  pp.use('saml', deps.saml);
  pp.serializeUser((user, done) => done(null, (user as { id: number }).id));
  pp.deserializeUser((id: number, done) => {
    services.users
      .get(id)
      .then((u) => done(null, u ?? false))
      .catch(done);
  });
  app.use(pp.initialize());
  app.use(pp.session());

  if (deps.testAuth) {
    app.use((req, _res, next) => {
      const id = Number(req.get('x-test-user-id'));
      if (!id) return next();
      services.users
        .get(id)
        .then((u) => {
          if (u) req.user = u;
          next();
        })
        .catch(next);
    });
  }

  // Nyelv (NFR-07): ?lang= → süti → felhasználói beállítás → magyar
  app.use((req, res, next) => {
    let lang: Lang = 'hu';
    const q = req.query.lang;
    if (isLang(q)) {
      res.cookie('lang', q, { maxAge: 365 * 86_400_000, sameSite: 'lax', httpOnly: true, secure: config.cookieSecure });
      lang = q;
    } else if (isLang(req.cookies?.lang)) {
      lang = req.cookies.lang;
    } else if (req.user) {
      lang = req.user.lang;
    }
    res.locals.lang = lang;
    res.locals.t = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
    res.locals.user = req.user;
    res.locals.path = req.path;
    res.locals.langUrl = (l: Lang) => {
      const url = new URL(req.originalUrl, 'http://x');
      url.searchParams.set('lang', l);
      return `${url.pathname}${url.search}`;
    };
    next();
  });

  // CSRF-védelem (szinkronizált token) minden állapotot módosító kérésre; kivétel a SAML ACS,
  // ahová az IdP küldi a választ egy másik webhelyről.
  app.use((req, res, next) => {
    if (req.user && !req.session.csrfToken) req.session.csrfToken = randomBytes(24).toString('base64url');
    res.locals.csrfToken = req.session.csrfToken;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.path === '/saml/acs') return next();
    const sent = (req.body as Record<string, unknown> | undefined)?._csrf ?? req.get('x-csrf-token');
    const expected = req.session.csrfToken;
    const ok =
      typeof sent === 'string' &&
      typeof expected === 'string' &&
      sent.length === expected.length &&
      timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
    if (!ok) return next(new ForbiddenError('error.csrf'));
    next();
  });

  app.get('/healthz', (_req, res, next) => {
    deps.pool
      .query('SELECT 1')
      .then(() => res.json({ status: 'ok' }))
      .catch(next);
  });

  app.use(authRoutes({ config, saml: deps.saml, passport: pp, sessionCookie: SESSION_COOKIE }));
  app.use('/api', apiRoutes({ services, clock: deps.clock }));
  app.use('/admin', adminRoutes({ services, clock: deps.clock }));
  app.use(pageRoutes({ services, clock: deps.clock }));

  app.use((_req, _res, next) => next(new NotFoundError()));
   
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof AppError ? err.status : 500;
    const code = err instanceof AppError ? err.code : 'error.internal';
    if (status >= 500) console.error(err);
    const lang: Lang = (res.locals.lang as Lang | undefined) ?? 'hu';
    res.locals.lang = lang;
    res.locals.t ??= (key: string, params?: Record<string, string | number>) => t(lang, key, params);
    res.locals.langUrl ??= (l: Lang) => `/?lang=${l}`;
    if (req.originalUrl.startsWith('/api/')) {
      res.status(status).json({ error: code, message: t(lang, code) });
      return;
    }
    res.status(status).render('pages/error.njk', { status, code });
  });

  return app;
}
