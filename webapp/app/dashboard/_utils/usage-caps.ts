/**
 * Free-tier Anki export cap — pure logic, webapp twin.
 *
 * ⚠️ TWIN of the Anki-export slice of `extension/src/usage-caps.module.js`
 * (`FREE_ANKI_EXPORTS_PER_MONTH`, `usagePeriodKey`, `normalizeMonthlyCounter`,
 * `isMonthlyAnkiExportCapReached`) — keep the two in sync. Enforced by
 * `webapp/tests/unit/usage-caps-parity.test.ts`, which imports both and diffs
 * their behavior. (Direct import of the extension module is avoided here for
 * the same reason as `_utils/anki.ts` — it lives outside the Next.js project
 * root. Same twin pattern as constants.js/constants.module.js.)
 *
 * The extension's other caps (Active Recall enrollment/reviews) have no
 * webapp-dashboard equivalent yet, so only the Anki slice is mirrored.
 *
 * Storage: the extension persists its counter in chrome.storage.local; the
 * webapp has no such API, so it uses localStorage under the same
 * `{ periodStart, count }` shape. Both are pure client-side counters — Pro
 * users are unlimited and callers must short-circuit on isPro before
 * consulting any of this.
 */

export const FREE_ANKI_EXPORTS_PER_MONTH = 10;

export interface MonthlyCounter {
  periodStart: string;
  count: number;
}

/** 'YYYY-MM' for the given time, in UTC so it's stable regardless of local TZ. */
export function usagePeriodKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Normalizes a stored monthly counter against "now": if the counter belongs
 * to a past period it resets to 0 for the current period. Does not mutate or
 * persist — callers write the result back if it changed.
 */
export function normalizeMonthlyCounter(
  stored: Partial<MonthlyCounter> | null | undefined,
  nowMs: number,
): MonthlyCounter {
  const periodStart = usagePeriodKey(nowMs);
  if (stored?.periodStart === periodStart) {
    return { periodStart, count: stored.count || 0 };
  }
  return { periodStart, count: 0 };
}

/** True when a free user has used all of this month's Anki exports. */
export function isMonthlyAnkiExportCapReached(
  stored: Partial<MonthlyCounter> | null | undefined,
  nowMs: number,
): boolean {
  return normalizeMonthlyCounter(stored, nowMs).count >= FREE_ANKI_EXPORTS_PER_MONTH;
}

// ─── localStorage plumbing (webapp-only; no extension equivalent) ─────────────

const STORAGE_KEY = 'clipmark_anki_export_usage';

/** Reads the stored counter, or null if unset/unavailable (SSR, storage disabled). */
export function getAnkiExportUsage(): MonthlyCounter | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Increments this month's export count by one, resetting if the period rolled over. */
export function recordAnkiExport(nowMs: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeMonthlyCounter(getAnkiExportUsage(), nowMs);
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ periodStart: normalized.periodStart, count: normalized.count + 1 }),
    );
  } catch {
    // Best-effort; a write failure just means the free cap won't be enforced.
  }
}
