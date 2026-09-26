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

// SEC-05: server actions keep the 1 MB default; only the photo route takes a large body.
test('a 2 MB anonymous post to the sign-in action is refused', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const actionField = html.match(/name="(\$ACTION_ID_[^"]+)"/)![1]!;
  const post = (pad: string) => request.post('/', {
    headers: { origin: new URL(test.info().project.use.baseURL!).origin },
    multipart: { [actionField]: '', phone: '+19185550100', pad },
    maxRedirects: 0,
  });
  // The same post, small, goes through; so the 500 below is the size limit (Next's "Body exceeded 1 MB limit").
  expect((await post('x')).status()).toBeLessThan(500);
  expect((await post('x'.repeat(2 * 1024 * 1024))).status()).toBe(500);
});

test('the photo route refuses a cross-origin post', async ({ request }) => {
  const res = await request.post('/crew/x/complete', { headers: { origin: 'https://evil.example' }, multipart: { visitId: 'x' }, maxRedirects: 0 });
  expect(res.status()).toBe(403);
});
