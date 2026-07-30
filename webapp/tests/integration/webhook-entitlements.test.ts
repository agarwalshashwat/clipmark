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

  it('subscription.cancelled does NOT revoke Pro while an active gifted-Pro window is running', async () => {
    const u = await createTestUser('wh-cancel-gift@example.test');
    await setProfileFlags(u.id, {
      is_pro: true,
      subscription_id: 'sub_gift',
      is_gifted_pro: true,
      gifted_pro_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    const res = await deliver({
      type: 'subscription.cancelled',
      data: { metadata: { user_id: u.id }, subscription_id: 'sub_gift' },
    });
    assert.equal(res.status, 200);
    assert.equal((await getProfile(u.id)).is_pro, true, 'gift keeps them Pro after the paid subscription ends');
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

  describe('referral credit grants gifted Pro immediately', () => {
    it('flips the referrer to Pro with an active gifted-Pro window on a referred first purchase', async () => {
      const referrer = await createTestUser('wh-ref-referrer@example.test');
      const { data: refProfile } = await admin
        .from('profiles')
        .select('referral_code')
        .eq('id', referrer.id)
        .single();
      const referralCode = (refProfile as { referral_code: string }).referral_code;
      assert.ok(referralCode, 'every profile gets an auto-generated referral_code (migration 010)');

      const payer = await createTestUser('wh-ref-payer@example.test');
      const res = await deliver({
        type: 'payment.succeeded',
        data: {
          metadata: { user_id: payer.id, user_referral_code: referralCode },
          payment_id: 'pay_ref',
          total_amount: 0,
        },
      });
      assert.equal(res.status, 200);

      const { data: referrerProfile } = await admin
        .from('profiles')
        .select('is_pro, is_gifted_pro, gifted_pro_expires_at, referral_months_credit')
        .eq('id', referrer.id)
        .single();
      const rp = referrerProfile as {
        is_pro: boolean; is_gifted_pro: boolean;
        gifted_pro_expires_at: string | null; referral_months_credit: number;
      };
      assert.equal(rp.is_pro, true, 'referrer is granted Pro immediately, no manual redemption');
      assert.equal(rp.is_gifted_pro, true);
      assert.ok(rp.gifted_pro_expires_at && new Date(rp.gifted_pro_expires_at) > new Date(), 'gift window is in the future');
      assert.equal(rp.referral_months_credit, 3);

      const { data: referralRow } = await admin
        .from('referrals')
        .select('status')
        .eq('referred_user_id', payer.id)
        .single();
      assert.equal((referralRow as { status: string }).status, 'rewarded');
    });
  });

  describe('referral reward reversal on refund (security PR — closes the pay-then-refund free-Pro loophole)', () => {
    async function referralCodeFor(userId: string): Promise<string> {
      const { data } = await admin.from('profiles').select('referral_code').eq('id', userId).single();
      return (data as { referral_code: string }).referral_code;
    }

    async function referrerState(userId: string) {
      const { data } = await admin
        .from('profiles')
        .select('is_pro, is_gifted_pro, gifted_pro_expires_at, referral_months_credit, subscription_id')
        .eq('id', userId)
        .single();
      return data as {
        is_pro: boolean; is_gifted_pro: boolean; gifted_pro_expires_at: string | null;
        referral_months_credit: number; subscription_id: string | null;
      };
    }

    it('claws back referral_months_credit and the gifted-Pro window when the referred purchase is refunded', async () => {
      const referrer = await createTestUser('wh-ref-refund-referrer@example.test');
      const referralCode = await referralCodeFor(referrer.id);

      const payer = await createTestUser('wh-ref-refund-payer@example.test');
      await deliver({
        type: 'payment.succeeded',
        data: { metadata: { user_id: payer.id, user_referral_code: referralCode }, payment_id: 'pay_ref_refund', total_amount: 0 },
      });

      const granted = await referrerState(referrer.id);
      assert.equal(granted.referral_months_credit, 3, 'sanity: the reward was actually granted');
      assert.equal(granted.is_gifted_pro, true);

      const res = await deliver({ type: 'refund.succeeded', data: { payment_id: 'pay_ref_refund' } });
      assert.equal(res.status, 200);

      const rp = await referrerState(referrer.id);
      assert.equal(rp.referral_months_credit, 0, 'the earned reward is clawed back');
      assert.equal(rp.is_gifted_pro, false);
      assert.equal(rp.gifted_pro_expires_at, null);
      assert.equal(rp.is_pro, false, 'referrer had no other Pro of their own');

      const { data: referralRow } = await admin
        .from('referrals')
        .select('status')
        .eq('referred_user_id', payer.id)
        .single();
      assert.equal((referralRow as { status: string }).status, 'cancelled', 'the referral is marked cancelled, not left rewarded');
    });

    it('repeated pay-then-refund cycles net zero free Pro for the referrer (the loophole is closed)', async () => {
      const referrer = await createTestUser('wh-ref-loop-referrer@example.test');
      const referralCode = await referralCodeFor(referrer.id);

      for (let i = 0; i < 3; i++) {
        const payer = await createTestUser(`wh-ref-loop-payer-${i}@example.test`);
        await deliver({
          type: 'payment.succeeded',
          data: { metadata: { user_id: payer.id, user_referral_code: referralCode }, payment_id: `pay_loop_${i}`, total_amount: 0 },
        });
        await deliver({ type: 'refund.succeeded', data: { payment_id: `pay_loop_${i}` } });
      }

      const rp = await referrerState(referrer.id);
      assert.equal(rp.referral_months_credit, 0, 'no net credit survives repeated pay-then-refund cycles');
      assert.equal(rp.is_gifted_pro, false);
      assert.equal(rp.is_pro, false);
    });

    it('keeps is_pro true via the referrer\'s own subscription after their gift window is clawed back', async () => {
      const referrer = await createTestUser('wh-ref-refund-ownsub@example.test');
      await setProfileFlags(referrer.id, { is_pro: true, subscription_id: 'sub_own_active' });
      const referralCode = await referralCodeFor(referrer.id);

      const payer = await createTestUser('wh-ref-refund-ownsub-payer@example.test');
      await deliver({
        type: 'payment.succeeded',
        data: { metadata: { user_id: payer.id, user_referral_code: referralCode }, payment_id: 'pay_ref_ownsub', total_amount: 0 },
      });
      await deliver({ type: 'refund.succeeded', data: { payment_id: 'pay_ref_ownsub' } });

      const rp = await referrerState(referrer.id);
      assert.equal(rp.is_gifted_pro, false, 'the referral-earned gift window is gone');
      assert.equal(rp.is_pro, true, 'but Pro survives via their own real subscription');
    });

    it('does not touch a referrer\'s unrelated permanent (admin-seeded) gift when a referral is refunded', async () => {
      const referrer = await createTestUser('wh-ref-refund-permanent@example.test');
      await setProfileFlags(referrer.id, { is_pro: true, is_gifted_pro: true, gifted_pro_expires_at: null });
      const referralCode = await referralCodeFor(referrer.id);

      const payer = await createTestUser('wh-ref-refund-permanent-payer@example.test');
      await deliver({
        type: 'payment.succeeded',
        data: { metadata: { user_id: payer.id, user_referral_code: referralCode }, payment_id: 'pay_ref_permanent', total_amount: 0 },
      });
      await deliver({ type: 'refund.succeeded', data: { payment_id: 'pay_ref_permanent' } });

      const rp = await referrerState(referrer.id);
      assert.equal(rp.is_gifted_pro, true, 'a permanent gift is never revoked by a referral refund');
      assert.equal(rp.gifted_pro_expires_at, null);
      assert.equal(rp.is_pro, true);
      assert.equal(rp.referral_months_credit, 0, 'the audit counter is still reversed even though the gift itself is untouched');
    });

    it('does nothing when the refunded purchase was never referred', async () => {
      const payer = await createTestUser('wh-ref-refund-unreferred@example.test');
      await setProfileFlags(payer.id, { is_pro: true, pro_payment_id: 'pay_unreferred' });

      const res = await deliver({ type: 'refund.succeeded', data: { payment_id: 'pay_unreferred' } });
      assert.equal(res.status, 200);

      const { data: p } = await admin.from('profiles').select('is_pro').eq('id', payer.id).single();
      assert.equal((p as { is_pro: boolean }).is_pro, false, 'the refunded payer\'s own Pro is still revoked as before');
    });
  });
});
