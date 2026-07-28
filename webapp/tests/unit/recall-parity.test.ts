/**
 * Recall due-check parity — webapp twin vs. extension engine.
 *
 * `webapp/app/dashboard/_utils/recall.ts` duplicates `isDueForRecall` from
 * `extension/src/recall.module.js` (the extension module sits outside the Next
 * project root). This test imports BOTH and asserts identical verdicts, so the
 * twins can't drift.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDueForRecall as webappDue, summariseRecallDue } from '../../app/dashboard/_utils/recall.js';
import { isDueForRecall as extensionDue } from '../../../extension/src/recall.module.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 29, 12, 0, 0); // fixed clock
const iso = (ms: number) => new Date(ms).toISOString();

const CASES: { name: string; bookmark: any }[] = [
  { name: 'fresh bookmark, nothing due yet', bookmark: { createdAt: iso(NOW - 2 * 3600_000), reviewSchedule: [1, 3, 7], lastReviewed: null } },
  { name: 'day-1 point passed, never reviewed → due', bookmark: { createdAt: iso(NOW - 2 * DAY), reviewSchedule: [1, 3, 7], lastReviewed: null } },
  { name: 'reviewed after the day-1 point → not due', bookmark: { createdAt: iso(NOW - 2 * DAY), reviewSchedule: [1, 3, 7], lastReviewed: iso(NOW - 1 * DAY) } },
  { name: 'reviewed before the passed point → still due', bookmark: { createdAt: iso(NOW - 5 * DAY), reviewSchedule: [1, 3, 7], lastReviewed: iso(NOW - 4.5 * DAY) } },
  { name: 'all points passed, reviewed recently → not due', bookmark: { createdAt: iso(NOW - 10 * DAY), reviewSchedule: [1, 3, 7], lastReviewed: iso(NOW - 1 * DAY) } },
  { name: 'exactly at a due boundary → due', bookmark: { createdAt: iso(NOW - 1 * DAY), reviewSchedule: [1], lastReviewed: null } },
  { name: 'empty schedule → never due', bookmark: { createdAt: iso(NOW - 30 * DAY), reviewSchedule: [], lastReviewed: null } },
  { name: 'missing schedule → never due', bookmark: { createdAt: iso(NOW - 30 * DAY), lastReviewed: null } },
  { name: 'missing createdAt → never due', bookmark: { reviewSchedule: [1, 3, 7], lastReviewed: null } },
  { name: 'appended long interval not yet reached, earlier ones reviewed', bookmark: { createdAt: iso(NOW - 8 * DAY), reviewSchedule: [1, 3, 7, 30], lastReviewed: iso(NOW - 1 * DAY) } },
  { name: 'graded item with streak still has a future point', bookmark: { createdAt: iso(NOW - 8 * DAY), reviewSchedule: [1, 3, 7, 14], lastReviewed: iso(NOW - 12 * 3600_000), recallStreak: 3 } },
];

describe('isDueForRecall: webapp twin matches the extension engine', () => {
  for (const { name, bookmark } of CASES) {
    it(name, () => {
      assert.equal(
        webappDue(bookmark, NOW),
        extensionDue(bookmark, NOW),
        `verdict diverged for: ${name}`,
      );
    });
  }

  it('null/undefined bookmarks are handled the same', () => {
    // The extension module's JSDoc types don't admit null, but it guards with
    // optional chaining at runtime — which is exactly what we're comparing.
    const extDue = extensionDue as (b: unknown, now: number) => boolean;
    assert.equal(webappDue(null, NOW), extDue(null, NOW));
    assert.equal(webappDue(undefined, NOW), extDue(undefined, NOW));
  });
});

describe('summariseRecallDue', () => {
  const due = { createdAt: iso(NOW - 5 * DAY), reviewSchedule: [1, 3], lastReviewed: null };
  const notDue = { createdAt: iso(NOW - 5 * DAY), reviewSchedule: [1, 3], lastReviewed: iso(NOW - 1000) };

  it('counts due bookmarks and sorts videos busiest-first', () => {
    const s = summariseRecallDue([
      { video_id: 'v1', video_title: 'One', bookmarks: [due, notDue] },
      { video_id: 'v2', video_title: 'Two', bookmarks: [due, due, due] },
    ], NOW);
    assert.equal(s.total, 4);
    assert.deepEqual(s.videos.map(v => [v.videoId, v.due]), [['v2', 3], ['v1', 1]]);
  });

  it('omits videos with nothing due', () => {
    const s = summariseRecallDue([{ video_id: 'v1', video_title: 'One', bookmarks: [notDue] }], NOW);
    assert.equal(s.total, 0);
    assert.deepEqual(s.videos, []);
  });

  it('tolerates null bookmark arrays and falls back to videoId for the title', () => {
    const s = summariseRecallDue([
      { video_id: 'v0', video_title: null, bookmarks: null },
      { video_id: 'v9', video_title: null, bookmarks: [due] },
    ], NOW);
    assert.equal(s.total, 1);
    assert.equal(s.videos[0].title, 'v9');
  });
});
