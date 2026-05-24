import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 2,       // two retries for heavy sites like YouTube
  workers: 1,       // serial: launchPersistentContext cannot run concurrently
  use: {
    headless: false, // Chrome extensions require non-headless
    viewport: { width: 1280, height: 800 },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
