import request from 'supertest';
import type { Pool } from '../../src/db/pool.js';
import { createApp } from '../../src/app.js';
import { createSamlStrategy } from '../../src/auth/saml.js';
import { clock, testConfig, testServices } from './db.js';

export function createTestApp(pool: Pool) {
  const config = testConfig();
  const { services, mailer } = testServices(pool);
  const app = createApp({ config, pool, services, clock, saml: createSamlStrategy(config, services.users), testAuth: true });
  return { app, services, mailer, config };
}

/** Bejelentkezett ügynök: a tesztfejléccel azonosít, és kiolvassa a CSRF-tokent. */
export async function agentFor(app: Parameters<typeof request.agent>[0], userId: number) {
  const agent = request.agent(app);
  agent.set('x-test-user-id', String(userId));
  const res = await agent.get('/profile');
  const csrf = /name="_csrf" value="([^"]+)"/.exec(res.text)?.[1];
  if (!csrf) throw new Error('Nem található CSRF-token');
  return { agent, csrf };
}
