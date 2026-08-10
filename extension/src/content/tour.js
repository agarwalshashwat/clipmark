// ─── Guided onboarding tour — Sub-tour A (YouTube watch page) ───────────────
// First-run coach-mark walkthrough of the player bookmark button, the Alt+B
// shortcut, and the scrubber markers, ending in a handoff card pointing at
// the toolbar icon (a content script can't spotlight the browser's own UI).
// See docs/guided-tour-spec.md for the full design.
//
// Bundled via a real npm import — this file is its own content_scripts entry
// (see manifest.json), so Vite/Rollup inlines driver.js into its own chunk.
// It does not read or write any bare global shared with content.js/recall.js
// etc., so it needs no entry in scripts/content-globals-guard.mjs.

import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../tour-theme.css';
import { shouldMarkTourSeen, shouldStartYoutubeTour } from '../tour-state.js';

const TOUR_POPOVER_CLASS = 'clipmark-tour-popover';

// Every step spotlights the player bookmark button, which content.js only
// creates once YouTube's own `.ytp-right-controls` exists. Wait for it rather
// than letting driver.js's waitForElement time out — see startYoutubeTour.
const TOUR_ANCHOR_SELECTOR = '.yt-bookmark-player-btn';
const TOUR_ANCHOR_TIMEOUT_MS = 30000;

function currentVideoId() {
  return new URLSearchParams(window.location.search).get('v');
}

function isWatchPage() {
  return window.location.pathname === '/watch' && !!currentVideoId();
}

function bookmarkStorageKey(videoId) {
  return `bm_${videoId}`;
}

function getBookmarkCount(videoId) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get({ [bookmarkStorageKey(videoId)]: [] }, (result) => {
        if (chrome.runtime.lastError) {
          resolve(0);
          return;
        }
        resolve((result[bookmarkStorageKey(videoId)] || []).length);
      });
    } catch {
      resolve(0);
    }
  });
}

function getTourState() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get({ tourState: {} }, (result) => {
        resolve(chrome.runtime.lastError ? {} : result.tourState || {});
      });
    } catch {
      resolve({});
    }
  });
}

// Set once the flag has been persisted for this page, so the several
// acknowledgement paths below (onDestroyStarted, onDestroyed, overlay click) can
// all call markYoutubeTourSeen defensively without spending extra
// chrome.storage.sync writes on the same one-shot.
let markedSeen = false;

function markYoutubeTourSeen() {
  if (markedSeen) return;
  markedSeen = true;
  try {
    chrome.storage.sync.get({ tourState: {} }, (result) => {
      if (chrome.runtime.lastError) { markedSeen = false; return; }
      const tourState = { ...(result.tourState || {}), youtubeTour: true };
      chrome.storage.sync.set({ tourState }, () => {
        // A failed write must not be silent: leaving markedSeen true would make
        // this page believe the one-shot was spent when nothing was stored, and
        // the tour would come back on the next video with no way to stop it.
        if (chrome.runtime.lastError) markedSeen = false;
      });
    });
  } catch {
    /* extension context invalidated — nothing to persist to */
    markedSeen = false;
  }
}

/**
 * Persist "seen" if the tour genuinely reached the user.
 *
 * Kept as one helper because there are several places the user can end the tour
 * and every one of them has to store the flag — the bug this closes was one of
 * those paths silently not storing it.
 */
function markSeenIfShown() {
  if (shouldMarkTourSeen({ stepShown, abandonedForNavigation })) markYoutubeTourSeen();
}

function buildSteps(hasBookmark) {
  const steps = [
    {
      element: '.yt-bookmark-player-btn',
      popover: {
        title: 'Bookmark any moment',
        description: "Click this button on the player controls to save the exact timestamp you're watching.",
        side: 'bottom',
        align: 'start',
        popoverClass: TOUR_POPOVER_CLASS,
      },
    },
    {
      element: '.yt-bookmark-player-btn',
      popover: {
        title: 'Or just press a key',
        description:
          'Alt+B saves silently from anywhere on the page — no need to click anything.',
        side: 'bottom',
        align: 'start',
        popoverClass: TOUR_POPOVER_CLASS,
      },
    },
  ];

  if (hasBookmark) {
    steps.push({
      element: '.yt-bookmark-markers',
      popover: {
        title: 'Every bookmark, right on the scrubber',
        description: 'Hover to preview, click to jump straight to it.',
        side: 'top',
        align: 'center',
        popoverClass: TOUR_POPOVER_CLASS,
      },
    });
  }

  steps.push({
    popover: {
      title: 'One more thing',
      description:
        "Open the ClipMark icon in your browser toolbar to see everything you've saved — and try Active Recall.",
      popoverClass: TOUR_POPOVER_CLASS,
      doneBtnText: 'Got it',
    },
  });

  return steps;
}

/**
 * Resolve once `selector` is in the DOM, or false if it never turns up.
 *
 * YouTube builds its player controls asynchronously and content.js only injects
 * the bookmark button afterwards, so on a cold load the anchor can be seconds
 * away — longer still on a slow connection.
 */
function waitForElement(selector, timeoutMs) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (found) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(found);
    };
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) finish(true);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

let tourInstance = null;
let starting = false;
// Bumped on every SPA navigation so an in-flight start attempt can tell that the
// page it was waiting for is gone and bail out instead of driving on the new one.
let navigationEpoch = 0;
// Per-run outcome, read by onDestroyed to decide whether the tour counts as seen.
let stepShown = false;
let abandonedForNavigation = false;
// The video the tour is running on, or is currently trying to start on. Set at
// ATTEMPT time, not just once the tour is live, so a `yt-navigate-finish` that
// lands while we are still waiting for the anchor doesn't cancel the attempt for
// the very video it fired on. Cleared when an attempt gives up or a tour ends.
let tourVideoId = null;

async function startYoutubeTour() {
  if (starting || tourInstance) return;
  if (!isWatchPage()) return;
  if (!shouldStartYoutubeTour(await getTourState())) return;

  starting = true;
  const epoch = navigationEpoch;
  tourVideoId = currentVideoId();
  try {
    // v1.0.1 drove the tour immediately and leaned on driver.js's own
    // `waitForElement` for the anchor. That does not fail loudly: on timeout
    // driver.js falls back to its centred `driver-dummy-element`, so step one
    // rendered "Click this button on the player controls" pointing at nothing —
    // and then marked the tour seen, for good. Wait for the real anchor here,
    // and if it never arrives leave the flag untouched so the next watch page
    // gets another go. (driver.js keeps its own 6s waitForElement below as a
    // backstop for the later `.yt-bookmark-markers` step.)
    const anchored = await waitForElement(TOUR_ANCHOR_SELECTOR, TOUR_ANCHOR_TIMEOUT_MS);
    // Give up on this video but let a later event try again.
    if (!anchored) { tourVideoId = null; return; }

    // Re-check everything the awaits above could have invalidated: the user may
    // have navigated away, or replayed/completed the tour from the side panel.
    if (epoch !== navigationEpoch || !isWatchPage()) return;
    if (!shouldStartYoutubeTour(await getTourState())) return;
    if (epoch !== navigationEpoch) return;

    const bookmarkCount = await getBookmarkCount(currentVideoId());

    stepShown = false;
    abandonedForNavigation = false;
    // A fresh run gets a fresh chance to persist the one-shot (the previous run
    // on this page may have been torn down by an SPA navigation before it
    // counted as seen).
    markedSeen = false;

    tourInstance = driver({
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      allowClose: true,
      waitForElement: 6000,
      overlayClickBehavior: (_el, _step, opts) => {
        // Don't let an accidental first click kill the tour before it says anything.
        if (opts.index === 0) return;
        // `destroy()` is driver.js's public teardown, which is `destroy(false)`
        // internally and therefore SKIPS onDestroyStarted — so mark here rather
        // than relying on a hook that won't run for this path.
        markSeenIfShown();
        tourInstance?.destroy();
      },
      // Proof that a coach-mark was actually painted. `onPopoverRender` fires as
      // soon as the popover is in the DOM (~10ms after drive()), whereas
      // `onHighlighted` is the END of driver.js's 400ms highlight transition —
      // and on a page as busy as a YouTube watch page that lands over a second
      // later. Gating "shown" on onHighlighted alone meant a user who clicked ×
      // during the fade-in — the common case, the × is right there — was
      // recorded as having seen nothing, so the one-shot flag was never stored
      // and the tour returned on every single video. Both are wired up; the
      // first to fire wins.
      onPopoverRender: () => {
        stepShown = true;
      },
      onHighlighted: () => {
        stepShown = true;
      },
      // The only teardown hook driver.js calls unconditionally. `onDestroyed` is
      // guarded on its `__activeElement` state, which is set at the same instant
      // onHighlighted fires — so closing the tour before the highlight
      // transition finished skipped onDestroyed entirely and the flag was never
      // written. This runs for every teardown driver.js starts itself (×, Done,
      // Esc), and completing it via destroy() re-enters as destroy(false), which
      // skips this hook rather than looping.
      onDestroyStarted: () => {
        markSeenIfShown();
        tourInstance?.destroy();
      },
      onDestroyed: () => {
        tourInstance = null;
        tourVideoId = null;
        markSeenIfShown();
      },
      steps: buildSteps(bookmarkCount > 0),
    });

    tourInstance.drive();
  } finally {
    starting = false;
    // A navigation that landed while this attempt was awaiting the anchor was
    // swallowed by the `starting` guard at the top. Pick it back up, or the
    // tour would sit out the very video the user just opened.
    if (epoch !== navigationEpoch && !tourInstance) startYoutubeTour();
  }
}

// SPA navigation risk: YouTube never fully reloads between videos, and a
// tour mid-step should dismiss rather than try to survive a torn-down DOM.
// Dismissing this way is not the user declining the tour, so it does not count
// as seen — the tour picks up again on the video they navigated to.
//
// But `yt-navigate-finish` is NOT a reliable "you navigated" signal: YouTube
// fires it on the INITIAL load of a watch page (~600ms in, well after our tour
// has started) and again as the SPA settles, all without the video changing.
// Treating those as navigations tore the live tour down and restarted it at
// step 1 roughly a second after it appeared — so Next appeared to do nothing
// (the step advanced, then the restart reset it), and the close button appeared
// dead (the tour was dismissed, then immediately re-shown). Worse, every one of
// those teardowns set abandonedForNavigation, which by design suppresses
// marking the tour seen — so a first-run user could neither finish it nor get
// rid of it. Gate on the video id actually changing.
document.addEventListener('yt-navigate-finish', () => {
  const nextVideoId = currentVideoId();
  if (nextVideoId && nextVideoId === tourVideoId) return; // same video — not a navigation

  navigationEpoch += 1;
  if (tourInstance?.isActive()) {
    abandonedForNavigation = true;
    tourInstance.destroy();
  }
  tourVideoId = null;
  startYoutubeTour();
});

startYoutubeTour();
