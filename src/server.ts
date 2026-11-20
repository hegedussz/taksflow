import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createPool } from './db/pool.js';
import { runMigrations, seedDemoData } from './db/migrate.js';
import { systemClock } from './domain/time.js';
import { buildServices } from './services/index.js';
import { LogMailer, SmtpMailer } from './services/mailer.js';
import { createSamlStrategy } from './auth/saml.js';
import { startReminderJob } from './jobs/reminders.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const applied = await runMigrations(pool);
if (applied.length) console.log(`Migrációk lefutottak: ${applied.join(', ')}`);
if (config.seedDemoData && (await seedDemoData(pool))) console.log('Demóadatok betöltve.');

const mailer = config.smtpUrl ? new SmtpMailer(config.smtpUrl, config.mailFrom) : new LogMailer();
const services = buildServices(pool, mailer, config.baseUrl, systemClock);
const PgStore = connectPgSimple(session);

const app = createApp({
  config,
  pool,
  services,
  clock: systemClock,
  saml: createSamlStrategy(config, services.users),
  sessionStore: new PgStore({ pool, tableName: 'session', pruneSessionInterval: 15 * 60 }),
});

const stopReminders = startReminderJob(pool, services.notifications, systemClock);
const server = app.listen(config.port, () => {
  console.log(`StudyRoom fut: ${config.baseUrl} (port ${config.port})`);
});

const shutdown = (signal: string) => {
  console.log(`${signal}: leállás…`);
  stopReminders();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
