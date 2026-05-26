import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 1,       // one retry for flaky network
  workers: 1,       // serial: launchPersistentContext cannot run concurrently
  use: {
    viewport: { width: 1280, height: 800 },
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
      testMatch: /visual\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        baseURL: 'http://localhost:3000',
      },
    },
  ],
  webServer: {
    command: 'cd webapp && npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
