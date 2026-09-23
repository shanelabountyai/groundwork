import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../src/db';
import { addDays, localDateOf, toDbDate } from '../src/time';
import { isServiceDay } from '../src/visits/cascade';
import { signInAs } from './sign-in';

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

  await page.getByText('Need to change this one?').first().click();
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

const weekdayAfter = (days: number) => {
  let d = addDays(localDateOf(new Date()), days);
  while (!isServiceDay(d)) d = addDays(d, 1);
  return d;
};

test('rescheduling to an open day previews "books right away", then moves the visit', async ({ page }) => {
  const crew = await prisma.crew.create({ data: { name: 'PX1 open', homeLat: 36.1, homeLng: -95.9, maxStops: 5, maxMinutes: 480 } });
  const visit = await makeJobVisit(crew.id, weekdayAfter(3), 6600);
  const to = weekdayAfter(10);
  await signInToPortal(page, visit.propertyId);

  await page.goto(`/portal/reschedule/${visit.id}`);
  await page.locator(`a[href$="?date=${to}"]`).click();
  await expect(page.getByText('so it books right away')).toBeVisible();
  expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe('pending');

  await page.getByRole('button', { name: /^Yes, move it to/ }).click();
  await expect(page.getByText(/^Moved to/)).toBeVisible();
  expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe('skipped');
  expect(await prisma.visit.count({ where: { crewId: crew.id, date: toDbDate(to), priceCents: 6600, status: 'pending' } })).toBe(1);
});

test('a full day becomes a request the dispatcher approves', async ({ page }) => {
  const crew = await prisma.crew.create({ data: { name: 'PX1 full', homeLat: 36.1, homeLng: -95.9, maxStops: 1, maxMinutes: 480 } });
  const to = weekdayAfter(12);
  const visit = await makeJobVisit(crew.id, weekdayAfter(4), 5500);
  await makeJobVisit(crew.id, to, 5500);
  await signInToPortal(page, visit.propertyId);

  await page.goto(`/portal/reschedule/${visit.id}?date=${to}`);
  await expect(page.getByText('goes to our office to confirm')).toBeVisible();
  await page.getByRole('button', { name: /^Yes, request/ }).click();
  await expect(page.getByText(/Awaiting confirmation/)).toBeVisible();
  expect(await prisma.visit.count({ where: { crewId: crew.id, date: toDbDate(to) } })).toBe(1);

  await signInAs(page, { email: 'dispatch@e2e.example' });
  await page.goto('/dispatch/reschedules');
  await page.getByRole('button', { name: 'Approve (over capacity)' }).first().click();
  await expect(page.getByText(/Approved and booked/)).toBeVisible();
  expect(await prisma.visit.count({ where: { crewId: crew.id, date: toDbDate(to), status: 'pending' } })).toBe(2);
});

/** A one-off job's visit on a fresh property, so specs never touch each other's rows. */
async function makeJobVisit(crewId: string, date: string, priceCents: number) {
  const serviceType = await prisma.serviceType.findFirstOrThrow();
  const property = await prisma.property.create({
    data: { address: `${date} PX1 Ln`, lat: 36.1, lng: -95.9, customerName: 'PX1', customerPhone: '+19185550199' },
  });
  const job = await prisma.job.create({ data: { propertyId: property.id, serviceTypeId: serviceType.id, priceCents, createdBy: 'e2e' } });
  return prisma.visit.create({
    data: { jobId: job.id, propertyId: property.id, serviceTypeId: serviceType.id, occurrenceDate: toDbDate(date), date: toDbDate(date), crewId, priceCents },
  });
}

test("a customer reaches only their own property's photos", async ({ page, request, browser }) => {
  const name = `${crypto.randomUUID()}.png`;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const { mkdir, writeFile, rm } = await import('node:fs/promises');
  await mkdir('uploads', { recursive: true });
  await writeFile(`uploads/${name}`, png);

  const visit = await prisma.visit.findFirstOrThrow({ orderBy: { date: 'asc' } });
  const other = await prisma.property.findFirstOrThrow({ where: { id: { not: visit.propertyId } } });
  const original = visit.beforePhoto;
  await prisma.visit.update({ where: { id: visit.id }, data: { beforePhoto: `uploads/${name}` } });
  try {
    expect((await request.get(`/portal/photos/${name}`)).status()).toBe(401);

    await signInToPortal(page, visit.propertyId);
    const own = await page.request.get(`/portal/photos/${name}`);
    expect(own.status()).toBe(200);
    expect(own.headers()['content-type']).toBe('image/png');

    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page2 = await ctx.newPage();
    await signInToPortal(page2, other.id);
    expect((await page2.request.get(`/portal/photos/${name}`)).status()).toBe(404);
    await ctx.close();
  } finally {
    await prisma.visit.update({ where: { id: visit.id }, data: { beforePhoto: original } });
    await rm(`uploads/${name}`, { force: true });
  }
});
