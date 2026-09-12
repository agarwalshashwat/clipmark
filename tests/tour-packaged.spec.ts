/**
 * First-run guided tour — end-to-end against the PACKAGED build.
 *
 * The v1.0.2 trap this exists to close: `yt-navigate-finish` is not a reliable
 * "you navigated" signal. YouTube fires it on the INITIAL load of a watch page
 * (~600ms in, after our tour has already appeared) and again as the SPA settles,
 * without the video ever changing. The listener treated every firing as a real
 * navigation, so it destroyed the live tour and restarted it at step 1 about a
 * second after it appeared. To a first-run user that reads as "Next does
 * nothing" (the step advanced, then the restart reset it) and "I can't close
 * it" (dismissed, then immediately re-shown) — and because each teardown set
 * abandonedForNavigation, which deliberately suppresses the seen flag, the tour
 * could neither be completed nor gotten rid of. A brand-new user was trapped.
 *
 * So these tests are mostly about the CONTROLS actually working, and about the
 * seen flag being set on genuine completion/dismissal and NOT on a real
 * navigation away mid-tour.
 *
 * The watch pages here are a DETERMINISTIC stand-in served at the real
 * youtube.com origin (tests/fixtures/youtube-watch.ts), not live YouTube.
 * Issue #84: gating this suite in CI put eleven more live-YouTube page loads
 * into `ci-extension-smoke`, so a single slow window at YouTube reddened a
 * dozen tests — the anchor wait below was routinely the thing that timed out.
 * None of what these tests assert is about YouTube's servers: the tour keys off
 * `.yt-bookmark-player-btn` appearing, chrome.storage, and yt-navigate-finish,
 * all of which the fixture reproduces faithfully (the player is mounted
 * asynchronously after document_end, exactly as the real one is, which is what
 * the content script's MutationObservers need in order to fire at all).
 *
 * Requires `make ext-build` first (skips with a message otherwise).
 */
import { test, expect, BrowserContext, Page, Worker } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'path';
import {
  launchExtensionContext,
  TEST_VIDEO_ID, TEST_VIDEO_TITLE, TEST_VIDEO_URL,
  TEST_VIDEO_ID_2, TEST_VIDEO_URL_2,
} from './fixtures';
import { serveYouTubeFixture, waitForExtensionMount } from './fixtures/youtube-watch';

const DIST = path.resolve(__dirname, '../extension/dist');
const VIDEO_ID = TEST_VIDEO_ID;
const OTHER_VIDEO_ID = TEST_VIDEO_ID_2;
const VIDEO_URL = TEST_VIDEO_URL;
const OTHER_VIDEO_URL = TEST_VIDEO_URL_2;
const OTHER_VIDEO_TITLE = 'Second fixture video';

// The fixture mounts its player ~200ms in, so the anchor is bounded by us
// rather than by youtube.com. 15s is still generous for a cold profile.
const MOUNT_TIMEOUT = 15_000;

const POPOVER = '.clipmark-tour-popover';
const PROGRESS = '.driver-popover-progress-text';
const NEXT = '.driver-popover-next-btn';
const PREV = '.driver-popover-prev-btn';
const CLOSE = '.driver-popover-close-btn';

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

async function launch(): Promise<BrowserContext> {
  const context = await launchExtensionContext(DIST);
  // Installed on the context so every page this spec opens — including the
  // second video and the reloads below — is served locally. Nothing in this
  // file reaches the network.
  await serveYouTubeFixture(context, {
    titles: { [VIDEO_ID]: TEST_VIDEO_TITLE, [OTHER_VIDEO_ID]: OTHER_VIDEO_TITLE },
  });
  return context;
}

/** Put the profile back to "never seen the tour". */
async function resetTour(worker: Worker): Promise<void> {
  await worker.evaluate(() => new Promise<void>((r) => chrome.storage.sync.remove('tourState', () => r())));
}

async function tourState(worker: Worker): Promise<Record<string, unknown>> {
  return worker.evaluate(() =>
    new Promise((r) => chrome.storage.sync.get({ tourState: {} }, (x) => r(x.tourState || {}))));
}

/** The same one-shot flag as `tourState`, but from the local fallback area. */
async function localTourState(worker: Worker): Promise<Record<string, unknown>> {
  return worker.evaluate(() =>
    new Promise((r) => chrome.storage.local.get({ tourState: {} }, (x) => r(x.tourState || {}))));
}

/** Seed the one-shot flag into the LOCAL fallback area only, leaving sync empty. */
async function seedLocalSeenFlag(worker: Worker): Promise<void> {
  await worker.evaluate(() =>
    new Promise<void>((r) => chrome.storage.local.set({ tourState: { youtubeTour: true } }, () => r())));
}

/** Open a watch page and wait for the tour's first step to be on screen. */
async function openWithTour(context: BrowserContext, url = VIDEO_URL): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
  await page.locator(POPOVER).waitFor({ timeout: MOUNT_TIMEOUT });
  // driver.js fades the popover in over 400ms; clicking mid-fade is not a fair
  // test of the controls (an opacity-0 ancestor is not hit-testable).
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && getComputedStyle(el).opacity === '1';
    },
    POPOVER,
    { timeout: 15_000 }
  );
  return page;
}

/**
 * Like openWithTour, but returns the moment the popover is on screen — WITHOUT
 * waiting for driver.js's 400ms fade-in to finish.
 *
 * That wait is why the v1.0.3 "tour on every video" bug got past this suite.
 * Every other case here settles the fade first, which also happens to be when
 * driver.js fires onHighlighted and sets the internal state onDestroyed is
 * gated on. A real user clicks × as soon as they see it — before either — and on
 * that path the seen flag was never stored at all.
 */
async function openWithTourNoFadeWait(context: BrowserContext, url = VIDEO_URL): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
  await page.locator(POPOVER).waitFor({ state: 'visible', timeout: MOUNT_TIMEOUT });
  return page;
}

test.describe('First-run guided tour (packaged build)', () => {
  test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  // Each case launches its own Chrome with the extension, which dominates the
  // wall clock now that the page itself is local. The old 180s allowance was
  // sized for youtube.com's worst case; the several deliberate settle-waits
  // below still push a case past the repo-wide 60s default.
  test.setTimeout(90_000);

  test('survives the initial-load yt-navigate-finish instead of resetting to step 1', async () => {
    const context = await launch();
    try {
      await resetTour(await extensionServiceWorker(context));
      const page = await openWithTour(context);

      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');

      // Advance, THEN fire the event YouTube fires on its own during settling.
      await page.locator(NEXT).click();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');

      await page.evaluate(() => document.dispatchEvent(new CustomEvent('yt-navigate-finish')));
      await page.waitForTimeout(1500);

      // The tour must still be up, and still on step 2 — this is the regression.
      await expect(page.locator(POPOVER)).toBeVisible();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');
    } finally {
      await context.close();
    }
  });

  test('Next and Back step through all three steps', async () => {
    const context = await launch();
    try {
      await resetTour(await extensionServiceWorker(context));
      const page = await openWithTour(context);

      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');
      // Back is disabled on the first step.
      await expect(page.locator(PREV)).toHaveClass(/driver-popover-btn-disabled/);

      await page.locator(NEXT).click();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');

      await page.locator(NEXT).click();
      await expect(page.locator(PROGRESS)).toHaveText('3 of 3');

      // And back down again.
      await page.locator(PREV).click();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');
      await page.locator(PREV).click();
      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');
    } finally {
      await context.close();
    }
  });

  test('completing the tour marks it seen, and it does not come back', async () => {
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await openWithTour(context);

      for (const step of ['2 of 3', '3 of 3']) {
        await page.locator(NEXT).click();
        await expect(page.locator(PROGRESS)).toHaveText(step);
      }
      // The last click finishes it.
      await page.locator(NEXT).click();
      await expect(page.locator(POPOVER)).toHaveCount(0);

      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);

      // A reload must not bring it back.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
      await page.waitForTimeout(3000);
      await expect(page.locator(POPOVER)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('the close button dismisses it for good', async () => {
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await openWithTour(context);

      await page.locator(CLOSE).click();
      await expect(page.locator(POPOVER)).toHaveCount(0);

      // Dismissing is the user declining — it counts as seen.
      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);

      // And it must not resurrect when YouTube settles the page.
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('yt-navigate-finish')));
      await page.waitForTimeout(2500);
      await expect(page.locator(POPOVER)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('navigating away mid-tour records it and does not offer it again', async () => {
    // INVERTED for the v1.0.8 field bug. This used to assert the opposite — that
    // being carried to another video left the flag unset so the tour "got
    // another go". That rule is what a real user hit: they browse videos, so the
    // tour got another go every single time, forever.
    //
    // A coach-mark that reached the screen counts as seen however the run ended.
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await openWithTour(context);
      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');

      await page.goto(OTHER_VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });

      // Recorded…
      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);
      // …and not offered on the video the user landed on.
      await page.waitForTimeout(4000); // past the anchor wait + drive()
      await expect(page.locator(POPOVER)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('an in-page SPA navigation mid-tour records it and does not re-arm', async () => {
    // INVERTED alongside the case above, and this is the one that matters: a
    // full page load tears the content script down wholesale, whereas the path
    // production actually takes between two videos keeps the SAME content-script
    // instance alive and reaches the tour through its yt-navigate-finish
    // listener. That listener destroyed the live tour, declined to record the
    // one-shot, and restarted the tour on the new video — the exact loop a user
    // filmed on v1.0.8.
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await openWithTour(context);
      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');

      // Sentinel: a document-level global survives pushState but not a reload.
      // Without it this test would still pass if navigateTo ever regressed into
      // a real navigation — and would then be a duplicate of the case above
      // rather than cover for the listener branch.
      await page.evaluate(() => { (window as any).__spaSentinel = true; });

      await page.evaluate(
        ({ id, title }) => (window as any).__clipmarkFixture.navigateTo(id, title),
        { id: OTHER_VIDEO_ID, title: OTHER_VIDEO_TITLE },
      );
      await waitForExtensionMount(page, MOUNT_TIMEOUT);

      // Same content-script instance, new video…
      expect(await page.evaluate(() => (window as any).__spaSentinel)).toBe(true);
      expect(new URL(page.url()).searchParams.get('v')).toBe(OTHER_VIDEO_ID);
      // …the one-shot is recorded…
      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);
      // …and the tour does not come back on the video they landed on.
      await page.waitForTimeout(4000);
      await expect(page.locator(POPOVER)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  /**
   * The v1.0.3 regression: the tour reappeared on EVERY fresh watch page.
   *
   * Root cause was entirely in the WRITE path. "Shown" was gated on driver.js's
   * `onHighlighted`, the end of its highlight transition, which on a live
   * YouTube page lands ~1.2s after the popover is visible; and `onDestroyed`,
   * the only place the flag was written, is itself gated on internal state set
   * at that same instant. Dismiss the tour inside that first second — the normal
   * thing to do — and neither ran, so nothing was ever persisted and the
   * one-shot never became one.
   *
   * Deliberately dismisses without waiting for the fade, then loads a second
   * video as a full page load (fresh content-script instance reading storage).
   */
  test('dismissing during the fade-in still sticks — no tour on the next video', async () => {
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await openWithTourNoFadeWait(context);

      // No fade wait, no step advance: close it the instant it appears.
      await page.locator(CLOSE).click();
      await expect(page.locator(POPOVER)).toHaveCount(0);

      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);

      // A DIFFERENT video, loaded fresh — the content script re-evaluates and
      // must short-circuit on the stored flag.
      await page.goto(OTHER_VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
      await page.waitForTimeout(4000); // well past the anchor wait + drive()
      await expect(page.locator(POPOVER)).toHaveCount(0);

      // And a third load, to be sure it is not alternating.
      await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
      await page.waitForTimeout(4000);
      await expect(page.locator(POPOVER)).toHaveCount(0);
      expect((await tourState(worker)).youtubeTour).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('a seen flag that only reached the local fallback still suppresses the tour', async () => {
    // The failure this guards: the one-shot flag lived ONLY in
    // chrome.storage.sync, so when that write was refused nothing was stored and
    // the tour returned on EVERY video with no way for the user to stop it. sync
    // refuses writes for reasons that persist across videos — QUOTA_BYTES is
    // ~100KB shared with every bm_{videoId} bookmark, the per-minute write cap,
    // or sync switched off on the profile. tour.js now mirrors the flag to
    // chrome.storage.local and believes EITHER area.
    //
    // This asserts the read half against the packaged build, which is the half
    // that is observable here: sync is seeded empty and local carries the flag,
    // exactly the state a refused sync write leaves behind. The write half (that
    // a refused sync set falls through to local) is covered in
    // tests/unit/tour-state.test.mjs — a genuine quota failure cannot be forced
    // in this harness, because Chrome does not enforce sync QUOTA_BYTES for an
    // unsigned-in test profile: filling past 102,000 bytes still accepts a small
    // write.
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);          // sync: no flag
      await seedLocalSeenFlag(worker);  // local: seen

      // Sanity: the areas really are in the state this test is about.
      expect((await tourState(worker)).youtubeTour).not.toBe(true);
      expect((await localTourState(worker)).youtubeTour).toBe(true);

      const page = await context.newPage();
      await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
      await page.waitForTimeout(4000); // well past the anchor wait + drive()
      await expect(page.locator(POPOVER)).toHaveCount(0);

      // A second video too — the flag has to hold across navigations.
      await page.goto(OTHER_VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
      await page.waitForTimeout(4000);
      await expect(page.locator(POPOVER)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  /**
   * ─── Sub-tour B: the Active Recall coach-mark in the side panel ───────────
   *
   * Same class of bug as #97 above, in a different file. side-panel.js gated
   * its seen flag on `stepShown`, which only `onHighlighted` set — the END of
   * driver.js's ~400ms highlight transition — and wrote it only from
   * `onDestroyed`, which driver.js guards on internal state set at that same
   * instant. Click "Got it" inside those 400ms (the common case: the button is
   * right there) and NOTHING was stored, so the card came back on every single
   * panel open, forever. The fix ports the #97 pattern verbatim.
   *
   * Deliberately no fade wait anywhere below — that wait is precisely what hid
   * the bug from a suite that otherwise settles before clicking.
   */
  const DONE = '.driver-popover-done-btn';
  const PANEL_HEADER = '.side-panel-header';

  function panelUrl(worker: Worker): string {
    return `chrome-extension://${new URL(worker.url()).host}/src/pages/side-panel.html`;
  }

  /** Open the panel page and return as soon as the coach-mark is on screen. */
  async function openPanelNoFadeWait(context: BrowserContext, worker: Worker): Promise<Page> {
    const page = await context.newPage();
    await page.goto(panelUrl(worker));
    await page.locator(POPOVER).waitFor({ state: 'visible', timeout: 20_000 });
    return page;
  }

  test('dismissing the coach-mark before the fade finishes still marks it seen', async () => {
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      // Sub-tour B defers to Sub-tour A while that is still pending on a
      // YouTube tab; the panel page is not a watch page, so it runs.
      const page = await openPanelNoFadeWait(context, worker);

      // No fade wait, no settle — the exact timing that stored nothing before.
      await page.locator(DONE).click();
      await expect(page.locator(POPOVER)).toHaveCount(0);

      await expect
        .poll(async () => (await tourState(worker)).sidePanelTour, { timeout: 10_000 })
        .toBe(true);

      // Reopening the panel is what the user actually does next. Before the fix
      // the card was back here, and on every open after that.
      const reopened = await context.newPage();
      await reopened.goto(panelUrl(worker));
      await reopened.waitForTimeout(4000); // well past waitForElement + drive()
      await expect(reopened.locator(POPOVER)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('the coach-mark never paints over the panel header, even when short', async () => {
    // driver.js's element-less (centered) branch is positioned with no viewport
    // clamp, so under ~281px of CSS viewport height the card crossed the 50px
    // header and painted over the wordmark — the popover is z-index 1000010,
    // the header 50, so the header simply lost. Two fixes: the steps are
    // anchored to a real element now, and tour-theme.css bounds the height.
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      const page = await context.newPage();
      // Deliberately brutal: shorter than the unclamped card needed.
      await page.setViewportSize({ width: 400, height: 260 });
      await page.goto(panelUrl(worker));
      await page.locator(POPOVER).waitFor({ state: 'visible', timeout: 20_000 });
      // Let driver.js finish positioning before measuring.
      await page.waitForTimeout(1200);

      const overlap = await page.evaluate(
        ([popSel, headerSel]) => {
          const pop = document.querySelector(popSel)?.getBoundingClientRect();
          const header = document.querySelector(headerSel)?.getBoundingClientRect();
          if (!pop || !header) return null;
          const vertical = Math.min(pop.bottom, header.bottom) - Math.max(pop.top, header.top);
          const horizontal = Math.min(pop.right, header.right) - Math.max(pop.left, header.left);
          return {
            overlapping: vertical > 0 && horizontal > 0,
            popTop: pop.top,
            popBottom: pop.bottom,
            headerBottom: header.bottom,
            fitsViewport: pop.bottom <= window.innerHeight + 1,
          };
        },
        [POPOVER, PANEL_HEADER] as const,
      );

      expect(overlap, 'popover or header missing').not.toBeNull();
      expect(
        overlap!.overlapping,
        `coach-mark (${overlap!.popTop}–${overlap!.popBottom}) crosses the header (ends ${overlap!.headerBottom})`,
      ).toBe(false);
      expect(overlap!.fitsViewport, 'coach-mark overflows the panel viewport').toBe(true);
    } finally {
      await context.close();
    }
  });

  test('a user with saved moments is not told to come back once they have saved one', async () => {
    // The copy was chosen from the CURRENT video's bookmarks, and the panel page
    // is not a watch page — so every returning user with a full library got the
    // empty-state pitch.
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      await worker.evaluate(
        ({ key, data }) => new Promise<void>((r) => chrome.storage.sync.set({ [key]: data }, () => r())),
        {
          key: `bm_${VIDEO_ID}`,
          data: [{
            id: 4001, videoId: VIDEO_ID, timestamp: 12, description: 'Already saved',
            tags: [], color: '#3b82f6', createdAt: new Date().toISOString(),
            videoTitle: 'Test', reviewSchedule: [1, 3, 7], lastReviewed: null,
          }],
        },
      );

      const page = await openPanelNoFadeWait(context, worker);
      await expect(page.locator(POPOVER)).toContainText('Active Recall');
      await expect(page.locator(POPOVER)).not.toContainText('Come back here once');
      await expect(page.locator(POPOVER)).toContainText("quizzes you before each clip plays");
    } finally {
      await context.close();
    }
  });

  /**
   * ─── The v1.0.8 field report ───────────────────────────────────────────────
   *
   * A real end user sent video of the tour coach-mark re-appearing over and over
   * while they watched YouTube — the "Or just press a key / Alt+B" step in
   * particular. Not the orphaned-context case #148 covered: an ordinary install,
   * an ordinary person moving between videos.
   *
   * Reproduced exactly here before the fix: 1 cold load + 4 in-page navigations
   * showed the tour 5 times, restarting at "1 of 3" every time, with BOTH storage
   * areas still empty. Cause was the interaction of two deliberate rules —
   * `shouldMarkTourSeen` refused to record the one-shot when a navigation ended
   * the tour, and the yt-navigate-finish listener immediately re-armed it on the
   * new video. Nothing terminated that loop, because browsing is not a terminal
   * state.
   *
   * These walk more navigations than any other case here on purpose: the bug is
   * only visible in the repetition, which is why a suite full of single-navigation
   * tests passed all the way through v1.0.8.
   */
  const MORE_VIDEO_IDS = ['ZZZspaVideo03', 'ZZZspaVideo04', 'ZZZspaVideo05'];

  /** launch(), but with the extra fixture videos these two cases navigate through. */
  async function launchWithExtraVideos(): Promise<BrowserContext> {
    const context = await launchExtensionContext(DIST);
    const titles: Record<string, string> = {
      [VIDEO_ID]: TEST_VIDEO_TITLE,
      [OTHER_VIDEO_ID]: OTHER_VIDEO_TITLE,
    };
    MORE_VIDEO_IDS.forEach((id, i) => { titles[id] = `SPA fixture ${i + 3}`; });
    await serveYouTubeFixture(context, { titles });
    return context;
  }

  /** Drive one in-page SPA navigation and let the tour have every chance to appear. */
  async function spaNavigate(page: Page, videoId: string, title: string): Promise<void> {
    await page.evaluate(
      ({ id, t }) => (window as any).__clipmarkFixture.navigateTo(id, t),
      { id: videoId, t: title },
    );
    await waitForExtensionMount(page, MOUNT_TIMEOUT);
    // Generous on purpose: past the anchor wait and drive(), so a tour that WOULD
    // re-arm has time to paint rather than being missed by a tight assertion.
    await page.waitForTimeout(3000);
  }

  test('the tour is offered at most once across repeated SPA navigations', async () => {
    const context = await launchWithExtraVideos();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      await worker.evaluate(() =>
        new Promise<void>((r) => chrome.storage.local.remove('tourState', () => r())));

      // A genuine first-run user: the tour appears, and they click Next — which
      // is where the filmed video was, on the Alt+B step.
      const page = await openWithTour(context);
      await expect(page.locator(POPOVER)).toHaveCount(1);
      await page.locator(NEXT).click();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');

      let appearances = 1;
      const journey: Array<[string, string]> = [
        [OTHER_VIDEO_ID, OTHER_VIDEO_TITLE],
        ...MORE_VIDEO_IDS.map((id, i) => [id, `SPA fixture ${i + 3}`] as [string, string]),
      ];
      for (const [id, title] of journey) {
        await spaNavigate(page, id, title);
        appearances += await page.locator(POPOVER).count();
      }

      expect(
        appearances,
        `tour was shown ${appearances}× across a cold load + ${journey.length} SPA navigations`,
      ).toBe(1);

      // And the one-shot really is persisted, not merely suppressed in memory.
      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);
    } finally {
      await context.close();
    }
  });

  test('a persisted seen flag survives repeated SPA navigations and re-inits', async () => {
    // The other half: a returning user whose flag is already stored. Covers the
    // read path across many navigations in ONE content-script context, then
    // across fresh contexts (full reloads re-evaluate the content script), which
    // is what "never re-arms" has to mean for someone who saw the tour weeks ago.
    const context = await launchWithExtraVideos();
    try {
      const worker = await extensionServiceWorker(context);
      await worker.evaluate(() =>
        new Promise<void>((r) => chrome.storage.sync.set({ tourState: { youtubeTour: true } }, () => r())));

      const page = await context.newPage();
      await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
      await page.waitForTimeout(3000);
      await expect(page.locator(POPOVER)).toHaveCount(0);

      // Many in-page navigations, same content-script instance.
      for (const [i, id] of MORE_VIDEO_IDS.entries()) {
        await spaNavigate(page, id, `SPA fixture ${i + 3}`);
        await expect(page.locator(POPOVER), `tour re-armed on SPA navigation ${i + 1}`).toHaveCount(0);
      }

      // Then fresh content-script contexts, which re-read storage from scratch.
      for (const url of [OTHER_VIDEO_URL, VIDEO_URL]) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT });
        await page.waitForTimeout(3000);
        await expect(page.locator(POPOVER), `tour re-armed on a reload of ${url}`).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });

  test('a fresh profile is still offered the tour exactly once', async () => {
    const context = await launch();
    try {
      const worker = await extensionServiceWorker(context);
      await resetTour(worker);
      expect((await tourState(worker)).youtubeTour).toBeFalsy();

      // (a) a genuine first-run user gets it…
      const page = await openWithTourNoFadeWait(context);
      await expect(page.locator(POPOVER)).toHaveCount(1);

      // …(b) the controls from #93 still work on this path…
      await page.waitForFunction(
        (sel) => getComputedStyle(document.querySelector(sel)).opacity === '1',
        POPOVER,
        { timeout: 15_000 }
      );
      await page.locator(NEXT).click();
      await expect(page.locator(PROGRESS)).toHaveText('2 of 3');
      await page.locator(PREV).click();
      await expect(page.locator(PROGRESS)).toHaveText('1 of 3');

      // …and (c) finishing it stores the one-shot.
      await page.locator(CLOSE).click();
      await expect
        .poll(async () => (await tourState(worker)).youtubeTour, { timeout: 10_000 })
        .toBe(true);
    } finally {
      await context.close();
    }
  });
});
