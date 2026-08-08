/**
 * A–B multi-segment loop — end-to-end against the PACKAGED build.
 *
 * Loads `extension/dist` (the artifact uploaded to the Chrome Web Store) rather
 * than the source dir, for the same reason as recall-packaged.spec.ts: a
 * bundler tree-shake once shipped an empty helper chunk that broke the packaged
 * extension while every source-loaded test stayed green. The loop engine is a
 * new classic content-script twin (src/loop.js), so it needs the same coverage.
 *
 * The loop MATH is unit-tested in tests/unit/loop.test.mjs; what only a real
 * browser can prove is the plumbing:
 *   - the watchdog actually seeks the real <video> at 2x
 *   - it keeps doing so inside real fullscreen
 *   - a saved loop round-trips through chrome.storage.sync and paints its range
 *
 * Real YouTube won't reliably autoplay under automation, so playback is driven
 * by writing video.currentTime. That still exercises the shipped watchdog: its
 * 200ms safety interval ticks regardless of whether frames are being presented.
 *
 * Requires `make ext-build` first (skips with a message otherwise).
 */
import { test, expect, chromium, BrowserContext, Page, Worker } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO_ID = 'dQw4w9WgXcQ';

const A = 30;
const B = 40;

function bmKey(id: string): string { return `bm_${id}`; }

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
  return chromium.launchPersistentContext('', {
    headless: false, // Chrome extensions require non-headless
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-sandbox',
    ],
  });
}

/** A saved loop is an ordinary bookmark carrying a `loop: { end }` range. */
function seedLoopBookmark() {
  return [{
    id: 2001,
    videoId: VIDEO_ID,
    timestamp: A,
    description: 'Hard bit',
    tags: [],
    color: '#8b5cf6',
    createdAt: new Date().toISOString(),
    videoTitle: 'Test',
    reviewSchedule: [1, 3, 7],
    lastReviewed: null,
    loop: { end: B },
  }];
}

async function seed(worker: Worker, bookmarks: unknown[]): Promise<void> {
  await worker.evaluate(
    ({ key, data }) => new Promise<void>(r => chrome.storage.sync.set({ [key]: data }, () => r())),
    { key: bmKey(VIDEO_ID), data: bookmarks },
  );
}

async function openWatchPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(VIDEO_URL, { waitUntil: 'networkidle' });
  // The built content.js references the loop helpers as bare globals, so the
  // injected player buttons prove the loop chunk survived bundling.
  await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 20_000 });
  await page.locator('video').hover({ force: true });
  await page.locator('.yt-loop-player-btn').waitFor({ timeout: 20_000 });
  // Keep the player quiet — position is driven explicitly below.
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.pause());
  return page;
}

const position = (page: Page) =>
  page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);

/** Drops the playhead past B and gives the watchdog time to pull it back. */
async function overshootAndSettle(page: Page, to: number): Promise<void> {
  await page.locator('video').evaluate((v: HTMLVideoElement, t: number) => { v.currentTime = t; }, to);
  await page.waitForTimeout(900); // ≫ the watchdog's 200ms safety interval
}

test.describe('A–B loop (packaged dist build)', () => {
  test.beforeEach(() => {
    test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  });

  test('a saved loop round-trips from storage and can be re-armed', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      await seed(worker, seedLoopBookmark());
      const page = await openWatchPage(context);

      // The saved range paints on the scrubber, distinct from point markers.
      await page.locator('.yt-loop-range--saved').waitFor({ timeout: 15_000 });

      // …and is listed in the panel, named, with its range.
      await page.locator('.yt-loop-player-btn').click();
      const panel = page.locator('.yt-loop-panel');
      await panel.waitFor({ timeout: 10_000 });
      await expect(panel).toContainText('Hard bit');
      await expect(panel).toContainText('0:30 → 0:40');

      // Clicking it arms the loop on the real player.
      await panel.locator('.yt-loop-row').first().click();
      await page.waitForTimeout(600);
      expect(await position(page)).toBeGreaterThanOrEqual(A - 1);
      expect(await position(page)).toBeLessThan(B);
    } finally {
      await context.close();
    }
  });

  for (const rate of [1, 1.5, 2]) {
    test(`wraps back to A at ${rate}x`, async () => {
      const context = await launchPackaged();
      try {
        const worker = await extensionServiceWorker(context);
        await seed(worker, seedLoopBookmark());
        const page = await openWatchPage(context);

        await page.locator('.yt-loop-player-btn').click();
        await page.locator('.yt-loop-panel').waitFor({ timeout: 10_000 });
        await page.locator('.yt-loop-row').first().click();
        await page.locator('video').evaluate((v: HTMLVideoElement, r: number) => {
          v.playbackRate = r;
        }, rate);
        await page.waitForTimeout(500);

        // Land exactly on B, then well past it — the second case is what breaks
        // competitors at speed, where one tick of media time overshoots the end.
        await overshootAndSettle(page, B);
        expect(await position(page)).toBeLessThan(B);
        expect(await position(page)).toBeGreaterThanOrEqual(A - 1);

        await overshootAndSettle(page, B + 3);
        expect(await position(page)).toBeLessThan(B);
        expect(await position(page)).toBeGreaterThanOrEqual(A - 1);
      } finally {
        await context.close();
      }
    });
  }

  test('keeps looping at 2x inside fullscreen, with the panel still visible', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      await seed(worker, seedLoopBookmark());
      const page = await openWatchPage(context);

      await page.locator('.yt-loop-player-btn').click();
      await page.locator('.yt-loop-panel').waitFor({ timeout: 10_000 });
      await page.locator('.yt-loop-row').first().click();
      await page.locator('video').evaluate((v: HTMLVideoElement) => { v.playbackRate = 2; });

      // requestFullscreen needs user activation, so go through a real click on a
      // temporary trigger rather than a bare page.evaluate().
      await page.evaluate(() => {
        const trigger = document.createElement('button');
        trigger.id = 'clipmark-fs-trigger';
        trigger.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647';
        trigger.textContent = 'fs';
        trigger.addEventListener('click', () => {
          const player = document.querySelector('.html5-video-player') || document.body;
          (player as HTMLElement).requestFullscreen?.().catch(() => {});
        });
        document.body.appendChild(trigger);
      });
      await page.locator('#clipmark-fs-trigger').click();
      await page.waitForTimeout(1200);

      const inFullscreen = await page.evaluate(() => !!document.fullscreenElement);
      test.skip(!inFullscreen, 'browser refused fullscreen in this environment');

      // The panel must live INSIDE the fullscreen subtree — anywhere else and
      // the browser simply does not paint it.
      expect(await page.evaluate(() => {
        const panel = document.querySelector('.yt-loop-panel');
        return !!panel && !!document.fullscreenElement?.contains(panel);
      })).toBe(true);
      await expect(page.locator('.yt-loop-panel')).toBeVisible();

      // …and the watchdog is still driving the player.
      await overshootAndSettle(page, B + 3);
      expect(await position(page)).toBeLessThan(B);
      expect(await position(page)).toBeGreaterThanOrEqual(A - 1);
    } finally {
      await context.close();
    }
  });

  test('chains multiple segments instead of keeping only the last one', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      await seed(worker, [
        ...seedLoopBookmark(),
        { ...seedLoopBookmark()[0], id: 2002, timestamp: 80, description: 'Second bit', loop: { end: 90 } },
      ]);
      const page = await openWatchPage(context);

      await page.locator('.yt-loop-player-btn').click();
      const panel = page.locator('.yt-loop-panel');
      await panel.waitFor({ timeout: 10_000 });
      // Both saved loops are listed — the single-segment limitation is the top
      // complaint about the market leader, so this is the differentiator.
      expect(await panel.locator('.yt-loop-row').count()).toBe(2);

      // Arm both, then run off the end of the first: chain mode advances to the
      // second segment rather than wrapping in place.
      await panel.locator('.yt-loop-row').nth(0).click();
      await page.locator('.yt-loop-player-btn').click();
      await panel.locator('.yt-loop-row').nth(1).click();
      await page.waitForTimeout(500);

      await panel.locator('.yt-loop-row').first().click(); // back to segment 1
      await page.waitForTimeout(500);
      await overshootAndSettle(page, B + 1);

      const at = await position(page);
      expect(at, 'chain mode should have advanced to the second segment').toBeGreaterThanOrEqual(79);
      expect(at).toBeLessThan(90);
    } finally {
      await context.close();
    }
  });
});
