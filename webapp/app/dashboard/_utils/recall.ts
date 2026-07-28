/**
 * Recall due-check for the web dashboard (read-only).
 *
 * ⚠️ TWIN of `isDueForRecall` in `extension/src/recall.module.js` — keep in sync.
 * Identical behaviour is enforced by `webapp/tests/unit/recall-parity.test.ts`,
 * which imports BOTH and diffs their verdicts. (Direct import is avoided because
 * the extension module lives outside the Next project root; see _utils/anki.ts
 * for the same trade-off.)
 *
 * Grading/scheduling deliberately lives ONLY in the extension: Active Recall
 * needs to drive the YouTube player, so the web surface just reports what's due.
 */

const RECALL_DAY_MS = 86_400_000;

/** Shape of the recall fields the extension writes into the bookmarks JSONB. */
export interface RecallFields {
  createdAt?: string | null;
  reviewSchedule?: number[] | null;
  lastReviewed?: string | null;
  recallStreak?: number | null;
}

/**
 * A bookmark is due when any scheduled day-offset from createdAt has passed and
 * it hasn't been reviewed since that point.
 */
export function isDueForRecall(bookmark: RecallFields | null | undefined, nowMs: number): boolean {
  if (!bookmark?.reviewSchedule?.length || !bookmark.createdAt) return false;
  const created = new Date(bookmark.createdAt).getTime();
  const lastReviewed = bookmark.lastReviewed ? new Date(bookmark.lastReviewed).getTime() : 0;
  return bookmark.reviewSchedule.some(days => {
    const dueAt = created + days * RECALL_DAY_MS;
    return nowMs >= dueAt && lastReviewed < dueAt;
  });
}

export interface RecallDueSummary {
  /** Total bookmarks due across every video. */
  total: number;
  /** Per-video breakdown, busiest first. */
  videos: { videoId: string; title: string; due: number }[];
}

/** Summarise what's due across the dashboard's per-video collections. */
export function summariseRecallDue(
  collections: { video_id: string; video_title: string | null; bookmarks: RecallFields[] | null }[],
  nowMs: number = Date.now(),
): RecallDueSummary {
  const videos: RecallDueSummary['videos'] = [];
  let total = 0;

  for (const c of collections) {
    const due = (c.bookmarks ?? []).filter(b => isDueForRecall(b, nowMs)).length;
    if (due > 0) {
      total += due;
      videos.push({ videoId: c.video_id, title: c.video_title || c.video_id, due });
    }
  }

  videos.sort((a, b) => b.due - a.due);
  return { total, videos };
}
