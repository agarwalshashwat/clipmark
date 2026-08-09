/**
 * A–B loop smoke test against the ZIP that actually goes to the Chrome Web Store.
 *
 * loop-packaged.spec.ts loads `extension/dist`, which is one step short of the
 * truth: the zip is what reviewers and users install, and `make ext-zip` applies
 * its own exclude rules on top of dist. This spec unpacks the real artifact into
 * a temp dir and loads THAT, so "the packaged build works" is a measured claim
 * rather than an inference from dist.
 *
 * Skips (rather than fails) when the zip is absent, so `npm run test:yt` still
 * works on a tree where only `make ext-build` has been run.
 *
 * Run: npx playwright test --project=extension tests/loop-zip.spec.ts
 */
import { test, expect, BrowserContext, Page, Worker } from '@playwright/test';
import { TEST_VIDEO_ID, TEST_VIDEO_URL, launchExtensionContext } from './fixtures';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'path';

const ZIP = path.resolve(__dirname, '../clipmark-extension.zip');
const VIDEO_URL = TEST_VIDEO_URL;
const VIDEO_ID = TEST_VIDEO_ID;
const A = 30;
const B = 40;

const mainVideo = (page: Page) => page.locator('video').first();

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

test.describe('A–B loop (Chrome Web Store zip)', () => {
  let unpacked: string | null = null;

  test.beforeAll(() => {
    if (!existsSync(ZIP)) return;
    unpacked = mkdtempSync(path.join(tmpdir(), 'clipmark-zip-'));
    execFileSync('unzip', ['-q', ZIP, '-d', unpacked]);
  });

  test.afterAll(() => {
    if (unpacked) rmSync(unpacked, { recursive: true, force: true });
  });

  test.beforeEach(() => {
    test.skip(!existsSync(ZIP), 'clipmark-extension.zip missing — run `make ext-zip` first');
    test.setTimeout(120_000);
  });

  test('the shipped zip loads and loops A–B at 2x', async () => {
    const context = await launchExtensionContext(unpacked!);
    try {
      const worker = await extensionServiceWorker(context);
      await worker.evaluate(
        ({ key, data }) => new Promise<void>(r => chrome.storage.sync.set({ [key]: data }, () => r())),
        {
          key: `bm_${VIDEO_ID}`,
          data: [{
            id: 3001, videoId: VIDEO_ID, timestamp: A, description: 'Zip loop',
            tags: [], color: '#8b5cf6', createdAt: new Date().toISOString(),
            videoTitle: 'Test', reviewSchedule: [1, 3, 7], lastReviewed: null,
            loop: { end: B },
          }],
        },
      );

      const page = await context.newPage();
      // Any ReferenceError from a tree-shaken loop chunk would surface here.
      const crashes: string[] = [];
      page.on('pageerror', e => {
        if ((e.stack ?? '').includes('chrome-extension://')) crashes.push(`${e}\n${e.stack}`);
      });

      await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('.yt-loop-player-btn').waitFor({ state: 'attached', timeout: 30_000 });
      await mainVideo(page).evaluate((v: HTMLVideoElement) => v.pause());

      // Saved loop survived the zip → install → storage → render path.
      await page.locator('.yt-loop-range--saved').waitFor({ timeout: 15_000 });
      await page.locator('.yt-loop-player-btn').dispatchEvent('click');
      const panel = page.locator('.yt-loop-panel');
      await panel.waitFor({ timeout: 15_000 });
      await expect(panel).toContainText('Zip loop');
      await expect(panel).toContainText('0:30 → 0:40');

      // …and the watchdog runs, at the rate competitors break on.
      await panel.locator('.yt-loop-row').first().dispatchEvent('click');
      await page.waitForTimeout(600);
      await mainVideo(page).evaluate((v: HTMLVideoElement) => { v.playbackRate = 2; });
      await mainVideo(page).evaluate((v: HTMLVideoElement, t: number) => { v.currentTime = t; }, B + 3);
      await page.waitForTimeout(900);

      const at = await mainVideo(page).evaluate((v: HTMLVideoElement) => v.currentTime);
      expect(at, 'the zipped build did not wrap the loop').toBeLessThan(B);
      expect(at).toBeGreaterThanOrEqual(A - 1);
      expect(crashes, `zipped content script threw: ${crashes[0] ?? ''}`).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
