/**
 * OAuth → extension handoff: the sending side.
 *
 * `/auth/extension-success` parses the callback's query string and relays it to
 * the extension as AUTH_SUCCESS. A break here fails sign-in for every extension
 * user, and the page's only visible symptom is a generic "Sign-in failed" — so
 * pin the two failure params and the exact message shape.
 *
 * The receiving half is tests/unit/external-messaging.test.mjs (pure) and
 * tests/auth-bridge.spec.ts (real Chrome round-trip).
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseExtensionAuthParams,
  type ParsedExtensionAuth,
} from '../../app/auth/extension-success/params.js';

const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop'; // 32 chars, a–p

/** Build the params object the page hands over, from a query string. */
function params(query: string) {
  return new URLSearchParams(query);
}

/** Full happy-path query string, as /auth/callback builds it. */
function fullQuery(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    extensionId:   EXT_ID,
    access_token:  'access-abc',
    refresh_token: 'refresh-def',
    user_id:       'user-123',
    user_email:    'someone@example.com',
    is_pro:        'true',
  };
  return new URLSearchParams({ ...base, ...overrides }).toString();
}

function expectOk(parsed: ParsedExtensionAuth) {
  assert.equal(parsed.ok, true, `expected a parsed handoff, got ${JSON.stringify(parsed)}`);
  return parsed as Extract<ParsedExtensionAuth, { ok: true }>;
}

describe('extension-success: rejected handoffs', () => {
  it('rejects a missing extensionId', () => {
    assert.deepEqual(parseExtensionAuthParams(params('access_token=access-abc')), {
      ok: false, reason: 'missing_extension_id',
    });
  });

  it('rejects a missing access_token', () => {
    assert.deepEqual(parseExtensionAuthParams(params(`extensionId=${EXT_ID}`)), {
      ok: false, reason: 'missing_access_token',
    });
  });

  it('rejects empty-string params, not just absent ones', () => {
    // `?extensionId=&access_token=x` reaches the page as '' — treating that as
    // present would send a message to extension id "" and hang.
    assert.equal(parseExtensionAuthParams(params(`extensionId=&access_token=abc`)).ok, false);
    assert.equal(parseExtensionAuthParams(params(`extensionId=${EXT_ID}&access_token=`)).ok, false);
  });

  it('rejects an empty query string', () => {
    assert.deepEqual(parseExtensionAuthParams(params('')), {
      ok: false, reason: 'missing_extension_id',
    });
  });

  it('distinguishes the two failure reasons', () => {
    // The page collapses both to a generic error, but the reasons are what make
    // "extension not installed" debuggable from a report.
    const a = parseExtensionAuthParams(params('access_token=abc'));
    const b = parseExtensionAuthParams(params(`extensionId=${EXT_ID}`));
    assert.notEqual((a as { reason: string }).reason, (b as { reason: string }).reason);
  });
});

describe('extension-success: AUTH_SUCCESS message shape', () => {
  it('relays every field the background worker reads', () => {
    const parsed = expectOk(parseExtensionAuthParams(params(fullQuery())));
    assert.equal(parsed.extensionId, EXT_ID);
    assert.deepEqual(parsed.message, {
      type:         'AUTH_SUCCESS',
      accessToken:  'access-abc',
      refreshToken: 'refresh-def',
      userId:       'user-123',
      userEmail:    'someone@example.com',
      isPro:        true,
    });
  });

  it('uses the key names the background handler destructures', () => {
    // background.js reads message.accessToken / refreshToken / userId /
    // userEmail / isPro — camelCase, unlike the snake_case query params. A
    // rename on either side silently stores undefined tokens.
    const parsed = expectOk(parseExtensionAuthParams(params(fullQuery())));
    assert.deepEqual(Object.keys(parsed.message).sort(), [
      'accessToken', 'isPro', 'refreshToken', 'type', 'userEmail', 'userId',
    ]);
  });

  it('treats only the literal string "true" as Pro', () => {
    for (const value of ['false', 'True', '1', 'yes', '']) {
      const parsed = expectOk(parseExtensionAuthParams(params(fullQuery({ is_pro: value }))));
      assert.equal(parsed.message.isPro, false, `is_pro=${JSON.stringify(value)} should not grant Pro`);
    }
    assert.equal(expectOk(parseExtensionAuthParams(params(fullQuery({ is_pro: 'true' })))).message.isPro, true);
  });

  it('defaults isPro to false when the param is absent', () => {
    const q = new URLSearchParams(fullQuery());
    q.delete('is_pro');
    assert.equal(expectOk(parseExtensionAuthParams(q)).message.isPro, false);
  });

  it('passes optional profile fields through as null rather than dropping them', () => {
    const parsed = expectOk(parseExtensionAuthParams(params(`extensionId=${EXT_ID}&access_token=access-abc`)));
    assert.deepEqual(parsed.message, {
      type:         'AUTH_SUCCESS',
      accessToken:  'access-abc',
      refreshToken: null,
      userId:       null,
      userEmail:    null,
      isPro:        false,
    });
  });

  it('preserves tokens verbatim, including URL-encoded characters', () => {
    // Supabase JWTs contain '.' and can contain '-'/'_' (base64url); a token
    // mangled in transit fails every subsequent API call with a 401.
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.s0me-_signature';
    const q = new URLSearchParams({ extensionId: EXT_ID, access_token: jwt, user_email: 'a+b@example.com' });
    const parsed = expectOk(parseExtensionAuthParams(q));
    assert.equal(parsed.message.accessToken, jwt);
    assert.equal(parsed.message.userEmail, 'a+b@example.com');
  });

  it('ignores unrelated query params', () => {
    const parsed = expectOk(parseExtensionAuthParams(params(`${fullQuery()}&next=%2Fdashboard&utm_source=x`)));
    assert.equal('next' in parsed.message, false);
    assert.equal('utm_source' in parsed.message, false);
  });
});
