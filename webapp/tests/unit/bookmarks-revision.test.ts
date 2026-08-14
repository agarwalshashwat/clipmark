/**
 * /api/bookmarks revision + tombstone unit tests (Phase 10a sync) — the
 * compare-and-swap PUT paths, legacy PUT interop, tombstone filtering on GET,
 * and tombstone shape validation, all with injected fakes. Real-DB CAS races
 * and RLS live in tests/integration/sync-revision.test.ts.
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetBookmarks, handlePutBookmarks } from '../../app/api/bookmarks/handler.js';
import { makeFakeSupabase, makeRequest, type FakeCtx, type Responder } from './fixtures/fakes.js';

const live = { id: 100, videoId: 'v', timestamp: 12, description: 'note', tags: [], color: '#111', createdAt: '2026-01-01T00:00:00Z', videoTitle: 'T' };
const tomb = { id: 200, deleted: true, deletedAt: '2026-02-02T00:00:00Z' };

// deps for a Pro caller whose user_bookmarks queries hit `responder`.
function proDeps(responder: Responder) {
  const fake = makeFakeSupabase(responder);
  return {
    deps: {
      admin: makeFakeSupabase((ctx: FakeCtx) =>
        ctx.table === 'profiles' ? { data: { is_pro: true } } : { error: null },
      ).client,
      getAuthedUser: async () => ({ user: { id: 'u1' }, client: fake.client }),
    },
    calls: fake.calls,
  };
}

const getReq = (qs = '?videoId=v') =>
  makeRequest({ url: `http://localhost/api/bookmarks${qs}`, method: 'GET' });
const putReq = (body: unknown) =>
  makeRequest({ url: 'http://localhost/api/bookmarks', method: 'PUT', body: JSON.stringify(body) });

const revisionFilter = (ctx: FakeCtx) => ctx.filters.find(([m, col]) => m === 'eq' && col === 'revision');

describe('PUT /api/bookmarks — compare-and-swap (baseRevision)', () => {
  it('matching baseRevision swaps in the new array and bumps revision', async () => {
    const { deps, calls } = proDeps((ctx) =>
      ctx.op === 'update' ? { data: [{ revision: 4 }] } : { data: null },
    );
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [live, tomb], baseRevision: 3 }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, revision: 4 });

    const update = calls.find(c => c.op === 'update')!;
    assert.equal((update.payload as { revision: number }).revision, 4, 'writes baseRevision + 1');
    assert.deepEqual(revisionFilter(update), ['eq', 'revision', 3], 'CAS predicate on the revision the client saw');
  });

  it('stale baseRevision → 409 with the raw wire array (tombstones included) + current revision', async () => {
    const { deps } = proDeps((ctx) => {
      if (ctx.op === 'update') return { data: [] }; // CAS matched 0 rows
      return { data: { bookmarks: [live, tomb], revision: 7, updated_at: '2026-03-03T00:00:00Z' } };
    });
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [live], baseRevision: 5 }), deps);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'revision_conflict');
    assert.equal(body.revision, 7);
    assert.equal(body.updatedAt, '2026-03-03T00:00:00Z');
    assert.equal(body.bookmarks.length, 2, 'conflict payload is raw — the engine re-merges from tombstones too');
    assert.equal(body.bookmarks[1].deleted, true);
  });

  it('baseRevision > 0 against a row that no longer exists → 409 with revision 0', async () => {
    const { deps } = proDeps((ctx) =>
      ctx.op === 'update' ? { data: [] } : { data: null }, // conflict fetch: no row
    );
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [live], baseRevision: 2 }), deps);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.revision, 0);
    assert.deepEqual(body.bookmarks, []);
  });

  it('baseRevision 0 inserts the row at revision 1', async () => {
    const { deps, calls } = proDeps(() => ({ data: null, error: null }));
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [live], baseRevision: 0 }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, revision: 1 });

    const insert = calls.find(c => c.op === 'insert')!;
    assert.ok(insert, 'creation path is a plain insert, not an upsert');
    assert.equal((insert.payload as { revision: number }).revision, 1);
  });

  it('baseRevision 0 losing the creation race (unique violation) → 409 with the winner\'s row', async () => {
    const { deps } = proDeps((ctx) => {
      if (ctx.op === 'insert') return { error: { code: '23505', message: 'duplicate key' } };
      return { data: { bookmarks: [tomb], revision: 1, updated_at: '2026-04-04T00:00:00Z' } };
    });
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [live], baseRevision: 0 }), deps);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'revision_conflict');
    assert.equal(body.revision, 1);
  });

  it('rejects a malformed baseRevision → 400', async () => {
    for (const bad of [-1, 1.5, 'three', null]) {
      const { deps } = proDeps(() => ({ data: null }));
      const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [], baseRevision: bad }), deps);
      assert.equal(res.status, 400, `baseRevision ${JSON.stringify(bad)} must be rejected`);
    }
  });
});

describe('PUT /api/bookmarks — legacy path (no baseRevision)', () => {
  it('still 200s with a blind upsert, but bumps the existing revision', async () => {
    const { deps, calls } = proDeps((ctx) =>
      ctx.op === 'select' ? { data: { revision: 2 } } : { data: null },
    );
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [live] }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, revision: 3 });

    // upsert registers as op 'update' in the fake, with no CAS predicate.
    const write = calls.find(c => c.op === 'update')!;
    assert.equal((write.payload as { revision: number }).revision, 3);
    assert.equal(revisionFilter(write), undefined, 'legacy write is unconditional');
  });

  it('starts a brand-new row at revision 1', async () => {
    const { deps, calls } = proDeps((ctx) =>
      ctx.op === 'select' ? { data: null } : { data: null },
    );
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [live] }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, revision: 1 });
    assert.equal((calls.find(c => c.op === 'update')!.payload as { revision: number }).revision, 1);
  });
});

describe('GET /api/bookmarks — tombstone filtering', () => {
  const row = { bookmarks: [live, tomb], updated_at: '2026-05-05T00:00:00Z', revision: 6 };

  it('filters tombstones by default (single video) and reports the revision', async () => {
    const { deps } = proDeps(() => ({ data: row }));
    const res = await handleGetBookmarks(getReq(), deps);
    const body = await res.json();
    assert.equal(body.bookmarks.length, 1, 'legacy clients must never see tombstones');
    assert.equal(body.bookmarks[0].id, live.id);
    assert.equal(body.revision, 6);
  });

  it('includeDeleted=1 returns the raw wire array (sync engine path)', async () => {
    const { deps } = proDeps(() => ({ data: row }));
    const res = await handleGetBookmarks(getReq('?videoId=v&includeDeleted=1'), deps);
    const body = await res.json();
    assert.equal(body.bookmarks.length, 2);
    assert.equal(body.bookmarks[1].deleted, true);
  });

  it('reports revision 0 for a video with no row yet', async () => {
    const { deps } = proDeps(() => ({ data: null, error: { code: 'PGRST116' } }));
    const body = await (await handleGetBookmarks(getReq(), deps)).json();
    assert.deepEqual(body, { bookmarks: [], updatedAt: null, revision: 0 });
  });

  it('filters tombstones per video in the all-videos response, and includeDeleted=1 keeps them', async () => {
    const rows = [{ video_id: 'v', bookmarks: [live, tomb], updated_at: 'x', revision: 6 }];
    const { deps } = proDeps(() => ({ data: rows }));
    const filtered = await (await handleGetBookmarks(getReq(''), deps)).json();
    assert.equal(filtered.videos[0].bookmarks.length, 1);
    assert.equal(filtered.videos[0].revision, 6);

    const { deps: deps2 } = proDeps(() => ({ data: rows }));
    const raw = await (await handleGetBookmarks(getReq('?includeDeleted=1'), deps2)).json();
    assert.equal(raw.videos[0].bookmarks.length, 2);
  });
});

describe('PUT /api/bookmarks — tombstone shape validation', () => {
  const put = async (bookmarks: unknown[]) => {
    const { deps } = proDeps(() => ({ data: null }));
    return handlePutBookmarks(putReq({ videoId: 'v', bookmarks }), deps);
  };

  it('accepts a well-formed tombstone alongside live bookmarks', async () => {
    assert.equal((await put([live, tomb])).status, 200);
  });

  it('rejects a tombstone missing a numeric id or string deletedAt → 400 invalid_tombstone', async () => {
    for (const bad of [
      { deleted: true, deletedAt: 'x' },                 // no id
      { id: '200', deleted: true, deletedAt: 'x' },      // non-numeric id
      { id: 200, deleted: true },                        // no deletedAt
      { id: 200, deleted: true, deletedAt: 42 },         // non-string deletedAt
    ]) {
      const res = await put([bad]);
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, 'invalid_tombstone');
    }
  });

  it('rejects a half-live tombstone carrying playback fields → 400 invalid_tombstone', async () => {
    for (const bad of [
      { ...tomb, timestamp: 12 },
      { ...tomb, loop: { end: 20 } },
    ]) {
      const res = await put([bad]);
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, 'invalid_tombstone');
    }
  });

  it('loop validation still runs alongside — an inverted range in the same payload → 400 invalid_loop', async () => {
    const res = await put([tomb, { id: 1, timestamp: 75, loop: { end: 42 } }]);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_loop');
  });
});
