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
 *
 * NO STAR-GATING — this is a Chrome Web Store policy line, not a preference:
 *
 *   There is exactly one ask, and it links straight to the public review page
 *   for every user who sees it. We never ask "are you enjoying this?" first and
 *   route only the happy answers to the store while diverting the unhappy ones
 *   to a feedback form — that is review-gating, it violates Web Store policy,
 *   and it manufactures a rating the listing has not earned. We also never name
 *   a rating: no "five stars", no "rate us highly". The copy asks for a review;
 *   what the review says is the user's business.
 *
 *   Concretely, that means this file must only ever build ONE outbound control,
 *   pointing at chromeStoreReviewUrl(), plus a dismiss that stores a decision
 *   and navigates nowhere. tests/unit/review-nudge.test.mjs asserts exactly
 *   that, so a future sentiment prompt cannot be added here quietly.
 */

import { collectStoredBookmarks } from '../idle-summary.js';
import {
  RECALL_SESSION_STATS_KEY,
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
  title.textContent = 'You\u2019ve been turning videos into flashcards';

  const body = document.createElement('p');
  body.className = 'review-nudge-body';
  // Names the thing this user actually did, asks once, and says plainly that a
  // "no" is final — the dismiss below really does retire the nudge for good.
  // No rating is ever named or implied: see the no-star-gating note in the
  // module header.
  body.textContent =
    'And coming back to review them \u2014 the part most people skip. '
    + 'If it\u2019s making things stick, a short review helps other learners find ClipMark. '
    + 'Say no and we won\u2019t ask again.';

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
    const [
      { [REVIEW_NUDGE_STORAGE_KEY]: stored, [RECALL_SESSION_STATS_KEY]: sessionStats, recallReviewUsage },
      syncAll,
    ] = await Promise.all([
      localGet({
        [REVIEW_NUDGE_STORAGE_KEY]: null,
        [RECALL_SESSION_STATS_KEY]: null,
        recallReviewUsage: null,
      }),
      syncGetAll(),
    ]);
    state = stored;

    const show = shouldShowReviewNudge({
      bookmarks: collectStoredBookmarks(syncAll),
      reviewUsage: recallReviewUsage,
      sessionStats,
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

/**
 * What the side panel calls once, on open.
 *
 * Two chances to mount, because the trigger is now a *moment* rather than a
 * standing threshold (see RECENT_SESSION_WINDOW_MS in ../review-nudge.js):
 *
 *   1. Panel open — catches someone who finished a drill and then opened the
 *      panel, and is also the only path when the panel was shut at the time.
 *   2. A `recallSessionStats` write — the panel is usually already open while
 *      the user drills on the YouTube tab, so this is the common case: the
 *      banner appears as the session ends, not on some later open.
 *
 * The listener is harmless after a successful paint: `sessionShown` makes the
 * second call a no-op, and every permanent stop is re-checked from storage on
 * each attempt.
 */
export function initReviewNudge() {
  mountReviewNudge();
  // Optional-chained so a stripped-down test or non-extension context can import
  // this module without a storage.onChanged stub — a nudge never breaks a panel.
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes?.[RECALL_SESSION_STATS_KEY]) return;
    mountReviewNudge();
  });
}

/** Test-only: clears the in-memory one-paint-per-session guard. */
export function __resetReviewNudgeSession() {
  sessionShown = false;
}
