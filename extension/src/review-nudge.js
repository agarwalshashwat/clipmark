/**
 * Review-nudge trigger rules — "may we ask this user for a Chrome Web Store
 * review right now?"
 *
 * Pure functions only: no chrome.* calls, no DOM. The side panel's banner
 * (src/popup/review-nudge-banner.js) owns the storage reads/writes and the
 * markup; everything decidable lives here so it stays testable without a
 * browser (tests/unit/review-nudge.test.mjs). Same split as tour-state.js.
 *
 * Product rules this encodes:
 *   - Only genuinely engaged users are ever asked. The gate is real usage —
 *     several saved bookmarks AND at least one completed Active Recall review
 *     AND a few days of history — never a first run, never a new install.
 *   - At most two asks, ever, with a long gap between them.
 *   - A dismiss or a click-through retires the nudge permanently.
 *
 * The v1.0.1 tour bug is the cautionary tale here (see tour-state.js): a
 * one-shot flag that is written at the wrong moment is either burned early or
 * never burned at all. The failure mode that matters for a *nudge* is the
 * second one — a "shown" write that silently fails would re-show the banner on
 * every panel open, i.e. exactly the nagging this feature promises not to do.
 * The rule that closes it is write-first-then-render, enforced by the banner:
 * if the write rejects, the banner is never rendered, so there is nothing to
 * re-show and no unbounded retry. `shouldShowReviewNudge` additionally takes a
 * `sessionShown` flag so a single panel session can never paint it twice.
 */

/** chrome.storage.local key holding the nudge's whole lifecycle state. */
export const REVIEW_NUDGE_STORAGE_KEY = 'reviewNudgeState';

/**
 * The published Chrome Web Store item id. Permanent for the life of the
 * listing, and the same id `CHROME_STORE_URL` in webapp/app/lib/constants.ts is
 * built from — tests/unit/review-nudge.test.mjs asserts the two never drift.
 */
export const CHROME_STORE_ITEM_ID = 'iboippnihpcnnglgboaiedaiimbiolgg';

/* ── Engagement milestone ──────────────────────────────────────────────────── */

/** Saved bookmarks required before we will ask. */
export const MIN_BOOKMARKS_FOR_NUDGE = 8;

/**
 * Days between the user's first-ever bookmark and the ask. Belt-and-braces on
 * top of the recall requirement: a review can only happen a day after the
 * bookmark it grades (schedule defaults to [1, 3, 7]), so this mostly guards
 * the odd case of a bulk import or a restored sync making someone look busy on
 * day one.
 */
export const MIN_DAYS_SINCE_FIRST_BOOKMARK = 3;

/* ── The value moment ──────────────────────────────────────────────── */

/**
 * chrome.storage.local key holding `{ count, lastCompletedAt }` for completed
 * Active Recall sessions.
 *
 * Written by the content script the moment a session ends — see
 * recordRecallSessionComplete in src/content/content.js, which spells this key
 * literally the way `recallReviewUsage` already is (a content script cannot
 * import this ESM module). tests/unit/review-nudge.test.mjs asserts the two
 * spellings never drift.
 */
export const RECALL_SESSION_STATS_KEY = 'recallSessionStats';

/**
 * Completed Active Recall sessions required before we will ask.
 *
 * Two, not one. A single session is a trial — someone poking the feature to see
 * what it does. Two means they came back and drilled again, which for a
 * spaced-repetition tool *is* the product working: the clips they saved came
 * due, and they showed up for them. That is the honest basis for asking a
 * learner to vouch for ClipMark, and a far better signal than a count of saved
 * bookmarks — saving is cheap, and easy to rack up in one sitting on one video.
 */
export const MIN_RECALL_SESSIONS_FOR_NUDGE = 2;

/**
 * How long after a completed session an ask still counts as "in the moment".
 *
 * This is the half of the trigger that decides *when*, not *whether*. The
 * banner should appear while the user can still feel the thing they would be
 * reviewing — just after "Recall session complete ✓" — not at an unrelated panel
 * open three days later. Thirty minutes is wide enough to cover finishing a
 * drill and *then* opening the side panel, and narrow enough that the ask is
 * never divorced from the value that earned it.
 */
export const RECENT_SESSION_WINDOW_MS = 30 * 60 * 1000;

/* ── Frequency cap ─────────────────────────────────────────────────────────── */

/** Hard lifetime ceiling on how many times the banner may ever be shown. */
export const MAX_NUDGE_SHOWS = 2;

/** Gap enforced between the first ask and the (only) second one. */
export const NUDGE_RESHOW_AFTER_MS = 14 * 86400000; // 14 days

const DAY_MS = 86400000;

/**
 * The listing's *review* tab, which is where "Leave a review" should land —
 * the plain detail URL drops the user on the description with no obvious way
 * to rate.
 *
 * @param {string} [itemId]
 * @returns {string}
 */
export function chromeStoreReviewUrl(itemId = CHROME_STORE_ITEM_ID) {
  const id = typeof itemId === 'string' && itemId.trim() ? itemId.trim() : CHROME_STORE_ITEM_ID;
  return `https://chromewebstore.google.com/detail/${id}/reviews`;
}

/**
 * Coerces whatever is in storage (missing, partial, or corrupt) into the full
 * state shape. Anything unreadable is treated as "never shown" rather than as
 * "already retired" — a corrupt record should not silently cost a user the
 * chance to be asked, and the milestone gate still has to pass afterwards.
 *
 * @param {object|null|undefined} stored
 * @returns {{shownCount: number, lastShownAt: number, dismissed: boolean, clickedThrough: boolean}}
 */
export function normalizeNudgeState(stored) {
  const shownCount = Number.isFinite(stored?.shownCount) && stored.shownCount > 0
    ? Math.floor(stored.shownCount)
    : 0;
  const lastShownAt = Number.isFinite(stored?.lastShownAt) && stored.lastShownAt > 0
    ? stored.lastShownAt
    : 0;
  return {
    shownCount,
    lastShownAt,
    dismissed: stored?.dismissed === true,
    clickedThrough: stored?.clickedThrough === true,
  };
}

/** Epoch ms of the earliest bookmark, or null when there are none. */
function firstBookmarkAt(bookmarks) {
  let earliest = null;
  for (const b of bookmarks || []) {
    const created = b?.createdAt ? new Date(b.createdAt).getTime() : NaN;
    if (!Number.isFinite(created)) continue;
    if (earliest === null || created < earliest) earliest = created;
  }
  return earliest;
}

/**
 * "Has this user actually done an Active Recall review?"
 *
 * Two independent pieces of evidence, because neither alone is complete:
 *   - `lastReviewed` on any bookmark — durable and lifetime, but only written
 *     by a 'got_it' grade (see gradeRecall in recall.module.js).
 *   - the current month's review counter — counts every grade including
 *     'again', but resets at the month boundary (usage-caps.module.js).
 *
 * @param {{bookmarks?: Array<object>, reviewUsage?: {count?: number}|null}} input
 * @returns {boolean}
 */
export function hasCompletedRecallReview({ bookmarks, reviewUsage } = {}) {
  if (Number.isFinite(reviewUsage?.count) && reviewUsage.count > 0) return true;
  return (bookmarks || []).some(b => {
    const reviewed = b?.lastReviewed ? new Date(b.lastReviewed).getTime() : NaN;
    return Number.isFinite(reviewed) && reviewed > 0;
  });
}

/**
 * Coerces the stored session record into `{ count, lastCompletedAt }`.
 *
 * Same posture as normalizeNudgeState: anything unreadable reads as "no
 * sessions yet", which delays an ask rather than granting one. Users who
 * drilled heavily *before* this counter shipped therefore start at zero and
 * have to complete two fresh sessions — deliberately the slow direction.
 *
 * @param {object|null|undefined} stored
 * @returns {{count: number, lastCompletedAt: number}}
 */
export function normalizeRecallSessionStats(stored) {
  const count = Number.isFinite(stored?.count) && stored.count > 0
    ? Math.floor(stored.count)
    : 0;
  const lastCompletedAt = Number.isFinite(stored?.lastCompletedAt) && stored.lastCompletedAt > 0
    ? stored.lastCompletedAt
    : 0;
  return { count, lastCompletedAt };
}

/**
 * "Did a recall session just finish?" — the timing half of the trigger.
 *
 * A timestamp in the future (a clock that moved backwards, a record restored
 * from a machine running fast) is not "just now"; it is unusable, so it reads
 * as no rather than as an open invitation.
 *
 * @param {{sessionStats?: object|null, nowMs: number}} input
 * @returns {boolean}
 */
export function justCompletedRecallSession({ sessionStats, nowMs } = {}) {
  const { lastCompletedAt } = normalizeRecallSessionStats(sessionStats);
  if (!lastCompletedAt || lastCompletedAt > nowMs) return false;
  return nowMs - lastCompletedAt <= RECENT_SESSION_WINDOW_MS;
}

/**
 * The engagement gate, independent of the frequency cap.
 *
 * Ordered so the recall evidence decides. Repeated completed sessions plus a
 * just-finished one are what earn the ask for a learning tool; the bookmark
 * count and the history check are floors underneath, there to stop a bulk
 * import or a restored sync from looking like a fortnight of study.
 *
 * @param {{bookmarks?: Array<object>, reviewUsage?: object|null, sessionStats?: object|null, nowMs: number}} input
 * @returns {boolean}
 */
export function hasReachedEngagementMilestone({ bookmarks, reviewUsage, sessionStats, nowMs } = {}) {
  // The value moment: they have drilled repeatedly, and one just ended.
  const stats = normalizeRecallSessionStats(sessionStats);
  if (stats.count < MIN_RECALL_SESSIONS_FOR_NUDGE) return false;
  if (!justCompletedRecallSession({ sessionStats, nowMs })) return false;

  const saved = (bookmarks || []).filter(b => b && typeof b === 'object');
  if (saved.length < MIN_BOOKMARKS_FOR_NUDGE) return false;

  // Cross-check that locally-written counter against the durable review
  // evidence in storage.sync. A session count with no reviewed bookmark and no
  // monthly grades behind it is a record we should not be acting on.
  if (!hasCompletedRecallReview({ bookmarks: saved, reviewUsage })) return false;

  const first = firstBookmarkAt(saved);
  if (first === null) return false; // no dateable history — treat as brand new
  return nowMs - first >= MIN_DAYS_SINCE_FIRST_BOOKMARK * DAY_MS;
}

/**
 * The single decision the banner asks. Every "no" here is permanent or
 * time-bounded — there is no path that keeps re-asking.
 *
 * @param {{
 *   bookmarks?: Array<object>,
 *   reviewUsage?: object|null,
 *   sessionStats?: object|null,
 *   state?: object|null,
 *   nowMs: number,
 *   sessionShown?: boolean,
 * }} input
 * @returns {boolean}
 */
export function shouldShowReviewNudge({ bookmarks, reviewUsage, sessionStats, state, nowMs, sessionShown } = {}) {
  // In-memory guard: one paint per panel session, whatever storage says. This
  // is what holds the line when a "shown" write fails and the state on disk
  // still reads as never-shown.
  if (sessionShown) return false;

  const s = normalizeNudgeState(state);
  if (s.dismissed) return false;        // they said no — never ask again
  if (s.clickedThrough) return false;   // they already went to the listing
  if (s.shownCount >= MAX_NUDGE_SHOWS) return false;

  // Second ask only after a long, quiet gap. A missing/garbage lastShownAt with
  // a positive shownCount is treated as "shown just now", i.e. not yet due —
  // the safe direction for a nudge.
  if (s.shownCount > 0) {
    if (!s.lastShownAt) return false;
    if (nowMs - s.lastShownAt < NUDGE_RESHOW_AFTER_MS) return false;
  }

  return hasReachedEngagementMilestone({ bookmarks, reviewUsage, sessionStats, nowMs });
}

/**
 * Next state after the banner is shown. Written BEFORE the banner renders —
 * see the module header.
 *
 * @param {object|null} state
 * @param {number} nowMs
 * @returns {object}
 */
export function markNudgeShown(state, nowMs) {
  const s = normalizeNudgeState(state);
  return { ...s, shownCount: s.shownCount + 1, lastShownAt: nowMs };
}

/** Next state after the user dismisses. Retires the nudge for good. */
export function markNudgeDismissed(state) {
  return { ...normalizeNudgeState(state), dismissed: true };
}

/** Next state after the user opens the listing. Also retires it for good. */
export function markNudgeClickedThrough(state) {
  return { ...normalizeNudgeState(state), clickedThrough: true };
}
