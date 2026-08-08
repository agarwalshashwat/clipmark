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
 * Deliberately avoids `networkidle`, `hover()` and real mouse clicks: YouTube
 * rarely goes idle, and the player auto-hides its control bar, so a coordinate
 * click on our injected button lands on whatever overlay is on top instead.
 * The controls are asserted as ATTACHED and driven with dispatchEvent, which
 * targets the element directly — this spec is testing our handlers, not
 * YouTube's chrome.
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

/** YouTube sometimes mounts a second <video> (ads/preview) — the player is the first. */
const mainVideo = (page: Page) => page.locator('video').first();

async function openWatchPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
  // The built content.js references the loop helpers as bare globals, so the
  // injected player buttons prove the loop chunk survived bundling. Attached,
  // not visible: YouTube hides the control bar until the pointer moves.
  await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: 30_000 });
  await page.locator('.yt-loop-player-btn').waitFor({ state: 'attached', timeout: 30_000 });
  // Keep the player quiet — position is driven explicitly below.
  await mainVideo(page).evaluate((v: HTMLVideoElement) => v.pause());
  return page;
}

/** Opens the loop panel and arms the saved loop at `index`. */
async function armSavedLoop(page: Page, index = 0): Promise<void> {
  await page.locator('.yt-loop-player-btn').dispatchEvent('click');
  await page.locator('.yt-loop-panel').waitFor({ timeout: 15_000 });
  await page.locator('.yt-loop-row').nth(index).dispatchEvent('click');
  await page.waitForTimeout(600);
}

async function setRate(page: Page, rate: number): Promise<void> {
  await mainVideo(page).evaluate((v: HTMLVideoElement, r: number) => {
    v.playbackRate = r;
  }, rate);
}

/** Ask the content script (via the SW) to start a revisit/recall session. */
async function startRevision(worker: Worker, bookmarks: unknown[], recall: boolean): Promise<void> {
  await worker.evaluate(
    ({ url, bms, useRecall }) => new Promise<void>((resolve, reject) => {
      chrome.tabs.query({ url }, tabs => {
        if (!tabs[0]?.id) { reject(new Error('No matching YouTube tab found')); return; }
        chrome.tabs.sendMessage(tabs[0].id, { action: 'startRevision', bookmarks: bms, recall: useRecall }, () => resolve());
      });
    }),
    { url: `${VIDEO_URL}*`, bms: bookmarks, useRecall: recall },
  );
}

async function storedBookmarks(worker: Worker): Promise<Record<string, unknown>[]> {
  return worker.evaluate(
    ({ key }) => new Promise<Record<string, unknown>[]>(r =>
      chrome.storage.sync.get({ [key]: [] }, x => r((x as Record<string, Record<string, unknown>[]>)[key]))),
    { key: bmKey(VIDEO_ID) },
  );
}

const position = (page: Page) =>
  mainVideo(page).evaluate((v: HTMLVideoElement) => v.currentTime);

/** Drops the playhead past B and gives the watchdog time to pull it back. */
async function overshootAndSettle(page: Page, to: number): Promise<void> {
  await mainVideo(page).evaluate((v: HTMLVideoElement, t: number) => { v.currentTime = t; }, to);
  await page.waitForTimeout(900); // ≫ the watchdog's 200ms safety interval
}

test.describe('A–B loop (packaged dist build)', () => {
  test.beforeEach(() => {
    test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
    // Each test launches a browser AND loads a real YouTube watch page before it
    // asserts anything; the 60s project default is not enough headroom.
    test.setTimeout(120_000);
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
      await page.locator('.yt-loop-player-btn').dispatchEvent('click');
      const panel = page.locator('.yt-loop-panel');
      await panel.waitFor({ timeout: 15_000 });
      await expect(panel).toContainText('Hard bit');
      await expect(panel).toContainText('0:30 → 0:40');

      // Clicking it arms the loop on the real player.
      await panel.locator('.yt-loop-row').first().dispatchEvent('click');
      await page.waitForTimeout(600);
      expect(await position(page)).toBeGreaterThanOrEqual(A - 1);
      expect(await position(page)).toBeLessThan(B);
    } finally {
      await context.close();
    }
  });

  // One context for all three rates: each browser launch + YouTube load is the
  // slow, flaky part, and the rate is the only variable being exercised.
  test('wraps back to A at 1x, 1.5x and 2x', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      await seed(worker, seedLoopBookmark());
      const page = await openWatchPage(context);
      await armSavedLoop(page);

      for (const rate of [1, 1.5, 2]) {
        await setRate(page, rate);

        // Land exactly on B, then well past it — the second case is what breaks
        // competitors at speed, where one tick of media time overshoots the end.
        for (const target of [B, B + 3]) {
          await overshootAndSettle(page, target);
          const at = await position(page);
          expect(at, `escaped the loop at ${rate}x from ${target}`).toBeLessThan(B);
          expect(at, `seeked outside the loop at ${rate}x from ${target}`).toBeGreaterThanOrEqual(A - 1);
        }
      }
    } finally {
      await context.close();
    }
  });

  test('keeps looping at 2x inside fullscreen, with the panel still visible', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      await seed(worker, seedLoopBookmark());
      const page = await openWatchPage(context);

      await armSavedLoop(page);
      await setRate(page, 2);

      // requestFullscreen needs USER ACTIVATION, so a dispatched (untrusted)
      // event won't do. A mouse click would, but Playwright hit-tests the
      // coordinates and YouTube's overlays sit on top — so focus a temporary
      // trigger and press Enter, which is trusted and needs no hit-testing.
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
      await page.locator('#clipmark-fs-trigger').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);

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

      await page.locator('.yt-loop-player-btn').dispatchEvent('click');
      const panel = page.locator('.yt-loop-panel');
      await panel.waitFor({ timeout: 15_000 });
      // Both saved loops are listed — the single-segment limitation is the top
      // complaint about the market leader, so this is the differentiator.
      expect(await panel.locator('.yt-loop-row').count()).toBe(2);

      // Arm both, then run off the end of the first: chain mode advances to the
      // second segment rather than wrapping in place.
      await panel.locator('.yt-loop-row').nth(0).dispatchEvent('click');
      await page.locator('.yt-loop-player-btn').dispatchEvent('click');
      await panel.locator('.yt-loop-row').nth(1).dispatchEvent('click');
      await page.waitForTimeout(500);

      await panel.locator('.yt-loop-row').first().dispatchEvent('click'); // back to segment 1
      await page.waitForTimeout(500);
      await overshootAndSettle(page, B + 1);

      const at = await position(page);
      expect(at, 'chain mode should have advanced to the second segment').toBeGreaterThanOrEqual(79);
      expect(at).toBeLessThan(90);
    } finally {
      await context.close();
    }
  });

  test('a segment can be edited: B re-anchors to the playhead and the save follows', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      await seed(worker, seedLoopBookmark());
      const page = await openWatchPage(context);
      await armSavedLoop(page);

      // Park the playhead past the current B and make that the new B. The first
      // edit suspends the loop, so the watchdog can't yank the playhead back to
      // A mid-edit — that suspend is the behaviour under test as much as the
      // range change is.
      await mainVideo(page).evaluate((v: HTMLVideoElement) => { v.currentTime = 55; });
      await page.locator('[data-loop-edit$=":end"]').first().dispatchEvent('click');
      await page.waitForTimeout(800);

      await expect(page.locator('.yt-loop-panel')).toContainText('0:30 → 0:55');
      await expect(page.locator('[data-loop-action="toggle"]')).toContainText('Loop');

      // The edit must reach storage, not just the panel — this is a saved loop.
      const stored = await storedBookmarks(worker);
      const loopRecord = stored.find(b => (b as { loop?: unknown }).loop) as
        { timestamp: number; loop: { end: number } } | undefined;
      expect(loopRecord?.loop.end).toBe(55);
      expect(loopRecord?.timestamp).toBe(30);

      // …and once re-armed, the loop honours the new bound.
      await page.locator('[data-loop-action="toggle"]').dispatchEvent('click');
      await page.waitForTimeout(600);
      await overshootAndSettle(page, 56);
      expect(await position(page)).toBeLessThan(55);
    } finally {
      await context.close();
    }
  });

  test('a saved loop drives Active Recall over its exact A–B range', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const saved = seedLoopBookmark();
      await seed(worker, saved);
      const page = await openWatchPage(context);

      // Same entry point the web dashboard uses — no loop-specific plumbing.
      await startRevision(worker, saved, true);
      const prompt = page.locator('.yt-recall-panel');
      await prompt.waitFor({ timeout: 15_000 });
      await expect(prompt).toContainText('Recall this moment');
      await expect(prompt).toContainText('0:30');

      await prompt.locator('.yt-recall-btn').dispatchEvent('click');
      await page.waitForTimeout(800);

      // The revisit overlay must show the loop's OWN range, not the default
      // "next bookmark or +60s" heuristic (which would read 0:30 → 1:30).
      await expect(page.locator('.yt-revision-range')).toHaveText('0:30 → 0:40');
    } finally {
      await context.close();
    }
  });

  test('survives YouTube removing the player chrome it hooks into', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      await seed(worker, seedLoopBookmark());
      const page = await openWatchPage(context);

      // Only errors thrown by the EXTENSION count here. Ripping out YouTube's
      // own nodes predictably makes YouTube's own scripts throw, which is not
      // what this test is about.
      const crashes: string[] = [];
      page.on('pageerror', e => {
        if ((e.stack ?? '').includes('chrome-extension://')) crashes.push(`${e}\n${e.stack}`);
      });

      // Rip out every selector the loop code reaches for, then poke the same
      // events a YouTube layout change / SPA nav would fire.
      await page.evaluate(() => {
        document.querySelector('.ytp-right-controls')?.remove();
        document.querySelector('.ytp-progress-bar')?.remove();
        document.querySelector('.yt-loop-ranges')?.remove();
        document.dispatchEvent(new CustomEvent('yt-navigate-finish'));
        document.dispatchEvent(new CustomEvent('fullscreenchange'));
      });
      await page.waitForTimeout(1500);

      // Keyboard control is bound to document, not the player chrome, so
      // looping must still be reachable with the controls gone.
      await page.keyboard.press('Alt+BracketLeft');
      await page.waitForTimeout(300);
      await mainVideo(page).evaluate((v: HTMLVideoElement) => { v.currentTime = 70; });
      await page.keyboard.press('Alt+BracketRight');
      await page.waitForTimeout(1000);

      expect(crashes, `content script threw: ${crashes[0] ?? ''}`).toEqual([]);
      await expect(page.locator('.yt-loop-panel')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
