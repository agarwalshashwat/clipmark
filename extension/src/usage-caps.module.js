// ─── Free-tier usage caps (pure functions) ──────────────────────────────────
// ESM twin of extension/src/usage-caps.js (classic content-script globals).
// KEEP IN SYNC: any change here must be mirrored in src/usage-caps.js.
//
// These are the med/exam-pivot free caps (see ClipMark-UsageCaps-Spec.md):
//   - Active Recall–enrolled segments: 25, standing (not monthly)
//   - Active Recall reviews:           30 / month
//   - Anki export:                     1 / month
// Pro users are always unlimited — callers should short-circuit on isPro
// before consulting these helpers.
//
// Monthly counters are stored client-side (chrome.storage.local, not sync —
// they don't need cross-device consistency and sync has a tight quota) as
// `{ periodStart: 'YYYY-MM', count: number }`. The functions here are pure:
// they normalize/compare a stored counter against "now" without touching
// chrome.storage themselves, so callers own the actual read/write.

export const FREE_RECALL_ENROLLED_CAP = 25;
export const FREE_RECALL_REVIEWS_PER_MONTH = 30;
export const FREE_ANKI_EXPORTS_PER_MONTH = 1;
export const RECALL_REVIEWS_WARN_THRESHOLD = Math.round(FREE_RECALL_REVIEWS_PER_MONTH * 0.8); // 24

/** 'YYYY-MM' for the given time, in UTC so it's stable regardless of local TZ. */
export function usagePeriodKey(nowMs) {
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
export function normalizeMonthlyCounter(stored, nowMs) {
  const periodStart = usagePeriodKey(nowMs);
  if (stored?.periodStart === periodStart) {
    return { periodStart, count: stored.count || 0 };
  }
  return { periodStart, count: 0 };
}

/** Count of bookmarks (across all videos) currently enrolled in Active Recall. */
export function countEnrolledRecallSegments(allBookmarks) {
  return (allBookmarks || []).filter(b => b?.reviewSchedule?.length > 0).length;
}

/** True when a free user's standing enrollment pool is full. */
export function isEnrollmentCapReached(enrolledCount) {
  return enrolledCount >= FREE_RECALL_ENROLLED_CAP;
}

/** True when a free user has used all of this month's recall reviews. */
export function isMonthlyReviewCapReached(stored, nowMs) {
  return normalizeMonthlyCounter(stored, nowMs).count >= FREE_RECALL_REVIEWS_PER_MONTH;
}

/** True when a free user has used all of this month's Anki exports. */
export function isMonthlyAnkiExportCapReached(stored, nowMs) {
  return normalizeMonthlyCounter(stored, nowMs).count >= FREE_ANKI_EXPORTS_PER_MONTH;
}

/** True when the review count is at/above the 80% in-session warning threshold. */
export function isMonthlyReviewWarnThreshold(stored, nowMs) {
  const { count } = normalizeMonthlyCounter(stored, nowMs);
  return count >= RECALL_REVIEWS_WARN_THRESHOLD && count < FREE_RECALL_REVIEWS_PER_MONTH;
}
