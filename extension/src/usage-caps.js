// ─── Free-tier usage caps (pure functions) ──────────────────────────────────
// Classic content-script twin of extension/src/usage-caps.module.js (ESM exports).
// KEEP IN SYNC: any change here must be mirrored in src/usage-caps.module.js.
//
// These are the med/exam-pivot free caps (see ClipMark-UsageCaps-Spec.md):
//   - Active Recall–enrolled segments: 25, standing (not monthly)
//   - Active Recall reviews:           30 / month
//   - Anki export:                     1 / month
//   - Saved A–B loops:                 3, standing (not monthly)
// Looping ITSELF is never capped — defining A–B points and looping them in the
// session is the free acquisition hook. Only *saving* a named loop (which then
// syncs and becomes a recall card) consumes the standing pool below.
// Pro users are always unlimited — callers should short-circuit on isPro
// before consulting these helpers.
//
// Monthly counters are stored client-side (chrome.storage.local, not sync —
// they don't need cross-device consistency and sync has a tight quota) as
// `{ periodStart: 'YYYY-MM', count: number }`. The functions here are pure:
// they normalize/compare a stored counter against "now" without touching
// chrome.storage themselves, so callers own the actual read/write.

const FREE_RECALL_ENROLLED_CAP = 25;
const FREE_RECALL_REVIEWS_PER_MONTH = 30;
const FREE_ANKI_EXPORTS_PER_MONTH = 1;
const FREE_SAVED_LOOPS_CAP = 3;
const RECALL_REVIEWS_WARN_THRESHOLD = Math.round(FREE_RECALL_REVIEWS_PER_MONTH * 0.8); // 24

/** 'YYYY-MM' for the given time, in UTC so it's stable regardless of local TZ. */
function usagePeriodKey(nowMs) {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Normalizes a stored monthly counter against "now": if the counter belongs to
 * a past period it resets to 0 for the current period. Does not mutate or
 * persist — callers write the result back if it changed.
 *
 * @param {{ periodStart?: string, count?: number } | null | undefined} stored
 * @param {number} nowMs
 * @returns {{ periodStart: string, count: number }}
 */
function normalizeMonthlyCounter(stored, nowMs) {
  const periodStart = usagePeriodKey(nowMs);
  if (stored?.periodStart === periodStart) {
    return { periodStart, count: stored.count || 0 };
  }
  return { periodStart, count: 0 };
}

/** Count of bookmarks (across all videos) currently enrolled in Active Recall. */
function countEnrolledRecallSegments(allBookmarks) {
  return (allBookmarks || []).filter(b => b?.reviewSchedule?.length > 0).length;
}

/** True when a free user's standing enrollment pool is full. */
function isEnrollmentCapReached(enrolledCount) {
  return enrolledCount >= FREE_RECALL_ENROLLED_CAP;
}

/** True when a free user has used all of this month's recall reviews. */
function isMonthlyReviewCapReached(stored, nowMs) {
  return normalizeMonthlyCounter(stored, nowMs).count >= FREE_RECALL_REVIEWS_PER_MONTH;
}

/** True when a free user has used all of this month's Anki exports. */
function isMonthlyAnkiExportCapReached(stored, nowMs) {
  return normalizeMonthlyCounter(stored, nowMs).count >= FREE_ANKI_EXPORTS_PER_MONTH;
}

/**
 * The single "may an Active Recall session start?" rule — see the module twin
 * (usage-caps.module.js) for why every entry point must route through it.
 */
function isRecallStartBlocked({ isPro, reviewUsage, nowMs }) {
  if (isPro) return false;
  return isMonthlyReviewCapReached(reviewUsage, nowMs);
}

/**
 * Count of saved A–B loops (across all videos).
 *
 * Loops are stored as ordinary bookmarks carrying a `loop: { end }` range —
 * see src/loop.module.js — so this counts records, not a separate store. The
 * shape check is inlined rather than importing isLoopBookmark so this module
 * stays dependency-free (it is loaded before loop.js in some surfaces).
 */
function countSavedLoops(allBookmarks) {
  return (allBookmarks || []).filter(
    b => typeof b?.timestamp === 'number' &&
         typeof b?.loop?.end === 'number' &&
         b.loop.end > b.timestamp,
  ).length;
}

/** True when a free user's standing saved-loop pool is full. */
function isSavedLoopCapReached(savedCount) {
  return savedCount >= FREE_SAVED_LOOPS_CAP;
}

/** True when the review count is at/above the 80% in-session warning threshold. */
function isMonthlyReviewWarnThreshold(stored, nowMs) {
  const { count } = normalizeMonthlyCounter(stored, nowMs);
  return count >= RECALL_REVIEWS_WARN_THRESHOLD && count < FREE_RECALL_REVIEWS_PER_MONTH;
}

// Register on globalThis so (a) the crxjs/Vite build does not tree-shake this
// entry to an empty IIFE, and (b) sibling content scripts — each wrapped in
// its own scope by the bundler — can reach these helpers via
// `typeof isEnrollmentCapReached === 'function'` guards.
globalThis.FREE_RECALL_ENROLLED_CAP = FREE_RECALL_ENROLLED_CAP;
globalThis.FREE_RECALL_REVIEWS_PER_MONTH = FREE_RECALL_REVIEWS_PER_MONTH;
globalThis.FREE_ANKI_EXPORTS_PER_MONTH = FREE_ANKI_EXPORTS_PER_MONTH;
globalThis.FREE_SAVED_LOOPS_CAP = FREE_SAVED_LOOPS_CAP;
globalThis.usagePeriodKey = usagePeriodKey;
globalThis.normalizeMonthlyCounter = normalizeMonthlyCounter;
globalThis.countEnrolledRecallSegments = countEnrolledRecallSegments;
globalThis.isEnrollmentCapReached = isEnrollmentCapReached;
globalThis.countSavedLoops = countSavedLoops;
globalThis.isSavedLoopCapReached = isSavedLoopCapReached;
globalThis.isMonthlyReviewCapReached = isMonthlyReviewCapReached;
globalThis.isMonthlyAnkiExportCapReached = isMonthlyAnkiExportCapReached;
globalThis.isMonthlyReviewWarnThreshold = isMonthlyReviewWarnThreshold;
globalThis.isRecallStartBlocked = isRecallStartBlocked;
