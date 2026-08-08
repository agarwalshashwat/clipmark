/**
 * Captures the restyled surfaces from the PACKAGED extension for review.
 *
 * Not an assertion suite — it exists to produce reviewable images of what the
 * design work actually ships, from `extension/dist` loaded in a real Chrome.
 * Excluded from the default extension run (it needs an explicit opt-in) so it
 * never slows CI:
 *
 *   CAPTURE_SCREENSHOTS=1 xvfb-run -a npx playwright test tests/screenshots.spec.ts \
 *     --project=extension
 *
 * Output: cws-screenshots/restyle/*.png
 *
 * Every <video> is muted and paused, and Chrome is launched with --mute-audio,
 * so a capture run is silent.
 */
import { test, chromium, BrowserContext, Page, Worker, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const OUT = path.resolve(__dirname, '../cws-screenshots/restyle');
const VIDEO_ID = 'dQw4w9WgXcQ';
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

test.skip(!process.env.CAPTURE_SCREENSHOTS, 'set CAPTURE_SCREENSHOTS=1 to capture');
test.describe.configure({ mode: 'serial' });

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

/** One loop (2:20 → 2:48) plus two point bookmarks, so both chip styles show. */
function seedBookmarks() {
  const base = {
    videoId: VIDEO_ID,
    videoTitle: 'How to Actually Remember What You Watch',
    color: '#14b8a6',
    createdAt: new Date('2026-08-01T10:00:00Z').toISOString(),
    reviewSchedule: [1, 3, 7],
    lastReviewed: null,
  };
  // Bookmark ids double as the saved-at clock (id = Date.now() in the product),
  // so literal small ids render "57y ago" in the dashboard stats.
  const t = Date.parse('2026-08-01T10:00:00Z');
  return [
    { ...base, id: t - 7_200_000, timestamp: 30, description: 'The spacing effect #important', tags: ['important'] },
    { ...base, id: t - 3_600_000, timestamp: 95, description: 'Interleaving beats blocking #study', tags: ['study'] },
    { ...base, id: t, timestamp: 140, description: 'Drill this bit', tags: [], loop: { end: 168 } },
  ];
}

/** Silence and freeze every media element on the page. */
async function silence(page: Page) {
  await page.evaluate(() => {
    for (const v of Array.from(document.querySelectorAll('video, audio'))) {
      const m = v as HTMLMediaElement;
      m.muted = true;
      m.volume = 0;
      try { m.pause(); } catch { /* not ready yet */ }
    }
  });
}

/** Close any first-run coach-mark / driver.js popover still on screen. */
async function dismissOverlays(page: Page) {
  for (const sel of ['.clipmark-tour-popover .driver-popover-close-btn',
                     '.clipmark-tour-popover button.driver-popover-done-btn',
                     '.sp-coach-dismiss', '[data-tour-dismiss]']) {
    const el = page.locator(sel);
    if (await el.count()) { await el.first().click({ force: true }).catch(() => {}); }
  }
  await page.evaluate(() => {
    for (const sel of ['.driver-overlay', '.driver-popover', '#driver-popover-content',
                       '.clipmark-tour-popover', '.driver-active-element']) {
      document.querySelectorAll(sel).forEach((n) => n.remove());
    }
    document.documentElement.classList.remove('driver-active', 'driver-fade');
    document.body.classList.remove('driver-active', 'driver-fade');
  });
  await page.waitForTimeout(300);
}

async function waitForFonts(page: Page) {
  await page.evaluate(() =>
    Promise.all([
      (document as any).fonts.load("400 20px 'Material Symbols Outlined'"),
      (document as any).fonts.load("800 20px 'Plus Jakarta Sans'"),
      (document as any).fonts.load("400 14px 'Inter'"),
    ]).then(() => (document as any).fonts.ready).then(() => undefined)
  );
}

test('capture the restyled surfaces', async () => {
  test.setTimeout(300_000);
  if (!existsSync(DIST)) test.skip(true, 'extension/dist missing — run `make ext-build`');
  mkdirSync(OUT, { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    headless: false, // extensions require a headed browser
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-sandbox',
      '--mute-audio', // belt and braces alongside the per-element muting
      '--autoplay-policy=user-gesture-required',
    ],
  });

  const worker = await extensionServiceWorker(context);
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(
    ([key, bookmarks]) =>
      new Promise<void>((resolve) =>
        // @ts-expect-error — chrome is the extension's own global here
        chrome.storage.sync.set({
          [key as string]: bookmarks,
          // A fresh profile fires the first-run guided tour, which dims the
          // surface and covers it with a coach-mark — accurate, but useless as a
          // review image of the restyle. Mark it seen so the captures show the
          // steady-state UI. (The tour's own styling is covered separately by
          // the tour overrides in tour-theme.css.)
          tourState: { youtubeTour: true, sidePanelTour: true, recallCoachMark: true },
        }, () => resolve())
      ),
    [`bm_${VIDEO_ID}`, seedBookmarks()] as const
  );

  // ── 1 + 2. Side panel: the clip list with A→B ranges, light and dark ───────
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 420, height: 920 });
  await panel.goto(`chrome-extension://${extensionId}/src/pages/side-panel.html`);
  await panel.locator('.sp-logo-text').waitFor();
  await panel.locator('.sp-clip-moment-time--loop').first().waitFor({ timeout: 20_000 });
  await dismissOverlays(panel);
  await waitForFonts(panel);
  await silence(panel);
  await panel.screenshot({ path: `${OUT}/01-side-panel-loop-ranges.png` });

  await panel.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await panel.waitForTimeout(400); // let the 0.2s theme transition finish
  await panel.screenshot({ path: `${OUT}/02-side-panel-loop-ranges-dark.png` });
  await panel.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await panel.waitForTimeout(400);

  // ── 2b. The occlusion fix, called out on its own ──────────────────────────
  // The idle screen used to cover the whole panel at `inset: 0; z-index: 1000`,
  // so the ClipMark wordmark was absent from the panel's most common state. It
  // now covers only .side-panel-body. Crop the top so the fix is unmistakable.
  await panel.screenshot({
    path: `${OUT}/09-idle-state-wordmark-visible.png`,
    clip: { x: 0, y: 0, width: 420, height: 300 },
  });
  await panel.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await panel.waitForTimeout(400);
  await panel.screenshot({
    path: `${OUT}/09b-idle-state-wordmark-visible-dark.png`,
    clip: { x: 0, y: 0, width: 420, height: 300 },
  });
  await panel.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await panel.waitForTimeout(400);

  // ── 3. Side-panel header, for parity against the dashboard header ──────────
  // The idle screen now covers only .side-panel-body, so the header is visible
  // in this state and the crop needs no overlay lifting.
  await panel.locator('.side-panel-header').screenshot({ path: `${OUT}/06a-header-side-panel.png` });

  // ── 4 + 5. Dashboard: new gray ramp + teal-700, and its header ─────────────
  const dash = await context.newPage();
  await dash.setViewportSize({ width: 1360, height: 940 });
  await dash.goto(`chrome-extension://${extensionId}/src/pages/dashboard.html`);
  await dash.locator('.page-title').waitFor();
  await dash.locator('.vc-vt-time--loop').first().waitFor({ timeout: 20_000 });
  await dismissOverlays(dash);
  await waitForFonts(dash);
  await silence(dash);
  await dash.screenshot({ path: `${OUT}/04-dashboard.png` });
  await dash.locator('.page-header').screenshot({ path: `${OUT}/06b-header-dashboard.png` });

  await dash.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await dash.waitForTimeout(400);
  await dash.screenshot({ path: `${OUT}/05-dashboard-dark.png` });
  await dash.close();

  // ── 6-8. On YouTube: the scrubber ranges, an armed loop, the recall prompt ─
  const yt = await context.newPage();
  await yt.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
  await yt.locator('.yt-loop-player-btn').waitFor({ state: 'attached', timeout: 40_000 });
  await silence(yt);
  await dismissOverlays(yt);
  // Park the playhead inside the saved range so the marker sits mid-screen, and
  // keep it there — position is set explicitly, never played.
  await yt.locator('video').first().evaluate((v: HTMLVideoElement) => {
    v.muted = true; v.volume = 0; v.pause(); v.currentTime = 150;
  });
  // Nudge the pointer so YouTube shows its control bar (and our overlay) instead
  // of auto-hiding it.
  await yt.mouse.move(640, 700);
  await yt.waitForTimeout(1200);
  await silence(yt);

  const ranges = yt.locator('.yt-loop-range--saved').first();
  await ranges.waitFor({ timeout: 20_000 });

  // Report what actually got painted, so the capture is evidence rather than a
  // hopeful crop.
  const rangeInfo = await ranges.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { bg: cs.backgroundColor, borderLeft: cs.borderLeftColor,
             box: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
  console.log('  saved loop range →', JSON.stringify(rangeInfo));

  // Crop tight around the range itself and magnify: at 1280px wide a 28-second
  // band on a 3:22 video is ~180px, which is unreadable in a full screenshot.
  const b = rangeInfo.box;
  await yt.screenshot({
    path: `${OUT}/07-scrubber-teal-loop-ranges.png`,
    clip: { x: Math.max(0, b.x - 90), y: Math.max(0, b.y - 22), width: Math.min(1280, b.w + 180), height: 48 },
  });
  await yt.screenshot({ path: `${OUT}/07b-scrubber-in-context.png` });

  // Arm the saved loop: opens the loop panel and starts looping the segment.
  await yt.locator('.yt-loop-player-btn').dispatchEvent('click');
  await yt.locator('.yt-loop-panel').waitFor({ timeout: 20_000 });
  await yt.locator('.yt-loop-row').first().dispatchEvent('click');
  await yt.waitForTimeout(900);
  await silence(yt);
  await expect(yt.locator('.yt-loop-range--active')).toHaveCount(1);
  await yt.locator('.yt-loop-panel').screenshot({ path: `${OUT}/03-loop-panel-armed.png` });
  await yt.screenshot({ path: `${OUT}/03b-loop-armed-in-context.png` });

  // Recall prompt, driven the same way the recall E2E drives it.
  await worker.evaluate(
    ({ url, bms }) =>
      new Promise<void>((resolve, reject) => {
        // @ts-expect-error — extension globals
        chrome.tabs.query({ url }, (tabs: any[]) => {
          if (!tabs[0]?.id) { reject(new Error('no YouTube tab')); return; }
          // @ts-expect-error — extension globals
          chrome.tabs.sendMessage(tabs[0].id, { action: 'startRevision', bookmarks: bms, recall: true }, () => resolve());
        });
      }),
    { url: `${VIDEO_URL}*`, bms: seedBookmarks() }
  );
  await yt.waitForTimeout(1800);
  await silence(yt);
  await yt.screenshot({ path: `${OUT}/08-recall-prompt.png` });

  await yt.close();
  await panel.close();

  // ── 10-11. The first-run tour, actually working ───────────────────────────
  // Its own profile so the tour has genuinely never been seen.
  const tourCtx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-sandbox', '--mute-audio'],
  });
  try {
    const tw = await extensionServiceWorker(tourCtx);
    await tw.evaluate(() => new Promise<void>((r) => chrome.storage.sync.remove('tourState', () => r())));
    const tp = await tourCtx.newPage();
    await tp.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
    await tp.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: 40_000 });
    await tp.locator('.clipmark-tour-popover').waitFor({ timeout: 40_000 });
    await tp.waitForFunction(() => {
      const el = document.querySelector('.clipmark-tour-popover');
      return !!el && getComputedStyle(el).opacity === '1';
    }, null, { timeout: 15_000 });
    await silence(tp);

    // Advance to step 2 — the thing that used to be impossible.
    await tp.locator('.driver-popover-next-btn').click();
    await tp.locator('.driver-popover-progress-text').filter({ hasText: '2 of 3' }).waitFor({ timeout: 10_000 });
    await tp.waitForTimeout(600);
    await silence(tp);
    await tp.screenshot({ path: `${OUT}/10-tour-step-2-of-3.png` });

    // …and dismissed with the close button.
    await tp.locator('.driver-popover-close-btn').click();
    await tp.locator('.clipmark-tour-popover').waitFor({ state: 'detached', timeout: 10_000 });
    await tp.waitForTimeout(700);
    await silence(tp);
    await tp.screenshot({ path: `${OUT}/11-tour-dismissed.png` });
  } finally {
    await tourCtx.close();
  }

  await context.close();

  console.log(`\nScreenshots written to ${OUT}\n`);
});
