/**
 * Active Recall Mode — end-to-end against the PACKAGED build.
 *
 * Unique among the specs here: this one loads `extension/dist` (the artifact
 * uploaded to the Chrome Web Store) rather than the source dir. That matters —
 * a bundler tree-shake once shipped an empty constants chunk, which broke the
 * packaged extension at runtime while every source-loaded test stayed green.
 * Keep at least one spec pointed at dist.
 *
 * Playback-independent by design: real YouTube won't reliably autoplay under
 * automation, so segment ends are triggered by setting video.currentTime and
 * dispatching a synthetic 'timeupdate' — exactly what revisionTimeUpdateHandler
 * listens for. Requires `make ext-build` first (skips with a message otherwise).
 */
import { test, expect, chromium, BrowserContext, Worker } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO_ID = 'dQw4w9WgXcQ';

// Sentinel answers — must never appear while the user is still recalling.
const ANSWER_1 = 'RECALL-ANSWER-ONE cardiac output basics';
const ANSWER_2 = 'RECALL-ANSWER-TWO preload vs afterload';

function bmKey(id: string): string { return `bm_${id}`; }

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

async function launchPackaged(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    headless: false, // Chrome extensions require non-headless
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-sandbox',
    ],
  });
}

/** createdAt 10 days back: the 'again' grade then appends day 12, which does not
 *  collide with the default [1, 3, 7] schedule (day 7 would be de-duplicated). */
function seedBookmarks() {
  const createdAt = new Date(Date.now() - 10 * 86400000).toISOString();
  return [
    { id: 1001, videoId: VIDEO_ID, timestamp: 12, description: ANSWER_1, tags: ['important'], color: '#ef4444', createdAt, videoTitle: 'Test', reviewSchedule: [1, 3, 7], lastReviewed: null },
    { id: 1002, videoId: VIDEO_ID, timestamp: 25, description: ANSWER_2, tags: ['review'], color: '#f97316', createdAt, videoTitle: 'Test', reviewSchedule: [1, 3, 7], lastReviewed: null },
  ];
}

async function seed(worker: Worker, bookmarks: unknown[]): Promise<void> {
  await worker.evaluate(
    ({ key, data }) => new Promise<void>(r => chrome.storage.sync.set({ [key]: data }, () => r())),
    { key: bmKey(VIDEO_ID), data: bookmarks },
  );
}

async function readStored(worker: Worker): Promise<Record<string, unknown>[]> {
  return worker.evaluate(
    ({ key }) => new Promise<Record<string, unknown>[]>(r =>
      chrome.storage.sync.get({ [key]: [] }, x => r((x as Record<string, Record<string, unknown>[]>)[key]))),
    { key: bmKey(VIDEO_ID) },
  );
}

async function startRevision(worker: Worker, bookmarks: unknown[], recall?: boolean): Promise<void> {
  await worker.evaluate(
    ({ url, bms, useRecall }) => new Promise<void>((resolve, reject) => {
      chrome.tabs.query({ url }, tabs => {
        if (!tabs[0]?.id) { reject(new Error('No matching YouTube tab found')); return; }
        const msg: Record<string, unknown> = { action: 'startRevision', bookmarks: bms };
        if (useRecall) msg.recall = true;
        chrome.tabs.sendMessage(tabs[0].id, msg, () => resolve());
      });
    }),
    { url: `${VIDEO_URL}*`, bms: bookmarks, useRecall: recall ?? false },
  );
}

/** Jump past a segment's end and nudge the handler that watches for it. */
async function forceSegmentEnd(page: import('@playwright/test').Page, seconds: number): Promise<void> {
  await page.locator('video').evaluate((v: HTMLVideoElement, t: number) => {
    v.currentTime = t;
    v.dispatchEvent(new Event('timeupdate'));
  }, seconds);
}

test.describe('Active Recall Mode (packaged dist build)', () => {
  test.beforeEach(() => {
    test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  });

  test('recall → reveal → grade → persist → advance', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const bookmarks = seedBookmarks();
      await seed(worker, bookmarks);

      const page = await context.newPage();
      await page.goto(VIDEO_URL, { waitUntil: 'networkidle' });

      // Content script alive in the packaged build. The built content.js uses
      // TAG_COLORS/getTagColor as bare globals, so injection + rendered markers
      // prove the constants chunk survived bundling.
      await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 20_000 });
      await page.locator('video').hover({ force: true });
      await page.locator('.yt-bookmark-markers').waitFor({ timeout: 15_000 });
      expect(await page.locator('.yt-bookmark-marker').count()).toBeGreaterThan(0);

      // ── Prompt: question shown, answer withheld ──────────────────────────
      await startRevision(worker, bookmarks, true);
      const prompt = page.locator('.yt-recall-panel');
      await prompt.waitFor({ timeout: 10_000 });
      await expect(prompt).toContainText('Recall this moment');
      await expect(prompt).toContainText('0:12');
      await expect(prompt).toContainText('Clip 1 / 2');
      await expect(prompt).not.toContainText(ANSWER_1);
      expect(await prompt.innerHTML()).toContain('yt-recall-tag');
      // Paused so the moment isn't spoiled before the user commits to an answer.
      expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

      // ── Reveal & Play ───────────────────────────────────────────────────
      await prompt.locator('.yt-recall-btn').click();
      await expect(page.locator('.yt-recall-panel')).toHaveCount(0);
      await page.waitForTimeout(800);
      expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
        .toBeGreaterThanOrEqual(11);

      // ── Grade panel: answer now revealed ────────────────────────────────
      await forceSegmentEnd(page, 26.5); // past segment 1 end (next bookmark @25)
      const grade = page.locator('.yt-recall-panel');
      await grade.waitFor({ timeout: 10_000 });
      await expect(grade).toContainText('Did you recall it?');
      await expect(grade).toContainText(ANSWER_1);
      await expect(grade.locator('[data-grade="got_it"]')).toBeVisible();
      await expect(grade.locator('[data-grade="again"]')).toBeVisible();

      // ── "Got it" persists via the real engine ───────────────────────────
      await grade.locator('[data-grade="got_it"]').click();
      await page.waitForTimeout(1500);
      const stored = await readStored(worker);
      const graded = stored.find(b => b.id === 1001)!;
      expect(graded.lastReviewed).toBeTruthy();
      // recallStreak is set only by gradeRecall (src/recall.js); content.js's
      // fallback just stamps lastReviewed. A streak of 1 proves the engine
      // loaded and ran inside the packaged build.
      expect(graded.recallStreak).toBe(1);
      expect(stored.find(b => b.id === 1002)!.lastReviewed).toBeNull();

      // ── Advances to the next clip, answer withheld again ────────────────
      const next = page.locator('.yt-recall-panel');
      await next.waitFor({ timeout: 10_000 });
      await expect(next).toContainText('Clip 2 / 2');
      await expect(next).not.toContainText(ANSWER_2);

      // ── "Again" keeps the item due and schedules a near-term retry ──────
      await next.locator('.yt-recall-btn').click();
      await forceSegmentEnd(page, 90); // past segment 2 end (25 + 60 cap)
      const grade2 = page.locator('.yt-recall-panel');
      await grade2.waitFor({ timeout: 10_000 });
      await grade2.locator('[data-grade="again"]').click();
      await page.waitForTimeout(1500);
      const after = await readStored(worker);
      const again = after.find(b => b.id === 1002)!;
      expect(again.lastReviewed).toBeNull();   // still due
      expect(again.recallStreak).toBe(0);
      expect(again.reviewSchedule).toContain(12);

      // ── Session over, overlay cleaned up ───────────────────────────────
      await page.waitForTimeout(1000);
      expect(await page.locator('.yt-recall-panel').count()).toBe(0);
    } finally {
      await context.close();
    }
  });

  test('classic Revisit (no recall flag) shows no recall panel', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const bookmarks = seedBookmarks().slice(0, 1);
      await seed(worker, bookmarks);

      const page = await context.newPage();
      await page.goto(VIDEO_URL, { waitUntil: 'networkidle' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ timeout: 20_000 });

      await startRevision(worker, bookmarks); // recall omitted
      await page.locator('.yt-revision-overlay').waitFor({ timeout: 10_000 });
      expect(await page.locator('.yt-recall-panel').count()).toBe(0);
    } finally {
      await context.close();
    }
  });
});
