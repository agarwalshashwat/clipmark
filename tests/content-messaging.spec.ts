/**
 * Content Script Messaging Tests
 *
 * Verifies that the content script message API responds correctly to
 * chrome.tabs.sendMessage calls originating from the service worker.
 * Covers: ping, getCurrentTime, seekTo, bookmarkUpdated, showToast.
 *
 * Run: npm run test:yt -- --grep "Content script messaging"
 */
import { test, expect, TEST_VIDEO_URL } from './fixtures';
import { makeBookmark, seedBookmarks, sendToContentScript } from './helpers';

const VIDEO_ID = 'dQw4w9WgXcQ';

test.describe('Content script messaging', () => {
  // ── ping ─────────────────────────────────────────────────────────────────
  test('ping → { status: "ready" }', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    const response = await sendToContentScript(context, TEST_VIDEO_URL, { action: 'ping' });
    expect(response).toEqual({ status: 'ready' });
  });

  // ── getCurrentTime ────────────────────────────────────────────────────────
  test('getCurrentTime returns the current video playback position', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    // Seek the video to a known position via evaluate
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.currentTime = 10; });
    await page.waitForTimeout(300);

    const response = await sendToContentScript(context, TEST_VIDEO_URL, { action: 'getCurrentTime' });
    expect(typeof response.currentTime).toBe('number');
    expect(response.currentTime as number).toBeGreaterThanOrEqual(9);
    expect(response.currentTime as number).toBeLessThan(15);
  });

  // ── seekTo ────────────────────────────────────────────────────────────────
  test('seekTo sets the video currentTime to the requested position', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    await sendToContentScript(context, TEST_VIDEO_URL, { action: 'seekTo', time: 25 });
    await page.waitForTimeout(600);

    const currentTime = await page.locator('video').evaluate(
      (v: HTMLVideoElement) => v.currentTime,
    );
    expect(currentTime).toBeGreaterThanOrEqual(24);
    expect(currentTime).toBeLessThan(30);
  });

  // ── bookmarkUpdated ───────────────────────────────────────────────────────
  test('bookmarkUpdated re-renders markers without a page reload', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    // Confirm no markers initially (no bookmarks seeded)
    const before = await page.locator('.yt-bookmark-marker').count();
    expect(before).toBe(0);

    // Seed a bookmark into storage (no page reload)
    const bookmark = makeBookmark(VIDEO_ID, 30, { description: 'Dynamic marker test' });
    await seedBookmarks(context, VIDEO_ID, [bookmark]);

    // Tell the content script to re-render
    await sendToContentScript(context, TEST_VIDEO_URL, { action: 'bookmarkUpdated' });
    await page.waitForTimeout(500);

    const after = await page.locator('.yt-bookmark-marker').count();
    expect(after).toBe(1);
  });

  // ── showToast ─────────────────────────────────────────────────────────────
  test('showToast displays a toast with the given message text', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    await sendToContentScript(context, TEST_VIDEO_URL, {
      action: 'showToast',
      message: 'Hello messaging test',
    });

    const toast = page.locator('.yt-bookmark-toast');
    await expect(toast).toBeAttached({ timeout: 3_000 });
    const text = await toast.textContent();
    expect(text).toContain('Hello messaging test');
  });
});
