/**
 * Web → extension Active Recall bridge, against the PACKAGED build.
 *
 * The web dashboard can't drive the YouTube player, so it asks the extension to
 * run the session via `chrome.runtime.sendMessage` (allowed by the manifest's
 * `externally_connectable`). This spec exercises that whole chain in real Chrome:
 * app origin → background START_RECALL → YouTube tab → recall overlay.
 *
 * The "web app" is a stand-in page served AT THE REAL ORIGIN via route
 * interception — the origin is genuine (only the body is faked), which is what
 * `externally_connectable` matches on. That also means this spec doubles as the
 * regression test for the manifest gate itself.
 *
 * Requires `make ext-build` (skips with a message otherwise).
 */
import { test, expect, BrowserContext, Worker, Page } from '@playwright/test';
import { TEST_VIDEO_ID, TEST_VIDEO_URL, launchExtensionContext } from './fixtures';
import { existsSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const VIDEO_ID = TEST_VIDEO_ID;
const VIDEO_URL = TEST_VIDEO_URL;
const APP_URL = 'https://clipmark.mithahara.com/dashboard';

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

async function launchPackaged(): Promise<BrowserContext> {
  return launchExtensionContext(DIST);
}

/** Three bookmarks, all due (createdAt 10 days back vs a [1,3,7] schedule). */
function seedData() {
  const createdAt = new Date(Date.now() - 10 * 86400000).toISOString();
  return [
    { id: 501, videoId: VIDEO_ID, timestamp: 12, description: 'DUE-ONE', tags: ['important'], color: '#ef4444', createdAt, videoTitle: 'T', reviewSchedule: [1, 3, 7], lastReviewed: null },
    { id: 502, videoId: VIDEO_ID, timestamp: 25, description: 'DUE-TWO', tags: [], color: '#4da1ee', createdAt, videoTitle: 'T', reviewSchedule: [1, 3, 7], lastReviewed: null },
    { id: 503, videoId: VIDEO_ID, timestamp: 40, description: 'NOT-REQUESTED', tags: [], color: '#4da1ee', createdAt, videoTitle: 'T', reviewSchedule: [1, 3, 7], lastReviewed: null },
  ];
}

async function seed(worker: Worker, data: unknown[]) {
  await worker.evaluate(
    ({ key, rows }) => new Promise<void>(r => chrome.storage.sync.set({ [key]: rows }, () => r())),
    { key: `bm_${VIDEO_ID}`, rows: data },
  );
}

/** Signs a user in, at the given entitlement. */
async function seedUser(worker: Worker, isPro: boolean) {
  await worker.evaluate(
    (pro) => new Promise<void>(r => chrome.storage.sync.set(
      { bmUser: { userId: 'u1', userEmail: 'u@example.com', accessToken: 't', refreshToken: 'r', isPro: pro } },
      () => r(),
    )),
    isPro,
  );
}

/**
 * Sets this month's Active Recall review counter. The period key is computed
 * inside the worker so it always matches the current UTC month the way
 * usage-caps' normalizeMonthlyCounter expects — a stale key would silently
 * reset to zero and the test would pass for the wrong reason.
 */
async function seedReviewCount(worker: Worker, count: number) {
  await worker.evaluate(
    (n) => new Promise<void>(r => {
      const d = new Date();
      const periodStart = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      chrome.storage.local.set({ recallReviewUsage: { periodStart, count: n } }, () => r());
    }),
    count,
  );
}

/** A page whose origin really is the app's, with a stand-in body. */
async function openAppStandIn(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.route('https://clipmark.mithahara.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Clipmark</title><h1>stand-in</h1>' }));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  return page;
}

function sendStartRecall(page: Page, extensionId: string, bookmarkIds?: number[]) {
  // Every value the page needs must be passed in: page.evaluate ships the
  // function source to the browser, where this module's top-level consts do
  // not exist (a bare VIDEO_ID here throws ReferenceError in the page).
  return page.evaluate(({ id, ids, videoId }) => new Promise(resolve => {
    const cr = (window as unknown as { chrome: { runtime: { sendMessage: (i: string, m: unknown, cb: (r: unknown) => void) => void; lastError?: { message?: string } } } }).chrome.runtime;
    cr.sendMessage(id, { type: 'START_RECALL', videoId, bookmarkIds: ids }, r =>
      resolve(r ?? { ok: false, error: cr.lastError?.message }));
  }), { id: extensionId, ids: bookmarkIds, videoId: VIDEO_ID });
}

test.describe('Active Recall bridge: web app → extension', () => {
  test.beforeEach(() => {
    test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  });

  test('starts a session in a NEW tab, scoped to the requested ids', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;
      await seed(worker, seedData());

      const app = await openAppStandIn(context);
      // Chrome exposes a limited chrome.runtime only to externally_connectable origins.
      expect(await app.evaluate(() =>
        typeof (window as unknown as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime?.sendMessage === 'function',
      )).toBe(true);

      const res = await sendStartRecall(app, extensionId, [501, 502]) as { ok: boolean; count: number };
      expect(res.ok).toBe(true);
      expect(res.count).toBe(2); // filtered by id — the third bookmark is excluded

      const yt = await context.waitForEvent('page', { timeout: 20_000 });
      await yt.waitForLoadState('domcontentloaded');
      expect(yt.url()).toContain(VIDEO_ID);

      const panel = yt.locator('.yt-recall-panel');
      await panel.waitFor({ timeout: 30_000 });
      await expect(panel).toContainText('Recall this moment');
      await expect(panel).toContainText('Clip 1 / 2');   // only the two requested
      await expect(panel).not.toContainText('DUE-ONE');  // answer still withheld
    } finally {
      await context.close();
    }
  });

  test('reuses an already-open tab without reloading it', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;
      await seed(worker, seedData());

      // Open the video first and let the content script boot.
      const yt = await context.newPage();
      await yt.goto(VIDEO_URL, { waitUntil: 'networkidle' });
      await yt.locator('.yt-bookmark-player-btn').waitFor({ timeout: 20_000 });
      // Marker the page so we can prove it was NOT reloaded.
      await yt.evaluate(() => { (window as unknown as { __kept: boolean }).__kept = true; });

      const app = await openAppStandIn(context);
      const res = await sendStartRecall(app, extensionId, [501, 502]) as { ok: boolean; count: number; reusedTab?: boolean };
      expect(res.ok).toBe(true);
      expect(res.reusedTab).toBe(true);

      await yt.locator('.yt-recall-panel').waitFor({ timeout: 20_000 });
      await expect(yt.locator('.yt-recall-panel')).toContainText('Clip 1 / 2');
      // Survived → the live content script was messaged instead of a reload.
      expect(await yt.evaluate(() => (window as unknown as { __kept?: boolean }).__kept === true)).toBe(true);
    } finally {
      await context.close();
    }
  });

  /**
   * The free-tier paywall on the web-started path.
   *
   * Active Recall started from the extension has always been capped for free
   * users (30 reviews/month), but the web dashboard's bridge handler applied no
   * entitlement check at all — so a free user with the extension installed had
   * unlimited Active Recall just by starting it from the website.
   *
   * These assert against the SHIPPED background worker rather than the
   * dashboard's UI, because the UI is not the gate: this exact
   * `chrome.runtime.sendMessage` call is what a user can make straight from the
   * console, skipping every button the page renders.
   *
   * All three cases stay offline — a refused session never opens a tab, and the
   * "gate passed" cases seed no bookmarks, so they stop at `no_bookmarks`
   * instead of loading youtube.com. That keeps this deterministic.
   */
  test.describe('free-tier review cap', () => {
    const AT_CAP = 30; // FREE_RECALL_REVIEWS_PER_MONTH

    test('refuses a free user who has spent this month\'s reviews, and opens no tab', async () => {
      const context = await launchPackaged();
      try {
        const worker = await extensionServiceWorker(context);
        const extensionId = new URL(worker.url()).host;
        await seed(worker, seedData());
        await seedUser(worker, false);
        await seedReviewCount(worker, AT_CAP);

        const app = await openAppStandIn(context);
        const before = context.pages().length;

        const res = await sendStartRecall(app, extensionId, [501, 502]) as
          { ok: boolean; error?: string; cap?: number };
        expect(res.ok).toBe(false);
        expect(res.error).toBe('review_cap_reached');
        expect(res.cap).toBe(AT_CAP);

        // The refusal must happen before any hand-off: no new tab, and no
        // pendingRevision left in storage for the next YouTube visit to pick up.
        await app.waitForTimeout(2000);
        expect(context.pages().length).toBe(before);
        const pending = await worker.evaluate(() =>
          new Promise(r => chrome.storage.local.get({ pendingRevision: null }, v => r(v.pendingRevision))));
        expect(pending).toBeNull();
      } finally {
        await context.close();
      }
    });

    test('lets a free user under the cap through the gate', async () => {
      const context = await launchPackaged();
      try {
        const worker = await extensionServiceWorker(context);
        const extensionId = new URL(worker.url()).host;
        await seedUser(worker, false);
        await seedReviewCount(worker, AT_CAP - 1);
        // No bookmarks seeded: past the gate, the handler stops here rather
        // than opening youtube.com.

        const app = await openAppStandIn(context);
        const res = await sendStartRecall(app, extensionId) as { ok: boolean; error?: string };
        expect(res.ok).toBe(false);
        expect(res.error).toBe('no_bookmarks'); // i.e. NOT review_cap_reached
      } finally {
        await context.close();
      }
    });

    test('lets a Pro user past the same counter', async () => {
      const context = await launchPackaged();
      try {
        const worker = await extensionServiceWorker(context);
        const extensionId = new URL(worker.url()).host;
        await seedUser(worker, true);
        await seedReviewCount(worker, AT_CAP * 10);

        const app = await openAppStandIn(context);
        const res = await sendStartRecall(app, extensionId) as { ok: boolean; error?: string };
        expect(res.ok).toBe(false);
        expect(res.error).toBe('no_bookmarks'); // entitlement wins over the counter
      } finally {
        await context.close();
      }
    });
  });

  test('the manifest gate keeps other origins from messaging the extension', async () => {
    const context = await launchPackaged();
    try {
      await extensionServiceWorker(context);
      const page = await context.newPage();
      await page.route('https://example.com/**', r =>
        r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
      await page.goto('https://example.com/', { waitUntil: 'domcontentloaded' });

      // Not in externally_connectable → Chrome never injects chrome.runtime,
      // so the START_RECALL handler is unreachable from here.
      expect(await page.evaluate(() =>
        typeof (window as unknown as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime?.sendMessage === 'function',
      )).toBe(false);
    } finally {
      await context.close();
    }
  });
});
