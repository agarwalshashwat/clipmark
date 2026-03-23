import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 40_000,
  retries: 1,       // one retry for flaky network
  workers: 1,       // serial: launchPersistentContext cannot run concurrently
  use: {
    headless: false, // Chrome extensions require non-headless
    viewport: { width: 1280, height: 800 },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
