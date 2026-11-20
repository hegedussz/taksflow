import { readFileSync } from 'node:fs';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const list = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  BASE_URL: z.string().min(1).default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET: legalább 32 karakter'),
  COOKIE_SECURE: bool.optional(),
  TRUST_PROXY: bool.default(false),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('StudyRoom <noreply@studyroom.local>'),
  SEED_DEMO_DATA: bool.default(false),

  SAML_IDP_SSO_URL: z.string().min(1),
  SAML_IDP_CERT: z.string().optional(),
  SAML_IDP_CERT_FILE: z.string().optional(),
  SAML_IDP_ENTITY_ID: z.string().optional(),
  SAML_SP_ENTITY_ID: z.string().optional(),
  SAML_SP_PRIVATE_KEY_FILE: z.string().optional(),
  SAML_SP_CERT_FILE: z.string().optional(),
  SAML_WANT_RESPONSE_SIGNED: bool.default(true),
  ALLOWED_SCOPES: list.default(['nye.hu']),
  ADMIN_EPPNS: list,
});

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  baseUrl: string;
  databaseUrl: string;
  sessionSecret: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  smtpUrl?: string;
  mailFrom: string;
  seedDemoData: boolean;
  saml: {
    idpSsoUrl: string;
    idpCert: string;
    idpEntityId?: string;
    spEntityId: string;
    callbackUrl: string;
    spPrivateKey?: string;
    spCert?: string;
    wantResponseSigned: boolean;
  };
  allowedScopes: string[];
  adminEppns: string[];
}

const readOptional = (file?: string) => (file ? readFileSync(file, 'utf8') : undefined);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Hibás konfiguráció:\n${issues}`);
  }
  const e = parsed.data;
  const idpCert = e.SAML_IDP_CERT ?? readOptional(e.SAML_IDP_CERT_FILE);
  if (!idpCert) throw new Error('Hibás konfiguráció: SAML_IDP_CERT vagy SAML_IDP_CERT_FILE megadása kötelező');
  const baseUrl = e.BASE_URL.replace(/\/$/, '');

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    baseUrl,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    cookieSecure: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
    trustProxy: e.TRUST_PROXY,
    smtpUrl: e.SMTP_URL || undefined,
    mailFrom: e.MAIL_FROM,
    seedDemoData: e.SEED_DEMO_DATA,
    saml: {
      idpSsoUrl: e.SAML_IDP_SSO_URL,
      idpCert,
      idpEntityId: e.SAML_IDP_ENTITY_ID || undefined,
      spEntityId: e.SAML_SP_ENTITY_ID || `${baseUrl}/saml/metadata`,
      callbackUrl: `${baseUrl}/saml/acs`,
      spPrivateKey: readOptional(e.SAML_SP_PRIVATE_KEY_FILE),
      spCert: readOptional(e.SAML_SP_CERT_FILE),
      wantResponseSigned: e.SAML_WANT_RESPONSE_SIGNED,
    },
    allowedScopes: e.ALLOWED_SCOPES,
    adminEppns: e.ADMIN_EPPNS,
  };
}
