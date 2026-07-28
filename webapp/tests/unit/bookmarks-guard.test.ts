/**
 * /api/bookmarks unit tests (audit #4) — auth + Pro-gate + input validation,
 * with injected fakes. Cross-user RLS isolation is covered in
 * tests/integration/bookmarks-sync.test.ts.
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetBookmarks, handlePutBookmarks } from '../../app/api/bookmarks/handler.js';
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
