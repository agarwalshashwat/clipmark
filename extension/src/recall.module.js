// ─── Active Recall scheduling engine (SM-2-lite, pure functions) ────────────
// ESM twin of extension/src/recall.js (classic content-script globals).
// KEEP IN SYNC: any change here must be mirrored in src/recall.js.
//
// Works with the existing bookmark fields:
//   reviewSchedule: number[]      — day-offsets from createdAt (default [1, 3, 7])
//   lastReviewed:   string | null — ISO timestamp of the last review
//   recallStreak:   number        — consecutive 'got_it' grades (added by this engine)

const RECALL_DAY_MS = 86400000;
const RECALL_MAX_INTERVAL_DAYS = 60;

/** Returns reviewSchedule sorted ascending with duplicates removed. */
function normalizeRecallSchedule(schedule) {
  return [...new Set(schedule || [])].sort((a, b) => a - b);
}

/**
 * True when at least one scheduled due-point has passed and has not been
 * reviewed since (lastReviewed predates that due-point).
 *
 * @param {{ createdAt?: string, reviewSchedule?: number[], lastReviewed?: string|null }} bookmark
 * @param {number} nowMs — current time in epoch ms
 * @returns {boolean}
 */
export function isDueForRecall(bookmark, nowMs) {
  if (!bookmark?.reviewSchedule?.length || !bookmark.createdAt) return false;
  const created      = new Date(bookmark.createdAt).getTime();
  const lastReviewed = bookmark.lastReviewed ? new Date(bookmark.lastReviewed).getTime() : 0;
  return bookmark.reviewSchedule.some(days => {
    const dueAt = created + days * RECALL_DAY_MS;
    return nowMs >= dueAt && lastReviewed < dueAt;
  });
}

/**
 * Applies a recall grade and returns a NEW bookmark object (no mutation).
 *
 * 'got_it'  — marks reviewed now, bumps recallStreak; if every scheduled
 *             due-point is now in the past, appends a next interval of
 *             min(lastInterval * 2, 60) days so the item comes due again.
 * 'again'   — resets recallStreak and ensures a due-point ~tomorrow
 *             (daysSinceCreated + 1); lastReviewed is left unchanged so the
 *             new point is unreviewed and therefore due.
 * unknown   — returns the bookmark unchanged.
 *
 * reviewSchedule is always returned sorted ascending and de-duplicated.
 *
 * @param {{ createdAt?: string, reviewSchedule?: number[], lastReviewed?: string|null, recallStreak?: number }} bookmark
 * @param {'got_it'|'again'|string} grade
 * @param {number} nowMs — current time in epoch ms
 * @returns {object} a new bookmark object (or the input if grade is unknown)
 */
export function gradeRecall(bookmark, grade, nowMs) {
  if (grade === 'got_it') {
    const schedule = normalizeRecallSchedule(bookmark.reviewSchedule);
    const created  = bookmark.createdAt ? new Date(bookmark.createdAt).getTime() : NaN;
    // schedule is sorted, so every due-point is past iff the last one is.
    const lastInterval = schedule[schedule.length - 1];
    if (schedule.length > 0 && created + lastInterval * RECALL_DAY_MS <= nowMs) {
      schedule.push(Math.min(lastInterval * 2, RECALL_MAX_INTERVAL_DAYS));
    }
    return {
      ...bookmark,
      lastReviewed: new Date(nowMs).toISOString(),
      recallStreak: (bookmark.recallStreak || 0) + 1,
      reviewSchedule: normalizeRecallSchedule(schedule),
    };
  }

  if (grade === 'again') {
    const schedule = normalizeRecallSchedule(bookmark.reviewSchedule);
    if (bookmark.createdAt) {
      const created          = new Date(bookmark.createdAt).getTime();
      const daysSinceCreated = Math.ceil((nowMs - created) / RECALL_DAY_MS);
      schedule.push(daysSinceCreated + 1); // normalize below de-duplicates
    }
    return {
      ...bookmark,
      recallStreak: 0,
      reviewSchedule: normalizeRecallSchedule(schedule),
    };
  }

  return bookmark;
}
