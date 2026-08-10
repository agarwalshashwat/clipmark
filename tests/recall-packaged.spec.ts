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
 *
 * Interaction discipline, same as loop-packaged.spec.ts: YouTube auto-hides the
 * player control bar, so anything injected into it is ATTACHED long before it is
 * ever `visible`. Waiting on visibility meant waiting on YouTube's chrome and
 * then poking the video with a coordinate hover to force it back — a real source
 * of flake that has nothing to do with what these tests assert. Wait for
 * attachment and drive elements with dispatchEvent, which targets them directly.
 */
import { test, expect, BrowserContext, Worker } from '@playwright/test';
import { TEST_VIDEO_ID, TEST_VIDEO_URL, launchExtensionContext } from './fixtures';
import { existsSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const VIDEO_URL = TEST_VIDEO_URL;
const VIDEO_ID = TEST_VIDEO_ID;

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
  return launchExtensionContext(DIST);
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

/**
 * Open the side panel's own page in a tab.
 *
 * The panel routes on the *active* tab's URL: because this page is itself the
 * active tab, and a chrome-extension:// URL is not a watch page, it renders the
 * idle screen — the exact surface the due strip lives on.
 */
async function openSidePanelPage(
  context: BrowserContext,
  worker: Worker,
): Promise<import('@playwright/test').Page> {
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/pages/side-panel.html`);
  return page;
}

/**
 * The real playback element.
 *
 * A bare locator('video') is a strict-mode violation on watch pages that also
 * render the inline-preview player (#inline-preview-player-cow), which YouTube
 * mounts non-deterministically — so every video assertion scopes to the movie
 * player explicitly.
 */
function mainVideo(page: import('@playwright/test').Page): import('@playwright/test').Locator {
  return page.locator('#movie_player video');
}

async function isPaused(page: import('@playwright/test').Page): Promise<boolean> {
  return mainVideo(page).evaluate((v: HTMLVideoElement) => v.paused);
}

async function currentTime(page: import('@playwright/test').Page): Promise<number> {
  return mainVideo(page).evaluate((v: HTMLVideoElement) => v.currentTime);
}

/**
 * Hit "Reveal & Play".
 *
 * dispatchEvent rather than click(): a real click has to pass Playwright's
 * actionability check, which never settles while the watch page is still
 * loading its own overlays. Muting first is what makes the resulting play()
 * survive the autoplay policy — a synthetic click carries no user activation.
 */
async function reveal(
  page: import('@playwright/test').Page,
  prompt: import('@playwright/test').Locator,
): Promise<void> {
  await mainVideo(page).evaluate((v: HTMLVideoElement) => { v.muted = true; });
  await prompt.locator('.yt-recall-btn').dispatchEvent('click');
}

/**
 * Assert the recall hold is genuinely holding at `start`.
 *
 * A bare `paused === true` read is racy and not the property that matters:
 * v.play() flips `paused` to false synchronously, while the `play` event that
 * drives the re-pause is dispatched a task later, so an instantaneous read can
 * land inside that window even though the guard is working. What the user
 * actually experiences is the playhead — if it never leaves the segment start,
 * the clip (the answer) was never spoiled. So assert the playhead is pinned and
 * let `paused` settle.
 */
async function expectHeldAt(
  page: import('@playwright/test').Page,
  start: number,
): Promise<void> {
  const before = await currentTime(page);
  await expect.poll(() => isPaused(page), { timeout: 10_000 }).toBe(true);
  const after = await currentTime(page);
  for (const t of [before, after]) {
    expect(t).toBeGreaterThanOrEqual(start - 1);
    expect(t).toBeLessThanOrEqual(start + 1);
  }
}

/** Jump past a segment's end and nudge the handler that watches for it. */
async function forceSegmentEnd(page: import('@playwright/test').Page, seconds: number): Promise<void> {
  await mainVideo(page).evaluate((v: HTMLVideoElement, t: number) => {
    v.currentTime = t;
    v.dispatchEvent(new Event('timeupdate'));
  }, seconds);
}

test.describe('Active Recall Mode (packaged dist build)', () => {
  test.beforeEach(() => {
    test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  });

  test('recall → reveal → grade → persist → advance', async () => {
    test.setTimeout(150_000); // a real watch page plus a four-stage recall session
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const bookmarks = seedBookmarks();
      await seed(worker, bookmarks);

      const page = await context.newPage();
      // domcontentloaded, not networkidle: a watch page streams continuously, so
      // networkidle can never settle. The content script's own button below is
      // the readiness signal that actually matters here.
      await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });

      // Content script alive in the packaged build. The built content.js uses
      // TAG_COLORS/getTagColor as bare globals, so injection + rendered markers
      // prove the constants chunk survived bundling.
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: 20_000 });
      await page.locator('.yt-bookmark-markers').waitFor({ state: 'attached', timeout: 15_000 });
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
      // Held so the moment isn't spoiled before the user commits to an answer.
      await expectHeldAt(page, 12);

      // ── Reveal & Play ───────────────────────────────────────────────────
      await reveal(page, prompt);
      await expect(page.locator('.yt-recall-panel')).toHaveCount(0);
      await page.waitForTimeout(800);
      expect(await currentTime(page)).toBeGreaterThanOrEqual(11);

      // ── Grade panel: answer now revealed ────────────────────────────────
      await forceSegmentEnd(page, 26.5); // past segment 1 end (next bookmark @25)
      const grade = page.locator('.yt-recall-panel');
      await grade.waitFor({ timeout: 10_000 });
      await expect(grade).toContainText('Did you recall it?');
      await expect(grade).toContainText(ANSWER_1);
      await expect(grade.locator('[data-grade="got_it"]')).toBeVisible();
      await expect(grade.locator('[data-grade="again"]')).toBeVisible();

      // ── "Got it" persists via the real engine ───────────────────────────
      // dispatchEvent for the same reason as reveal(): a real click has to clear
      // Playwright's actionability check, which the watch page's own overlays
      // keep unsettled.
      await grade.locator('[data-grade="got_it"]').dispatchEvent('click');
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
      await reveal(page, next);
      await forceSegmentEnd(page, 90); // past segment 2 end (25 + 60 cap)
      const grade2 = page.locator('.yt-recall-panel');
      await grade2.waitFor({ timeout: 10_000 });
      await grade2.locator('[data-grade="again"]').dispatchEvent('click');
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

  /**
   * Regression: the side panel's due-strip "Start review" used to route through
   * openVideoAt, whose reused-tab branch sends `seekTo` — and seekTo seeks then
   * calls play(). On a due clip the video started playing immediately and the
   * recall prompt never appeared at all, because the storage handoff it also
   * wrote is only consumed on a fresh player init that never happened.
   *
   * The prompt assertion is what pins the bug: under the old code the panel
   * never mounts on a reused tab, regardless of whether the browser's autoplay
   * policy let the playback actually start.
   */
  test('side-panel "Start review" holds and prompts on an already-open tab', async () => {
    test.setTimeout(150_000); // two pages plus a real watch-page load
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const bookmarks = seedBookmarks();
      await seed(worker, bookmarks);

      const yt = await context.newPage();
      await yt.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await yt.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: 30_000 });

      // Put the playhead well away from the first segment (12s) and try to get
      // it rolling, so "paused at 12" cannot be true by accident.
      await mainVideo(yt).evaluate((v: HTMLVideoElement) => {
        v.currentTime = 200;
        // Muted playback is exempt from the autoplay policy, so this is the one
        // way to get the player genuinely rolling under automation. The play()
        // promise is deliberately NOT awaited — on a still-buffering watch page
        // it can stay pending forever and hang evaluate().
        v.muted = true;
        void v.play().catch(() => {});
      });

      const panel = await openSidePanelPage(context, worker);
      const startBtn = panel.locator('#sp-idle-due-start-btn');
      await startBtn.waitFor({ state: 'visible', timeout: 20_000 });
      // dispatchEvent, not click(): the packaged panel's actionability check
      // never settles under automation — same reason the loop specs moved off
      // coordinate clicks. The handler is bound via onclick, so this drives it.
      await startBtn.dispatchEvent('click');

      // ── Prompt on the SAME tab — no reload, no second implementation ──────
      const prompt = yt.locator('.yt-recall-panel');
      await prompt.waitFor({ timeout: 15_000 });
      await expect(prompt).toContainText('Recall this moment');
      await expect(prompt).toContainText('0:12');
      await expect(prompt).toContainText('Clip 1 / 2');
      await expect(prompt).not.toContainText(ANSWER_1);

      // ── Held AT the segment start, not merely paused wherever it was ──────
      // It was rolling at 200s a moment ago, so this pins both the seek and the pause.
      await expectHeldAt(yt, 12);

      // ── And it stays held: the guard re-pauses YouTube's own play() ───────
      await mainVideo(yt).evaluate((v: HTMLVideoElement) => { void v.play().catch(() => {}); });
      await yt.waitForTimeout(1500);
      await expectHeldAt(yt, 12);
      await expect(yt.locator('.yt-recall-panel')).toContainText('Recall this moment');

      // ── Playback only after Reveal ────────────────────────────────────────
      await reveal(yt, prompt);
      await expect(yt.locator('.yt-recall-panel')).toHaveCount(0);
      await expect.poll(() => isPaused(yt), { timeout: 10_000 }).toBe(false);
    } finally {
      await context.close();
    }
  });

  /**
   * The other branch of the same entry point: no tab for the video, so the
   * session is handed over through chrome.storage.local and picked up on player
   * init. content.js must pause in the storage callback rather than after its
   * 800ms marker setup, or the clip plays audibly before the prompt mounts.
   */
  test('side-panel "Start review" holds and prompts when no tab is open', async () => {
    test.setTimeout(150_000); // the panel opens the watch page itself
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const bookmarks = seedBookmarks();
      await seed(worker, bookmarks);

      // No YouTube tab exists — the panel page is the only one open.
      const panel = await openSidePanelPage(context, worker);
      const startBtn = panel.locator('#sp-idle-due-start-btn');
      await startBtn.waitFor({ state: 'visible', timeout: 20_000 });

      const opened = context.waitForEvent('page', { timeout: 30_000 });
      await startBtn.dispatchEvent('click');
      const yt = await opened;
      await yt.waitForLoadState('domcontentloaded');
      expect(yt.url()).toContain(VIDEO_ID);

      const prompt = yt.locator('.yt-recall-panel');
      await prompt.waitFor({ timeout: 30_000 });
      await expect(prompt).toContainText('Recall this moment');
      await expect(prompt).toContainText('0:12');
      await expect(prompt).not.toContainText(ANSWER_1);

      await expectHeldAt(yt, 12);

      await reveal(yt, prompt);
      await expect(yt.locator('.yt-recall-panel')).toHaveCount(0);
      await expect.poll(() => isPaused(yt), { timeout: 10_000 }).toBe(false);
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
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: 20_000 });

      await startRevision(worker, bookmarks); // recall omitted
      await page.locator('.yt-revision-overlay').waitFor({ timeout: 10_000 });
      expect(await page.locator('.yt-recall-panel').count()).toBe(0);
    } finally {
      await context.close();
    }
  });
});
