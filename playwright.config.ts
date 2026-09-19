import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3900);

/**
 * e2e runs against a production build (`next build && next start`), never a
 * dev server. Env comes from whoever launched Playwright (`npm run test:e2e`
 * loads .env.test; CI sets it on the job), and the web server inherits it.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // Specs share one seeded database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The crew view's acceptance criterion: a phone, held in one hand.
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.env.E2E_DEV ? `npx next dev -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
