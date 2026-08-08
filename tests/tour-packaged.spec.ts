/**
 * First-run guided tour — end-to-end against the PACKAGED build.
 *
 * The v1.0.2 trap this exists to close: `yt-navigate-finish` is not a reliable
 * "you navigated" signal. YouTube fires it on the INITIAL load of a watch page
 * (~600ms in, after our tour has already appeared) and again as the SPA settles,
 * without the video ever changing. The listener treated every firing as a real
 * navigation, so it destroyed the live tour and restarted it at step 1 about a
 * second after it appeared. To a first-run user that reads as "Next does
 * nothing" (the step advanced, then the restart reset it) and "I can't close
 * it" (dismissed, then immediately re-shown) — and because each teardown set
 * abandonedForNavigation, which deliberately suppresses the seen flag, the tour
 * could neither be completed nor gotten rid of. A brand-new user was trapped.
 *
 * So these tests are mostly about the CONTROLS actually working, and about the
 * seen flag being set on genuine completion/dismissal and NOT on a real
 * navigation away mid-tour.
 *
 * Requires `make ext-build` first (skips with a message otherwise).
 */
import { test, expect, chromium, BrowserContext, Page, Worker } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const VIDEO_ID = 'dQw4w9WgXcQ';
const OTHER_VIDEO_ID = '9bZkp7q19f0';
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const OTHER_VIDEO_URL = `https://www.youtube.com/watch?v=${OTHER_VIDEO_ID}`;

const POPOVER = '.clipmark-tour-popover';
const PROGRESS = '.driver-popover-progress-text';
const NEXT = '.driver-popover-next-btn';
const PREV = '.driver-popover-prev-btn';
const CLOSE = '.driver-popover-close-btn';

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

async function launch(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    headless: false, // Chrome extensions require non-headless
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-sandbox', '--mute-audio'],
  });
}

/** Put the profile back to "never seen the tour". */
async function resetTour(worker: Worker): Promise<void> {
  await worker.evaluate(() => new Promise<void>((r) => chrome.storage.sync.remove('tourState', () => r())));
}

async function tourState(worker: Worker): Promise<Record<string, unknown>> {
  return worker.evaluate(() =>
    new Promise((r) => chrome.storage.sync.get({ tourState: {} }, (x) => r(x.tourState || {}))));
}

/** Open a watch page and wait for the tour's first step to be on screen. */
async function openWithTour(context: BrowserContext, url = VIDEO_URL): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: 40_000 });
  await page.locator(POPOVER).waitFor({ timeout: 40_000 });
  // driver.js fades the popover in over 400ms; clicking mid-fade is not a fair
  // test of the controls (an opacity-0 ancestor is not hit-testable).
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && getComputedStyle(el).opacity === '1';
    },
    POPOVER,
    { timeout: 15_000 }
  );
  return page;
}

test.describe('First-run guided tour (packaged build)', () => {
  test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  // Each case launches its own Chrome with the extension and loads a real
  // YouTube watch page; the anchor wait alone can take 30s+ on a cold profile,
  // which does not fit the repo-wide 60s default.
  test.setTimeout(180_000);

  test('survives the initial-load yt-navigate-finish instead of resetting to step 1', async () => {
    const context = await launch();
    try {
      await resetTour(await extensionServiceWorker(context));
      const page = await openWithTour(context);

      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');

      // Advance, THEN fire the event YouTube fires on its own during settling.
      await page.locator(NEXT).click();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');

      await page.evaluate(() => document.dispatchEvent(new CustomEvent('yt-navigate-finish')));
      await page.waitForTimeout(1500);

      // The tour must still be up, and still on step 2 — this is the regression.
      await expect(page.locator(POPOVER)).toBeVisible();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');
    } finally {
      await context.close();
    }
  });

  test('Next and Back step through all three steps', async () => {
    const context = await launch();
    try {
      await resetTour(await extensionServiceWorker(context));
      const page = await openWithTour(context);

      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');
      // Back is disabled on the first step.
      await expect(page.locator(PREV)).toHaveClass(/driver-popover-btn-disabled/);

      await page.locator(NEXT).click();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');

      await page.locator(NEXT).click();
      await expect(page.locator(PROGRESS)).toHaveText('3 of 3');

      // And back down again.
      await page.locator(PREV).click();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');
      await page.locator(PREV).click();
      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');
    } finally {
      await context.close();
    }
  });

  test('completing the tour marks it seen, and it does not come back', async () => {
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await openWithTour(context);

      for (const step of ['2 of 3', '3 of 3']) {
        await page.locator(NEXT).click();
        await expect(page.locator(PROGRESS)).toHaveText(step);
      }
      // The last click finishes it.
      await page.locator(NEXT).click();
      await expect(page.locator(POPOVER)).toHaveCount(0);

      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);

      // A reload must not bring it back.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: 40_000 });
      await page.waitForTimeout(3000);
      await expect(page.locator(POPOVER)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('the close button dismisses it for good', async () => {
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await openWithTour(context);

      await page.locator(CLOSE).click();
      await expect(page.locator(POPOVER)).toHaveCount(0);

      // Dismissing is the user declining — it counts as seen.
      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);

      // And it must not resurrect when YouTube settles the page.
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('yt-navigate-finish')));
      await page.waitForTimeout(2500);
      await expect(page.locator(POPOVER)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a real navigation mid-tour does NOT burn the seen flag', async () => {
    // The rule this protects: "seen" means a step rendered AND the user was the
    // one who ended it. Being carried to another video by an SPA navigation is
    // neither, so the tour gets another go on the next watch page.
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await openWithTour(context);
      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');

      await page.goto(OTHER_VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: 40_000 });

      // Still unseen…
      expect((await tourState(worker)).youtubeTour).toBeFalsy();
      // …and offered again on the video the user landed on.
      await page.locator(POPOVER).waitFor({ timeout: 40_000 });
      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');
    } finally {
      await context.close();
    }
  });
});
