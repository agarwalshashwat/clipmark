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
import { hasSeenYoutubeTour, shouldMarkTourSeen, shouldStartYoutubeTour } from '../tour-state.js';

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

function readArea(area) {
  return new Promise((resolve) => {
    try {
      chrome.storage[area].get({ tourState: {} }, (result) => {
        resolve(chrome.runtime.lastError ? {} : result.tourState || {});
      });
    } catch {
      resolve({});
    }
  });
}

/**
 * The tour state as both storage areas see it. `sync` is authoritative for
 * everything except the one-shot flag, which is believed from either area —
 * see hasSeenYoutubeTour in ../tour-state.js for why the local mirror exists.
 */
async function getTourState() {
  const [syncState, localState] = await Promise.all([readArea('sync'), readArea('local')]);
  return { ...localState, ...syncState, youtubeTour: hasSeenYoutubeTour({ syncState, localState }) };
}

// Set once the flag has been persisted for this page, so the several
// acknowledgement paths below (onDestroyStarted, onDestroyed, overlay click) can
// all call markYoutubeTourSeen defensively without spending extra
// chrome.storage.sync writes on the same one-shot.
let markedSeen = false;

// Last-resort, in-memory backstop: a tour reached the user on this page,
// whatever storage did about it. Both areas refusing a write is not a reason to
// show the tour again on the next video — that is the endless-tour bug in its
// purest form, and the one thing the user cannot escape. This suppresses it for
// the rest of the session (until the tab or SPA session goes away), by which
// point a healthy write will normally have landed. It deliberately does NOT
// persist: if storage really is unwritable, a fresh session offering the tour
// once more is the correct, bounded fallback.
let endedThisSession = false;

/**
 * Last-resort mirror of the one-shot flag in chrome.storage.local.
 *
 * Only reached when sync refused the write. local is per-machine so it does not
 * follow the user, but it is not subject to sync's quota or rate limits — and a
 * flag that stops the tour on THIS machine is strictly better than a tour that
 * cannot be dismissed at all. getTourState() believes either area.
 */
function mirrorSeenLocally() {
  try {
    chrome.storage.local.get({ tourState: {} }, (result) => {
      if (chrome.runtime.lastError) { markedSeen = false; return; }
      const tourState = { ...(result.tourState || {}), youtubeTour: true };
      chrome.storage.local.set({ tourState }, () => {
        // Both areas refused. `endedThisSession` already suppresses the tour for
        // the rest of this session, so allowing a retry here costs nothing and
        // may still catch a write once quota/rate pressure clears.
        if (chrome.runtime.lastError) markedSeen = false;
      });
    });
  } catch {
    markedSeen = false;
  }
}

function markYoutubeTourSeen() {
  if (markedSeen) return;
  markedSeen = true;
  try {
    chrome.storage.sync.get({ tourState: {} }, (result) => {
      // A read failure says nothing about whether a write would land, and the
      // spread below is only needed to preserve sidePanelTour — so fall through
      // with what we have rather than giving up on persisting anything.
      const existing = chrome.runtime.lastError ? {} : (result.tourState || {});
      const tourState = { ...existing, youtubeTour: true };
      chrome.storage.sync.set({ tourState }, () => {
        // The write can fail for reasons that will still be true on the next
        // video — sync QUOTA_BYTES exhausted by saved bookmarks, the per-minute
        // write cap, or sync disabled on the profile. Retrying forever means the
        // tour re-appears on every single video with no way for the user to stop
        // it, which is the exact bug this guards. Mirror to local instead.
        if (chrome.runtime.lastError) mirrorSeenLocally();
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
 * Called from first paint AND from every teardown path. Kept as one idempotent
 * helper (`markedSeen` dedupes) because there are several places a run can end
 * and every one of them has to store the flag — one of those paths silently not
 * storing it is the bug shape this has regressed into twice now.
 */
function markSeenIfShown() {
  if (!shouldMarkTourSeen({ stepShown })) return;
  // Set before the async write, and independently of whether it lands — this is
  // the record that the tour REACHED the user, not that storage agreed.
  endedThisSession = true;
  markYoutubeTourSeen();
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

/**
 * The tour has been put on screen once in this content-script context.
 *
 * This is the belt to storage's braces, and the thing that actually bounds the
 * bug a real user hit on v1.0.8: the tour re-appeared on video after video
 * because every SPA navigation tore it down, declined to record the one-shot,
 * and re-armed it on the next video. Storage alone cannot close that loop —
 * whether the flag is written is decided asynchronously and can be refused,
 * whereas navigation is immediate and endless.
 *
 * Set SYNCHRONOUSLY, in the same tick as `drive()`, so no amount of re-entrant
 * `yt-navigate-finish` can slip between "decide to show" and "recorded that we
 * showed". It deliberately latches on the tour being SHOWN rather than merely
 * attempted, so an attempt that gives up waiting for the player button still
 * leaves the next watch page free to offer the tour.
 *
 * Per-context by design: a genuine new page load starts fresh and defers to the
 * persisted flag, which is what makes "at most once ever" survive a reload.
 */
let tourOfferedInThisContext = false;
// The video the tour is running on, or is currently trying to start on. Set at
// ATTEMPT time, not just once the tour is live, so a `yt-navigate-finish` that
// lands while we are still waiting for the anchor doesn't cancel the attempt for
// the very video it fired on. Cleared when an attempt gives up or a tour ends.
let tourVideoId = null;

/**
 * True once this content script has been orphaned — the extension was updated,
 * reloaded or disabled while the page stayed open. Every chrome.* call then
 * throws "Extension context invalidated", and `chrome.runtime.id` is the cheap
 * synchronous tell. Without this the yt-navigate-finish listener keeps calling
 * startYoutubeTour on a dead context for as long as the tab lives.
 */
function isContextInvalidated() {
  try {
    return !chrome.runtime?.id;
  } catch {
    return true;
  }
}

async function startYoutubeTour() {
  // ── Synchronous guards ────────────────────────────────────────────────────
  // Everything decidable without I/O happens before the first `await`, and
  // `starting` is claimed in this same tick. v1.0.8 read the seen flag BEFORE
  // claiming it, so two `yt-navigate-finish` events landing while that read was
  // in flight both passed the guard and both went on to drive a tour — one
  // popover overwriting the other's `tourInstance` and leaving it on screen with
  // nothing able to close it.
  if (starting || tourInstance) return;
  // Already shown once here — never re-arm, whatever storage did or didn't do.
  if (tourOfferedInThisContext) return;
  if (isContextInvalidated()) return;
  // The user already ended a tour in this session; a storage write that never
  // landed must not bring it back on the next video.
  if (endedThisSession) return;
  if (!isWatchPage()) return;

  starting = true;
  const epoch = navigationEpoch;
  tourVideoId = currentVideoId();
  try {
    // Now the async part. The resolved flag gates the tour — nothing below is
    // reachable for a user who has already seen it.
    if (!shouldStartYoutubeTour(await getTourState())) return;
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
    markedSeen = false;
    // Claimed here, synchronously, before driver.js can paint anything and
    // before any listener can re-enter: from this point the tour has had its one
    // turn in this context.
    tourOfferedInThisContext = true;

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
      // Proof that a coach-mark was actually painted, and the point at which the
      // one-shot is persisted.
      //
      // `onPopoverRender` fires as soon as the popover is in the DOM (~10ms after
      // drive()), whereas `onHighlighted` is the END of driver.js's 400ms
      // highlight transition — and on a page as busy as a YouTube watch page that
      // lands over a second later. Gating "shown" on onHighlighted alone meant a
      // user who clicked × during the fade-in — the common case, the × is right
      // there — was recorded as having seen nothing, so the flag was never stored
      // and the tour returned on every video. Both are wired up; first to fire wins.
      //
      // Storing here rather than only on teardown is what closes the last hole:
      // teardown is not guaranteed to run at all. A full page load mid-tour
      // (typed URL, hard link, reload) destroys this content script outright — no
      // yt-navigate-finish, no onDestroyed, nothing — so a flag written only on
      // the way out is simply lost and the next page offers the tour again. The
      // teardown paths below still call this; `markedSeen` makes the repeats free.
      onPopoverRender: () => {
        stepShown = true;
        markSeenIfShown();
      },
      onHighlighted: () => {
        stepShown = true;
        markSeenIfShown();
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
    // The attempt concluded without a live tour (flag already set, anchor never
    // arrived, or the page moved on): stop claiming a video, or the navigation
    // listener's "same video, not a real navigation" check would compare against
    // a stale id.
    if (!tourInstance) tourVideoId = null;
    // A navigation that landed while this attempt was awaiting the anchor was
    // swallowed by the `starting` guard at the top. Pick it back up, or the
    // tour would sit out the very video the user just opened. Harmless once the
    // tour has had its turn — the latch above returns immediately.
    if (epoch !== navigationEpoch && !tourInstance) startYoutubeTour();
  }
}

// SPA navigation risk: YouTube never fully reloads between videos, and a tour
// mid-step should dismiss rather than try to survive a torn-down DOM.
//
// `yt-navigate-finish` is NOT a reliable "you navigated" signal: YouTube fires it
// on the INITIAL load of a watch page (~600ms in, well after our tour has
// started) and again as the SPA settles, all without the video changing.
// Treating those as navigations tore the live tour down and restarted it at
// step 1 roughly a second after it appeared — so Next appeared to do nothing
// (the step advanced, then the restart reset it) and the close button appeared
// dead (dismissed, then immediately re-shown). Gate on the video id actually
// changing.
//
// That gate fixed the spurious case but not the REAL one, which is what a user
// reported on v1.0.8: when the video id genuinely does change, this handler
// destroyed the tour and started it again on the new video — and the teardown
// declined to record the one-shot, so it could repeat forever. Two things stop
// that now: the teardown marks the tour seen like any other (see
// shouldMarkTourSeen), and `tourOfferedInThisContext` refuses a second showing
// in this context even if the write never lands.
document.addEventListener('yt-navigate-finish', () => {
  // Orphaned by an extension update/reload while this tab stayed open: every
  // chrome.* call below would throw. Nothing left to drive.
  if (isContextInvalidated()) return;
  const nextVideoId = currentVideoId();
  if (nextVideoId && nextVideoId === tourVideoId) return; // same video — not a navigation

  navigationEpoch += 1;
  if (tourInstance?.isActive()) {
    // Tearing the tour down here used to set `abandonedForNavigation`, which
    // suppressed the one-shot — so the tour came straight back on the new video,
    // for as long as the user kept browsing. It now falls through to
    // markSeenIfShown like every other teardown: a coach-mark that reached the
    // screen counts, and `tourOfferedInThisContext` stops the re-arm regardless.
    tourInstance.destroy();
  }
  tourVideoId = null;
  startYoutubeTour();
});

startYoutubeTour();
