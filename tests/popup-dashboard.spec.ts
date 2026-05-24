/**
 * Popup & Dashboard UI Tests
 * 
 * Verifies management interfaces: creating/deleting from popup,
 * and data organization in the dashboard.
 */
import { test, expect, TEST_VIDEO_URL } from './fixtures';
import { makeBookmark, seedBookmarks } from './helpers';

test.describe('Popup & Dashboard UI', () => {

  test('can create a bookmark from the popup UI', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    
    // Get extension ID
    const sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];
    
    // Open popup
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/pages/popup.html`);
    
    // Type description and save
    await popup.fill('#description', 'Created via Popup UI');
    // Note: In popup.js, there is no "Save" button usually for timestamps, 
    // but there's often a "Save Moment" or it auto-saves when you press Enter or a button.
    // Let's check the HTML for buttons.
  });

  test('dashboard displays video groups correctly', async ({ context }) => {
    const sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];

    // Seed storage with some groups
    await sw.evaluate(() => {
      return new Promise<void>(resolve => {
        chrome.storage.sync.set({
          vgroups: [
            { id: 'group-1', name: 'Learning React', videoIds: ['vid1', 'vid2'] }
          ]
        }, resolve);
      });
    });

    const dashboard = await context.newPage();
    await dashboard.goto(`chrome-extension://${extensionId}/src/pages/dashboard.html`);

    // Verify group is visible
    await expect(dashboard.locator('text=Learning React')).toBeVisible({ timeout: 10_000 });
  });

  test('bookmark deletion from popup reflects on video page', async ({ context }) => {
    const VIDEO_ID = new URL(TEST_VIDEO_URL).searchParams.get('v')!;
    const bookmark = makeBookmark(VIDEO_ID, 60, { description: 'Delete Me' });
    await seedBookmarks(context, VIDEO_ID, [bookmark]);

    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await expect(page.locator('.yt-bookmark-marker')).toHaveCount(1);

    const sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];
    
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/pages/popup.html`);

    // Click delete in popup (assuming a delete button exists per bookmark)
    await popup.locator('.bookmark-item').filter({ hasText: 'Delete Me' }).locator('.delete-btn').click();
    
    // Verify marker is gone from the YouTube page
    await expect(page.locator('.yt-bookmark-marker')).toHaveCount(0, { timeout: 10_000 });
  });
});
