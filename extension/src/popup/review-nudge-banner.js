/**
 * The side panel's Chrome Web Store review nudge.
 *
 * This file is the only thing that touches chrome.* or the DOM for the feature;
 * every rule about *whether* to show lives in src/review-nudge.js so it can be
 * unit-tested without a browser.
 *
 * Ordering rule — write first, render second:
 *
 *   The nudge's whole promise is "at most twice, ever". That promise is only as
 *   good as the `shownCount` write, so the write has to happen before the user
 *   can see anything. If it rejects (quota, an invalidated extension context, a
 *   storage error), we bail without rendering: the user was never asked, so
 *   there is nothing to re-show and no retry loop. Rendering first and writing
 *   afterwards would turn a failing write into a banner on every single panel
 *   open — the nagging this feature exists to avoid, and the same shape as the
 *   v1.0.1 tour flag bug (see src/tour-state.js).
 *
 *   `sessionShown` backs that up in memory for the lifetime of this panel.
 */

import { collectStoredBookmarks } from '../idle-summary.js';
import {
  REVIEW_NUDGE_STORAGE_KEY,
  chromeStoreReviewUrl,
  markNudgeClickedThrough,
  markNudgeDismissed,
  markNudgeShown,
  shouldShowReviewNudge,
} from '../review-nudge.js';

/** One paint per panel session, independent of what storage says. */
let sessionShown = false;

function localGet(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(defaults, result => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function localSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function syncGetAll() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(null, result => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

/**
 * Retires the nudge. Best-effort by design: the user has already made their
 * choice, and `sessionShown` plus the removed DOM node keep this panel quiet
 * even if the write never lands. The worst case is one more ask on a later
 * session, still under the lifetime cap of two.
 */
async function persistOutcome(next) {
  try {
    await localSet({ [REVIEW_NUDGE_STORAGE_KEY]: next });
  } catch {
    /* non-critical — see above */
  }
}

function buildBanner({ onReview, onDismiss }) {
  const section = document.createElement('section');
  section.className = 'review-nudge';
  section.id = 'review-nudge';
  // A labelled region rather than a live region: the banner appears quietly
  // after load and must never interrupt a screen reader mid-sentence or steal
  // focus. It is reachable in reading order and by Tab like any other content.
  section.setAttribute('role', 'region');
  section.setAttribute('aria-labelledby', 'review-nudge-title');

  const title = document.createElement('p');
  title.className = 'review-nudge-title';
  title.id = 'review-nudge-title';
  title.textContent = 'Enjoying ClipMark?';

  const body = document.createElement('p');
  body.className = 'review-nudge-body';
  body.textContent = 'A quick review really helps other learners find it.';

  const actions = document.createElement('div');
  actions.className = 'review-nudge-actions';

  // An anchor, not a button: it navigates, so it should read as a link, expose
  // the destination on hover, and support open-in-new-tab. The handler still
  // takes over so the click-through is recorded and the tab opens predictably
  // from the side panel.
  const reviewLink = document.createElement('a');
  reviewLink.className = 'review-nudge-btn review-nudge-btn--primary';
  reviewLink.id = 'review-nudge-review';
  reviewLink.href = chromeStoreReviewUrl();
  reviewLink.target = '_blank';
  reviewLink.rel = 'noopener noreferrer';
  reviewLink.textContent = 'Leave a review';
  reviewLink.addEventListener('click', event => {
    event.preventDefault();
    onReview();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'review-nudge-btn review-nudge-btn--ghost';
  dismissBtn.id = 'review-nudge-dismiss';
  dismissBtn.type = 'button';
  dismissBtn.textContent = 'No thanks';
  dismissBtn.addEventListener('click', onDismiss);

  actions.append(reviewLink, dismissBtn);
  section.append(title, body, actions);
  return section;
}

/**
 * Evaluates the trigger rules and, if they pass, renders the banner into
 * `#review-nudge-slot`.
 *
 * Never throws: a nudge is the least important thing on this panel, so any
 * failure resolves to "don't show".
 *
 * @returns {Promise<boolean>} whether the banner was rendered
 */
export async function mountReviewNudge() {
  const slot = document.getElementById('review-nudge-slot');
  if (!slot || sessionShown) return false;

  let state;
  try {
    const [{ [REVIEW_NUDGE_STORAGE_KEY]: stored, recallReviewUsage }, syncAll] = await Promise.all([
      localGet({ [REVIEW_NUDGE_STORAGE_KEY]: null, recallReviewUsage: null }),
      syncGetAll(),
    ]);
    state = stored;

    const show = shouldShowReviewNudge({
      bookmarks: collectStoredBookmarks(syncAll),
      reviewUsage: recallReviewUsage,
      state: stored,
      nowMs: Date.now(),
      sessionShown,
    });
    if (!show) return false;

    // Write BEFORE render — see the module header. A rejection here means the
    // banner is never shown, which is the bounded, non-nagging outcome.
    await localSet({ [REVIEW_NUDGE_STORAGE_KEY]: markNudgeShown(stored, Date.now()) });
  } catch {
    return false;
  }

  sessionShown = true;

  const banner = buildBanner({
    onReview: () => {
      banner.remove();
      persistOutcome(markNudgeClickedThrough(state));
      chrome.tabs.create({ url: chromeStoreReviewUrl() });
    },
    onDismiss: () => {
      banner.remove();
      persistOutcome(markNudgeDismissed(state));
    },
  });

  slot.replaceChildren(banner);
  return true;
}

/** Test-only: clears the in-memory one-paint-per-session guard. */
export function __resetReviewNudgeSession() {
  sessionShown = false;
}
