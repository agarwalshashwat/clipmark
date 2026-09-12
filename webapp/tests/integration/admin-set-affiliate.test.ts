/**
 * Admin affiliate bypass integration tests — real GoTrue token validation + real
 * DB writes against the local Supabase stack.
 *
 * Regression coverage for the original bug: the route wrote `affiliate_status`
 * (no such column, ever) and `affiliate_commission_rate` (should be
 * `commission_rate`) — either one made the whole `UPDATE profiles` fail. A 200
 * response in these tests is itself proof those columns are gone. The
 * commission_rate assertions additionally guard the percent -> fraction unit
 * conversion (a raw "40" stored instead of "0.40" would 100x-overpay).
 *
 * The final test walks the full chain the admin bypass exists to unblock: a
 * brand-new, non-Pro creator gets granted a code, the code resolves via the
 * real (unmodified) /r/[code] route, and a referred purchase's webhook records
 * a commission at the admin-set rate.
 */
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../app/api/admin/_lib.js';
import { handleSetAffiliate } from '../../app/api/admin/set-affiliate/handler.js';
import { handleAdminUsers } from '../../app/api/admin/users/handler.js';
import { handleDodoWebhook } from '../../app/api/webhooks/dodo/handler.js';
import { GET as resolveAffiliateCode } from '../../app/r/[code]/route.js';
import { adminClient, anonClient } from './fixtures/supabase.js';
import { createTestUser, type TestUser } from './fixtures/seed.js';
import { makeRequest, fakeDodo, fakeDodoDiscounts } from '../unit/fixtures/fakes.js';
import { CONSENT_COOKIE, makeConsentRecord, serializeConsent } from '../../app/lib/consent.js';

const admin = adminClient();

// A server-client factory whose auth.getUser() validates a real JWT via GoTrue.
const serverForToken = (token: string) =>
  (async () => ({ auth: { getUser: () => anonClient().auth.getUser(token) } })) as never;

async function getProfile(id: string) {
  const { data } = await admin
    .from('profiles')
    .select('is_affiliate, affiliate_code, commission_rate, is_pro')
    .eq('id', id)
    .single();
  return data as {
    is_affiliate: boolean;
    affiliate_code: string | null;
    commission_rate: string;
    is_pro: boolean;
  };
}

describe('admin set-affiliate (integration)', () => {
  let adminUser: TestUser;
  before(async () => {
    adminUser = await createTestUser('admin-affiliate@example.test');
    process.env.ADMIN_USER_IDS = adminUser.id; // only this user is an admin
  });

  function setAffiliate(userToken: string, body: Record<string, unknown>) {
    return handleSetAffiliate(
      makeRequest({ url: 'http://localhost/api/admin/set-affiliate', body: JSON.stringify(body) }),
      {
        admin,
        requireAdmin: () => requireAdmin(serverForToken(userToken)),
        dodo: fakeDodoDiscounts(),
      },
    );
  }

  it('grants a brand-new, non-Pro creator a working affiliate code + custom rate', async () => {
    const creator = await createTestUser('creator-nonpro@example.test');
    const startingProfile = await getProfile(creator.id);
    assert.equal(startingProfile.is_pro, false, 'creator starts non-Pro — the whole point of the admin bypass');

    const res = await setAffiliate(adminUser.accessToken, {
      userId: creator.id,
      affiliateCode: 'testcreator',
      commissionRate: 40,
      approve: true,
    });
    assert.equal(res.status, 200);

    const p = await getProfile(creator.id);
    assert.equal(p.is_affiliate, true);
    assert.equal(p.affiliate_code, 'testcreator');
    // Regression: a 40% input must be stored as the fraction 0.40, not 40.
    assert.equal(Number(p.commission_rate), 0.4);
  });

  it('rejects commissionRate above 100 and writes nothing', async () => {
    const creator = await createTestUser('creator-badrate@example.test');
    const res = await setAffiliate(adminUser.accessToken, {
      userId: creator.id,
      commissionRate: 150,
      approve: true,
    });
    assert.equal(res.status, 400);
    assert.equal((await getProfile(creator.id)).is_affiliate, false);
  });

  it('a non-admin is rejected (403) and the target is unchanged', async () => {
    const nonAdmin = await createTestUser('nonadmin-affiliate@example.test');
    const creator = await createTestUser('creator-unauth@example.test');
    const res = await setAffiliate(nonAdmin.accessToken, { userId: creator.id, approve: true });
    assert.equal(res.status, 403);
    assert.equal((await getProfile(creator.id)).is_affiliate, false);
  });

  it('an unauthenticated caller is rejected (401)', async () => {
    const creator = await createTestUser('creator-noauth@example.test');
    const res = await handleSetAffiliate(
      makeRequest({ url: 'http://localhost/api/admin/set-affiliate', body: JSON.stringify({ userId: creator.id, approve: true }) }),
      {
        admin,
        requireAdmin: () => requireAdmin((async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } })) as never),
        dodo: fakeDodoDiscounts(),
      },
    );
    assert.equal(res.status, 401);
  });

  it('admin/users search returns the real commission_rate (was 500ing on affiliate_commission_rate)', async () => {
    const creator = await createTestUser('creator-search@example.test');
    await setAffiliate(adminUser.accessToken, {
      userId: creator.id,
      affiliateCode: 'searchcode',
      commissionRate: 25,
      approve: true,
    });

    const res = await handleAdminUsers(
      makeRequest({ url: 'http://localhost/api/admin/users?q=creator-search', method: 'GET' }),
      { admin, requireAdmin: () => requireAdmin(serverForToken(adminUser.accessToken)) },
    );
    assert.equal(res.status, 200, `expected 200 (endpoint must not 500 on the column select)`);
    const json = await res.json();
    const match = (json.users as Array<{ id: string; commission_rate?: number }>).find((u) => u.id === creator.id);
    assert.ok(match, 'creator should appear in search results');
    assert.equal(Number(match!.commission_rate), 0.25);
  });

  it('end-to-end: admin grant -> code resolves -> referred signup attributes -> commission recorded', async () => {
    const creator = await createTestUser('creator-e2e@example.test');
    const grantRes = await setAffiliate(adminUser.accessToken, {
      userId: creator.id,
      affiliateCode: 'e2ecreator',
      commissionRate: 40,
      approve: true,
    });
    assert.equal(grantRes.status, 200);

    // Code resolves via the real, unmodified /r/[code] route.
    //
    // `clipmark_ref` is a non-essential marketing cookie, so the route sets it
    // only where consent is already on record — the visitor here arrives with
    // an "accept" cookie, which is what the consent banner writes. The
    // no-consent case is asserted separately below; both directions matter,
    // because a route that set the cookie unconditionally would still pass the
    // conversion assertions that follow.
    const resolveRes = await resolveAffiliateCode(
      new NextRequest('http://localhost/r/e2ecreator', {
        headers: { cookie: `${CONSENT_COOKIE}=${serializeConsent(makeConsentRecord(true, Date.now()))}` },
      }),
      { params: Promise.resolve({ code: 'e2ecreator' }) },
    );
    assert.ok(resolveRes instanceof NextResponse);
    assert.equal(resolveRes.status, 307, 'expects a redirect to the homepage with ?ref=');
    const setCookie = resolveRes.headers.get('set-cookie') ?? '';
    assert.ok(setCookie.includes('clipmark_ref=e2ecreator'), 'sets the attribution cookie for the click');

    // A referred user upgrades — mirrors what upgrade/actions.ts puts into Dodo
    // checkout metadata from the clipmark_ref cookie.
    const referred = await createTestUser('referred-e2e@example.test');
    const webhookRes = await handleDodoWebhook(
      makeRequest({ headers: { 'webhook-id': 'wh-e2e' }, body: '{}' }),
      {
        dodo: fakeDodo({
          event: {
            type: 'payment.succeeded',
            data: {
              metadata: { user_id: referred.id, affiliate_code: 'e2ecreator' },
              payment_id: 'pay_e2e',
              total_amount: 1000, // $10.00
            },
          },
        }),
        admin,
      },
    );
    assert.equal(webhookRes.status, 200);

    const { data: conv } = await admin
      .from('affiliate_conversions')
      .select('affiliate_id, commission_usd, commission_rate, status')
      .eq('referred_user_id', referred.id)
      .single();
    const row = conv as { affiliate_id: string; commission_usd: string; commission_rate: string; status: string };
    assert.equal(row.affiliate_id, creator.id, 'commission attributed to the admin-granted creator');
    assert.equal(Number(row.commission_rate), 0.4, 'uses the admin-set 40% rate, not the 30% self-serve default');
    assert.equal(Number(row.commission_usd), 4, '$10 * 0.40 = $4');
    assert.equal(row.status, 'pending');
  });

  // The other half of the consent gate, against the real route and the real DB.
  // `clipmark_ref` is a marketing cookie under UK PECR reg. 6, so a visitor who
  // has not answered the banner — which is EVERY first-time visitor, since /r is
  // the first request they make — must be redirected without one. The click is
  // still recorded: that row lives on our server and stores nothing on the
  // visitor's device, so the affiliate's click count is unaffected by the answer.
  it('does not set the attribution cookie without consent, but still counts the click', async () => {
    const creator = await createTestUser('creator-noconsent@example.test');
    await setAffiliate(adminUser.accessToken, {
      userId: creator.id,
      affiliateCode: 'noconsentcreator',
      commissionRate: 30,
      approve: true,
    });

    const before = await admin
      .from('affiliate_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_code', 'noconsentcreator');

    for (const [label, cookie] of [
      ['no consent cookie at all', undefined],
      ['optional cookies rejected', `${CONSENT_COOKIE}=${serializeConsent(makeConsentRecord(false, Date.now()))}`],
    ] as const) {
      const res = await resolveAffiliateCode(
        new NextRequest('http://localhost/r/noconsentcreator', {
          headers: cookie ? { cookie } : {},
        }),
        { params: Promise.resolve({ code: 'noconsentcreator' }) },
      );
      assert.equal(res.status, 307, `${label}: still redirects`);
      assert.ok(
        res.headers.get('location')?.includes('ref=noconsentcreator'),
        `${label}: the code still rides the redirect for the banner to claim`,
      );
      assert.ok(
        !(res.headers.get('set-cookie') ?? '').includes('clipmark_ref='),
        `${label}: must not set the attribution cookie`,
      );
    }

    const after = await admin
      .from('affiliate_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_code', 'noconsentcreator');
    assert.equal((after.count ?? 0) - (before.count ?? 0), 2, 'both clicks are recorded regardless of consent');
  });
});
