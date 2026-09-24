import { expect, test } from '@playwright/test';

// SEC-03: dispatch and portal pages must not be frameable, and must not leak URLs (portal links carry tokens).
for (const path of ['/dispatch', '/portal', '/login']) {
  test(`security headers on ${path}`, async ({ request }) => {
    const h = (await request.get(path, { maxRedirects: 0 })).headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('no-referrer');
  });
}
