/**
 * mintExtensionSession — the OAuth callback's fix for the extension and the
 * website signing each other out.
 *
 * Regression cover for: /auth/callback used to hand the extension the exact
 * same refresh_token the website had just put in its cookies. Supabase rotates
 * that token on every use and revokes the whole family on replay, so whichever
 * surface refreshed second invalidated the token the other was still holding —
 * reported as "frequently signed out" on both the website and the extension.
 *
 * This mints the extension an unrelated session via admin.generateLink +
 * verifyOtp instead of forking the website's own. See
 * app/auth/callback/extension-session.ts for the full mechanism.
 *
 * Placeholder env is set by the --import preload in the test:unit:webapp script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mintExtensionSession } from '../../app/auth/callback/extension-session.js';

// Minimal fakes — only the two auth calls this function touches.
function fakeAdmin(generateLinkResult: { data?: unknown; error?: unknown }) {
  const calls: unknown[] = [];
  return {
    client: {
      auth: {
        admin: {
          async generateLink(params: unknown) {
            calls.push(params);
            return generateLinkResult;
          },
        },
      },
    },
    calls,
  };
}

function fakeAnon(verifyOtpResult: { data?: unknown; error?: unknown }) {
  const calls: unknown[] = [];
  return {
    client: {
      auth: {
        async verifyOtp(params: unknown) {
          calls.push(params);
          return verifyOtpResult;
        },
      },
    },
    calls,
  };
}

describe('mintExtensionSession', () => {
  it('mints a session from the generated link and returns it', async () => {
    const admin = fakeAdmin({ data: { properties: { hashed_token: 'hash-abc' } }, error: null });
    const anon = fakeAnon({
      data: { session: { access_token: 'new-access', refresh_token: 'new-refresh' } },
      error: null,
    });

    const result = await mintExtensionSession(admin.client as never, anon.client as never, 'user@example.com');

    assert.deepEqual(result, { accessToken: 'new-access', refreshToken: 'new-refresh' });
    assert.deepEqual(admin.calls[0], { type: 'magiclink', email: 'user@example.com' });
    assert.deepEqual(anon.calls[0], { type: 'magiclink', token_hash: 'hash-abc' });
  });

  it('returns null without calling verifyOtp when generateLink errors', async () => {
    const admin = fakeAdmin({ data: null, error: { message: 'nope' } });
    const anon = fakeAnon({ data: { session: null }, error: null });

    const result = await mintExtensionSession(admin.client as never, anon.client as never, 'user@example.com');

    assert.equal(result, null);
    assert.equal(anon.calls.length, 0);
  });

  it('returns null when generateLink succeeds but the token is missing', async () => {
    const admin = fakeAdmin({ data: { properties: {} }, error: null });
    const anon = fakeAnon({ data: { session: null }, error: null });

    const result = await mintExtensionSession(admin.client as never, anon.client as never, 'user@example.com');

    assert.equal(result, null);
    assert.equal(anon.calls.length, 0);
  });

  it('returns null when verifyOtp errors', async () => {
    const admin = fakeAdmin({ data: { properties: { hashed_token: 'hash-abc' } }, error: null });
    const anon = fakeAnon({ data: { session: null }, error: { message: 'expired' } });

    const result = await mintExtensionSession(admin.client as never, anon.client as never, 'user@example.com');

    assert.equal(result, null);
  });

  it('returns null when verifyOtp succeeds with no session', async () => {
    const admin = fakeAdmin({ data: { properties: { hashed_token: 'hash-abc' } }, error: null });
    const anon = fakeAnon({ data: { session: null }, error: null });

    const result = await mintExtensionSession(admin.client as never, anon.client as never, 'user@example.com');

    assert.equal(result, null);
  });

  it('short-circuits on an empty email without calling either API', async () => {
    const admin = fakeAdmin({ data: null, error: null });
    const anon = fakeAnon({ data: null, error: null });

    const result = await mintExtensionSession(admin.client as never, anon.client as never, '');

    assert.equal(result, null);
    assert.equal(admin.calls.length, 0);
    assert.equal(anon.calls.length, 0);
  });
});
