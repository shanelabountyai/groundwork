import { expect, test } from '@playwright/test';
import { signInAs } from './sign-in';

test('asking for a link gives the same answer whether or not the account exists', async ({ page }) => {
  for (const login of ['dispatch@e2e.example', 'nobody@e2e.example']) {
    await page.goto('/');
    await page.getByLabel('Email or mobile number').fill(login);
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(page.getByRole('status')).toHaveText(/If that matches an account/);
  }
});

test('a spent or made-up link does not sign in', async ({ page }) => {
  await page.goto('/login/not-a-real-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/expired or was already used/)).toBeVisible();
});

test('a crew lead is kept off the dispatcher pages, and sign-out ends the session', async ({ page }) => {
  await signInAs(page, { phone: '+19185550100' });
  await page.goto('/dispatch');
  await expect(page).toHaveURL(/\/crew\//);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/dispatch');
  await expect(page.getByRole('button', { name: 'Send sign-in link' })).toBeVisible();
});
