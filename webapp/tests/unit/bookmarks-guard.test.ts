/**
 * /api/bookmarks unit tests (audit #4) — auth + Pro-gate + input validation,
 * with injected fakes. Cross-user RLS isolation is covered in
 * tests/integration/bookmarks-sync.test.ts.
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetBookmarks, handlePutBookmarks, validateLoopFields } from '../../app/api/bookmarks/handler.js';
import { makeFakeSupabase, makeRequest, type FakeCtx } from './fixtures/fakes.js';

const benignClient = () => makeFakeSupabase(() => ({ data: [], error: null })).client;
const authed = (isPro: boolean) => ({
  admin: makeFakeSupabase((ctx: FakeCtx) =>
    ctx.table === 'profiles' ? { data: { is_pro: isPro } } : { error: null },
  ).client,
  getAuthedUser: async () => ({ user: { id: 'u1' }, client: benignClient() }),
});
const unauth = () => ({
  admin: makeFakeSupabase(() => ({ error: null })).client,
  getAuthedUser: async () => null,
});

const getReq = () => makeRequest({ url: 'http://localhost/api/bookmarks?videoId=v', method: 'GET' });
const putReq = (body: unknown) =>
  makeRequest({ url: 'http://localhost/api/bookmarks', method: 'PUT', body: JSON.stringify(body) });

describe('/api/bookmarks guards (#4)', () => {
  it('GET unauthenticated → 401', async () => {
    assert.equal((await handleGetBookmarks(getReq(), unauth())).status, 401);
  });

  it('PUT unauthenticated → 401', async () => {
    assert.equal((await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [] }), unauth())).status, 401);
  });

  it('GET as a non-Pro user → 403 pro_required', async () => {
    const res = await handleGetBookmarks(getReq(), authed(false));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'pro_required');
  });

  it('PUT as a non-Pro user → 403 pro_required', async () => {
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [] }), authed(false));
    assert.equal(res.status, 403);
  });

  it('PUT (Pro) with missing videoId → 400', async () => {
    const res = await handlePutBookmarks(putReq({ bookmarks: [] }), authed(true));
    assert.equal(res.status, 400);
  });

  it('PUT (Pro) with non-array bookmarks → 400', async () => {
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: 'nope' }), authed(true));
    assert.equal(res.status, 400);
  });
});

// ─── Saved A–B loops ─────────────────────────────────────────────────────────
// Looping in-session is free and never touches the server. SAVING a named loop
// syncs it, and sync rides this route — so the Pro line for saved loops is
// enforced here, server-side, not by the extension's local cap.
describe('/api/bookmarks — saved A–B loops', () => {
  const loop = { id: 1, videoId: 'v', timestamp: 42, description: 'Chorus', loop: { end: 75 } };

  it('a non-Pro caller cannot sync a saved loop → 403 pro_required', async () => {
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [loop] }), authed(false));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'pro_required');
  });

  it('a non-Pro caller cannot read saved loops back → 403 pro_required', async () => {
    assert.equal((await handleGetBookmarks(getReq(), authed(false))).status, 403);
  });

  it('an unauthenticated caller cannot sync a loop → 401', async () => {
    assert.equal((await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [loop] }), unauth())).status, 401);
  });

  it('a Pro caller may sync a well-formed loop', async () => {
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [loop] }), authed(true));
    assert.equal(res.status, 200);
  });

  it('rejects an inverted range even from a Pro caller → 400 invalid_loop', async () => {
    const bad = { ...loop, timestamp: 75, loop: { end: 42 } };
    const res = await handlePutBookmarks(putReq({ videoId: 'v', bookmarks: [bad] }), authed(true));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_loop');
  });
});

describe('validateLoopFields', () => {
  it('accepts records with no loop field — plain bookmarks must keep syncing', () => {
    assert.equal(validateLoopFields([{ timestamp: 10, description: 'note' }]), null);
    assert.equal(validateLoopFields([{ timestamp: 10, loop: null }]), null);
    assert.equal(validateLoopFields([]), null);
  });

  it('accepts a well-formed range', () => {
    assert.equal(validateLoopFields([{ timestamp: 10, loop: { end: 20 } }]), null);
    assert.equal(validateLoopFields([{ timestamp: 0, loop: { end: 0.5 } }]), null);
  });

  it('rejects an inverted or zero-length range', () => {
    assert.equal(validateLoopFields([{ timestamp: 20, loop: { end: 10 } }]), 'invalid_loop');
    assert.equal(validateLoopFields([{ timestamp: 20, loop: { end: 20 } }]), 'invalid_loop');
  });

  it('rejects a non-numeric or non-finite end', () => {
    assert.equal(validateLoopFields([{ timestamp: 10, loop: { end: '20' } }]), 'invalid_loop');
    assert.equal(validateLoopFields([{ timestamp: 10, loop: { end: NaN } }]), 'invalid_loop');
    assert.equal(validateLoopFields([{ timestamp: 10, loop: { end: Infinity } }]), 'invalid_loop');
    assert.equal(validateLoopFields([{ timestamp: 10, loop: {} }]), 'invalid_loop');
  });

  it('rejects a loop that is not an object', () => {
    assert.equal(validateLoopFields([{ timestamp: 10, loop: 20 }]), 'invalid_loop');
    assert.equal(validateLoopFields([{ timestamp: 10, loop: [20] }]), 'invalid_loop');
  });

  it('rejects a loop record with no usable A point', () => {
    assert.equal(validateLoopFields([{ loop: { end: 20 } }]), 'invalid_loop');
    assert.equal(validateLoopFields([{ timestamp: '10', loop: { end: 20 } }]), 'invalid_loop');
  });

  it('fails the whole payload when any record is bad', () => {
    assert.equal(
      validateLoopFields([
        { timestamp: 10, loop: { end: 20 } },
        { timestamp: 30, loop: { end: 25 } },
      ]),
      'invalid_loop',
    );
  });

  it('tolerates junk entries rather than throwing', () => {
    assert.equal(validateLoopFields([null, undefined, 'nope', 7]), null);
  });
});
