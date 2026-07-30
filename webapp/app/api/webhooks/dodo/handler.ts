import type DodoPayments from 'dodopayments';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Injectable dependencies so the handler can be unit-tested with fakes.
// Production supplies the real memoized clients (see POST wrapper at the bottom).
export interface WebhookDeps {
  dodo: Pick<DodoPayments, 'webhooks'>;
  // Service-role client — bypasses RLS so the webhook can update any user's profile.
  admin: SupabaseClient;
}

// Structured logger so webhook health (signature failures, DB write failures,
// conversion outcomes) is observable in production logs / alerting.
const log = {
  info:  (msg: string, meta?: unknown) => console.info(`[dodo-webhook] ${msg}`, meta ?? ''),
  warn:  (msg: string, meta?: unknown) => console.warn(`[dodo-webhook] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: unknown) => console.error(`[dodo-webhook] ${msg}`, meta ?? ''),
};

// A failed Supabase write returns { error } rather than throwing. For entitlement
// writes (is_pro grants/revokes) we MUST surface the failure so the handler
// returns 500 and Dodo redelivers — otherwise the user pays but is never granted
// Pro and nothing alerts.
function assertWrite(label: string, error: { message?: string } | null) {
  if (error) {
    log.error(`${label} — DB write failed`, error.message ?? error);
    throw new Error(`${label} failed`);
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/** True while a gifted-Pro window (creator seed OR referral reward) is still active. */
function hasActiveGiftedPro(profile: { is_gifted_pro?: boolean | null; gifted_pro_expires_at?: string | null } | null | undefined) {
  if (!profile?.is_gifted_pro) return false;
  const expiresAt = profile.gifted_pro_expires_at ?? null;
  return expiresAt === null || new Date(expiresAt) > new Date();
}

export async function handleDodoWebhook(request: NextRequest, { dodo, admin }: WebhookDeps) {
  const body = await request.text();
  const webhookId = request.headers.get('webhook-id') ?? 'unknown';

  let event: DodoPayments.WebhookPayload;
  try {
    event = dodo.webhooks.unwrap(body, {
      headers: {
        'webhook-id':        request.headers.get('webhook-id')        ?? '',
        'webhook-signature': request.headers.get('webhook-signature') ?? '',
        'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
      },
    }) as DodoPayments.WebhookPayload;
  } catch {
    log.error(`signature verification failed webhook-id=${webhookId}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { type, data } = event;
  log.info(`received type=${type} webhook-id=${webhookId}`);

  async function recordAffiliateConversion(
    payingUserId: string,
    affiliateCode: string | undefined,
    plan: 'monthly' | 'annual' | 'lifetime',
    amountCents: number,          // actual amount paid in cents (from Dodo payload)
    paymentId?: string,
  ) {
    if (!affiliateCode) return;

    // Convert cents to USD dollars
    const amount = parseFloat((amountCents / 100).toFixed(2));
    if (!amount) return;

    const { data: affiliate } = await admin
      .from('profiles')
      .select('id, commission_rate')
      .eq('affiliate_code', affiliateCode)
      .eq('is_affiliate', true)
      .single();

    if (!affiliate) return;

    // Self-referral guard: affiliate cannot earn commission on their own purchase
    if (affiliate.id === payingUserId) return;

    // Duplicate conversion guard: one commission per referred user lifetime
    const { count: existingCount } = await admin
      .from('affiliate_conversions')
      .select('*', { count: 'exact', head: true })
      .eq('referred_user_id', payingUserId)
      .neq('status', 'cancelled');
    if ((existingCount ?? 0) > 0) return;

    const commissionRate = Number(affiliate.commission_rate) || 0.30;
    const commissionUsd  = parseFloat((amount * commissionRate).toFixed(2));

    // Attribution failures are logged but NOT fatal: without an idempotency
    // backstop, forcing a Dodo retry here could double-credit. Log for follow-up.
    const { error } = await admin.from('affiliate_conversions').insert({
      affiliate_id:     affiliate.id,
      referred_user_id: payingUserId,
      plan,
      amount_usd:       amount,
      commission_usd:   commissionUsd,
      commission_rate:  commissionRate,
      status:           'pending',
      dodo_payment_id:  paymentId ?? null,
    });
    if (error) log.error(`affiliate conversion insert failed user=${payingUserId}`, error.message);
    else log.info(`affiliate conversion recorded user=${payingUserId} plan=${plan} commission=${commissionUsd}`);
  }

  /**
   * recordReferralCredit — grants the referrer free Pro time immediately when
   * a referred user makes their first Pro purchase via a /ref/[code] link.
   *
   * Previously this only incremented a `referral_months_credit` counter with
   * no code path that ever converted it into real entitlement (the referral
   * dashboard's "automatically applied" copy was aspirational, not true). It
   * now reuses the same is_gifted_pro/gifted_pro_expires_at mechanism as
   * creator/partner Pro seeding: the reward stacks as a parallel gifted-Pro
   * window alongside any paid subscription, so cancelling a subscription
   * later doesn't strip reward time already earned (see the gift-aware guard
   * on subscription.cancelled/expired below). referral_months_credit is kept
   * as a lifetime-earned audit counter for the referral dashboard.
   *
   * Guards:
   *  - Code must map to a real profile
   *  - Self-referral blocked (referrer_id === payingUserId)
   *  - One reward per referred user lifetime (duplicate guard)
   */
  async function recordReferralCredit(
    payingUserId: string,
    userReferralCode: string | undefined,
    rewardMonths = 3,
  ) {
    if (!userReferralCode) return;

    const { data: referrer } = await admin
      .from('profiles')
      .select('id, referral_months_credit, is_pro, is_gifted_pro, gifted_pro_expires_at')
      .eq('referral_code', userReferralCode)
      .single();

    if (!referrer) return;

    // Self-referral guard
    if (referrer.id === payingUserId) return;

    // Duplicate reward guard: one reward per referred user
    const { count: existingCount } = await admin
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referred_user_id', payingUserId)
      .neq('status', 'cancelled');
    if ((existingCount ?? 0) > 0) return;

    const now = new Date();
    const alreadyPermanentGift = referrer.is_gifted_pro === true && referrer.gifted_pro_expires_at === null;

    // Stack on top of any remaining gift window rather than resetting it.
    const windowStart = (!alreadyPermanentGift && hasActiveGiftedPro(referrer))
      ? new Date(referrer.gifted_pro_expires_at as string)
      : now;

    const profileUpdate: Record<string, unknown> = {
      referral_months_credit: (Number(referrer.referral_months_credit) || 0) + rewardMonths,
    };
    if (!referrer.is_pro) profileUpdate.is_pro = true;
    if (!alreadyPermanentGift) {
      profileUpdate.is_gifted_pro = true;
      profileUpdate.gifted_pro_expires_at = addMonths(windowStart, rewardMonths).toISOString();
    }

    // Award the months and record the referral (attribution — log, don't 500).
    const [creditRes, insertRes] = await Promise.all([
      admin.from('profiles').update(profileUpdate).eq('id', referrer.id),
      admin.from('referrals').insert({
        referrer_id:      referrer.id,
        referred_user_id: payingUserId,
        status:           'rewarded',
        reward_months:    rewardMonths,
        reward_applied_at: now.toISOString(),
      }),
    ]);
    if (creditRes.error || insertRes.error) {
      log.error(`referral credit failed referrer=${referrer.id} user=${payingUserId}`,
        creditRes.error?.message ?? insertRes.error?.message);
    } else {
      log.info(`referral credit awarded referrer=${referrer.id} months=${rewardMonths} gifted_pro_expires_at=${profileUpdate.gifted_pro_expires_at ?? 'permanent'}`);
    }
  }

  try {
    if (type === 'payment.succeeded') {
      const payment = data as DodoPayments.WebhookPayload.Payment;
      const userId = payment.metadata?.user_id;
      if (userId) {
        // Capture is_pro state BEFORE updating so we can detect already-Pro users
        const { data: existingProfile } = await admin
          .from('profiles')
          .select('is_pro')
          .eq('id', userId)
          .single();

        // Store pro_payment_id so a later refund can reverse this grant.
        const { error } = await admin
          .from('profiles')
          .update({ is_pro: true, pro_payment_id: payment.payment_id ?? null })
          .eq('id', userId);
        assertWrite('grant pro (payment.succeeded)', error);
        log.info(`granted pro user=${userId} payment=${payment.payment_id}`);

        // Only record conversion if the user was not already a Pro subscriber
        if (!existingProfile?.is_pro) {
          const amountCents = (payment as unknown as { total_amount?: number }).total_amount ?? 0;
          await recordAffiliateConversion(userId, payment.metadata?.affiliate_code, 'lifetime', amountCents, payment.payment_id);
          await recordReferralCredit(userId, payment.metadata?.user_referral_code);
        }
      }
    }

    else if (type === 'subscription.active') {
      const sub = data as DodoPayments.WebhookPayload.Subscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        const productId = (sub as unknown as { product_id?: string }).product_id ?? '';
        const plan = productId === process.env.DODO_ANNUAL_PRODUCT_ID ? 'annual' : 'monthly';

        // Capture is_pro + subscription_id state BEFORE updating
        const { data: existingProfile } = await admin
          .from('profiles')
          .select('is_pro, subscription_id')
          .eq('id', userId)
          .single();

        const { error } = await admin.from('profiles').update({
          is_pro: true,
          subscription_id: sub.subscription_id,
          subscription_started_at: sub.created_at,
          subscription_period_end: sub.next_billing_date ?? null,
          cancel_at_period_end: false,
        }).eq('id', userId);
        assertWrite('grant pro (subscription.active)', error);
        log.info(`activated subscription user=${userId} plan=${plan} sub=${sub.subscription_id}`);

        // Only record conversion if user was not already an active subscriber
        const wasAlreadyActiveSubscriber = existingProfile?.is_pro === true && !!existingProfile?.subscription_id;
        if (!wasAlreadyActiveSubscriber) {
          const amountCents = (sub as unknown as { recurring_pre_tax_amount?: number }).recurring_pre_tax_amount ?? 0;
          await recordAffiliateConversion(userId, sub.metadata?.affiliate_code, plan, amountCents, sub.subscription_id);
          await recordReferralCredit(userId, sub.metadata?.user_referral_code);
        }
      }
    }

    else if (type === 'subscription.renewed') {
      const sub = data as DodoPayments.WebhookPayload.Subscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        const { error } = await admin.from('profiles').update({
          is_pro: true,
          subscription_period_end: sub.next_billing_date ?? null,
          cancel_at_period_end: false,
        }).eq('id', userId);
        assertWrite('renew subscription', error);
        log.info(`renewed subscription user=${userId} sub=${sub.subscription_id}`);
      }
    }

    else if (type === 'subscription.cancelled' || type === 'subscription.expired') {
      const sub = data as DodoPayments.WebhookPayload.Subscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        // A cancelled/expired subscription shouldn't strip an active gifted-Pro
        // window (creator seed or referral reward) running alongside it —
        // those are earned/granted independently of the subscription.
        const { data: existingProfile } = await admin
          .from('profiles')
          .select('is_gifted_pro, gifted_pro_expires_at')
          .eq('id', userId)
          .single();
        const retainedViaGift = hasActiveGiftedPro(existingProfile);

        const { error } = await admin.from('profiles').update({
          is_pro: retainedViaGift,
          subscription_id: null,
          subscription_period_end: null,
          cancel_at_period_end: false,
        }).eq('id', userId);
        assertWrite(`revoke pro (${type})`, error);
        log.info(`revoked pro user=${userId} reason=${type} retained_via_gift=${retainedViaGift}`);
      }
    }

    else if (type === 'refund.succeeded') {
      const refund = data as { payment_id?: string };
      if (refund.payment_id) {
        // Reverse any pending affiliate commission for this payment (non-fatal).
        const { error: convErr } = await admin
          .from('affiliate_conversions')
          .update({ status: 'cancelled' })
          .eq('dodo_payment_id', refund.payment_id)
          .eq('status', 'pending');
        if (convErr) log.error(`cancel affiliate conversion failed payment=${refund.payment_id}`, convErr.message);

        // Revoke Pro for a refunded one-time (lifetime) purchase. Subscription
        // refunds are handled by subscription.cancelled/expired. A refund of
        // the lifetime purchase shouldn't strip an unrelated active gifted-Pro
        // window (creator seed or referral reward) on the same profile.
        const { data: refundedProfile, error: findErr } = await admin
          .from('profiles')
          .select('id, is_gifted_pro, gifted_pro_expires_at')
          .eq('pro_payment_id', refund.payment_id)
          .maybeSingle();
        if (findErr) log.error(`lookup refunded profile failed payment=${refund.payment_id}`, findErr.message);

        if (refundedProfile) {
          const retainedViaGift = hasActiveGiftedPro(refundedProfile);
          const { error: revokeErr } = await admin
            .from('profiles')
            .update({ is_pro: retainedViaGift, pro_payment_id: null })
            .eq('id', refundedProfile.id);
          assertWrite('revoke pro (refund)', revokeErr);
          log.info(`revoked pro user=${refundedProfile.id} reason=refund payment=${refund.payment_id} retained_via_gift=${retainedViaGift}`);
        }
      }
    }
  } catch (err) {
    // A critical entitlement write failed — return 500 so Dodo redelivers the
    // event rather than silently leaving the user in the wrong state.
    log.error(`handler failed, returning 500 for retry webhook-id=${webhookId}`, (err as Error).message);
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
