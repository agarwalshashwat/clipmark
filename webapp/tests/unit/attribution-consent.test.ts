/**
 * POST/DELETE /api/consent/attribution, with injected fakes (no DB, no network).
 *
 * This endpoint is the only path by which a non-essential attribution cookie can
 * be set after the consent banner is answered, so its refusals are the actual
 * compliance boundary — the client is not trusted to have checked anything. The
 * cases below are the ones where being wrong is invisible in the UI:
 *
 *   • a claim POSTed without a consent cookie must set nothing
 *   • a claim POSTed with a REJECT on record must set nothing
 *   • an existing cookie must survive a second claim (first-click attribution)
 *   • a code that does not resolve to a real affiliate must set nothing
 *   • DELETE must expire both cookies, with or without consent
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import {
  handleClaimAttribution,
  handleRevokeAttribution,
  type AttributionDeps,
} from '../../app/api/consent/attribution/handler.js';
import { CONSENT_COOKIE, makeConsentRecord, serializeConsent } from '../../app/lib/consent.js';
import { AFFILIATE_REF_COOKIE, USER_REF_COOKIE } from '../../app/lib/attribution.js';
import { makeFakeSupabase, type FakeCtx, type Responder } from './fixtures/fakes.js';

const NOW = 1_760_000_000_000;
const ACCEPTED = serializeConsent(makeConsentRecord(true, NOW));
const REJECTED = serializeConsent(makeConsentRecord(false, NOW));

/** Every code resolves to a real row unless a test says otherwise. */
const resolvesEverything: Responder = () => ({ data: { id: 'user-1' }, error: null });
const resolvesNothing: Responder = () => ({ data: null, error: { code: 'PGRST116' } });

function claimRequest(opts: {
  cookies?: Record<string, string>;
  body?: unknown;
}): NextRequest {
  const cookieHeader = Object.entries(opts.cookies ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new NextRequest('http://localhost/api/consent/attribution', {
    method: 'POST',
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    body: JSON.stringify(opts.body ?? {}),
  });
}

function deps(responder: Responder): AttributionDeps {
  return { admin: makeFakeSupabase(responder).client };
}

/** The cookie names a response actually asks the browser to set (max-age > 0). */
function cookiesSet(res: NextResponse): string[] {
  return res.cookies
    .getAll()
    .filter((c) => c.maxAge === undefined || c.maxAge > 0)
    .map((c) => c.name);
}

describe('POST /api/consent/attribution — the consent gate', () => {
  it('refuses with 403 and sets nothing when there is no consent cookie', async () => {
    const res = await handleClaimAttribution(
      claimRequest({ body: { affiliate: 'mkbhd' } }),
      deps(resolvesEverything),
    );
    assert.equal(res.status, 403);
    assert.deepEqual(cookiesSet(res), []);
  });

  it('refuses with 403 when the visitor REJECTED optional cookies', async () => {
    const res = await handleClaimAttribution(
      claimRequest({ cookies: { [CONSENT_COOKIE]: REJECTED }, body: { affiliate: 'mkbhd' } }),
      deps(resolvesEverything),
    );
    assert.equal(res.status, 403);
    assert.deepEqual(cookiesSet(res), []);
  });

  it('refuses when the consent cookie is malformed, rather than assuming yes', async () => {
    const res = await handleClaimAttribution(
      claimRequest({ cookies: { [CONSENT_COOKIE]: 'garbage' }, body: { affiliate: 'mkbhd' } }),
      deps(resolvesEverything),
    );
    assert.equal(res.status, 403);
  });

  it('sets the affiliate cookie once consent is on record', async () => {
    const res = await handleClaimAttribution(
      claimRequest({ cookies: { [CONSENT_COOKIE]: ACCEPTED }, body: { affiliate: 'mkbhd' } }),
      deps(resolvesEverything),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(cookiesSet(res), [AFFILIATE_REF_COOKIE]);
    const cookie = res.cookies.get(AFFILIATE_REF_COOKIE);
    assert.equal(cookie?.value, 'mkbhd');
    assert.equal(cookie?.httpOnly, true, 'page scripts must not be able to read the referrer');
    assert.equal(cookie?.sameSite, 'lax');
  });

  it('sets the user-referral cookie from `uref`', async () => {
    const res = await handleClaimAttribution(
      claimRequest({ cookies: { [CONSENT_COOKIE]: ACCEPTED }, body: { user: 'friend-code' } }),
      deps(resolvesEverything),
    );
    assert.deepEqual(cookiesSet(res), [USER_REF_COOKIE]);
  });
});

describe('POST /api/consent/attribution — validation and first-click', () => {
  it('leaves an existing attribution cookie alone (first click wins)', async () => {
    const res = await handleClaimAttribution(
      claimRequest({
        cookies: { [CONSENT_COOKIE]: ACCEPTED, [AFFILIATE_REF_COOKIE]: 'first-affiliate' },
        body: { affiliate: 'late-affiliate' },
      }),
      deps(resolvesEverything),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(cookiesSet(res), [], 'must not overwrite the earlier referrer');
  });

  it('sets nothing when the code does not resolve to an approved affiliate', async () => {
    const res = await handleClaimAttribution(
      claimRequest({ cookies: { [CONSENT_COOKIE]: ACCEPTED }, body: { affiliate: 'not-a-real-code' } }),
      deps(resolvesNothing),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(cookiesSet(res), []);
  });

  // An approved-affiliate check that silently degraded to "any profile with
  // this code" would still pass every other test in this file.
  it('checks the affiliate against is_affiliate, not just the code column', async () => {
    const { client, calls } = makeFakeSupabase(resolvesEverything);
    await handleClaimAttribution(
      claimRequest({ cookies: { [CONSENT_COOKIE]: ACCEPTED }, body: { affiliate: 'mkbhd' } }),
      { admin: client },
    );
    const call: FakeCtx | undefined = calls[0];
    assert.equal(call?.table, 'profiles');
    assert.deepEqual(call?.filters.map(([, col]) => col), ['affiliate_code', 'is_affiliate']);
  });

  it('rejects codes that are not a plausible referral code', async () => {
    for (const affiliate of ['', 'a'.repeat(65), 'has space', 'semi;colon', 42, null, {}]) {
      const res = await handleClaimAttribution(
        claimRequest({ cookies: { [CONSENT_COOKIE]: ACCEPTED }, body: { affiliate } }),
        deps(resolvesEverything),
      );
      assert.deepEqual(cookiesSet(res), [], `${JSON.stringify(affiliate)} should not be claimable`);
    }
  });

  it('400s on a body that is not JSON', async () => {
    const req = new NextRequest('http://localhost/api/consent/attribution', {
      method: 'POST',
      headers: { cookie: `${CONSENT_COOKIE}=${ACCEPTED}` },
      body: 'not json',
    });
    const res = await handleClaimAttribution(req, deps(resolvesEverything));
    assert.equal(res.status, 400);
  });
});

describe('DELETE /api/consent/attribution — withdrawing consent', () => {
  it('expires both attribution cookies', () => {
    const res = handleRevokeAttribution();
    assert.equal(res.status, 200);
    for (const name of [AFFILIATE_REF_COOKIE, USER_REF_COOKIE]) {
      const cookie = res.cookies.get(name);
      assert.ok(cookie, `${name} must be in the response`);
      assert.equal(cookie?.maxAge, 0, `${name} must be expired, not merely blanked`);
      assert.equal(cookie?.path, '/', 'must match the path it was set with or the browser keeps it');
    }
  });
});
