/**
 * Free-tier usage caps unit tests — no browser, no Chrome APIs required.
 *
 * All helpers are pure functions imported directly from the shipped source
 * module (extension/src/usage-caps.module.js) so these tests guard the real
 * code that content.js/side-panel.js/dashboard.js/background.js consume.
 *
 * IMPORTANT: extension/src/usage-caps.js is the classic content-script twin
 * of usage-caps.module.js — keep both in sync (only the module twin is
 * tested here).
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  FREE_RECALL_ENROLLED_CAP,
  FREE_RECALL_REVIEWS_PER_MONTH,
  FREE_ANKI_EXPORTS_PER_MONTH,
  FREE_SAVED_LOOPS_CAP,
  usagePeriodKey,
  normalizeMonthlyCounter,
  countEnrolledRecallSegments,
  isEnrollmentCapReached,
  isMonthlyReviewCapReached,
  isRecallStartBlocked,
  isMonthlyAnkiExportCapReached,
  isMonthlyReviewWarnThreshold,
  countSavedLoops,
  isSavedLoopCapReached,
} from '../../extension/src/usage-caps.module.js';

const NOW = Date.parse('2026-07-30T12:00:00.000Z'); // period '2026-07'

describe('cap constants', () => {
  it('match the approved spec numbers', () => {
    assert.equal(FREE_RECALL_ENROLLED_CAP, 25);
    assert.equal(FREE_RECALL_REVIEWS_PER_MONTH, 30);
    assert.equal(FREE_ANKI_EXPORTS_PER_MONTH, 1);
  });
});

describe('usagePeriodKey', () => {
  it('formats as YYYY-MM in UTC', () => {
    assert.equal(usagePeriodKey(NOW), '2026-07');
    assert.equal(usagePeriodKey(Date.parse('2026-01-01T00:00:00.000Z')), '2026-01');
    assert.equal(usagePeriodKey(Date.parse('2026-12-31T23:59:59.000Z')), '2026-12');
  });
});

describe('normalizeMonthlyCounter', () => {
  it('returns count 0 for a never-used counter', () => {
    assert.deepEqual(normalizeMonthlyCounter(null, NOW), { periodStart: '2026-07', count: 0 });
    assert.deepEqual(normalizeMonthlyCounter(undefined, NOW), { periodStart: '2026-07', count: 0 });
  });

  it('preserves the count when the stored period matches the current one', () => {
    const stored = { periodStart: '2026-07', count: 12 };
    assert.deepEqual(normalizeMonthlyCounter(stored, NOW), { periodStart: '2026-07', count: 12 });
  });

  it('resets to 0 when the stored period is a past month', () => {
    const stored = { periodStart: '2026-06', count: 29 };
    assert.deepEqual(normalizeMonthlyCounter(stored, NOW), { periodStart: '2026-07', count: 0 });
  });
});

describe('countEnrolledRecallSegments', () => {
  it('counts only bookmarks with a non-empty reviewSchedule', () => {
    const bookmarks = [
      { id: 1, reviewSchedule: [1, 3, 7] },
      { id: 2, reviewSchedule: [] },
      { id: 3 }, // never enrolled (e.g. capped at creation time)
      { id: 4, reviewSchedule: [1] },
    ];
    assert.equal(countEnrolledRecallSegments(bookmarks), 2);
  });

  it('handles empty/null input', () => {
    assert.equal(countEnrolledRecallSegments([]), 0);
    assert.equal(countEnrolledRecallSegments(null), 0);
    assert.equal(countEnrolledRecallSegments(undefined), 0);
  });
});

describe('isEnrollmentCapReached', () => {
  it('is false below the cap and true at/above it', () => {
    assert.equal(isEnrollmentCapReached(0), false);
    assert.equal(isEnrollmentCapReached(24), false);
    assert.equal(isEnrollmentCapReached(25), true);
    assert.equal(isEnrollmentCapReached(26), true);
  });
});

describe('isMonthlyReviewCapReached', () => {
  it('is false below 30 reviews this month', () => {
    assert.equal(isMonthlyReviewCapReached({ periodStart: '2026-07', count: 29 }, NOW), false);
  });

  it('is true at/above 30 reviews this month', () => {
    assert.equal(isMonthlyReviewCapReached({ periodStart: '2026-07', count: 30 }, NOW), true);
    assert.equal(isMonthlyReviewCapReached({ periodStart: '2026-07', count: 45 }, NOW), true);
  });

  it('a stale month counter never blocks — it resets first', () => {
    assert.equal(isMonthlyReviewCapReached({ periodStart: '2026-06', count: 999 }, NOW), false);
  });
});

describe('isMonthlyAnkiExportCapReached', () => {
  it('is false before the first export this month', () => {
    assert.equal(isMonthlyAnkiExportCapReached(null, NOW), false);
  });

  it('is true after the one free export this month', () => {
    assert.equal(isMonthlyAnkiExportCapReached({ periodStart: '2026-07', count: 1 }, NOW), true);
  });

  it('resets on a new month', () => {
    assert.equal(isMonthlyAnkiExportCapReached({ periodStart: '2026-06', count: 1 }, NOW), false);
  });
});

describe('isMonthlyReviewWarnThreshold (80% nudge)', () => {
  it('is false below the 24-review threshold', () => {
    assert.equal(isMonthlyReviewWarnThreshold({ periodStart: '2026-07', count: 23 }, NOW), false);
  });

  it('is true from 24 through 29 (inclusive)', () => {
    for (let count = 24; count <= 29; count++) {
      assert.equal(isMonthlyReviewWarnThreshold({ periodStart: '2026-07', count }, NOW), true, `count=${count}`);
    }
  });

  it('is false once the hard cap (30) is hit — the hard stop takes over', () => {
    assert.equal(isMonthlyReviewWarnThreshold({ periodStart: '2026-07', count: 30 }, NOW), false);
  });
});

// ─── Saved A–B loops (free vs Pro) ───────────────────────────────────────────
// Looping itself is deliberately uncapped — it is the free acquisition hook.
// Only SAVING a named loop (which syncs and becomes a recall card) is metered.
describe('countSavedLoops', () => {
  const loop = (start, end) => ({ timestamp: start, loop: { end } });

  it('counts only records carrying a valid A–B range', () => {
    const all = [
      loop(10, 20),
      { timestamp: 5, description: 'a plain bookmark' },
      loop(60, 90),
    ];
    assert.equal(countSavedLoops(all), 2);
  });

  it('ignores a malformed range rather than counting it against the user', () => {
    assert.equal(countSavedLoops([{ timestamp: 10, loop: { end: 10 } }]), 0);
    assert.equal(countSavedLoops([{ timestamp: 10, loop: { end: 5 } }]), 0);
    assert.equal(countSavedLoops([{ timestamp: 10, loop: {} }]), 0);
    assert.equal(countSavedLoops([{ loop: { end: 20 } }]), 0);
  });

  it('handles an empty/absent list', () => {
    assert.equal(countSavedLoops([]), 0);
    assert.equal(countSavedLoops(undefined), 0);
    assert.equal(countSavedLoops(null), 0);
  });
});

describe('isSavedLoopCapReached (free tier)', () => {
  it('is false below the cap', () => {
    for (let n = 0; n < FREE_SAVED_LOOPS_CAP; n++) {
      assert.equal(isSavedLoopCapReached(n), false, `n=${n}`);
    }
  });

  it('is true at and above the cap', () => {
    assert.equal(isSavedLoopCapReached(FREE_SAVED_LOOPS_CAP), true);
    assert.equal(isSavedLoopCapReached(FREE_SAVED_LOOPS_CAP + 5), true);
  });

  it('is a standing pool, not a monthly one — no period argument exists', () => {
    assert.equal(isSavedLoopCapReached.length, 1);
  });
});

describe('isRecallStartBlocked (shared gate for every recall entry point)', () => {
  const usage = (count, periodStart = '2026-07') => ({ periodStart, count });

  it('never blocks a Pro user, whatever the counter says', () => {
    assert.equal(isRecallStartBlocked({ isPro: true, reviewUsage: usage(0), nowMs: NOW }), false);
    assert.equal(isRecallStartBlocked({ isPro: true, reviewUsage: usage(FREE_RECALL_REVIEWS_PER_MONTH), nowMs: NOW }), false);
    assert.equal(isRecallStartBlocked({ isPro: true, reviewUsage: usage(9999), nowMs: NOW }), false);
  });

  it('lets a free user through below the monthly cap', () => {
    assert.equal(isRecallStartBlocked({ isPro: false, reviewUsage: null, nowMs: NOW }), false);
    assert.equal(isRecallStartBlocked({ isPro: false, reviewUsage: usage(0), nowMs: NOW }), false);
    assert.equal(
      isRecallStartBlocked({ isPro: false, reviewUsage: usage(FREE_RECALL_REVIEWS_PER_MONTH - 1), nowMs: NOW }),
      false,
    );
  });

  it('blocks a free user at and above the monthly cap', () => {
    assert.equal(
      isRecallStartBlocked({ isPro: false, reviewUsage: usage(FREE_RECALL_REVIEWS_PER_MONTH), nowMs: NOW }),
      true,
    );
    assert.equal(
      isRecallStartBlocked({ isPro: false, reviewUsage: usage(FREE_RECALL_REVIEWS_PER_MONTH + 1), nowMs: NOW }),
      true,
    );
  });

  it('unblocks a free user once the period rolls over', () => {
    const spent = usage(FREE_RECALL_REVIEWS_PER_MONTH, '2026-06'); // last month's allowance
    assert.equal(isRecallStartBlocked({ isPro: false, reviewUsage: spent, nowMs: NOW }), false);
  });

  it('agrees with isMonthlyReviewCapReached for free users — one rule, not two', () => {
    // The web-started path (background.js) and the extension's own UI both call
    // this; if it ever diverged from the underlying cap, the paywall would be
    // inconsistent by entry point again.
    for (const count of [0, 1, 15, 29, 30, 31, 100]) {
      assert.equal(
        isRecallStartBlocked({ isPro: false, reviewUsage: usage(count), nowMs: NOW }),
        isMonthlyReviewCapReached(usage(count), NOW),
        `count=${count}`,
      );
    }
  });
});
