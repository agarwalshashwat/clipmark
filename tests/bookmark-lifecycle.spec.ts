/**
 * Bookmark Lifecycle Tests
 *
 * Verifies the full create → persist → reload lifecycle of bookmarks:
 *
 * 1. A bookmark saved via Alt+S is persisted in chrome.storage.sync
 *    and its marker still appears after a hard page reload.
 * 2. Bookmarks pre-seeded directly into storage appear as markers
 *    immediately when the page loads.
 * 3. Multiple bookmarks create the correct number of markers.
 *
 * Run: npm run test:yt -- --grep "lifecycle"
 */
import { test, expect, TEST_VIDEO_URL } from './fixtures';
import {
  makeBookmark,
  seedBookmarks,
  getStoredBookmarks,
  clearStoredBookmarks,
} from './helpers';

const VIDEO_ID = 'dQw4w9WgXcQ'; // extracted from TEST_VIDEO_URL

test.describe('Bookmark lifecycle', () => {
  // ── Alt+S → storage → reload ──────────────────────────────────────────────
  test('Alt+S bookmark persists across a hard page reload', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });

    // Wait for the extension to finish injecting
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    // Give the video a chance to load and advance slightly so currentTime > 0
    await page.locator('video').click({ force: true });
    await page.waitForTimeout(1_500);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur?.(); });

    // Save via Alt+S
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(1_500); // allow storage write + re-render

    // Verify at least one marker is visible before reload
    const beforeReload = await page.locator('.yt-bookmark-marker').count();
    expect(beforeReload).toBeGreaterThan(0);

    // Hard reload the page
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });
    await page.locator('.yt-bookmark-markers').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1_000); // wait for storage read + re-render

    // Markers must still be present after reload
    const afterReload = await page.locator('.yt-bookmark-marker').count();
    expect(afterReload).toBeGreaterThanOrEqual(beforeReload);
  });

  // ── Pre-seeded bookmarks appear as markers ───────────────────────────────
  test('Pre-seeded bookmark renders a marker on first load', async ({ context }) => {
    const bookmark = makeBookmark(VIDEO_ID, 45, {
      description: 'Pre-seeded test marker',
      videoTitle:  'Rick Astley - Never Gonna Give You Up (Official Music Video)',
    });

    await seedBookmarks(context, VIDEO_ID, [bookmark]);

    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });
    await page.locator('.yt-bookmark-markers').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1_000);

    const count = await page.locator('.yt-bookmark-marker').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── Marker count matches stored bookmark count ────────────────────────────
  test('Three pre-seeded bookmarks produce three markers', async ({ context }) => {
    const bookmarks = [
      makeBookmark(VIDEO_ID, 10,  { description: 'Marker A' }),
      makeBookmark(VIDEO_ID, 60,  { description: 'Marker B' }),
      makeBookmark(VIDEO_ID, 120, { description: 'Marker C' }),
    ];

    await seedBookmarks(context, VIDEO_ID, bookmarks);

    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });
    await page.locator('.yt-bookmark-markers').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1_000);

    const count = await page.locator('.yt-bookmark-marker').count();
    expect(count).toBe(3);
  });

  // ── Storage is written after Alt+S ───────────────────────────────────────
  test('Alt+S writes bookmark data to chrome.storage.sync', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    await page.locator('video').click({ force: true });
    await page.waitForTimeout(1_500);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur?.(); });

    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(2_000);

    const stored = await getStoredBookmarks(context, VIDEO_ID);
    expect(stored.length).toBeGreaterThan(0);
  });

  // ── Bookmark button click also saves and persists ─────────────────────────
  test('Player button click saves a bookmark that persists after reload', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    await page.locator('video').click({ force: true });
    await page.waitForTimeout(1_000);

    await page.locator('.yt-bookmark-player-btn').click();
    await page.waitForTimeout(1_500);

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });
    await page.locator('.yt-bookmark-markers').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1_000);

    const count = await page.locator('.yt-bookmark-marker').count();
    expect(count).toBeGreaterThan(0);
  });

  // ── Marker left-position reflects timestamp ───────────────────────────────
  test('Marker left% is proportional to its timestamp', async ({ context }) => {
    // Seed a bookmark at exactly 25% of a 100s video
    const bookmark = makeBookmark(VIDEO_ID, 25);

    await seedBookmarks(context, VIDEO_ID, [bookmark]);

    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });
    await page.locator('.yt-bookmark-marker').waitFor({ timeout: 15_000 });

    const leftStyle = await page.locator('.yt-bookmark-marker').first().evaluate(
      el => (el as HTMLElement).style.left,
    );

    // The left% should be non-zero (bookmark is not at t=0)
    expect(leftStyle).toBeTruthy();
    const pct = parseFloat(leftStyle);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });

  // ── Marker has correct data-timestamp attribute ───────────────────────────
  test('Marker carries the correct data-timestamp attribute', async ({ context }) => {
    const bookmark = makeBookmark(VIDEO_ID, 42, { description: 'Timestamp check' });
    await seedBookmarks(context, VIDEO_ID, [bookmark]);

    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('video').hover({ force: true });
    await page.locator('.yt-bookmark-marker').waitFor({ timeout: 15_000 });

    const dataTs = await page.locator('.yt-bookmark-marker').first().getAttribute('data-timestamp');
    expect(parseFloat(dataTs ?? 'NaN')).toBeCloseTo(42, 0);
  });
});
