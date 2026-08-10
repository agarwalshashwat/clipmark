/**
 * Extension dashboard → Reminders, against the PACKAGED build.
 *
 * `dashboard.js` read a bare `TITLE_TRUNCATE_LENGTH` while building the
 * Reminders "create" form's video <select>. That constant is defined only in
 * `src/constants.js`, a classic content script the manifest injects into
 * youtube.com — the dashboard PAGE has its own ESM graph and never loads it, so
 * the name was undefined and the form threw a ReferenceError for any user with
 * at least one titled bookmark. The whole Reminders view was dead in the
 * shipping zip.
 *
 * Nothing caught it: source-based specs run on youtube.com where the content
 * script has already defined the global, and `content-globals-guard.mjs` only
 * inspects content-script chunks. So this spec loads `extension/dist` — the
 * bytes that ship — opens the real dashboard page, and watches for a
 * ReferenceError. `scripts/page-globals-guard.mjs` now fails the build on the
 * same class; this is the runtime half of that pair.
 *
 * Fully offline: every API call the view makes is route-intercepted, and
 * youtube.com is never loaded.
 *
 * Requires `make ext-build` (skips with a message otherwise).
 */
import { test, expect, BrowserContext, Worker, Page } from '@playwright/test';
import { TEST_VIDEO_ID, launchExtensionContext } from './fixtures';
import { existsSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const APP_ORIGIN = 'https://clipmark.mithahara.com';

// Longer than TITLE_TRUNCATE_LENGTH (60) on purpose: the <option> label must be
// visibly cut, which is only observable if the constant actually resolved.
const LONG_TITLE =
  'But what is a neural network? | Deep learning chapter 1, an unusually long title for truncation';
const TRUNCATE_AT = 60;

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

/** A JWT-shaped token whose `exp` is far enough out that getValidToken uses it as-is. */
function unexpiredToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

async function seed(worker: Worker) {
  await worker.evaluate(
    ({ key, rows, user }) => new Promise<void>(r => chrome.storage.sync.set({ [key]: rows, bmUser: user }, () => r())),
    {
      key: `bm_${TEST_VIDEO_ID}`,
      rows: [{
        id: 901,
        videoId: TEST_VIDEO_ID,
        timestamp: 30,
        description: 'A moment #review',
        tags: ['review'],
        color: '#ffa94d',
        createdAt: new Date().toISOString(),
        videoTitle: LONG_TITLE,
      }],
      user: {
        userId: 'u1',
        userEmail: 'u@example.com',
        accessToken: unexpiredToken(),
        refreshToken: 'r',
        isPro: true,
      },
    },
  );
}

/**
 * Answers every call the Reminders view makes, so it renders without network.
 *
 * Registration order matters: Playwright matches routes last-registered-first,
 * so the catch-all goes on FIRST and the specific shapes override it. With the
 * order reversed, /api/groups gets `{}` and buildCreateForm dies on
 * `groups.map` — a different failure that would masquerade as this bug.
 */
async function stubApi(page: Page) {
  await page.route(`${APP_ORIGIN}/api/**`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route(`${APP_ORIGIN}/api/reminders*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ due: [], upcoming: [] }) }));
  await page.route(`${APP_ORIGIN}/api/groups*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

test.describe('packaged dashboard: Reminders create form', () => {
  test.beforeEach(() => {
    test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  });

  test('renders for a user with a titled bookmark, with no ReferenceError', async () => {
    const context = await launchExtensionContext(DIST);
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;
      await seed(worker);

      const page = await context.newPage();
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', err => pageErrors.push(`${err.name}: ${err.message}`));
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      await stubApi(page);

      await page.goto(`chrome-extension://${extensionId}/src/pages/dashboard.html`, {
        waitUntil: 'domcontentloaded',
      });

      await page.locator('#subnav-revisit').click();

      // The form is built by buildCreateForm() — the function that threw.
      const form = page.locator('#rm-create-form');
      await form.waitFor({ timeout: 15_000 });

      // And the specific line that threw produced a real, truncated option.
      const option = page.locator(`#rm-create-form option[value="${TEST_VIDEO_ID}"]`);
      await expect(option).toHaveCount(1);
      const label = (await option.textContent()) ?? '';
      expect(label).toBe(LONG_TITLE.substring(0, TRUNCATE_AT));
      expect(label.length).toBe(TRUNCATE_AT);
      expect(label.length).toBeLessThan(LONG_TITLE.length); // truncation really happened

      const referenceErrors = [...pageErrors, ...consoleErrors].filter(e => /ReferenceError/.test(e));
      expect(referenceErrors, `unexpected ReferenceError(s): ${referenceErrors.join(' | ')}`).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
