import { createHash, randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { prisma } from '../src/db';

/**
 * Signs in through a real link. The link itself goes to a phone or inbox the
 * test cannot read, so the test mints the token the way requestLink does
 * and takes it from the landing page onward.
 */
export async function signInAs(page: Page, login: { email: string } | { phone: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: login });
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  await prisma.loginToken.create({
    data: { hash: createHash('sha256').update(token).digest('hex'), userId: user.id, createdAt: new Date(now), expiresAt: new Date(now + 15 * 60_000) },
  });
  await page.goto(`/login/${token}`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login\//);
}
