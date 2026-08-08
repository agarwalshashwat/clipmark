/**
 * Cloud sync integration tests (audit #4) — Pro-gate, upsert round-trip, and
 * cross-user isolation against the real local-Supabase DB. getAuthedUser is
 * built from each user's real JWT so RLS (auth.uid()) applies to auth.client.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetBookmarks, handlePutBookmarks } from '../../app/api/bookmarks/handler.js';
import { adminClient, userClient } from './fixtures/supabase.js';
import { createTestUser, makePro, type TestUser } from './fixtures/seed.js';
import { makeRequest } from '../unit/fixtures/fakes.js';

const admin = adminClient();

// deps whose auth resolves to a specific user with their JWT-scoped client.
function depsFor(user: TestUser) {
  return {
    admin,
    getAuthedUser: async () => ({ user: { id: user.id }, client: userClient(user.accessToken) }),
  };
}
const getReq = (videoId?: string) =>
  makeRequest({
    url: `http://localhost/api/bookmarks${videoId ? `?videoId=${videoId}` : ''}`,
    method: 'GET',
  });
const putReq = (body: unknown) =>
  makeRequest({ url: 'http://localhost/api/bookmarks', method: 'PUT', body: JSON.stringify(body) });

describe('cloud sync (#4, integration)', () => {
  it('non-Pro user is blocked (403) on GET and PUT', async () => {
    const free = await createTestUser('sync-free@example.test'); // is_pro defaults false
    assert.equal((await handleGetBookmarks(getReq('v1'), depsFor(free))).status, 403);
    assert.equal(
      (await handlePutBookmarks(putReq({ videoId: 'v1', bookmarks: [] }), depsFor(free))).status,
      403,
    );
  });

  it('Pro user PUT → GET round-trips and upserts (no duplicate row)', async () => {
    const u = await createTestUser('sync-pro@example.test');
    await makePro(u.id);

    const first = await handlePutBookmarks(
      putReq({ videoId: 'vidX', bookmarks: [{ timestamp: 5 }] }),
      depsFor(u),
    );
    assert.equal(first.status, 200);

    const get1 = await handleGetBookmarks(getReq('vidX'), depsFor(u));
    assert.equal((await get1.json()).bookmarks.length, 1);

    // Second PUT for the same (user, video) updates in place.
    await handlePutBookmarks(putReq({ videoId: 'vidX', bookmarks: [{ timestamp: 5 }, { timestamp: 9 }] }), depsFor(u));
    const get2 = await handleGetBookmarks(getReq('vidX'), depsFor(u));
    assert.equal((await get2.json()).bookmarks.length, 2);

    // Exactly one row for (user, video) — upsert, not insert.
    const { count } = await admin
      .from('user_bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .eq('video_id', 'vidX');
    assert.equal(count, 1);
  });

  it('a Pro user cannot read another Pro user\'s bookmarks', async () => {
    const a = await createTestUser('sync-a@example.test');
    const b = await createTestUser('sync-b@example.test');
    await makePro(a.id);
    await makePro(b.id);

    await handlePutBookmarks(putReq({ videoId: 'shared', bookmarks: [{ timestamp: 1 }] }), depsFor(a));

    // Via the handler: B asks for the same videoId → gets nothing (scoped to B).
    const bGet = await handleGetBookmarks(getReq('shared'), depsFor(b));
    assert.equal((await bGet.json()).bookmarks.length, 0);

    // Defense in depth: B's JWT client cannot read A's row directly (RLS).
    const { data: leak } = await userClient(b.accessToken)
      .from('user_bookmarks')
      .select('bookmarks')
      .eq('user_id', a.id)
      .eq('video_id', 'shared');
    assert.equal(leak?.length ?? 0, 0, 'RLS must hide another user\'s row');
  });
});

// ─── Saved A–B loops ─────────────────────────────────────────────────────────
// A saved loop is an ordinary bookmark carrying `loop: { end }` — it has no
// route of its own, so its Pro gate IS this route's gate. These run against the
// real DB with real JWTs, so RLS applies: this is the server-side proof that a
// non-Pro user cannot persist or sync a loop, whatever the client believes.
describe('saved A–B loops (#4, integration)', () => {
  const loop = (id: number, start: number, end: number, name = 'Hard bit') => ({
    id, videoId: 'loopvid', timestamp: start, description: name,
    tags: [], color: '#8b5cf6', createdAt: new Date().toISOString(),
    videoTitle: 'T', reviewSchedule: [1, 3, 7], lastReviewed: null,
    loop: { end },
  });

  it('a non-Pro user cannot PERSIST a saved loop (403) and nothing is written', async () => {
    const free = await createTestUser('loop-free@example.test');

    const res = await handlePutBookmarks(
      putReq({ videoId: 'loopvid', bookmarks: [loop(1, 30, 40)] }),
      depsFor(free),
    );
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'pro_required');

    // The row must genuinely not exist — a 403 that still wrote would be the bug.
    const { count } = await admin
      .from('user_bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', free.id)
      .eq('video_id', 'loopvid');
    assert.equal(count, 0, 'a rejected loop must leave no row behind');
  });

  it('a non-Pro user cannot SYNC saved loops back down (403)', async () => {
    const free = await createTestUser('loop-free-read@example.test');
    assert.equal((await handleGetBookmarks(getReq('loopvid'), depsFor(free))).status, 403);
    assert.equal((await handleGetBookmarks(getReq(), depsFor(free))).status, 403);
  });

  it('a non-Pro user cannot bypass the handler and write the row directly (RLS)', async () => {
    const free = await createTestUser('loop-free-rls@example.test');
    const { error } = await userClient(free.accessToken)
      .from('user_bookmarks')
      .upsert({ user_id: free.id, video_id: 'loopvid', bookmarks: [loop(2, 10, 20)] });
    // Whether RLS rejects outright or silently filters, no row may result.
    const { count } = await admin
      .from('user_bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', free.id)
      .eq('video_id', 'loopvid');
    assert.equal(count ?? 0, 0, `direct write left a row behind (error was ${error?.message ?? 'none'})`);
  });

  it('a Pro user round-trips a saved loop with its range intact', async () => {
    const u = await createTestUser('loop-pro@example.test');
    await makePro(u.id);

    assert.equal(
      (await handlePutBookmarks(putReq({ videoId: 'loopvid', bookmarks: [loop(3, 30, 40, 'Chorus')] }), depsFor(u))).status,
      200,
    );

    const got = await handleGetBookmarks(getReq('loopvid'), depsFor(u));
    const [stored] = (await got.json()).bookmarks;
    assert.equal(stored.timestamp, 30, 'A point survives the JSONB round-trip');
    assert.equal(stored.loop.end, 40, 'B point survives the JSONB round-trip');
    assert.equal(stored.description, 'Chorus');
    assert.deepEqual(stored.reviewSchedule, [1, 3, 7], 'still a recall card after syncing');
  });

  it('rejects a malformed range server-side even for a Pro user (400)', async () => {
    const u = await createTestUser('loop-pro-bad@example.test');
    await makePro(u.id);

    for (const bad of [loop(4, 40, 30), { ...loop(5, 10, 20), loop: { end: 'x' } }]) {
      const res = await handlePutBookmarks(
        putReq({ videoId: 'loopbad', bookmarks: [bad] }),
        depsFor(u),
      );
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, 'invalid_loop');
    }

    const { count } = await admin
      .from('user_bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .eq('video_id', 'loopbad');
    assert.equal(count, 0);
  });
});
