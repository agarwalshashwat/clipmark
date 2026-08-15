/**
 * Sync-engine revision integration tests (Phase 10a) — compare-and-swap
 * conflicts, revision monotonicity, legacy-PUT interop, and tombstone
 * round-trips against the real local-Supabase DB. Requires migration
 * 020_user_bookmarks_revision.sql to be applied (the harness migrates before
 * running). getAuthedUser is built from each user's real JWT so RLS applies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetBookmarks, handlePutBookmarks } from '../../app/api/bookmarks/handler.js';
import { adminClient, userClient } from './fixtures/supabase.js';
import { createTestUser, makePro, type TestUser } from './fixtures/seed.js';
import { makeRequest } from '../unit/fixtures/fakes.js';

const admin = adminClient();

function depsFor(user: TestUser) {
  return {
    admin,
    getAuthedUser: async () => ({ user: { id: user.id }, client: userClient(user.accessToken) }),
  };
}
const getReq = (videoId?: string, includeDeleted = false) =>
  makeRequest({
    url: `http://localhost/api/bookmarks?${videoId ? `videoId=${videoId}` : ''}${includeDeleted ? '&includeDeleted=1' : ''}`,
    method: 'GET',
  });
const putReq = (body: unknown) =>
  makeRequest({ url: 'http://localhost/api/bookmarks', method: 'PUT', body: JSON.stringify(body) });

const bm = (id: number, ts: number, extra: Record<string, unknown> = {}) => ({
  id, videoId: 'revvid', timestamp: ts, description: `bm${id}`,
  tags: [], color: '#8b5cf6', createdAt: new Date().toISOString(), videoTitle: 'T',
  ...extra,
});
const tomb = (id: number) => ({ id, deleted: true, deletedAt: new Date().toISOString() });

describe('sync revisions (Phase 10a, integration)', () => {
  it('revision increments monotonically across writes and is reported by GET', async () => {
    const u = await createTestUser('rev-mono@example.test');
    await makePro(u.id);

    // baseRevision 0 creates the row at revision 1.
    const create = await handlePutBookmarks(
      putReq({ videoId: 'mono', bookmarks: [bm(1, 5)], baseRevision: 0 }),
      depsFor(u),
    );
    assert.equal(create.status, 200);
    assert.equal((await create.json()).revision, 1);

    const get1 = await handleGetBookmarks(getReq('mono'), depsFor(u));
    assert.equal((await get1.json()).revision, 1);

    // CAS write on top of revision 1 → revision 2.
    const cas = await handlePutBookmarks(
      putReq({ videoId: 'mono', bookmarks: [bm(1, 5), bm(2, 9)], baseRevision: 1 }),
      depsFor(u),
    );
    assert.equal(cas.status, 200);
    assert.equal((await cas.json()).revision, 2);

    const get2 = await handleGetBookmarks(getReq('mono'), depsFor(u));
    const body2 = await get2.json();
    assert.equal(body2.revision, 2);
    assert.equal(body2.bookmarks.length, 2);
  });

  it('two writers from the same base: the second gets 409 carrying the current server state', async () => {
    const u = await createTestUser('rev-race@example.test');
    await makePro(u.id);

    await handlePutBookmarks(putReq({ videoId: 'race', bookmarks: [bm(1, 5)], baseRevision: 0 }), depsFor(u));

    // Device A wins the write from base 1.
    const a = await handlePutBookmarks(
      putReq({ videoId: 'race', bookmarks: [bm(1, 5), bm(2, 10)], baseRevision: 1 }),
      depsFor(u),
    );
    assert.equal(a.status, 200);
    assert.equal((await a.json()).revision, 2);

    // Device B writes from the same (now stale) base 1 → conflict, not clobber.
    const b = await handlePutBookmarks(
      putReq({ videoId: 'race', bookmarks: [bm(1, 5), bm(3, 20)], baseRevision: 1 }),
      depsFor(u),
    );
    assert.equal(b.status, 409);
    const conflict = await b.json();
    assert.equal(conflict.error, 'revision_conflict');
    assert.equal(conflict.revision, 2, '409 carries the revision to retry against');
    assert.equal(conflict.bookmarks.length, 2, '409 carries A\'s state so B can re-merge');
    assert.ok(conflict.bookmarks.some((x: { id: number }) => x.id === 2), 'A\'s write survived');

    // B's losing write must not have landed.
    const now = await (await handleGetBookmarks(getReq('race'), depsFor(u))).json();
    assert.ok(!now.bookmarks.some((x: { id: number }) => x.id === 3));
  });

  it('losing the creation race (both send baseRevision 0) → 409 with the winner\'s row', async () => {
    const u = await createTestUser('rev-create-race@example.test');
    await makePro(u.id);

    const first = await handlePutBookmarks(putReq({ videoId: 'crace', bookmarks: [bm(1, 5)], baseRevision: 0 }), depsFor(u));
    assert.equal(first.status, 200);

    const second = await handlePutBookmarks(putReq({ videoId: 'crace', bookmarks: [bm(2, 9)], baseRevision: 0 }), depsFor(u));
    assert.equal(second.status, 409);
    const conflict = await second.json();
    assert.equal(conflict.revision, 1);
    assert.equal(conflict.bookmarks[0].id, 1);
  });

  it('baseRevision > 0 against a row that does not exist → 409 with revision 0', async () => {
    const u = await createTestUser('rev-norow@example.test');
    await makePro(u.id);

    const res = await handlePutBookmarks(putReq({ videoId: 'ghost', bookmarks: [bm(1, 5)], baseRevision: 3 }), depsFor(u));
    assert.equal(res.status, 409);
    const conflict = await res.json();
    assert.equal(conflict.revision, 0);
    assert.deepEqual(conflict.bookmarks, []);
  });

  it('legacy PUT (no baseRevision) still 200s and keeps the revision moving', async () => {
    const u = await createTestUser('rev-legacy@example.test');
    await makePro(u.id);

    // Legacy client creates the row.
    const first = await handlePutBookmarks(putReq({ videoId: 'legacy', bookmarks: [bm(1, 5)] }), depsFor(u));
    assert.equal(first.status, 200);
    assert.equal((await first.json()).revision, 1);

    // Sync client writes on top with CAS.
    const cas = await handlePutBookmarks(putReq({ videoId: 'legacy', bookmarks: [bm(1, 5), bm(2, 9)], baseRevision: 1 }), depsFor(u));
    assert.equal((await cas.json()).revision, 2);

    // Legacy client blind-writes again — allowed (last-write-wins), and the
    // bump means a sync client's stale base 2 now conflicts instead of
    // silently crossing the legacy write.
    const legacy = await handlePutBookmarks(putReq({ videoId: 'legacy', bookmarks: [bm(1, 5)] }), depsFor(u));
    assert.equal(legacy.status, 200);
    assert.equal((await legacy.json()).revision, 3);

    const stale = await handlePutBookmarks(putReq({ videoId: 'legacy', bookmarks: [bm(9, 90)], baseRevision: 2 }), depsFor(u));
    assert.equal(stale.status, 409);
  });

  it('tombstones round-trip via includeDeleted=1 and are hidden by default', async () => {
    const u = await createTestUser('rev-tomb@example.test');
    await makePro(u.id);

    const dead = tomb(2);
    await handlePutBookmarks(
      putReq({ videoId: 'tombvid', bookmarks: [bm(1, 5), dead], baseRevision: 0 }),
      depsFor(u),
    );

    // Default GET (legacy clients): tombstone hidden, single video and all-videos.
    const plain = await (await handleGetBookmarks(getReq('tombvid'), depsFor(u))).json();
    assert.equal(plain.bookmarks.length, 1);
    assert.equal(plain.bookmarks[0].id, 1);

    const all = await (await handleGetBookmarks(getReq(), depsFor(u))).json();
    const row = all.videos.find((v: { videoId: string }) => v.videoId === 'tombvid');
    assert.equal(row.bookmarks.length, 1);
    assert.equal(row.revision, 1);

    // Sync engine GET: the raw wire array, tombstone intact.
    const raw = await (await handleGetBookmarks(getReq('tombvid', true), depsFor(u))).json();
    assert.equal(raw.bookmarks.length, 2);
    const stored = raw.bookmarks.find((x: { id: number }) => x.id === 2);
    assert.deepEqual(stored, dead, 'tombstone survives the JSONB round-trip verbatim');
  });

  it('rejects a malformed tombstone server-side and writes nothing', async () => {
    const u = await createTestUser('rev-tomb-bad@example.test');
    await makePro(u.id);

    const res = await handlePutBookmarks(
      putReq({ videoId: 'tombbad', bookmarks: [{ id: 1, deleted: true, deletedAt: 'x', timestamp: 5 }], baseRevision: 0 }),
      depsFor(u),
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_tombstone');

    const { count } = await admin
      .from('user_bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .eq('video_id', 'tombbad');
    assert.equal(count, 0);
  });
});
