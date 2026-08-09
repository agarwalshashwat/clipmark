/**
 * External-message trust gate + AUTH_SUCCESS payload shape.
 *
 * AUTH_SUCCESS is the single message that hands every signed-in feature (Pro
 * entitlement, cloud sync, reminders) from the web app to the extension, and it
 * had no coverage anywhere. These are the pure halves of that handler; the
 * round-trip through real Chrome lives in tests/auth-bridge.spec.ts.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_ORIGIN,
  isTrustedExternalSender,
  buildAuthUser,
} from '../../extension/src/external-messaging.module.js';

describe('isTrustedExternalSender', () => {
  it('accepts the exact production app origin', () => {
    assert.equal(isTrustedExternalSender({ origin: APP_ORIGIN }), true);
    assert.equal(isTrustedExternalSender({ origin: 'https://clipmark.mithahara.com' }), true);
  });

  it('accepts any path under the app origin', () => {
    assert.equal(isTrustedExternalSender({ origin: `${APP_ORIGIN}/` }), true);
    assert.equal(isTrustedExternalSender({ url: `${APP_ORIGIN}/auth/extension-success?extensionId=x` }), true);
  });

  it('falls back to sender.url when sender.origin is absent', () => {
    // Chrome populates `origin` for external messages, but the handler reads
    // either — losing the url fallback would reject legitimate senders.
    assert.equal(isTrustedExternalSender({ url: `${APP_ORIGIN}/dashboard` }), true);
    assert.equal(isTrustedExternalSender({ url: 'https://evil.example/dashboard' }), false);
  });

  it('rejects look-alike hosts that merely contain the app origin', () => {
    for (const origin of [
      'https://clipmark.mithahara.com.evil.test',
      'https://clipmark.mithahara.com.evil.test/dashboard',
      'https://evil.test/https://clipmark.mithahara.com/',
      'https://notclipmark.mithahara.com',
    ]) {
      assert.equal(isTrustedExternalSender({ origin }), false, `should reject ${origin}`);
    }
  });

  it('rejects the http scheme and localhost', () => {
    // externally_connectable was narrowed to https production only during
    // launch hardening (see tests/unit/manifest.test.mjs); keep the defence-in-
    // depth check aligned with it.
    assert.equal(isTrustedExternalSender({ origin: 'http://clipmark.mithahara.com' }), false);
    assert.equal(isTrustedExternalSender({ origin: 'http://localhost:3000' }), false);
  });

  it('rejects missing / empty / malformed senders', () => {
    assert.equal(isTrustedExternalSender(undefined), false);
    assert.equal(isTrustedExternalSender(null), false);
    assert.equal(isTrustedExternalSender({}), false);
    assert.equal(isTrustedExternalSender({ origin: '' }), false);
    assert.equal(isTrustedExternalSender({ origin: '', url: '' }), false);
  });
});

describe('buildAuthUser (AUTH_SUCCESS → bmUser)', () => {
  const message = {
    type:         'AUTH_SUCCESS',
    accessToken:  'access-abc',
    refreshToken: 'refresh-def',
    userId:       'user-123',
    userEmail:    'someone@example.com',
    isPro:        true,
  };

  it('maps every field the extension reads back off bmUser', () => {
    assert.deepEqual(buildAuthUser(message), {
      userId:       'user-123',
      userEmail:    'someone@example.com',
      accessToken:  'access-abc',
      refreshToken: 'refresh-def',
      isPro:        true,
    });
  });

  it('stores nothing beyond the five known keys', () => {
    // A stray `type` (or anything else the page sends) must not end up in
    // storage — bmUser is read by the side panel, dashboard, and sync.
    assert.deepEqual(Object.keys(buildAuthUser(message)).sort(), [
      'accessToken', 'isPro', 'refreshToken', 'userEmail', 'userId',
    ]);
  });

  it('ignores extra fields the page tries to smuggle in', () => {
    const smuggled = buildAuthUser({ ...message, isAdmin: true, bmUser: 'nope' });
    assert.equal('isAdmin' in smuggled, false);
    assert.equal('bmUser' in smuggled, false);
  });

  it('defaults a missing entitlement to not-Pro', () => {
    assert.equal(buildAuthUser({ ...message, isPro: undefined }).isPro, false);
    const { isPro, ...withoutIsPro } = message;
    assert.equal(buildAuthUser(withoutIsPro).isPro, false);
  });

  it('coerces a falsy entitlement to a boolean rather than passing it through', () => {
    // `isPro` is read as a boolean by the upsell gates; leaving '' or null in
    // storage would still be falsy, but 0/'' round-trips inconsistently.
    assert.equal(buildAuthUser({ ...message, isPro: null }).isPro, false);
    assert.equal(buildAuthUser({ ...message, isPro: '' }).isPro, false);
    assert.equal(buildAuthUser({ ...message, isPro: false }).isPro, false);
  });
});
