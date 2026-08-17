import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 1,       // one retry for flaky network
  workers: 1,       // serial: launchPersistentContext cannot run concurrently
  use: {
    viewport: { width: 1280, height: 800 },
    // No test run may ever make sound. This covers every Playwright-launched
    // browser; specs that call chromium.launchPersistentContext themselves get
    // the same flag from tests/fixtures.ts → extensionLaunchArgs().
    launchOptions: { args: ['--mute-audio'] },
  },
  projects: [
    {
      name: 'extension',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /visual\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // Chrome extensions require non-headless
      },
    },
    {
      name: 'webapp',
      testMatch: /(visual|ci)\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        baseURL: 'http://localhost:3000',
      },
    },
  ],
  // The extension specs never talk to localhost:3000: they run against
  // chrome-extension:// pages and route-intercepted origins only. Booting
  // `next dev` for them costs ~30s and hands `ci-extension-smoke` a 120s-timeout
  // failure mode belonging to a server it has no use for — a second source of
  // the red builds in issue #84, alongside live youtube.com. The extension-only
  // npm scripts set this so the webapp projects keep their server unchanged.
  webServer: process.env.CLIPMARK_SKIP_WEBAPP_SERVER
    ? undefined
    : {
        command: 'cd webapp && npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
  reporter: [['list'], ['html', { open: 'never' }]],
});
