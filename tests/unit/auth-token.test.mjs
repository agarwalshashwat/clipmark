/**
 * Unit tests for the shared access-token resolver.
 *
 * Regression cover for the production 401 storm on POST /api/refresh and
 * GET /api/reminders:
 *
 *  - the background worker sent `bmUser.accessToken` raw, so every reminder sync
 *    401'd once that hour-long token aged out and no alarms were ever scheduled;
 *  - the two page copies of this helper had no single-flight, so a load that
 *    needed a token from several places POSTed the same rotate-on-use refresh
 *    token concurrently and could persist one the server had already revoked;
 *  - and any failed refresh — including a transient one — wiped `bmUser`, so
 *    being briefly offline signed the user out.
 *
 * See extension/src/auth-token.module.js.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getValidToken,
  isAccessTokenFresh,
  resolveAccessToken,
  TOKEN_NO_SESSION,
  TOKEN_OK,
  TOKEN_REFRESH_FAILED,
  TOKEN_SESSION_EXPIRED,
} from '../../extension/src/auth-token.module.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A JWT with only the `exp` the resolver reads, expiring `secondsFromNow`. */
function jwt(secondsFromNow, label = 'tok') {
  const payload = { exp: Math.floor(Date.now() / 1000) + secondsFromNow, label };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${b64}.signature`;
}

/** Minimal chrome.storage.sync stand-in (promise flavour, as MV3 exposes it). */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(defaults) {
      const out = {};
      for (const [key, fallback] of Object.entries(defaults)) {
        out[key] = key in data ? data[key] : fallback;
      }
      return out;
    },
    async set(entries) {
      Object.assign(data, entries);
    },
  };
}

/** A fetch stand-in that records calls and replies with `responder(call#)`. */
function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return responder(calls.length - 1);
  };
  fn.calls = calls;
  return fn;
}

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// ─── isAccessTokenFresh ───────────────────────────────────────────────────────

describe('isAccessTokenFresh', () => {
  it('accepts a token comfortably inside its life', () => {
    assert.equal(isAccessTokenFresh(jwt(3600)), true);
  });

  it('rejects a token inside the 60s expiry margin, so a request cannot expire mid-flight', () => {
    assert.equal(isAccessTokenFresh(jwt(30)), false);
    assert.equal(isAccessTokenFresh(jwt(3600), { now: Date.now() + 3_590_000 }), false);
  });

  it('treats an absent or unparseable token as stale rather than throwing', () => {
    assert.equal(isAccessTokenFresh(null), false);
    assert.equal(isAccessTokenFresh(''), false);
    assert.equal(isAccessTokenFresh('not-a-jwt'), false);
    assert.equal(isAccessTokenFresh('a.@@@.c'), false);
  });
});

// ─── resolveAccessToken ───────────────────────────────────────────────────────

describe('resolveAccessToken', () => {
  it('returns a still-valid token without touching the network', async () => {
    const token = jwt(3600);
    const storage = fakeStorage({ bmUser: { accessToken: token, refreshToken: 'r1' } });
    const fetchImpl = fakeFetch(() => { throw new Error('should not refresh'); });

    assert.deepEqual(await resolveAccessToken({ storage, fetchImpl }), { token, reason: TOKEN_OK });
    assert.equal(fetchImpl.calls.length, 0);
  });

  it('reports no session when nothing is stored', async () => {
    const storage = fakeStorage({});
    assert.deepEqual(
      await resolveAccessToken({ storage, fetchImpl: fakeFetch(() => jsonResponse({})) }),
      { token: null, reason: TOKEN_NO_SESSION },
    );
  });

  it('refreshes an expired token and persists the rotated pair', async () => {
    const fresh = jwt(3600, 'fresh');
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1', userEmail: 'a@b.c' } });
    const fetchImpl = fakeFetch(() => jsonResponse({ access_token: fresh, refresh_token: 'r2' }));

    const result = await resolveAccessToken({ storage, fetchImpl });

    assert.deepEqual(result, { token: fresh, reason: TOKEN_OK });
    assert.equal(fetchImpl.calls.length, 1);
    assert.match(fetchImpl.calls[0].url, /\/api\/refresh$/);
    assert.deepEqual(fetchImpl.calls[0].body, { refresh_token: 'r1' });
    assert.deepEqual(storage.data.bmUser, {
      accessToken: fresh,
      refreshToken: 'r2',
      userEmail: 'a@b.c',
    });
  });

  it('collapses concurrent callers into a single refresh', async () => {
    // The refresh token is rotate-on-use: a second POST with the same token
    // races the first and can end up persisting a revoked one.
    const fresh = jwt(3600, 'fresh');
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1' } });
    const fetchImpl = fakeFetch(() => jsonResponse({ access_token: fresh, refresh_token: 'r2' }));

    const results = await Promise.all(
      Array.from({ length: 5 }, () => resolveAccessToken({ storage, fetchImpl })),
    );

    assert.equal(fetchImpl.calls.length, 1);
    for (const r of results) assert.deepEqual(r, { token: fresh, reason: TOKEN_OK });
    assert.equal(storage.data.bmUser.refreshToken, 'r2');
  });

  it('refreshes again on a later call, once the in-flight one has settled', async () => {
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1' } });
    const fetchImpl = fakeFetch(n =>
      jsonResponse({ access_token: jwt(-10, `stale${n}`), refresh_token: `r${n + 2}` }),
    );

    // Each response is itself already expired, so the second call cannot short-
    // circuit on the stored token and must issue its own request.
    await resolveAccessToken({ storage, fetchImpl });
    await resolveAccessToken({ storage, fetchImpl });

    assert.equal(fetchImpl.calls.length, 2);
    assert.deepEqual(fetchImpl.calls[1].body, { refresh_token: 'r2' });
  });

  it('merges onto the latest record so a concurrent write is not resurrected', async () => {
    const fresh = jwt(3600, 'fresh');
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1', isPro: false } });
    const fetchImpl = fakeFetch(async () => {
      // Stands in for refreshEntitlement() landing while the refresh is away.
      await storage.set({ bmUser: { ...storage.data.bmUser, isPro: true } });
      return jsonResponse({ access_token: fresh, refresh_token: 'r2' });
    });

    await resolveAccessToken({ storage, fetchImpl });

    assert.equal(storage.data.bmUser.isPro, true);
    assert.equal(storage.data.bmUser.accessToken, fresh);
  });

  it('does not resurrect a session the user signed out of mid-refresh', async () => {
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1' } });
    const fetchImpl = fakeFetch(async () => {
      await storage.set({ bmUser: null });
      return jsonResponse({ access_token: jwt(3600), refresh_token: 'r2' });
    });

    assert.deepEqual(
      await resolveAccessToken({ storage, fetchImpl }),
      { token: null, reason: TOKEN_NO_SESSION },
    );
    assert.equal(storage.data.bmUser, null);
  });

  it('reports a rejected refresh token as a dead session', async () => {
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1' } });
    const fetchImpl = fakeFetch(() => jsonResponse({ error: 'Token refresh failed' }, 401));

    assert.deepEqual(
      await resolveAccessToken({ storage, fetchImpl }),
      { token: null, reason: TOKEN_SESSION_EXPIRED },
    );
    // Nothing is cleared here — that call belongs to the caller that owns the UI.
    assert.equal(storage.data.bmUser.refreshToken, 'r1');
  });

  it('reports an unreachable server as transient, never as a dead session', async () => {
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1' } });
    const fetchImpl = fakeFetch(() => { throw new TypeError('Failed to fetch'); });

    assert.deepEqual(
      await resolveAccessToken({ storage, fetchImpl }),
      { token: null, reason: TOKEN_REFRESH_FAILED },
    );
  });

  it('reports a 5xx as transient — the session is not the thing that failed', async () => {
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1' } });
    const fetchImpl = fakeFetch(() => jsonResponse({ error: 'Internal server error' }, 500));

    const { reason } = await resolveAccessToken({ storage, fetchImpl });
    assert.equal(reason, TOKEN_REFRESH_FAILED);
  });

  it('reports a truncated success body as transient rather than handing back undefined', async () => {
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10), refreshToken: 'r1' } });
    const fetchImpl = fakeFetch(() => jsonResponse({ access_token: jwt(3600) }));

    const { token, reason } = await resolveAccessToken({ storage, fetchImpl });
    assert.equal(token, null);
    assert.equal(reason, TOKEN_REFRESH_FAILED);
    assert.equal(storage.data.bmUser.refreshToken, 'r1');
  });

  it('treats a session with no refresh token as expired', async () => {
    const storage = fakeStorage({ bmUser: { accessToken: jwt(-10) } });
    assert.deepEqual(
      await resolveAccessToken({ storage, fetchImpl: fakeFetch(() => jsonResponse({})) }),
      { token: null, reason: TOKEN_SESSION_EXPIRED },
    );
  });
});

describe('getValidToken', () => {
  it('unwraps to just the token for the call sites that only need one', async () => {
    const token = jwt(3600);
    const storage = fakeStorage({ bmUser: { accessToken: token, refreshToken: 'r1' } });
    assert.equal(await getValidToken({ storage, fetchImpl: fakeFetch(() => jsonResponse({})) }), token);
  });

  it('is null — not undefined — when there is no session to speak of', async () => {
    const storage = fakeStorage({});
    assert.equal(await getValidToken({ storage, fetchImpl: fakeFetch(() => jsonResponse({})) }), null);
  });
});
