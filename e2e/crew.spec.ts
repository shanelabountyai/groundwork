import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './sign-in';

// The smallest valid PNG header is enough: the server sniffs bytes, not names.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

async function openCrew(page: Page) {
  await signInAs(page, { phone: '+19185550100' });
  await expect(page.getByRole('heading', { name: 'E2E Crew' })).toBeVisible();
}
const stop = (page: Page, address: string) => page.getByRole('listitem', { name: new RegExp(address) });

test('today\'s route: ordered stops, access notes up front, no price, no sideways scroll', async ({ page }) => {
  await openCrew(page);
  await expect(page.locator('.stop h2')).toHaveText(['101 First St', '202 Second St', '303 Third St']);
  await expect(stop(page, '101 First St').locator('.access')).toHaveText(/Gate code 4412#/);
  await expect(stop(page, '101 First St').getByRole('link', { name: 'Map' })).toHaveAttribute('href', /query=36\.16,-95\.993$/);

  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/\$|123\.45|12345/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('start, then complete with before/after photos and a note', async ({ page }) => {
  await openCrew(page);
  const card = stop(page, '101 First St');
  await card.getByRole('button', { name: /Start/ }).click();
  await expect(card.locator('.status')).toHaveText('En route');

  await card.getByText('Complete stop').click();
  await card.getByLabel('Before photo').setInputFiles(photo('before.png'));
  await card.getByLabel('After photo').setInputFiles(photo('after.png'));
  await card.getByLabel('Note', { exact: true }).fill('Edged the drive');
  await card.getByRole('button', { name: 'Mark complete' }).click();

  await expect(card.locator('.status')).toHaveText('Done');
  await expect(card).toContainText('Note: Edged the drive');
  await expect(page.getByText('1 of 3 stops done')).toBeVisible();
});

test('skip needs a reason; "other" needs a note', async ({ page }) => {
  await openCrew(page);
  const card = stop(page, '202 Second St');
  await card.getByText('Skip stop').click();
  await card.getByLabel('Other', { exact: true }).check();
  await card.getByRole('button', { name: 'Skip this stop' }).click();
  await expect(page.locator('.alert')).toContainText('note');

  const again = stop(page, '202 Second St');
  await again.getByText('Skip stop').click();
  await again.getByLabel('Dog loose').check();
  await again.getByRole('button', { name: 'Skip this stop' }).click();
  await expect(again.locator('.status')).toHaveText('Skipped');
  await expect(again).toContainText('Skipped: Dog loose');
});

test('a non-photo upload is refused and the stop stays open', async ({ page }) => {
  await openCrew(page);
  const card = stop(page, '303 Third St');
  await card.getByRole('button', { name: /Start/ }).click();
  await card.getByText('Complete stop').click();
  await card.getByLabel('Before photo').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('not a photo') });
  await card.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page.locator('.alert')).toContainText('not a photo');
  await expect(stop(page, '303 Third St').locator('.status')).toHaveText('En route');
});

test('clock in and out from the phone (BO-8)', async ({ page }) => {
  await openCrew(page);
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.locator('.clock')).toContainText('E2E Lead · clocked in');
  await page.getByRole('button', { name: 'Clock out' }).click();
  await expect(page.locator('.clock')).toContainText('not clocked in');
});
