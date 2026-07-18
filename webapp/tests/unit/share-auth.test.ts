/**
 * /api/share unit tests (audit #3) — auth boundary, owner-spoof prevention,
 * input validation, and bookmark sorting, with injected fakes (no DB).
 * Free-tier limit against a real DB is covered in tests/integration/share.test.ts.
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleShare } from '../../app/api/share/handler.js';
import { makeFakeSupabase, makeRequest, type FakeCtx } from './fixtures/fakes.js';

function shareReq(body: unknown) {
  return makeRequest({ url: 'http://localhost/api/share', body: JSON.stringify(body) });
}

const proProfile = (ctx: FakeCtx) => {
  if (ctx.table === 'profiles') return { data: { is_pro: true } };
  if (ctx.table === 'collections' && ctx.op === 'insert') return { data: { id: 'col_1' } };
  if (ctx.table === 'collections') return { count: 1 };
  return { error: null };
};

describe('/api/share handler (#3)', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleShare(shareReq({ videoId: 'v', bookmarks: [{ timestamp: 1 }] }), {
      admin: client,
      getUserId: async () => null,
    });
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0, 'no DB work when unauthorized');
  });

  it('derives the owner from the token and ignores body.userId (spoof)', async () => {
    const { client, calls } = makeFakeSupabase(proProfile);
    const res = await handleShare(
      shareReq({ userId: 'victim', videoId: 'v', videoTitle: 't', bookmarks: [{ timestamp: 1 }] }),
      { admin: client, getUserId: async () => 'real-user' },
    );
    assert.equal(res.status, 201);
    const insert = calls.find((c) => c.table === 'collections' && c.op === 'insert');
    assert.ok(insert, 'expected a collections insert');
    assert.equal((insert!.payload as { user_id?: string }).user_id, 'real-user');
    assert.notEqual((insert!.payload as { user_id?: string }).user_id, 'victim');
  });

  it('returns 400 when videoId is missing', async () => {
    const { client } = makeFakeSupabase(proProfile);
    const res = await handleShare(shareReq({ bookmarks: [{ timestamp: 1 }] }), {
      admin: client,
      getUserId: async () => 'u1',
    });
    assert.equal(res.status, 400);
  });

  it('returns 400 when bookmarks is empty', async () => {
    const { client } = makeFakeSupabase(proProfile);
    const res = await handleShare(shareReq({ videoId: 'v', bookmarks: [] }), {
      admin: client,
      getUserId: async () => 'u1',
    });
    assert.equal(res.status, 400);
  });

  it('sorts bookmarks by timestamp before storing', async () => {
    const { client, calls } = makeFakeSupabase(proProfile);
    const res = await handleShare(
      shareReq({ videoId: 'v', bookmarks: [{ timestamp: 30 }, { timestamp: 10 }, { timestamp: 20 }] }),
      { admin: client, getUserId: async () => 'u1' },
    );
    assert.equal(res.status, 201);
    const insert = calls.find((c) => c.table === 'collections' && c.op === 'insert');
    const stored = (insert!.payload as { bookmarks: Array<{ timestamp: number }> }).bookmarks;
    assert.deepEqual(stored.map((b) => b.timestamp), [10, 20, 30]);
  });
});
