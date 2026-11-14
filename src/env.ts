import { z } from 'zod';

/**
 * Every environment variable the app, scripts and prisma.config.ts read.
 * `.env.example` names exactly these (src/env.test.ts checks both directions).
 * Parsed once at server start (instrumentation.ts) and whenever src/db.ts loads,
 * so a malformed value stops the process instead of surfacing mid-request.
 * Nothing here is NEXT_PUBLIC_: every key is server-only.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),
  SHADOW_DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//).optional(), // prisma migrate dev only
  GROUNDWORK_ALLOW_CLOUD_DB: z.string().min(1).optional(), // any value: reach a cloud database on purpose (src/db.ts)
  APP_URL: z.url().optional(), // sign-in and payment links; defaults to http://localhost:3900
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(), // unset = photos on local disk
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_FROM_NUMBER: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  OSRM_BASE_URL: z.url().optional(), // unset = straight-line drive estimate
  GROUNDWORK_ROAD_FACTOR: z.string().regex(/^\d+(\.\d+)?$/, 'must be a positive number').refine((v) => Number(v) > 0, 'must be a positive number').optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(), // unset = sending an invoice refuses
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(), // unset = the webhook refuses every event
  CRON_SECRET: z.string().min(1).optional(), // unset = /api/cron/outbox refuses every request
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // An empty `NAME=` line (a key waiting for its value) is unset, not an invalid empty string.
  const result = envSchema.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(`Invalid environment: ${keys}`); // names only, never values
  }
  return result.data;
}

export const env = parseEnv(process.env);
