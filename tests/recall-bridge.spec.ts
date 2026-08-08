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

/** A page whose origin really is the app's, with a stand-in body. */
async function openAppStandIn(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.route('https://clipmark.mithahara.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Clipmark</title><h1>stand-in</h1>' }));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  return page;
}

function sendStartRecall(page: Page, extensionId: string, bookmarkIds?: number[]) {
  return page.evaluate(({ id, ids }) => new Promise(resolve => {
    const cr = (window as unknown as { chrome: { runtime: { sendMessage: (i: string, m: unknown, cb: (r: unknown) => void) => void; lastError?: { message?: string } } } }).chrome.runtime;
    cr.sendMessage(id, { type: 'START_RECALL', videoId: VIDEO_ID, bookmarkIds: ids }, r =>
      resolve(r ?? { ok: false, error: cr.lastError?.message }));
  }), { id: extensionId, ids: bookmarkIds });
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
