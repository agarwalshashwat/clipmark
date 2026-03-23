import { test as base, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '../extension');

// A well-known public video with chapters (for .ytp-chapter-title-content test)
export const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
// A second video for SPA navigation tests
export const TEST_VIDEO_URL_2 = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
