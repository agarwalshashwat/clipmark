/**
 * Extension dashboard → per-card "Recall" button, against the PACKAGED build.
 *
 * Active Recall is not Pro-only: the pricing page sells it as free up to
 * FREE_RECALL_REVIEWS_PER_MONTH reviews a month, unlimited on Pro. #96 unified
 * that rule into `isRecallStartBlocked` across four entry points and missed a
 * fifth — this one. The `.vc-revisit-btn` on every video card kept a bare
 * `checkPro()` hard-block, so a free user clicking Recall got an "unlock it
 * with Pro" modal for a feature they are entitled to, while the due-strip
 * button in the same file honoured the monthly cap.
 *
 * `tests/unit/recall-gate-coverage.test.mjs` pins the invariant at the source
 * level (and runs in ci-unit); this is the runtime half — it asserts what the
 * user actually gets from the bytes that ship.
 *
 * Fully offline: youtube.com is route-intercepted at the context level, so the
 * tab the handler opens after the gate never hits the network.
 *
 * Requires `make ext-build` (skips with a message otherwise).
 */
import { test, expect, BrowserContext, Worker, Page } from '@playwright/test';
import { TEST_VIDEO_ID, launchExtensionContext } from './fixtures';
import { existsSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const APP_ORIGIN = 'https://clipmark.mithahara.com';
const AT_CAP = 30; // FREE_RECALL_REVIEWS_PER_MONTH

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

/** One bookmark for TEST_VIDEO_ID, so a video card (and its Recall button) renders. */
async function seed(worker: Worker, { isPro, reviewCount }: { isPro: boolean; reviewCount: number }) {
  await worker.evaluate(
    ({ key, rows, user, usage }) => Promise.all([
      new Promise<void>(r => chrome.storage.sync.set({ [key]: rows, bmUser: user }, () => r())),
      new Promise<void>(r => chrome.storage.local.set({ recallReviewUsage: usage }, () => r())),
    ]).then(() => undefined),
    {
      key: `bm_${TEST_VIDEO_ID}`,
      rows: [{
        id: 701,
        videoId: TEST_VIDEO_ID,
        timestamp: 30,
        description: 'A moment',
        tags: [],
        color: '#ffa94d',
        createdAt: new Date().toISOString(),
        videoTitle: 'Test video',
      }],
      user: {
        userId: 'u1',
        userEmail: 'u@example.com',
        accessToken: unexpiredToken(),
        refreshToken: 'r',
        isPro,
      },
      // The period key the extension computes for "now" (UTC 'YYYY-MM').
      usage: {
        periodStart: `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`,
        count: reviewCount,
      },
    },
  );
}

/**
 * Keeps the run offline. `/api/me` is stubbed to echo the seeded entitlement so
 * checkPro()'s refresh can't flip it, and youtube.com is intercepted because the
 * handler opens a tab there once the gate passes.
 */
async function stubNetwork(context: BrowserContext, isPro: boolean) {
  await context.route(`${APP_ORIGIN}/api/**`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route(`${APP_ORIGIN}/api/me*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isPro }) }));
  await context.route('**://*.youtube.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub</body></html>' }));
}

async function pendingRevision(worker: Worker): Promise<{ videoId?: string; recall?: boolean } | null> {
  return worker.evaluate(() =>
    new Promise(r => chrome.storage.local.get({ pendingRevision: null }, v => r(v.pendingRevision)))) as
    Promise<{ videoId?: string; recall?: boolean } | null>;
}

async function openDashboard(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/pages/dashboard.html`, {
    waitUntil: 'domcontentloaded',
  });
  // Video cards (and their .vc-revisit-btn) are rendered by renderBookmarks(),
  // which drives the default "All Bookmarks" view — no navigation needed.
  await page.locator('.vc-revisit-btn').first().waitFor({ timeout: 15_000 });
  return page;
}

test.describe('packaged dashboard: per-card Recall button honours the free tier', () => {
  test.beforeEach(() => {
    test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  });

  test('a FREE user under the monthly cap starts a session — no Pro paywall', async () => {
    const context = await launchExtensionContext(DIST);
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;
      await seed(worker, { isPro: false, reviewCount: AT_CAP - 1 });
      await stubNetwork(context, false);

      const page = await openDashboard(context, extensionId);
      await page.locator('.vc-revisit-btn').first().click();

      // The session must actually start: a handoff is written for the video.
      await expect.poll(async () => (await pendingRevision(worker))?.videoId, { timeout: 10_000 })
        .toBe(TEST_VIDEO_ID);
      expect((await pendingRevision(worker))?.recall).toBe(true);

      // And the free user is NOT told Active Recall is a Pro feature.
      await expect(page.locator('#cm-upgrade-overlay')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a FREE user at the cap is refused, and told it is about reviews — not that Recall is Pro-only', async () => {
    const context = await launchExtensionContext(DIST);
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;
      await seed(worker, { isPro: false, reviewCount: AT_CAP });
      await stubNetwork(context, false);

      const page = await openDashboard(context, extensionId);
      await page.locator('.vc-revisit-btn').first().click();

      const overlay = page.locator('#cm-upgrade-overlay');
      await overlay.waitFor({ timeout: 10_000 });
      // The cap message, not the old "Active Recall Mode … Unlock it with Pro".
      await expect(overlay.locator('.cm-upgrade-title')).toHaveText(/reviews this month/i);
      await expect(overlay.locator('.cm-upgrade-benefit')).toContainText(String(AT_CAP));

      // Refused before any handoff was written.
      expect(await pendingRevision(worker)).toBeNull();
    } finally {
      await context.close();
    }
  });

  test('a PRO user past the same counter is unaffected', async () => {
    const context = await launchExtensionContext(DIST);
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;
      await seed(worker, { isPro: true, reviewCount: AT_CAP * 10 });
      await stubNetwork(context, true);

      const page = await openDashboard(context, extensionId);
      await page.locator('.vc-revisit-btn').first().click();

      await expect.poll(async () => (await pendingRevision(worker))?.videoId, { timeout: 10_000 })
        .toBe(TEST_VIDEO_ID);
      await expect(page.locator('#cm-upgrade-overlay')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
