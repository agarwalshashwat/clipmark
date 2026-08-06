/**
 * Unit tests for the side panel's idle ("not watching right now") summary.
 *
 * Covers the grouping/ordering the thumbnail cards depend on and the
 * due-for-review strip's counting. Due-ness itself is the shared Active Recall
 * engine — these tests inject it rather than reimplementing it, which is also
 * how src/idle-summary.js is wired in production.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  bookmarkSavedAt,
  buildDueSummary,
  buildIdleVideoCards,
  collectStoredBookmarks,
  dueBookmarksForVideo,
  dueCountLabel,
  groupBookmarksByVideo,
  momentCountLabel,
  resolveVideoTitle,
} from '../../extension/src/idle-summary.js';
import { isDueForRecall } from '../../extension/src/recall.module.js';
import { ytThumbnailUrl } from '../../extension/src/constants.module.js';

const bm = (videoId, timestamp, savedAt, extra = {}) => ({
  videoId,
  timestamp,
  id: savedAt,
  description: `at ${timestamp}`,
  ...extra,
});

describe('collectStoredBookmarks', () => {
  it('flattens bm_ keys and tags each bookmark with its video id', () => {
    const found = collectStoredBookmarks({
      bm_aaa: [{ timestamp: 10, id: 1 }, { timestamp: 20, id: 2 }],
      bm_bbb: [{ timestamp: 5, id: 3 }],
      videoTitles: { aaa: 'A' },
      bmUser: { isPro: true },
      vgroups: [],
      rem_aaa: { at: 1 },
    });
    assert.equal(found.length, 3);
    assert.deepEqual([...new Set(found.map(b => b.videoId))].sort(), ['aaa', 'bbb']);
  });

  it('ignores non-array bm_ values, empty ids and junk entries', () => {
    assert.deepEqual(collectStoredBookmarks({ bm_x: 'nope', bm_: [{ id: 1 }] }), []);
    assert.deepEqual(collectStoredBookmarks({ bm_a: [null, 'x', 7] }), []);
    assert.deepEqual(collectStoredBookmarks({}), []);
    assert.deepEqual(collectStoredBookmarks(null), []);
  });
});

describe('bookmarkSavedAt', () => {
  it('prefers createdAt, falling back to the id (which is Date.now() at save)', () => {
    assert.equal(bookmarkSavedAt({ createdAt: '2026-01-02T00:00:00.000Z' }), Date.parse('2026-01-02T00:00:00.000Z'));
    assert.equal(bookmarkSavedAt({ id: 1700 }), 1700);
    assert.equal(bookmarkSavedAt({ createdAt: 'not a date', id: 42 }), 42);
    assert.equal(bookmarkSavedAt({}), 0);
  });
});

describe('groupBookmarksByVideo', () => {
  it('groups by video, newest video first and newest moment first', () => {
    const groups = groupBookmarksByVideo([
      bm('old', 10, 100),
      bm('new', 30, 900),
      bm('old', 20, 300),
      bm('new', 40, 500),
    ]);
    assert.deepEqual(groups.map(g => g.videoId), ['new', 'old']);
    assert.deepEqual(groups[0].bookmarks.map(b => b.timestamp), [30, 40], 'newest saved first, not lowest timestamp');
    assert.deepEqual(groups[1].bookmarks.map(b => b.timestamp), [20, 10]);
  });

  it('skips entries with no video id', () => {
    assert.deepEqual(groupBookmarksByVideo([{ timestamp: 1 }]), []);
    assert.deepEqual(groupBookmarksByVideo(undefined), []);
  });
});

describe('resolveVideoTitle', () => {
  it('prefers a title stored on the bookmark, then the titles map', () => {
    assert.equal(resolveVideoTitle([{ videoTitle: 'On bookmark' }], { v: 'From map' }, 'v'), 'On bookmark');
    assert.equal(resolveVideoTitle([{}], { v: 'From map' }, 'v'), 'From map');
  });

  it('never returns an empty label', () => {
    assert.equal(resolveVideoTitle([{}], {}, 'v'), 'Untitled video');
    assert.equal(resolveVideoTitle([{ videoTitle: '' }], {}, 'v'), 'Untitled video');
    assert.equal(resolveVideoTitle(undefined, undefined, 'v'), 'Untitled video');
  });
});

describe('buildIdleVideoCards', () => {
  const bookmarks = [
    bm('vid1', 30, 900, { videoTitle: 'First video' }),
    bm('vid1', 10, 800),
    bm('vid1', 20, 700),
    bm('vid1', 50, 600),
    bm('vid2', 15, 400),
  ];

  it('builds one card per video with a full moment count', () => {
    const cards = buildIdleVideoCards({ bookmarks });
    assert.deepEqual(cards.map(c => c.videoId), ['vid1', 'vid2']);
    assert.equal(cards[0].momentCount, 4);
    assert.equal(cards[0].title, 'First video');
    assert.equal(cards[1].momentCount, 1);
  });

  it('caps the moments shown and reports the remainder', () => {
    const [card] = buildIdleVideoCards({ bookmarks, momentLimit: 3 });
    assert.equal(card.moments.length, 3);
    assert.equal(card.hiddenMomentCount, 1);
    // momentCount stays the true total — the card says "4 moments saved".
    assert.equal(momentCountLabel(card.momentCount), '4 moments saved');
  });

  it('deep-links the card header at the most recently saved moment', () => {
    const [card] = buildIdleVideoCards({ bookmarks });
    assert.equal(card.headerTimestamp, 30, 'newest saved moment, not the earliest timestamp');
  });

  it('limits how many cards are returned', () => {
    assert.equal(buildIdleVideoCards({ bookmarks, limit: 1 }).length, 1);
    assert.equal(buildIdleVideoCards({ bookmarks, limit: 0 }).length, 0);
  });

  it('falls back to the titles map and a placeholder description', () => {
    const [card] = buildIdleVideoCards({
      bookmarks: [bm('vid9', 5, 1, { description: '' })],
      videoTitles: { vid9: 'Mapped title' },
    });
    assert.equal(card.title, 'Mapped title');
    assert.equal(card.moments[0].description, 'Saved moment');
  });

  it('returns nothing for an empty store', () => {
    assert.deepEqual(buildIdleVideoCards({ bookmarks: [] }), []);
    assert.deepEqual(buildIdleVideoCards(), []);
  });
});

describe('buildDueSummary', () => {
  const isDue = (b) => !!b.due;

  it('counts due moments and picks the video with the most waiting', () => {
    const summary = buildDueSummary({
      bookmarks: [
        bm('a', 1, 10, { due: true }),
        bm('b', 2, 20, { due: true }),
        bm('b', 3, 30, { due: true }),
        bm('c', 4, 40),
      ],
      isDue,
    });
    assert.equal(summary.dueCount, 3);
    assert.equal(summary.primaryVideoId, 'b');
    assert.deepEqual(summary.videos.map(v => v.count), [2, 1]);
  });

  it('reports nothing due so the strip can be omitted entirely', () => {
    const summary = buildDueSummary({ bookmarks: [bm('a', 1, 10)], isDue });
    assert.equal(summary.dueCount, 0);
    assert.equal(summary.primaryVideoId, null);
    assert.deepEqual(summary.videos, []);
  });

  it('is inert without a due predicate rather than assuming everything is due', () => {
    const summary = buildDueSummary({ bookmarks: [bm('a', 1, 10)] });
    assert.equal(summary.dueCount, 0);
    assert.equal(summary.primaryVideoId, null);
  });

  it('treats a throwing predicate as not-due instead of breaking the panel', () => {
    const summary = buildDueSummary({
      bookmarks: [bm('a', 1, 10)],
      isDue: () => { throw new Error('bad bookmark'); },
    });
    assert.equal(summary.dueCount, 0);
  });
});

describe('dueBookmarksForVideo', () => {
  it('returns only that video\'s due moments, in playback order', () => {
    const due = dueBookmarksForVideo({
      bookmarks: [
        bm('a', 50, 10, { due: true }),
        bm('a', 20, 20, { due: true }),
        bm('a', 30, 30),
        bm('b', 5, 40, { due: true }),
      ],
      videoId: 'a',
      isDue: (b) => !!b.due,
    });
    assert.deepEqual(due.map(b => b.timestamp), [20, 50], 'recall walks the video front to back');
  });

  it('returns nothing without a video id or predicate', () => {
    assert.deepEqual(dueBookmarksForVideo({ bookmarks: [bm('a', 1, 1)], isDue: () => true }), []);
    assert.deepEqual(dueBookmarksForVideo({ bookmarks: [bm('a', 1, 1)], videoId: 'a' }), []);
    assert.deepEqual(dueBookmarksForVideo(), []);
  });
});

describe('integration with the shipped helpers', () => {
  it('agrees with the real Active Recall engine', () => {
    // Guards against the strip drifting from the scheduler: a bookmark with no
    // review schedule is not due, one scheduled in the past is.
    const now = Date.parse('2026-08-06T00:00:00.000Z');
    const notEnrolled = { videoId: 'a', timestamp: 1, id: 1, reviewSchedule: [] };
    const overdue = {
      videoId: 'b',
      timestamp: 2,
      id: 2,
      reviewSchedule: [1, 3, 7],
      createdAt: new Date(now - 5 * 86400000).toISOString(),
    };
    const summary = buildDueSummary({ bookmarks: [notEnrolled, overdue], isDue: isDueForRecall, now });
    assert.equal(summary.dueCount, 1);
    assert.equal(summary.primaryVideoId, 'b');
  });

  it('builds thumbnail URLs from the CDN the panel CSP has to allow', () => {
    // The cards render <img src> from this helper; if the host ever changes,
    // the side panel's image loading has to be re-verified.
    assert.equal(ytThumbnailUrl('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  });
});

describe('labels', () => {
  it('pluralise correctly', () => {
    assert.equal(momentCountLabel(1), '1 moment saved');
    assert.equal(momentCountLabel(3), '3 moments saved');
    assert.equal(dueCountLabel(1), '1 moment due for review');
    assert.equal(dueCountLabel(4), '4 moments due for review');
  });
});
