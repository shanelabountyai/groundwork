import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dispatcher' }).click();
  await expect(page.getByRole('heading', { name: /Week of/ })).toBeVisible();
}
const cell = (page: Page, crew: string, n: number) => page.getByRole('link', { name: new RegExp(`^${crew},.*${n} stops`) });

test('the board shows load per crew-day and opens the day', async ({ page }) => {
  await signIn(page);
  // E2E Dispatch: 3 stops today against a 3-stop capacity.
  await cell(page, 'E2E Dispatch', 3).first().click();
  await expect(page.getByRole('heading', { name: /E2E Dispatch/ })).toBeVisible();
  await expect(page.getByText('3/3 stops')).toBeVisible();
  await expect(page.getByText('$88.00').first()).toBeVisible();
});

test("a crew's photo and note reach the dispatcher, and the file is dispatcher-only", async ({ page, request }) => {
  await signIn(page);
  await cell(page, 'E2E Dispatch', 3).first().click();
  const photo = page.getByRole('img', { name: /After — 44 Done Ln/ });
  await expect(photo).toBeVisible();
  await expect(page.getByText('Note: Mowed and blown off')).toBeVisible();

  const src = await photo.getAttribute('src');
  expect((await page.request.get(src!)).status()).toBe(200);
  // A request without the dispatcher cookie is refused.
  expect((await request.get(src!)).status()).toBe(403);
});

test('rain day: collision and overflow previewed, resolved, then committed', async ({ page }) => {
  await signIn(page);
  await cell(page, 'E2E Dispatch', 3).first().click();
  const push = page.getByRole('link', { name: /Rain day — push 2 stops/ });
  await expect(push).toBeVisible(); // the day has rendered, so this is its URL
  const day = page.url();
  await push.click();

  await page.getByRole('radio', { name: /^Next day/ }).check();
  await page.getByRole('button', { name: 'Update preview' }).click();
  await expect(page.getByRole('status')).toContainText('Overflow');
  await expect(page.getByText(/Already on .*: Mow & edge at this property/)).toBeVisible();
  await expect(page.getByText(/4\/3 stops/)).toBeVisible();
  // The dispatcher opens this on a phone in the truck too.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // Push the colliding stop one day further; the rest fits.
  const colliding = page.locator('.stop', { hasText: '11 Rain Ave' });
  await colliding.getByRole('radio', { name: /^Push further/ }).check();
  await page.getByRole('button', { name: 'Update preview' }).click();
  await expect(page.getByRole('status')).toContainText('Clean push');

  await page.getByRole('button', { name: /^Push 2 stops/ }).click();
  await expect(page.getByRole('status')).toContainText('Pushed 2 stops');

  // The rained-out day keeps only the finished stop; nothing pending is left behind.
  await page.goto(day);
  await expect(page.locator('.stop')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Rain day/ })).toHaveCount(0);
});

test('the owner report counts the week: revenue is completed stops only', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Report' }).click();
  await expect(page.getByRole('heading', { name: /Report . week of/ })).toBeVisible();

  // E2E Dispatch has three $88 stops today and has completed exactly one of
  // them (44 Done Ln). Revenue counts that one, not the ones still to do.
  // The arithmetic itself is pinned in src/crews/report.test.ts; what this
  // asserts is that a dispatcher gets those numbers on the page.
  await expect(page.getByRole('row', { name: /^E2E Dispatch/ }).getByRole('cell', { name: '$88.00' })).toBeVisible();
});
