/**
 * Recall scheduling engine unit tests — no browser, no Chrome APIs required.
 *
 * isDueForRecall / gradeRecall are imported directly from the shipped source
 * module (extension/src/recall.module.js) so these tests guard the real code.
 *
 * IMPORTANT: extension/src/recall.js is the classic content-script twin of
 * recall.module.js — keep both in sync (only the module twin is tested here).
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isDueForRecall, gradeRecall } from '../../extension/src/recall.module.js';

const DAY_MS = 86400000;

// Fixed "now" so tests are deterministic regardless of wall-clock time.
const NOW = Date.parse('2026-07-20T12:00:00.000Z');

/**
 * Builds a minimal bookmark created the given number of days before NOW.
 *
 * @param {number} daysAgo
 * @param {Object} [options]
 * @param {number[]} [options.reviewSchedule=[1,3,7]]
 * @param {string|null} [options.lastReviewed=null]
 * @param {number} [options.recallStreak]
 */
function makeBm(daysAgo, { reviewSchedule = [1, 3, 7], lastReviewed = null, recallStreak } = {}) {
  const bm = {
    createdAt: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    reviewSchedule,
    lastReviewed,
  };
  if (recallStreak !== undefined) bm.recallStreak = recallStreak;
  return bm;
}

// ─── isDueForRecall ───────────────────────────────────────────────────────────
describe('isDueForRecall', () => {
  const cases = [
    {
      name: 'false when reviewSchedule is empty',
      bm: makeBm(5, { reviewSchedule: [] }),
      expected: false,
    },
    {
      name: 'false when reviewSchedule is missing',
      bm: { createdAt: new Date(NOW - 5 * DAY_MS).toISOString(), lastReviewed: null },
      expected: false,
    },
    {
      name: 'false when createdAt is missing',
      bm: { reviewSchedule: [1, 3, 7], lastReviewed: null },
      expected: false,
    },
    {
      name: 'false when createdAt is null',
      bm: { createdAt: null, reviewSchedule: [1, 3, 7], lastReviewed: null },
      expected: false,
    },
    {
      name: 'false when bookmark was just created (no due-point reached)',
      bm: makeBm(0),
      expected: false,
    },
    {
      name: 'true when a due-point has passed and item was never reviewed',
      bm: makeBm(2, { reviewSchedule: [1] }),
      expected: true,
    },
    {
      name: 'false when all scheduled days are still in the future',
      bm: makeBm(0, { reviewSchedule: [7, 14] }),
      expected: false,
    },
    {
      name: 'true when one of several scheduled days is due and unreviewed',
      bm: makeBm(4, { reviewSchedule: [3, 7] }),
      expected: true,
    },
    {
      name: 'false when the passed due-point was reviewed after it',
      bm: makeBm(3, {
        reviewSchedule: [1],
        lastReviewed: new Date(NOW - 2 * DAY_MS).toISOString(),
      }),
      expected: false,
    },
    {
      name: 'true when reviewed before an earlier due-point but a later one has since passed',
      bm: makeBm(4, {
        reviewSchedule: [1, 3],
        lastReviewed: new Date(NOW - 2.5 * DAY_MS).toISOString(), // after day-1, before day-3
      }),
      expected: true,
    },
    {
      name: 'false when all passed due-points were reviewed',
      bm: makeBm(10, {
        reviewSchedule: [1, 3, 7],
        lastReviewed: new Date(NOW - 1 * DAY_MS).toISOString(),
      }),
      expected: false,
    },
  ];

  for (const { name, bm, expected } of cases) {
    it(name, () => {
      assert.strictEqual(isDueForRecall(bm, NOW), expected);
    });
  }

  it('boundary: due exactly at nowMs counts as due (nowMs >= dueAt)', () => {
    const bm = makeBm(1, { reviewSchedule: [1] }); // dueAt === NOW
    assert.strictEqual(isDueForRecall(bm, NOW), true);
  });

  it('boundary: 1ms before the due-point is not due', () => {
    const bm = makeBm(1, { reviewSchedule: [1] });
    assert.strictEqual(isDueForRecall(bm, NOW - 1), false);
  });

  it('boundary: lastReviewed exactly at the due-point covers it', () => {
    // lastReviewed === dueAt → lastReviewed < dueAt is false → not due
    const bm = makeBm(2, {
      reviewSchedule: [1],
      lastReviewed: new Date(NOW - 1 * DAY_MS).toISOString(),
    });
    assert.strictEqual(isDueForRecall(bm, NOW), false);
  });
});

// ─── gradeRecall: got_it ──────────────────────────────────────────────────────
describe('gradeRecall — got_it', () => {
  it('sets lastReviewed to nowMs as an ISO string', () => {
    const result = gradeRecall(makeBm(2, { reviewSchedule: [1] }), 'got_it', NOW);
    assert.strictEqual(result.lastReviewed, new Date(NOW).toISOString());
  });

  it('increments recallStreak from undefined to 1', () => {
    const result = gradeRecall(makeBm(2, { reviewSchedule: [1] }), 'got_it', NOW);
    assert.strictEqual(result.recallStreak, 1);
  });

  it('increments an existing recallStreak', () => {
    const result = gradeRecall(makeBm(2, { reviewSchedule: [1], recallStreak: 4 }), 'got_it', NOW);
    assert.strictEqual(result.recallStreak, 5);
  });

  it('appends a doubled interval when ALL due-points are in the past', () => {
    // Created 8 days ago, schedule [1,3,7] all in the past → append min(7*2, 60)=14
    const result = gradeRecall(makeBm(8), 'got_it', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 3, 7, 14]);
  });

  it('does NOT append when a future due-point remains', () => {
    // Created 4 days ago, schedule [1,3,7]: day-7 is still in the future
    const result = gradeRecall(makeBm(4), 'got_it', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 3, 7]);
  });

  it('caps the appended interval at 60 days', () => {
    // Last interval 40 → 40*2=80 capped to 60
    const result = gradeRecall(makeBm(50, { reviewSchedule: [1, 40] }), 'got_it', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 40, 60]);
  });

  it('appending a capped 60 onto an existing 60 leaves the schedule de-duplicated', () => {
    const result = gradeRecall(makeBm(70, { reviewSchedule: [30, 60] }), 'got_it', NOW);
    assert.deepEqual(result.reviewSchedule, [30, 60]);
  });

  it('after got_it on an exhausted schedule, the item is no longer due now', () => {
    const result = gradeRecall(makeBm(8), 'got_it', NOW);
    assert.strictEqual(isDueForRecall(result, NOW), false);
  });

  it('after got_it, the item comes due again at the appended interval', () => {
    // Created 8 days ago + appended interval 14 → due again 6 days from NOW
    const result = gradeRecall(makeBm(8), 'got_it', NOW);
    assert.strictEqual(isDueForRecall(result, NOW + 5 * DAY_MS), false);
    assert.strictEqual(isDueForRecall(result, NOW + 6 * DAY_MS), true);
  });

  it('sorts and de-duplicates an unsorted input schedule', () => {
    const result = gradeRecall(makeBm(4, { reviewSchedule: [7, 1, 3, 3] }), 'got_it', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 3, 7]);
  });

  it('due-point exactly at nowMs counts as past for the exhaustion check', () => {
    // Created 7 days ago, schedule [1,3,7]: day-7 dueAt === NOW → exhausted → append 14
    const result = gradeRecall(makeBm(7), 'got_it', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 3, 7, 14]);
  });
});

// ─── gradeRecall: again ───────────────────────────────────────────────────────
describe('gradeRecall — again', () => {
  it('resets recallStreak to 0', () => {
    const result = gradeRecall(makeBm(2, { recallStreak: 5 }), 'again', NOW);
    assert.strictEqual(result.recallStreak, 0);
  });

  it('leaves lastReviewed unchanged', () => {
    const lastReviewed = new Date(NOW - 1 * DAY_MS).toISOString();
    const result = gradeRecall(makeBm(5, { lastReviewed }), 'again', NOW);
    assert.strictEqual(result.lastReviewed, lastReviewed);
  });

  it('adds a due-point at daysSinceCreated + 1', () => {
    // Created exactly 5 days ago → daysSinceCreated = ceil(5) = 5 → adds 6
    const result = gradeRecall(makeBm(5), 'again', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 3, 6, 7]);
  });

  it('rounds partial days up before adding 1', () => {
    // Created 4.5 days ago → ceil(4.5)=5 → adds 6
    const result = gradeRecall(makeBm(4.5), 'again', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 3, 6, 7]);
  });

  it('does not add a duplicate when the tomorrow point already exists', () => {
    // Created exactly 2 days ago → adds 3, which is already in [1,3,7]
    const result = gradeRecall(makeBm(2), 'again', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 3, 7]);
  });

  it('adds the tomorrow point exactly once across repeated "again" grades', () => {
    const once  = gradeRecall(makeBm(5), 'again', NOW);
    const twice = gradeRecall(once, 'again', NOW);
    assert.deepEqual(twice.reviewSchedule, once.reviewSchedule);
  });

  it('the added point becomes due one day later', () => {
    const result = gradeRecall(makeBm(8, {
      lastReviewed: new Date(NOW - 1000).toISOString(), // all prior points covered
    }), 'again', NOW);
    assert.strictEqual(isDueForRecall(result, NOW), false);
    assert.strictEqual(isDueForRecall(result, NOW + 1 * DAY_MS), true);
  });

  it('keeps the schedule sorted after appending', () => {
    const result = gradeRecall(makeBm(10, { reviewSchedule: [30, 1] }), 'again', NOW);
    assert.deepEqual(result.reviewSchedule, [1, 11, 30]);
  });
});

// ─── gradeRecall: unknown grade + purity ──────────────────────────────────────
describe('gradeRecall — unknown grade and purity', () => {
  it('returns the bookmark unchanged for an unknown grade', () => {
    const bm = makeBm(5);
    const result = gradeRecall(bm, 'meh', NOW);
    assert.strictEqual(result, bm);
  });

  it('got_it does not mutate the input bookmark or its schedule', () => {
    const bm = makeBm(8, { recallStreak: 2 });
    const snapshot = structuredClone(bm);
    gradeRecall(bm, 'got_it', NOW);
    assert.deepEqual(bm, snapshot);
  });

  it('again does not mutate the input bookmark or its schedule', () => {
    const bm = makeBm(5, { recallStreak: 2 });
    const snapshot = structuredClone(bm);
    gradeRecall(bm, 'again', NOW);
    assert.deepEqual(bm, snapshot);
  });

  it('got_it returns a new object, not the input', () => {
    const bm = makeBm(2);
    assert.notStrictEqual(gradeRecall(bm, 'got_it', NOW), bm);
  });

  it('again returns a new object, not the input', () => {
    const bm = makeBm(2);
    assert.notStrictEqual(gradeRecall(bm, 'again', NOW), bm);
  });

  it('preserves unrelated bookmark fields', () => {
    const bm = { ...makeBm(2), id: 42, description: 'note #important', timestamp: 90 };
    const result = gradeRecall(bm, 'got_it', NOW);
    assert.strictEqual(result.id, 42);
    assert.strictEqual(result.description, 'note #important');
    assert.strictEqual(result.timestamp, 90);
  });
});
