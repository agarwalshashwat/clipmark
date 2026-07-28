/**
 * /api/share integration tests (audit #3) — free-tier collection limit against
 * the real local-Supabase DB. Auth boundary + spoof are covered in the unit test;
 * here getUserId is injected to return a seeded user and admin is the real client.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleShare } from '../../app/api/share/handler.js';
import { adminClient } from './fixtures/supabase.js';
import { createTestUser, setProfileFlags } from './fixtures/seed.js';

const admin = adminClient();
const FREE_LIMIT = 5;

async function seedCollections(userId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const { error } = await admin
      .from('collections')
      .insert({ video_id: `vid_${userId.slice(0, 6)}_${i}`, user_id: userId, bookmarks: [] });
    assert.equal(error, null, `seed collection ${i} failed`);
  }
}

function share(userId: string, videoId = 'newvid') {
  return handleShare(
    { json: async () => ({ videoId, videoTitle: 't', bookmarks: [{ timestamp: 1 }] }) } as never,
    { admin, getUserId: async () => userId },
  );
}

describe('/api/share free-tier limit (#3, integration)', () => {
  it('lets a free user at 4 collections create a 5th (201)', async () => {
    const u = await createTestUser('share-free-4@example.test');
    await seedCollections(u.id, FREE_LIMIT - 1);
    const res = await share(u.id);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.shareId, 'returns a shareId');
  });

  it('blocks a free user already at the limit (403 free_limit_reached)', async () => {
    const u = await createTestUser('share-free-5@example.test');
    await seedCollections(u.id, FREE_LIMIT);
    const res = await share(u.id);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'free_limit_reached');
    assert.equal(body.limit, FREE_LIMIT);
  });

  it('lets a Pro user share past the free limit (201)', async () => {
    const u = await createTestUser('share-pro@example.test');
    await setProfileFlags(u.id, { is_pro: true });
    await seedCollections(u.id, FREE_LIMIT + 1);
    const res = await share(u.id);
    assert.equal(res.status, 201);
  });
});
