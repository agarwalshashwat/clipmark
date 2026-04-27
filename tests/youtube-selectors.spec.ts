/**
 * YouTube DOM Selector Alignment Tests
 *
 * These tests verify that YouTube's own DOM selectors still exist as expected.
 * They load a real YouTube video in Chromium (with the extension loaded) and
 * assert each selector. If any required selector test fails, it means YouTube
 * changed their DOM and the content script needs to be updated accordingly.
 *
 * Run: npm run test:yt -- --grep "selector"
 */
import { test, expect, TEST_VIDEO_URL } from './fixtures';

test.describe('YouTube DOM selector alignment', () => {
  test('video element exists and has a valid src', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'domcontentloaded' });
    const video = page.locator('video');
    await expect(video).toBeAttached({ timeout: 20_000 });
    // Must have a real src — not a blank placeholder element
    const hasSrc = await video.evaluate(
      v => (v as HTMLVideoElement).src !== '' || (v as HTMLVideoElement).currentSrc !== ''
    );
    expect(hasSrc).toBeTruthy();
  });

  test('.ytp-progress-bar (marker injection point) is visible', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('video').waitFor({ timeout: 20_000 });
    // Hover to reveal player controls
    await page.locator('video').hover({ force: true });
    await expect(page.locator('.ytp-progress-bar')).toBeVisible({ timeout: 20_000 });
  });

  test('.ytp-right-controls (bookmark button injection point) exists', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('video').waitFor({ timeout: 20_000 });
    await page.locator('video').hover({ force: true });
    await expect(page.locator('.ytp-right-controls')).toBeAttached({ timeout: 20_000 });
  });

  test('h1.ytd-video-primary-info-renderer (title extraction) has non-empty text', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    const title = page.locator('h1.ytd-video-primary-info-renderer');
    await expect(title).toBeAttached({ timeout: 20_000 });
    const text = await title.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('.html5-video-player or #movie_player (save flash parent) exists', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('video').waitFor({ timeout: 20_000 });
    const primary  = await page.locator('.html5-video-player').count();
    const fallback = await page.locator('#movie_player').count();
    // At least one of the two player container selectors must exist
    expect(primary + fallback).toBeGreaterThan(0);
  });

  test('.ytp-chapter-title-content (optional) — warns if missing, does not fail', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });
    const count = await page.locator('.ytp-chapter-title-content').count();
    if (count === 0) {
      console.warn(
        '⚠️  .ytp-chapter-title-content not present on test video — ' +
        'auto-description chapter fallback may be affected. ' +
        'Switch TEST_VIDEO_URL to a video with chapters to test this selector.'
      );
    }
    // Not a hard failure — not all videos have chapters
  });
});
