import { describe, expect, it } from 'vitest';
import config from '../next.config';

// K7 / SEC-03: the global header set, checked on the config itself (e2e/headers.spec.ts checks the served response).
describe('global security headers', () => {
  it('sets frame-ancestors, X-Frame-Options, Referrer-Policy, nosniff and HSTS on every path', async () => {
    const rules = await config.headers!();
    const all = rules.find((r) => r.source === '/:path*');
    const h = Object.fromEntries(all!.headers.map(({ key, value }) => [key.toLowerCase(), value]));
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['strict-transport-security']).toMatch(/^max-age=(\d+); includeSubDomains$/);
    expect(Number(/max-age=(\d+)/.exec(h['strict-transport-security']!)![1])).toBeGreaterThanOrEqual(31536000);
  });
});
