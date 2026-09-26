import { expect, test, type Locator, type Page } from '@playwright/test';
import { prisma } from '../src/db';
import { systemClock } from '../src/clock';
import { addDays, localDateOf } from '../src/time';
import { signInAs } from './sign-in';

async function signIn(page: Page) {
  await signInAs(page, { email: 'dispatch@e2e.example' });
  await expect(page.getByRole('heading', { name: /Week of/ })).toBeVisible();
}
const top = async (l: Locator) => (await l.boundingBox())!.y;
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// DG-12: the admin forms are cards with related fields paired on a row (desktop) that stack on a phone.
test.describe('desktop', () => {
  test.use({ viewport: { width: 1100, height: 800 }, isMobile: false, hasTouch: false });

  test('crew form pairs lat/lng and max stops/minutes, and creates the crew', async ({ page }) => {
    await signIn(page);
    await page.goto('/dispatch/crews/new');
    await expect(page.locator('form.card')).toBeVisible();
    const lat = page.getByLabel('Home latitude'), lng = page.getByLabel('Home longitude');
    const stops = page.getByLabel('Max stops per day'), mins = page.getByLabel('Max minutes per day');
    expect(await top(lat)).toBe(await top(lng));
    expect(await top(stops)).toBe(await top(mins));
    expect(await top(stops)).toBeGreaterThan(await top(lat));

    await page.getByLabel('Name').fill('Forms Crew');
    await lat.fill('36.15'); await lng.fill('-95.99');
    await stops.fill('5'); await mins.fill('300');
    await page.getByRole('button', { name: 'Create crew' }).click();
    await expect(page).not.toHaveURL(/\/crews\/new/);
    await expect(page.getByText('Forms Crew').first()).toBeVisible();
  });

  test('agreement form pairs service/crew and frequency/start, and creates the agreement', async ({ page }) => {
    await signIn(page);
    const property = await prisma.property.findFirstOrThrow({ where: { address: '22 Storm St' } });
    await page.goto(`/dispatch/agreements/new?propertyId=${property.id}`);
    const service = page.getByLabel('Service type'), crew = page.getByLabel('Crew');
    const freq = page.getByLabel('Frequency'), start = page.getByLabel('Start date');
    expect(await top(service)).toBe(await top(crew));
    expect(await top(freq)).toBe(await top(start));

    await service.selectOption({ label: 'Mow & edge (~45 min)' });
    await crew.selectOption({ label: 'Forms Crew' });
    await freq.selectOption('one_time');
    // Far enough out that no other spec's day changes.
    await start.fill(addDays(localDateOf(systemClock.now()), 60));
    await page.getByLabel(/^Price/).fill('45.00');
    await page.getByRole('button', { name: 'Create agreement' }).click();
    await expect(page).not.toHaveURL(/agreements\/new/);
    expect(await prisma.agreement.count({ where: { crew: { name: 'Forms Crew' }, priceCents: 4500 } })).toBe(1);
  });

  test('crew edit form keeps its pairs and current values', async ({ page }) => {
    await signIn(page);
    const crew = await prisma.crew.findFirstOrThrow({ where: { name: 'Forms Crew' } });
    await page.goto(`/dispatch/crews/${crew.id}`);
    await expect(page.getByLabel('Max stops per day')).toHaveValue('5');
    expect(await top(page.getByLabel('Home latitude'))).toBe(await top(page.getByLabel('Home longitude')));
    await expect(page.locator('form.card')).toHaveCount(2); // save + delete
  });
});

test('forms stack on a phone without sideways scroll', async ({ page }) => {
  await signIn(page);
  await page.goto('/dispatch/crews/new');
  expect(await top(page.getByLabel('Home longitude'))).toBeGreaterThan(await top(page.getByLabel('Home latitude')));
  expect(await noSideScroll(page)).toBe(true);
  const today = localDateOf(systemClock.now());
  await page.goto(`/dispatch/invoices/new?from=${today}&to=${today}`);
  await expect(page.locator('form.card')).toBeVisible();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByRole('button', { name: 'Create draft invoices' })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});
