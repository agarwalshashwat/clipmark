/**
 * Storage Schema Tests
 *
 * Validates that bookmarks written to chrome.storage.sync by the extension
 * conform to the documented schema. Every required field must be present
 * with the correct type, and the storage key must follow the bm_{videoId}
 * naming convention.
 *
 * These tests are the canonical guard against schema drift — if the
 * content script or background service worker changes the bookmark shape,
 * these tests will catch it.
 *
 * Run: npm run test:yt -- --grep "storage schema"
 */
import { test, expect, TEST_VIDEO_URL } from './fixtures';
import { getStoredBookmarks, getServiceWorker } from './helpers';

const VIDEO_ID = 'dQw4w9WgXcQ';

test.describe('Storage schema', () => {
  // Helper: save one bookmark via Alt+S and return the stored data
  async function saveAndRead(context: import('@playwright/test').BrowserContext) {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    // Pause video to get a stable, non-zero timestamp
    await page.locator('video').evaluate((v: HTMLVideoElement) => {
      v.currentTime = 15;
      v.pause();
    });
    await page.waitForTimeout(500);

    await page.locator('video').click({ force: true }); // ensure keyboard focus
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(2_000); // allow storage write

    return getStoredBookmarks(context, VIDEO_ID);
  }

  // ── Key convention ────────────────────────────────────────────────────────
  test('Storage key follows the bm_{videoId} pattern', async ({ context }) => {
    const bookmarks = await saveAndRead(context);
    // If the key pattern was wrong, getStoredBookmarks would return []
    expect(bookmarks.length).toBeGreaterThan(0);
  });

  // ── Required fields ───────────────────────────────────────────────────────
  test('Saved bookmark contains all required schema fields', async ({ context }) => {
    const bookmarks = await saveAndRead(context);
    const bm = bookmarks[0];

    const REQUIRED_FIELDS = [
      'id',
      'videoId',
      'timestamp',
      'description',
      'tags',
      'color',
      'createdAt',
      'videoTitle',
      'reviewSchedule',
      'lastReviewed',
    ] as const;

    for (const field of REQUIRED_FIELDS) {
      expect(bm, `Missing field: ${field}`).toHaveProperty(field);
    }
  });

  // ── Field types ───────────────────────────────────────────────────────────
  test('Bookmark "id" is a positive integer (Date.now() value)', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(typeof bm.id).toBe('number');
    expect(Number.isInteger(bm.id)).toBe(true);
    expect(bm.id).toBeGreaterThan(0);
    // Date.now() produces a 13-digit millisecond timestamp
    expect(String(bm.id).length).toBeGreaterThanOrEqual(13);
  });

  test('Bookmark "videoId" matches the current page video ID', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(bm.videoId).toBe(VIDEO_ID);
  });

  test('Bookmark "timestamp" is a non-negative number', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(typeof bm.timestamp).toBe('number');
    expect(bm.timestamp).toBeGreaterThanOrEqual(0);
  });

  test('Bookmark "description" is a non-empty string', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(typeof bm.description).toBe('string');
    expect(bm.description.length).toBeGreaterThan(0);
  });

  test('Bookmark "tags" is an array', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(Array.isArray(bm.tags)).toBe(true);
  });

  test('Bookmark "color" is a non-empty string (hex or hsl)', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(typeof bm.color).toBe('string');
    expect(bm.color.length).toBeGreaterThan(0);
  });

  test('Bookmark "createdAt" is a valid ISO 8601 date string', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(typeof bm.createdAt).toBe('string');
    const date = new Date(bm.createdAt);
    expect(isNaN(date.getTime())).toBe(false);
    // Must match ISO format: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(bm.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('Bookmark "reviewSchedule" defaults to [1, 3, 7]', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(Array.isArray(bm.reviewSchedule)).toBe(true);
    expect(bm.reviewSchedule).toEqual([1, 3, 7]);
  });

  test('Bookmark "lastReviewed" defaults to null', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    expect(bm.lastReviewed).toBeNull();
  });

  test('Bookmark "videoTitle" is a string or null', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    // videoTitle is populated asynchronously from the cached title map; it may be
    // null on the first ever save but must never be an unexpected type.
    expect(bm.videoTitle === null || typeof bm.videoTitle === 'string').toBe(true);
  });

  // ── No extra duplicate entries in the array ────────────────────────────────
  test('Each bookmark id in the array is unique', async ({ context }) => {
    const bookmarks = await saveAndRead(context);
    const ids = bookmarks.map(b => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // ── Timestamp is close to where we set it ─────────────────────────────────
  test('Stored timestamp is within 2s of where video was paused', async ({ context }) => {
    const [bm] = await saveAndRead(context);
    // We paused at currentTime = 15s in saveAndRead()
    expect(Math.abs(bm.timestamp - 15)).toBeLessThan(2);
  });

  // ── Tagged bookmark schema ─────────────────────────────────────────────────
  test('Tags parsed from description are stored in the tags array', async ({ context }) => {
    // We cannot type a description via Alt+S (silent save), so we test the
    // tag parsing contract via direct storage seeding + schema verification.
    // The actual parseTags logic is covered in the unit tests.
    //
    // Here we verify that a bookmark seeded with tags round-trips correctly.
    const { seedBookmarks, makeBookmark, getStoredBookmarks } = await import('./helpers');
    const bm = makeBookmark(VIDEO_ID, 5, {
      description: 'Key insight #important #review',
      tags: ['important', 'review'],
      color: '#ef4444',
    });
    await seedBookmarks(context, VIDEO_ID, [bm]);

    const stored = await getStoredBookmarks(context, VIDEO_ID);
    expect(stored[0].tags).toEqual(['important', 'review']);
  });

  // ── Multiple bookmarks accumulate in the same array ───────────────────────
  test('A second Alt+S adds to the existing array rather than replacing it', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    // First bookmark at t=10
    await page.locator('video').evaluate((v: HTMLVideoElement) => {
      v.currentTime = 10;
      v.pause();
    });
    await page.waitForTimeout(500);
    await page.locator('video').click({ force: true });
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(1_500);

    // Second bookmark at t=20
    await page.locator('video').evaluate((v: HTMLVideoElement) => {
      v.currentTime = 20;
    });
    await page.waitForTimeout(500);
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(1_500);

    const stored = await getStoredBookmarks(context, VIDEO_ID);
    expect(stored.length).toBe(2);
  });

  // ── Bookmarks are ordered by insertion (ascending id) ─────────────────────
  test('Bookmarks in storage maintain insertion order (ascending id)', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    for (const t of [10, 30]) {
      await page.locator('video').evaluate((v: HTMLVideoElement, time: number) => {
        v.currentTime = time;
        v.pause();
      }, t);
      await page.waitForTimeout(400);
      await page.locator('video').click({ force: true });
      await page.keyboard.press('Alt+s');
      await page.waitForTimeout(1_200);
    }

    const stored = await getStoredBookmarks(context, VIDEO_ID);
    expect(stored.length).toBe(2);
    expect(stored[0].id).toBeLessThan(stored[1].id);
  });

  // ── videoTitle matches the page heading ───────────────────────────────────
  test('videoTitle stored in bookmark matches the h1 heading on the page', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 15_000 });

    // Wait until the YouTube title heading is populated (not empty)
    const titleLocator = page.locator('h1.ytd-video-primary-info-renderer').first();
    await expect(titleLocator).not.toHaveText('', { timeout: 10_000 });

    // Pause at a stable timestamp, then save via Alt+S
    await page.locator('video').evaluate((v: HTMLVideoElement) => {
      v.currentTime = 20;
      v.pause();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur?.(); });
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(2_000);

    const stored = await getStoredBookmarks(context, VIDEO_ID);
    expect(stored.length).toBeGreaterThanOrEqual(1);

    const storedTitle = stored[0].videoTitle as string | null;
    const pageTitle = await titleLocator.textContent();

    // videoTitle must be a non-empty string matching the page heading
    expect(typeof storedTitle).toBe('string');
    expect((storedTitle as string).trim().length).toBeGreaterThan(0);
    expect((storedTitle as string).trim()).toBe((pageTitle ?? '').trim());
  });
});
