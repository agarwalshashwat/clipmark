/**
 * lib/bookmarks wire-format helpers (Phase 10a sync) — tombstone detection,
 * live filtering, and tombstone construction. The handler-level behaviour
 * these feed is covered in bookmarks-revision.test.ts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTombstone, liveBookmarks, makeTombstone } from '../../lib/bookmarks.js';

const live = { id: 1, videoId: 'v', timestamp: 5, description: '', tags: [], color: '#111', createdAt: 'x', videoTitle: null };
const tomb = { id: 2, deleted: true, deletedAt: '2026-01-01T00:00:00Z' };

describe('isTombstone', () => {
  it('recognises a tombstone by deleted: true', () => {
    assert.equal(isTombstone(tomb), true);
    assert.equal(isTombstone(makeTombstone(3, 'now')), true);
  });

  it('does not flag live bookmarks or junk', () => {
    assert.equal(isTombstone(live), false);
    assert.equal(isTombstone({ ...live, deleted: false }), false);
    assert.equal(isTombstone({ ...live, deleted: 'true' }), false, 'deleted must be exactly true');
    assert.equal(isTombstone(null), false);
    assert.equal(isTombstone(undefined), false);
    assert.equal(isTombstone('deleted'), false);
    assert.equal(isTombstone(42), false);
  });
});

describe('liveBookmarks', () => {
  it('filters tombstones and keeps live entries in order', () => {
    assert.deepEqual(liveBookmarks([tomb, live, makeTombstone(9, 'x')]), [live]);
  });

  it('passes a tombstone-free array through unchanged', () => {
    assert.deepEqual(liveBookmarks([live]), [live]);
    assert.deepEqual(liveBookmarks([]), []);
  });

  it('returns a fresh array (callers sort in place)', () => {
    const input = [live];
    assert.notEqual(liveBookmarks(input), input);
  });

  it('tolerates null/undefined/non-array rows → []', () => {
    assert.deepEqual(liveBookmarks(null), []);
    assert.deepEqual(liveBookmarks(undefined), []);
    assert.deepEqual(liveBookmarks('nope'), []);
    assert.deepEqual(liveBookmarks({ bookmarks: [live] }), []);
  });
});

describe('makeTombstone', () => {
  it('builds the minimal wire shape and nothing else', () => {
    const t = makeTombstone(7, '2026-02-02T00:00:00Z');
    assert.deepEqual(t, { id: 7, deleted: true, deletedAt: '2026-02-02T00:00:00Z' });
    assert.deepEqual(Object.keys(t).sort(), ['deleted', 'deletedAt', 'id']);
  });
});
