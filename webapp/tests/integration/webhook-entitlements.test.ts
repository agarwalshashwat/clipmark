/**
 * Dodo webhook integration tests (audit #2) — real entitlement writes against
 * the local Supabase DB. Signature verification is bypassed with a fake unwrap;
 * the admin client is the real service-role client.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { handleDodoWebhook } from '../../app/api/webhooks/dodo/handler.js';
import { adminClient } from './fixtures/supabase.js';
import { createTestUser, setProfileFlags, type TestUser } from './fixtures/seed.js';
import { makeRequest, fakeDodo } from '../unit/fixtures/fakes.js';

const admin = adminClient();

function deliver(event: unknown) {
  return handleDodoWebhook(makeRequest({ headers: { 'webhook-id': 'wh' }, body: '{}' }), {
    dodo: fakeDodo({ event }),
    admin,
  });
}

async function getProfile(id: string) {
  const { data } = await admin.from('profiles').select('is_pro, pro_payment_id').eq('id', id).single();
  return data as { is_pro: boolean; pro_payment_id: string | null };
}

describe('Dodo webhook entitlements (#2, integration)', () => {
  it('payment.succeeded grants Pro and stores pro_payment_id', async () => {
    const u = await createTestUser('wh-grant@example.test');
    const res = await deliver({
      type: 'payment.succeeded',
      data: { metadata: { user_id: u.id }, payment_id: 'pay_grant', total_amount: 0 },
    });
    assert.equal(res.status, 200);
    const p = await getProfile(u.id);
    assert.equal(p.is_pro, true);
    assert.equal(p.pro_payment_id, 'pay_grant');
  });

  it('refund.succeeded revokes Pro and cancels the pending conversion', async () => {
    const affiliate = await createTestUser('wh-refund-aff@example.test');
    await setProfileFlags(affiliate.id, { is_affiliate: true, affiliate_code: 'aff_refund', commission_rate: 0.3 });
    const payer = await createTestUser('wh-refund-payer@example.test');
    await setProfileFlags(payer.id, { is_pro: true, pro_payment_id: 'pay_refund' });
    const { error: convErr } = await admin.from('affiliate_conversions').insert({
      affiliate_id: affiliate.id,
      referred_user_id: payer.id,
      plan: 'lifetime',
      amount_usd: 10,
      commission_usd: 3,
      commission_rate: 0.3,
      status: 'pending',
      dodo_payment_id: 'pay_refund',
    });
    assert.equal(convErr, null);

    const res = await deliver({ type: 'refund.succeeded', data: { payment_id: 'pay_refund' } });
    assert.equal(res.status, 200);

    const p = await getProfile(payer.id);
    assert.equal(p.is_pro, false, 'Pro revoked on refund');
    assert.equal(p.pro_payment_id, null);

    const { data: conv } = await admin
      .from('affiliate_conversions')
      .select('status')
      .eq('dodo_payment_id', 'pay_refund')
      .single();
    assert.equal((conv as { status: string }).status, 'cancelled');
  });

  it('subscription.cancelled revokes Pro', async () => {
    const u = await createTestUser('wh-cancel@example.test');
    await setProfileFlags(u.id, { is_pro: true, subscription_id: 'sub_x' });
    const res = await deliver({
      type: 'subscription.cancelled',
      data: { metadata: { user_id: u.id }, subscription_id: 'sub_x' },
    });
    assert.equal(res.status, 200);
    assert.equal((await getProfile(u.id)).is_pro, false);
  });

  describe('affiliate conversion recording + duplicate guard', () => {
    let affiliate: TestUser;
    before(async () => {
      affiliate = await createTestUser('wh-aff@example.test');
      await setProfileFlags(affiliate.id, { is_affiliate: true, affiliate_code: 'aff_rec', commission_rate: 0.3 });
    });

    async function convCount(referredId: string) {
      const { count } = await admin
        .from('affiliate_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('referred_user_id', referredId);
      return count ?? 0;
    }

    it('records a conversion for a first-time (non-Pro) referred purchase', async () => {
      const referred = await createTestUser('wh-aff-new@example.test');
      await deliver({
        type: 'payment.succeeded',
        data: { metadata: { user_id: referred.id, affiliate_code: 'aff_rec' }, payment_id: 'pay_new', total_amount: 1000 },
      });
      assert.equal(await convCount(referred.id), 1);
      const { data: conv } = await admin
        .from('affiliate_conversions')
        .select('plan, commission_usd')
        .eq('referred_user_id', referred.id)
        .single();
      const row = conv as { plan: string; commission_usd: string };
      assert.equal(row.plan, 'lifetime');
      assert.equal(Number(row.commission_usd), 3); // $10 * 0.30
    });

    it('does NOT record a second conversion for an already-Pro user', async () => {
      const referred = await createTestUser('wh-aff-dup@example.test');
      await setProfileFlags(referred.id, { is_pro: true }); // already Pro
      await deliver({
        type: 'payment.succeeded',
        data: { metadata: { user_id: referred.id, affiliate_code: 'aff_rec' }, payment_id: 'pay_dup', total_amount: 1000 },
      });
      assert.equal(await convCount(referred.id), 0, 'no conversion for an already-Pro buyer');
    });
  });
});
