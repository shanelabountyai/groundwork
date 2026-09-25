import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3900);

/**
 * `npm run shots`: screenshots of the real seed (not the e2e fixtures), for the
 * demo and the exec-brief. Same production build as the e2e suite, no
 * globalSetup, so it never resets the database it is about to photograph.
 */
export default defineConfig({
  testDir: 'e2e-shots',
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
