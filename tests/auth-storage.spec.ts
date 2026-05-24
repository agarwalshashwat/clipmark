/**
 * Auth & Storage Resilience Tests
 * 
 * Verifies that the extension handles authentication states, 
 * token management, and storage synchronization logic.
 */
import { test, expect, TEST_VIDEO_URL } from './fixtures';
import { getServiceWorker, getExtensionId } from './helpers';

test.describe('Auth & Storage Resilience', () => {
  
  test('extension identifies logged in state from storage', async ({ context }) => {
    // Inject a fake user into sync storage
    const sw = await getServiceWorker(context);
    await sw.evaluate(() => {
      return new Promise<void>(resolve => {
        chrome.storage.sync.set({
          bmUser: {
            userId: 'test-user-123',
            userEmail: 'test@example.com',
            isPro: true,
            accessToken: 'fake-access-token',
            refreshToken: 'fake-refresh-token'
          }
        }, resolve);
      });
    });

    const extensionId = await getExtensionId(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/pages/popup.html`);
    
    // Should NOT show login button if logged in
    const loginBtn = popup.locator('text=Sign in with Google');
    await expect(loginBtn).not.toBeVisible();
  });

  test('markers update when storage changes externally (onChanged)', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_VIDEO_URL, { waitUntil: 'networkidle' });
    await page.locator('.yt-bookmark-player-btn').waitFor();

    const VIDEO_ID = new URL(TEST_VIDEO_URL).searchParams.get('v')!;
    
    // Initial state: no markers
    await expect(page.locator('.yt-bookmark-marker')).toHaveCount(0);

    // Simulate external storage change (e.g. from sync)
    const sw = await getServiceWorker(context);
    await sw.evaluate(({ videoId }) => {
      const key = `bm_${videoId}`;
      const bookmark = {
        id: Date.now(),
        videoId: videoId,
        timestamp: 45,
        description: 'External Bookmark',
        tags: [],
        color: '#ff0000',
        createdAt: new Date().toISOString(),
        videoTitle: 'Test Video'
      };
      return new Promise<void>(resolve => {
        chrome.storage.sync.set({ [key]: [bookmark] }, resolve);
      });
    }, { videoId: VIDEO_ID });

    // The content script should listen to chrome.storage.onChanged and re-render
    await expect(page.locator('.yt-bookmark-marker')).toHaveCount(1, { timeout: 10_000 });
  });

  test('token refresh is triggered when access token is expired', async ({ context }) => {
    // 1. Mock the refresh endpoint
    await context.route('**/api/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'new-fresh-token',
          refresh_token: 'new-refresh-token'
        })
      });
    });

    // 2. Set an expired token in storage
    const sw = await getServiceWorker(context);
    await sw.evaluate(() => {
      const expiredPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 }));
      const expiredToken = `header.${expiredPayload}.signature`;
      
      return new Promise<void>(resolve => {
        chrome.storage.sync.set({
          bmUser: {
            userId: 'test-user',
            accessToken: expiredToken,
            refreshToken: 'valid-refresh-token'
          }
        }, resolve);
      });
    });

    // 3. Trigger an action that requires a valid token (e.g. we might need to open the popup)
    const extensionId = await getExtensionId(context);
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/pages/popup.html`);

    // 4. Verify storage was updated with the new token
    await expect.poll(async () => {
      const result = await sw.evaluate(() => {
        return new Promise(resolve => chrome.storage.sync.get('bmUser', resolve));
      }) as any;
      return result.bmUser?.accessToken;
    }, { timeout: 10000 }).toBe('new-fresh-token');
  });
});

