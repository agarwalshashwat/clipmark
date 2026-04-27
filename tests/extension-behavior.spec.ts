/**
 * Extension Behavior Tests
 *
 * These tests verify that the extension's core functionality works end-to-end:
 * - Alt+S keyboard shortcut saves a bookmark (toast + marker)
 * - Bookmark button click triggers the saving animation
 * - SPA navigation: extension re-injects correctly on a new video
 * - SPA navigation: no duplicate elements after navigating between videos
 *
 * Run: npm run test:yt -- --grep "behavior"
 */
import { test, expect, TEST_VIDEO_URL, TEST_VIDEO_URL_2 } from './fixtures';

test.describe('Extension behavior', () => {
  test('Alt+S shows a toast notification (.yt-bookmark-toast)', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    // Wait for extension to fully initialize before sending keyboard event
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });
    // Click player to give it focus — required for keyboard events to reach content script
    await page.locator('video').click({ force: true });
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur?.(); });
    await page.keyboard.press('Alt+s');
    await expect(page.locator('.yt-bookmark-toast')).toBeAttached({ timeout: 5_000 });
  });

  test('Alt+S adds a marker to the progress bar', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });
    const before = await page.locator('.yt-bookmark-marker').count();
    await page.locator('video').click({ force: true });
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur?.(); });
    await page.keyboard.press('Alt+s');
    // Allow storage write + updateBookmarkMarkers() re-render
    await page.waitForTimeout(1_500);
    const after = await page.locator('.yt-bookmark-marker').count();
    expect(after).toBeGreaterThan(before);
  });

  test('bookmark button click applies .saving class and removes it after ~400ms', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });
    await page.locator('.yt-bookmark-player-btn').click();
    // .saving class should appear immediately
    await expect(page.locator('.yt-bookmark-player-btn.saving')).toBeAttached({ timeout: 500 });
    // And should be removed after the 400ms animation
    await expect(page.locator('.yt-bookmark-player-btn.saving')).not.toBeAttached({ timeout: 1_000 });
  });

  test('SPA navigation: extension injects into the new video player', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    // Navigate to a different video — YouTube SPA, no page reload
    await page.goto(TEST_VIDEO_URL_2, { waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });

    // Extension must re-inject into the new player
    await expect(page.locator('.yt-bookmark-player-btn')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('.yt-bookmark-markers')).toBeAttached({ timeout: 15_000 });
  });

  test('SPA navigation: no duplicate elements after navigating between videos', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    await page.goto(TEST_VIDEO_URL_2, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });
    // Extra wait for any late MutationObserver callbacks
    await page.waitForTimeout(2_000);

    expect(await page.locator('.yt-bookmark-player-btn').count()).toBe(1);
    expect(await page.locator('.yt-bookmark-markers').count()).toBe(1);
  });
});
