/**
 * user_bookmarks RLS integration tests — direct PostgREST access with real
 * JWTs, bypassing the route entirely. Proves the database-level Pro gate from
 * migrations/016_user_bookmarks_pro_rls.sql:
 *
 *   * writes (INSERT/UPDATE) require ownership AND is_pro — the anon key is
 *     public and the extension holds the user's own JWT, so the route's 403
 *     alone would not stop a non-Pro client POSTing straight to
 *     /rest/v1/user_bookmarks;
 *   * SELECT and DELETE require ownership only — a lapsed subscriber must
 *     still be able to read back and delete data they already own.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminClient, userClient } from './fixtures/supabase.js';
import { createTestUser, makePro, setProfileFlags } from './fixtures/seed.js';

const admin = adminClient();

const bm = (id: number) => ({
  id, videoId: 'rlsvid', timestamp: id, description: `bm${id}`,
  tags: [], color: '#8b5cf6', createdAt: new Date().toISOString(), videoTitle: 'T',
});

async function rowCount(userId: string, videoId: string): Promise<number> {
  const { count } = await admin
    .from('user_bookmarks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('video_id', videoId);
  return count ?? 0;
}

describe('user_bookmarks RLS (migration 016, integration)', () => {
  it('a non-Pro user\'s direct INSERT is rejected by RLS', async () => {
    const free = await createTestUser('rls-bm-free-insert@example.test');

    const { error } = await userClient(free.accessToken)
      .from('user_bookmarks')
      .insert({ user_id: free.id, video_id: 'rlsvid', bookmarks: [bm(1)] });

    // Whether PostgREST reports the policy violation or silently writes
    // nothing, the row must not exist.
    assert.equal(await rowCount(free.id, 'rlsvid'), 0,
      `direct insert left a row behind (error was ${error?.message ?? 'none'})`);
  });

  it('a non-Pro user\'s direct UPDATE of an existing row writes 0 rows', async () => {
    const free = await createTestUser('rls-bm-free-update@example.test');
    // Seed the row via service role (bypasses RLS) so there is something to hit.
    await admin.from('user_bookmarks').insert({
      user_id: free.id, video_id: 'rlsvid', bookmarks: [bm(1)], revision: 1,
    });

    const { data } = await userClient(free.accessToken)
      .from('user_bookmarks')
      .update({ bookmarks: [bm(1), bm(2)], revision: 2 })
      .eq('user_id', free.id)
      .eq('video_id', 'rlsvid')
      .select('revision');
    assert.equal(data?.length ?? 0, 0, 'UPDATE policy requires Pro — 0 rows must match');

    const { data: after } = await admin
      .from('user_bookmarks')
      .select('bookmarks, revision')
      .eq('user_id', free.id)
      .eq('video_id', 'rlsvid')
      .single();
    assert.equal((after!.bookmarks as unknown[]).length, 1, 'row content untouched');
    assert.equal(after!.revision, 1, 'revision untouched');
  });

  it('a LAPSED user keeps SELECT and DELETE on their own rows but loses UPDATE', async () => {
    const u = await createTestUser('rls-bm-lapsed@example.test');
    await makePro(u.id);

    // While Pro: a direct write works (this is the legitimate sync path).
    const { error: insertErr } = await userClient(u.accessToken)
      .from('user_bookmarks')
      .insert({ user_id: u.id, video_id: 'rlsvid', bookmarks: [bm(1)], revision: 1 });
    assert.equal(insertErr, null, 'a Pro user\'s own insert must pass RLS');
    assert.equal(await rowCount(u.id, 'rlsvid'), 1);

    // Subscription lapses.
    await setProfileFlags(u.id, { is_pro: false });

    // SELECT still works — a lapsed subscriber can read back data they own
    // (the product's gate on reading down is the route's 403, not RLS).
    const { data: readBack } = await userClient(u.accessToken)
      .from('user_bookmarks')
      .select('bookmarks, revision')
      .eq('user_id', u.id)
      .eq('video_id', 'rlsvid');
    assert.equal(readBack?.length, 1, 'lapsed user must still see their own row');

    // UPDATE no longer matches any row.
    const { data: updated } = await userClient(u.accessToken)
      .from('user_bookmarks')
      .update({ bookmarks: [bm(1), bm(2)], revision: 2 })
      .eq('user_id', u.id)
      .eq('video_id', 'rlsvid')
      .select('revision');
    assert.equal(updated?.length ?? 0, 0, 'lapsed user must not be able to update');
    const { data: after } = await admin
      .from('user_bookmarks')
      .select('revision')
      .eq('user_id', u.id)
      .eq('video_id', 'rlsvid')
      .single();
    assert.equal(after!.revision, 1, 'the blocked update changed nothing');

    // DELETE still works — a lapsed user must always be able to delete their data.
    const { error: delErr } = await userClient(u.accessToken)
      .from('user_bookmarks')
      .delete()
      .eq('user_id', u.id)
      .eq('video_id', 'rlsvid');
    assert.equal(delErr, null);
    assert.equal(await rowCount(u.id, 'rlsvid'), 0, 'lapsed user\'s delete must land');
  });
});
