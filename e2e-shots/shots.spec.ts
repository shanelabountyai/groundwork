import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../src/db';
import { addDays, localDateOf } from '../src/time';
import { isServiceDay } from '../src/visits/cascade';
import { signInAs } from '../e2e/sign-in';

const OUT = 'docs/screenshots';
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };

const serviceDay = () => {
  let d = localDateOf(new Date());
  while (!isServiceDay(d)) d = addDays(d, 1);
  return d;
};

test.describe('dispatcher', () => {
  test.use({ viewport: DESK });

  test('board, crew-day, reports', async ({ page }) => {
    await signInAs(page, { email: 'dispatch@evergreen.example' });
    await expect(page.getByRole('link', { name: 'Board' })).toBeVisible();
    await page.screenshot({ path: `${OUT}/dispatch-board.png` });

    const crew = await prisma.crew.findFirstOrThrow({ where: { name: 'Midtown' } });
    await page.goto(`/dispatch/${crew.id}/${serviceDay()}`);
    await page.screenshot({ path: `${OUT}/dispatch-crew-day.png`, fullPage: true });

    await page.goto('/dispatch/report');
    await page.screenshot({ path: `${OUT}/dispatch-report.png`, fullPage: true });
  });
});

test.describe('phone', () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test('crew view', async ({ page }) => {
    await signInAs(page, { phone: '+19185550150' });
    await page.screenshot({ path: `${OUT}/crew-day.png`, fullPage: true });
  });

  test('customer portal', async ({ page }) => {
    const property = await prisma.property.findFirstOrThrow({ where: { customerPhone: '918-555-0101' } });
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    await prisma.portalToken.create({
      data: { hash: createHash('sha256').update(token).digest('hex'), propertyId: property.id, createdAt: new Date(now), expiresAt: new Date(now + 15 * 60_000) },
    });
    await page.goto(`/portal/${token}`);
    await page.getByRole('button', { name: 'View my schedule' }).click();
    await expect(page).toHaveURL(/\/portal$/);
    await page.screenshot({ path: `${OUT}/portal.png`, fullPage: true });
  });
});
