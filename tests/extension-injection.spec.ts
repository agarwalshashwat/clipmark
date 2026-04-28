/**
 * Extension UI Injection Tests
 *
 * These tests verify that the extension correctly injects its own DOM elements
 * into YouTube's player after the MutationObservers fire. They also verify
 * double-injection guards so a single element is never added twice.
 *
 * Run: npm run test:yt -- --grep "injection"
 */
import { test, expect, TEST_VIDEO_URL } from './fixtures';

test.describe('Extension UI injection', () => {
  test('bookmark button (.yt-bookmark-player-btn) injected inside .ytp-right-controls', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'domcontentloaded' });
    // Hover to trigger player controls visibility — required for MutationObserver to fire
    await page.locator('video').hover({ force: true });
    await expect(page.locator('.yt-bookmark-player-btn')).toBeAttached({ timeout: 15_000 });
    // Must be a direct child of .ytp-right-controls
    const insideControls = await page.locator('.ytp-right-controls .yt-bookmark-player-btn').count();
    expect(insideControls).toBe(1);
  });

  test('bookmark markers container (.yt-bookmark-markers) injected inside .ytp-progress-bar', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('video').hover({ force: true });
    await expect(page.locator('.yt-bookmark-markers')).toBeAttached({ timeout: 15_000 });
    // Must be inside the progress bar
    const insideBar = await page.locator('.ytp-progress-bar .yt-bookmark-markers').count();
    expect(insideBar).toBe(1);
  });

  test('markers container has correct absolute positioning styles', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('.yt-bookmark-markers').waitFor({ timeout: 15_000 });
    const styles = await page.locator('.yt-bookmark-markers').evaluate(el => {
      const s = (el as HTMLElement).style;
      return { position: s.position, width: s.width, height: s.height, pointerEvents: s.pointerEvents };
    });
    expect(styles.position).toBe('absolute');
    expect(styles.width).toBe('100%');
    expect(styles.height).toBe('100%');
    expect(styles.pointerEvents).toBe('none'); // markers must not block clicks on the progress bar
  });

  test('no double-injection of bookmark button (guard check)', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });
    // Wait for any late MutationObserver callbacks to settle
    await page.waitForTimeout(2_000);
    const count = await page.locator('.yt-bookmark-player-btn').count();
    expect(count).toBe(1);
  });

  test('no double-injection of markers container (guard check)', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-markers').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(2_000);
    const count = await page.locator('.yt-bookmark-markers').count();
    expect(count).toBe(1);
  });
});
