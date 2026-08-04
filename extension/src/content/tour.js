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

const TOUR_POPOVER_CLASS = 'clipmark-tour-popover';

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

function markYoutubeTourSeen() {
  try {
    chrome.storage.sync.get({ tourState: {} }, (result) => {
      if (chrome.runtime.lastError) return;
      const tourState = { ...(result.tourState || {}), youtubeTour: true };
      chrome.storage.sync.set({ tourState });
    });
  } catch {
    /* extension context invalidated — nothing to persist to */
  }
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

let tourInstance = null;
let bootstrapped = false;

async function startYoutubeTour() {
  if (bootstrapped) return;
  if (!isWatchPage()) return;

  const tourState = await getTourState();
  if (tourState.youtubeTour) {
    bootstrapped = true;
    return;
  }

  bootstrapped = true;

  const videoId = currentVideoId();
  const bookmarkCount = await getBookmarkCount(videoId);

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
      tourInstance?.destroy();
    },
    onDestroyed: () => {
      markYoutubeTourSeen();
    },
    steps: buildSteps(bookmarkCount > 0),
  });

  tourInstance.drive();
}

// SPA navigation risk: YouTube never fully reloads between videos, and a
// tour mid-step should dismiss rather than try to survive a torn-down DOM.
document.addEventListener('yt-navigate-finish', () => {
  if (tourInstance?.isActive()) {
    tourInstance.destroy();
    return;
  }
  startYoutubeTour();
});

startYoutubeTour();
