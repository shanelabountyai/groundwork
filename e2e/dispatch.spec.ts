import { expect, test, type Page } from '@playwright/test';
import { systemClock } from '../src/clock';
import { addDays, localDateOf } from '../src/time';
import { BULK_OFFSET } from './global-setup';
import { signInAs } from './sign-in';

async function signIn(page: Page) {
  await signInAs(page, { email: 'dispatch@e2e.example' });
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

// Preview only; the commit is next.
test('bulk rain day: one summary row per crew, one combined commit', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Rain day — all crews' }).click();
  await expect(page.getByRole('heading', { name: /Rain day: all crews/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /^E2E Dispatch/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Push \d+ stops · notify/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('bulk rain day commits every crew in one click, each on its own', async ({ page }) => {
  await signIn(page);
  await page.goto(`/dispatch/rain/${addDays(localDateOf(systemClock.now()), BULK_OFFSET)}`);
  await expect(page.getByRole('row', { name: /^E2E Bulk A/ })).toContainText('Clean');
  await expect(page.getByRole('row', { name: /^E2E Bulk B/ })).toContainText('Clean');
  await page.getByRole('button', { name: /^Push 4 stops/ }).click();
  await expect(page.getByRole('status')).toContainText('Pushed 4 stops');
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

  // The rained-out day keeps its resolved stops — the finished one and the
  // skipped one — and nothing pending is left behind.
  await page.goto(day);
  await expect(page.locator('.stop')).toHaveCount(2);
  await expect(page.getByRole('link', { name: /Rain day/ })).toHaveCount(0);
});

test('the owner report counts the week: scheduled value is completed stops only', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Report' }).click();
  await expect(page.getByRole('heading', { name: /Report . week of/ })).toBeVisible();

  // E2E Dispatch has three $88 stops today and has completed exactly one of
  // them (44 Done Ln). Scheduled value counts that one, not the ones still to do.
  // The arithmetic itself is pinned in src/crews/report.test.ts; what this
  // asserts is that a dispatcher gets those numbers on the page.
  await expect(page.getByRole('row', { name: /^E2E Dispatch/ }).getByRole('cell', { name: '$88.00' })).toBeVisible();
});

// Last in the file: booking adds a visit to a later day, which the specs above read.
test('a skipped stop offers the next slot the crew can take, and books it', async ({ page }) => {
  await signIn(page);
  // By the day, not the load: the rain-day test above emptied today's pending stops.
  await page.getByRole('link', { name: /^E2E Dispatch/ }).filter({ hasText: 'skipped' }).first().click();
  const skipped = page.locator('.stop', { hasText: '55 Locked Gate Ln' });
  await expect(skipped).toContainText('Skipped: Locked gate');

  const offer = skipped.getByRole('button', { name: /^Book make-up/ });
  const offered = (await offer.textContent())!.replace('Book make-up ', '');
  await offer.click();

  await expect(page.getByRole('status')).toContainText(`Make-up booked for ${offered}`);
  const again = page.locator('.stop', { hasText: '55 Locked Gate Ln' });
  await expect(again).toContainText(`Make-up booked for ${offered}`);
  // The offer is gone: the unique occurrence slot is taken, so it cannot be booked twice.
  await expect(again.getByRole('button', { name: /^Book make-up/ })).toHaveCount(0);
  // The skip itself is still history.
  await expect(again.locator('.status')).toHaveText('Skipped');
});

test('search finds a customer by address fragment, from the board', async ({ page }) => {
  await signIn(page);
  await page.getByRole('search').getByRole('searchbox').fill('second st');
  await page.getByRole('search').getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: 'Customer 2' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Customer 1' })).toHaveCount(0);
});

test('a crew-day message queues for the customers still on the route, and the quarter view renders', async ({ page }) => {
  await signIn(page);
  await cell(page, 'E2E Dispatch', 3).first().click();
  await page.getByLabel('Message everyone still on this route').fill('Running about 30 minutes behind.');
  await page.getByRole('button', { name: 'Send to customers' }).click();
  await expect(page.getByRole('status')).toContainText(/Queued for \d+ customers?/);

  await page.goto('/dispatch/report/range');
  await expect(page.getByRole('heading', { name: /Report · 13 weeks/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By customer' })).toBeVisible();
});

test('a duplicate service-type name marks that field and keeps the other input', async ({ page }) => {
  await signIn(page);
  await page.goto('/dispatch/service-types/new');
  await page.getByLabel('Name').fill('Mow & edge');
  await page.getByLabel('Estimated minutes').fill('30');
  await page.getByRole('button', { name: 'Create service type' }).click();
  await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: 'already in use' })).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('Mow & edge');
  await expect(page.getByLabel('Estimated minutes')).toHaveValue('30');
  await expect(page.getByLabel('Estimated minutes')).not.toHaveAttribute('aria-invalid', 'true');
});

test('a bad one-off job price marks the price and keeps the rest of the form', async ({ page }) => {
  await signIn(page);
  await page.goto('/dispatch/jobs/new');
  await page.getByLabel('Property').selectOption({ index: 1 });
  await page.getByLabel('Service type').selectOption({ index: 1 });
  await page.getByLabel('Crew').selectOption({ index: 1 });
  await page.getByLabel('Price ($)').fill('forty');
  await page.getByRole('button', { name: 'Place job' }).click();
  await expect(page.getByLabel('Price ($)')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Price ($)')).toHaveValue('forty');
  await expect(page.getByRole('alert').filter({ hasText: 'dollars and cents' })).toBeVisible();
  await expect(page.getByLabel('Crew')).not.toHaveValue('');
  await expect(page.getByLabel('Service type')).not.toHaveValue('');
});
