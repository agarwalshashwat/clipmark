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
  usagePeriodKey,
  normalizeMonthlyCounter,
  countEnrolledRecallSegments,
  isEnrollmentCapReached,
  isMonthlyReviewCapReached,
  isMonthlyAnkiExportCapReached,
  isMonthlyReviewWarnThreshold,
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
