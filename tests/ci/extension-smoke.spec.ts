/**
 * The extension's CI smoke gate: does the content script actually attach to a
 * watch page and capture a moment?
 *
 * Runs against a DETERMINISTIC stand-in watch page served at the real
 * youtube.com origin (see tests/fixtures/youtube-watch.ts), not live YouTube.
 * Issue #84: this gate used to be a function of youtube.com's uptime and
 * markup, and its usual failure was `.yt-bookmark-player-btn` never arriving
 * inside a 40s wait. Nothing here is about YouTube's servers — it is about our
 * mount chain reacting to the player DOM appearing, which the fixture
 * reproduces exactly (async player mount, real `<video>`, real progress bar).
 *
 * Deliberately more than an injection check. A gate that only asserts a button
 * exists cannot tell a working capture path from a broken one, and capture is
 * the product.
 */
import { test, expect } from '@playwright/test';
import { TEST_VIDEO_ID, TEST_VIDEO_ID_2, TEST_VIDEO_TITLE, launchExtensionContext } from '../fixtures';
import {
  serveYouTubeFixture,
  openWatchPage,
  waitForExtensionMount,
  seekTo,
  watchUrl,
  FIXTURE_DURATION,
} from '../fixtures/youtube-watch';
import { getStoredBookmarks, seedBookmarks, makeBookmark } from '../helpers';
import type { BrowserContext } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'path';

const SOURCE_TREE = path.resolve(__dirname, '../../extension');
const CHAPTER = 'Gradient descent';

/**
 * The fixture clip is 60s, so every timestamp below sits inside it. Kept well
 * away from 0 so a silently-failed seek (see the range-request note in
 * youtube-watch.ts) can never be mistaken for a pass.
 */
const CAPTURE_AT = 27.5;

async function launch(): Promise<BrowserContext> {
  const context = await launchExtensionContext(SOURCE_TREE);
  await serveYouTubeFixture(context, {
    chapter: CHAPTER,
    titles: {
      [TEST_VIDEO_ID]: TEST_VIDEO_TITLE,
      [TEST_VIDEO_ID_2]: 'Second fixture video',
    },
  });
  return context;
}

/**
 * Put the profile in the state of a user who has already been through
 * onboarding. The first-run tour is covered properly by tour-packaged.spec.ts;
 * here it would only be a modal overlay sitting on top of the player.
 */
async function skipFirstRunTour(context: BrowserContext): Promise<void> {
  const worker = context.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'))
    ?? await context.waitForEvent('serviceworker', { timeout: 20_000 });
  await worker.evaluate(() => new Promise<void>(resolve =>
    chrome.storage.sync.set({ tourState: { youtubeTour: true, sidePanelTour: true } }, () => resolve())));
}

test.describe('Extension smoke', () => {
  test.skip(!existsSync(SOURCE_TREE), 'extension/ source tree missing');
  // No network in the critical path any more, but each case still boots its own
  // Chrome with a persistent profile, which dominates the wall clock.
  test.setTimeout(90_000);

  test('injects its player controls on a YouTube watch page', async () => {
    const context = await launch();
    try {
      await skipFirstRunTour(context);
      const page = await openWatchPage(context, TEST_VIDEO_ID);

      // The origin really is YouTube's — that is what makes Chrome inject the
      // content scripts from manifest.json rather than us doing it by hand.
      expect(page.url()).toBe(watchUrl(TEST_VIDEO_ID));

      await expect(page.locator('.yt-bookmark-player-btn')).toHaveCount(1);
      // Injected independently on purpose (see setupPlayerLoopButton) — a
      // regression that takes out one must not be masked by the other.
      await expect(page.locator('.yt-loop-player-btn')).toHaveCount(1);
      // Both land inside YouTube's own control cluster, not loose in the page.
      await expect(page.locator('.ytp-right-controls .yt-bookmark-player-btn')).toHaveCount(1);
      await expect(page.locator('.ytp-progress-bar .yt-bookmark-markers')).toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test('the player button captures the current moment into storage', async () => {
    const context = await launch();
    try {
      await skipFirstRunTour(context);
      const page = await openWatchPage(context, TEST_VIDEO_ID);
      await seekTo(page, CAPTURE_AT);

      await page.locator('.yt-bookmark-player-btn').click();

      await expect.poll(
        async () => (await getStoredBookmarks(context, TEST_VIDEO_ID)).length,
        { timeout: 15_000 },
      ).toBe(1);

      const [bookmark] = await getStoredBookmarks(context, TEST_VIDEO_ID);
      expect(bookmark.videoId).toBe(TEST_VIDEO_ID);
      // The whole point of the capture: the timestamp the user was actually at.
      expect(bookmark.timestamp).toBeGreaterThan(CAPTURE_AT - 1);
      expect(bookmark.timestamp).toBeLessThan(CAPTURE_AT + 2);
      // No transcript on the fixture page, so the chapter is the description
      // source — the real fallback chain, exercised rather than stubbed.
      expect(bookmark.description).toBe(CHAPTER);
      expect(bookmark.videoTitle).toBe(TEST_VIDEO_TITLE);

      // And it paints on the scrubber at the right fraction of the duration.
      const marker = page.locator('.yt-bookmark-markers .yt-bookmark-marker');
      await expect(marker).toHaveCount(1);
      const left = await marker.evaluate(el => (el as HTMLElement).style.left);
      expect(parseFloat(left)).toBeCloseTo((CAPTURE_AT / FIXTURE_DURATION) * 100, 0);
    } finally {
      await context.close();
    }
  });

  test('Alt+B captures without touching the player chrome', async () => {
    const context = await launch();
    try {
      await skipFirstRunTour(context);
      const page = await openWatchPage(context, TEST_VIDEO_ID);
      await seekTo(page, 42);

      await page.keyboard.press('Alt+b');

      await expect.poll(
        async () => (await getStoredBookmarks(context, TEST_VIDEO_ID)).length,
        { timeout: 15_000 },
      ).toBe(1);

      const [bookmark] = await getStoredBookmarks(context, TEST_VIDEO_ID);
      expect(bookmark.timestamp).toBeGreaterThan(41);
      expect(bookmark.timestamp).toBeLessThan(44);

      // A second press at the same second is the duplicate the save path
      // rejects — still exactly one bookmark.
      await page.keyboard.press('Alt+b');
      await page.waitForTimeout(1500);
      expect(await getStoredBookmarks(context, TEST_VIDEO_ID)).toHaveLength(1);
    } finally {
      await context.close();
    }
  });

  test('re-mounts onto the next video across an SPA navigation', async () => {
    // YouTube never reloads between videos; the content script has to notice
    // via yt-navigate-finish and rebuild against the new player. This is the
    // path that broke title tracking in v1.0.2.
    const context = await launch();
    try {
      await skipFirstRunTour(context);
      await seedBookmarks(context, TEST_VIDEO_ID_2, [
        makeBookmark(TEST_VIDEO_ID_2, 15),
        makeBookmark(TEST_VIDEO_ID_2, 30),
      ]);

      const page = await openWatchPage(context, TEST_VIDEO_ID);
      await expect(page.locator('.yt-bookmark-markers .yt-bookmark-marker')).toHaveCount(0);

      await page.evaluate(
        ({ id, title }) => (window as any).__clipmarkFixture.navigateTo(id, title),
        { id: TEST_VIDEO_ID_2, title: 'Second fixture video' },
      );
      await waitForExtensionMount(page);

      expect(new URL(page.url()).searchParams.get('v')).toBe(TEST_VIDEO_ID_2);
      await expect(page.locator('.yt-bookmark-player-btn')).toHaveCount(1);
      // The new video's bookmarks, not the previous one's.
      await expect(page.locator('.yt-bookmark-markers .yt-bookmark-marker')).toHaveCount(2);
    } finally {
      await context.close();
    }
  });
});
