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
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

/** The version this tree would build — the zip has to match it. */
const SOURCE_VERSION: string = JSON.parse(
  readFileSync(path.join(ROOT, 'extension/manifest.json'), 'utf8'),
).version;

/**
 * Which zip to load.
 *
 * `make ext-zip` writes clipmark-extension.zip, but the artifact that actually
 * goes to the Web Store is cut by hand as clipmark-extension-<version>.zip — so
 * the unversioned name sat stale in the tree for two releases while this spec
 * happily loaded it and reported green. Prefer the versioned artifact for the
 * version this tree builds, and fall back to the Makefile's name.
 */
function resolveZip(): string | null {
  const versioned = path.join(ROOT, `clipmark-extension-${SOURCE_VERSION}.zip`);
  if (existsSync(versioned)) return versioned;
  const generic = path.join(ROOT, 'clipmark-extension.zip');
  return existsSync(generic) ? generic : null;
}

const ZIP = resolveZip();
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
    if (!ZIP) return;
    unpacked = mkdtempSync(path.join(tmpdir(), 'clipmark-zip-'));
    execFileSync('unzip', ['-q', ZIP, '-d', unpacked]);
  });

  test.afterAll(() => {
    if (unpacked) rmSync(unpacked, { recursive: true, force: true });
  });

  test.beforeEach(() => {
    test.skip(!ZIP, `no clipmark-extension zip for v${SOURCE_VERSION} — run \`make ext-zip\` first`);
    test.setTimeout(120_000);
  });

  /**
   * Loading a stale zip is worse than not running: it reports the LAST release
   * as green while the current tree is untested. This spec did exactly that for
   * two versions. Assert the artifact is the one this tree builds, and fail
   * loudly — never skip — when it is not.
   */
  test('the zip under test is the one this tree builds', () => {
    const zipManifest = JSON.parse(
      readFileSync(path.join(unpacked!, 'manifest.json'), 'utf8'),
    );
    expect(
      zipManifest.version,
      `${path.basename(ZIP!)} is a stale artifact (v${zipManifest.version}); ` +
        `this tree builds v${SOURCE_VERSION} — re-run \`make ext-zip\``,
    ).toBe(SOURCE_VERSION);

    // The v1.0.3 dead-weight regression: raw un-bundled ESM shipped because it
    // was listed in web_accessible_resources. Nothing loads it, so only the
    // shipped bytes show it.
    expect(
      existsSync(path.join(unpacked!, 'src/popup/dashboard.js')),
      'raw un-bundled dashboard.js is back in the package',
    ).toBe(false);
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
