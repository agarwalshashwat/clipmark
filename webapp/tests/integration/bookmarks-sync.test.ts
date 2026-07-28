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
