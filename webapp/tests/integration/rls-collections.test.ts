/**
 * RLS: collections insert/update lockdown + view-count RPC (audit #1, integration).
 * Migration 012 scoped INSERT to the owner, removed the open UPDATE policy, and
 * exposed increment_collection_view as the only anonymous write path.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { adminClient, anonClient, userClient } from './fixtures/supabase.js';
import { createTestUser, type TestUser } from './fixtures/seed.js';

const admin = adminClient();

describe('RLS: collections (#1)', () => {
  let owner: TestUser;
  let other: TestUser;
  before(async () => {
    owner = await createTestUser('rls-col-owner@example.test');
    other = await createTestUser('rls-col-other@example.test');
  });

  it('anonymous INSERT is rejected', async () => {
    const { data, error } = await anonClient()
      .from('collections')
      .insert({ video_id: 'anon_vid', user_id: owner.id, bookmarks: [] })
      .select('id');
    assert.ok(error, 'anon insert should be rejected by RLS');
    assert.ok(!data || (data as unknown[]).length === 0);
  });

  it('authenticated INSERT with own user_id succeeds', async () => {
    const { data, error } = await userClient(owner.accessToken)
      .from('collections')
      .insert({ video_id: 'own_vid', user_id: owner.id, bookmarks: [] })
      .select('id');
    assert.equal(error, null);
    assert.equal(data?.length, 1);
  });

  it('authenticated INSERT spoofing another user_id is rejected', async () => {
    const { error } = await userClient(owner.accessToken)
      .from('collections')
      .insert({ video_id: 'spoof_vid', user_id: other.id, bookmarks: [] })
      .select('id');
    assert.ok(error, 'insert with a foreign user_id must fail the WITH CHECK');
  });

  it('a non-owner cannot UPDATE a collection (no UPDATE policy)', async () => {
    // Seed a collection owned by `owner` via the service role.
    const { data: seeded } = await admin
      .from('collections')
      .insert({ video_id: 'update_target', user_id: owner.id, bookmarks: [], video_title: 'orig' })
      .select('id')
      .single();
    const id = (seeded as { id: string }).id;

    // Another authenticated user tries to hijack it.
    await userClient(other.accessToken)
      .from('collections')
      .update({ video_title: 'hijacked' })
      .eq('id', id);

    const { data: after } = await admin.from('collections').select('video_title').eq('id', id).single();
    assert.equal((after as { video_title: string }).video_title, 'orig', 'row must be unchanged');
  });

  it('increment_collection_view RPC bumps only view_count, callable anonymously', async () => {
    const { data: seeded } = await admin
      .from('collections')
      .insert({ video_id: 'view_target', user_id: owner.id, bookmarks: [], video_title: 'vt' })
      .select('id, view_count')
      .single();
    const id = (seeded as { id: string }).id;

    const anon = anonClient();
    await anon.rpc('increment_collection_view', { collection_id: id });
    await anon.rpc('increment_collection_view', { collection_id: id });

    const { data: after } = await admin
      .from('collections')
      .select('view_count, video_title')
      .eq('id', id)
      .single();
    const row = after as { view_count: number; video_title: string };
    assert.equal(row.view_count, 2, 'view_count incremented twice');
    assert.equal(row.video_title, 'vt', 'no other column touched');
  });
});
