import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { envSchema, parseEnv } from './env';

const root = join(__dirname, '..');
const ok = { DATABASE_URL: 'postgresql://u@localhost:5432/groundwork_test' };

describe('parseEnv', () => {
  it('accepts a minimal local environment and treats empty values as unset', () => {
    expect(parseEnv({ ...ok, CRON_SECRET: '', APP_URL: '' })).toMatchObject({ DATABASE_URL: ok.DATABASE_URL });
  });

  it('refuses a missing or non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow('Invalid environment: DATABASE_URL');
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/x' })).toThrow('Invalid environment: DATABASE_URL');
  });

  it('refuses malformed optional values and names the key, never the value', () => {
    expect(() => parseEnv({ ...ok, APP_URL: 'groundwork.example.com' })).toThrow('Invalid environment: APP_URL');
    expect(() => parseEnv({ ...ok, GROUNDWORK_ROAD_FACTOR: 'fast' })).toThrow('Invalid environment: GROUNDWORK_ROAD_FACTOR');
    expect(() => parseEnv({ ...ok, GROUNDWORK_ROAD_FACTOR: '0' })).toThrow('Invalid environment: GROUNDWORK_ROAD_FACTOR');
    expect(() => parseEnv({ ...ok, OSRM_BASE_URL: 'secret-looking-value' })).toThrow(/^Invalid environment: OSRM_BASE_URL$/);
  });
});

// Framework-set, not configured by anyone.
const FRAMEWORK = new Set(['NODE_ENV', 'NEXT_RUNTIME']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'generated' || name === 'node_modules') return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('env inventory', () => {
  const read = new Set(
    [...sources(join(root, 'app')), ...sources(join(root, 'src')), ...sources(join(root, 'scripts')), join(root, 'prisma.config.ts'), join(root, 'instrumentation.ts')]
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]!)),
  );
  const schema = new Set(Object.keys(envSchema.shape));
  const example = new Set(
    readFileSync(join(root, '.env.example'), 'utf8').split('\n').map((l) => /^([A-Z0-9_]+)=/.exec(l)?.[1]).filter((k): k is string => !!k),
  );

  it('every variable the code reads is in the schema', () => {
    expect([...read].filter((k) => !FRAMEWORK.has(k) && !schema.has(k))).toEqual([]);
  });

  it('.env.example names exactly the schema keys', () => {
    expect([...schema].filter((k) => !FRAMEWORK.has(k)).sort()).toEqual([...example].sort());
  });

  it('no key is NEXT_PUBLIC_', () => {
    expect([...schema, ...example].filter((k) => k.startsWith('NEXT_PUBLIC_'))).toEqual([]);
  });
});
