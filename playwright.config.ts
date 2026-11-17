import { defineConfig, devices } from '@playwright/test';

// Phone smoke test: the built site, served locally, on an emulated phone.
// CI downloads Playwright's Chromium; on a desktop the installed Edge is used instead.
export default defineConfig({
  testDir: 'apps/site/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    channel: process.env.CI ? 'chromium' : 'msedge',
    baseURL: 'http://localhost:4329',
  },
  webServer: {
    // Its own port, so a dev server left running on Astro's default port is never tested by mistake.
    command: 'pnpm --filter @ii00ii/site preview --port 4329',
    url: 'http://localhost:4329',
    reuseExistingServer: !process.env.CI,
  },
});
