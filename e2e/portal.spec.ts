import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../src/db';
import { localDateOf, toDbDate } from '../src/time';

/** Mints a portal link token the way requestPortalLink does; the real one goes to an inbox the test can't read. */
async function signInToPortal(page: import('@playwright/test').Page, propertyId: string) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  await prisma.portalToken.create({
    data: { hash: createHash('sha256').update(token).digest('hex'), propertyId, createdAt: new Date(now), expiresAt: new Date(now + 15 * 60_000) },
  });
  await page.goto(`/portal/${token}`);
  await page.getByRole('button', { name: 'View my schedule' }).click();
  await expect(page).toHaveURL(/\/portal$/);
}

test('cancelling a visit previews it first, and only the second click cancels', async ({ page }) => {
  const visit = await prisma.visit.findFirstOrThrow({
    where: { status: 'pending', date: { gte: toDbDate(localDateOf(new Date())) } },
    orderBy: { date: 'asc' },
  });
  await signInToPortal(page, visit.propertyId);

  await page.getByText('Need to skip this one?').first().click();
  await page.getByRole('link', { name: 'Cancel this visit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Cancel this visit?' })).toBeVisible();
  await expect(page.getByText(/\$/)).toBeVisible();
  expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe('pending');

  await page.getByRole('link', { name: 'Keep it' }).click();
  await expect(page).toHaveURL(/\/portal$/);

  await page.goto(`/portal/cancel/${visit.id}`);
  await page.getByRole('button', { name: 'Yes, cancel this visit' }).click();
  await expect(page).toHaveURL(/\/portal(\?.*)?$/);
  expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe('skipped');
});
