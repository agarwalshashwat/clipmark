import DodoPayments from 'dodopayments';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
  environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
});

// Service role client — bypasses RLS so the webhook can update any user's profile
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: NextRequest) {
  const body = await request.text();

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
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { type, data } = event;

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

    const { data: affiliate } = await supabaseAdmin
      .from('profiles')
      .select('id, commission_rate')
      .eq('affiliate_code', affiliateCode)
      .eq('is_affiliate', true)
      .single();

    if (!affiliate) return;

    // Self-referral guard: affiliate cannot earn commission on their own purchase
    if (affiliate.id === payingUserId) return;

    // Duplicate conversion guard: one commission per referred user lifetime
    const { count: existingCount } = await supabaseAdmin
      .from('affiliate_conversions')
      .select('*', { count: 'exact', head: true })
      .eq('referred_user_id', payingUserId)
      .neq('status', 'cancelled');
    if ((existingCount ?? 0) > 0) return;

    const commissionRate = Number(affiliate.commission_rate) || 0.30;
    const commissionUsd  = parseFloat((amount * commissionRate).toFixed(2));

    await supabaseAdmin.from('affiliate_conversions').insert({
      affiliate_id:     affiliate.id,
      referred_user_id: payingUserId,
      plan,
      amount_usd:       amount,
      commission_usd:   commissionUsd,
      commission_rate:  commissionRate,
      status:           'pending',
      dodo_payment_id:  paymentId ?? null,
    });
  }

  /**
   * recordReferralCredit — awards free months to the referrer when a referred
   * user makes their first Pro purchase via a /ref/[code] link.
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

    const { data: referrer } = await supabaseAdmin
      .from('profiles')
      .select('id, referral_months_credit')
      .eq('referral_code', userReferralCode)
      .single();

    if (!referrer) return;

    // Self-referral guard
    if (referrer.id === payingUserId) return;

    // Duplicate reward guard: one reward per referred user
    const { count: existingCount } = await supabaseAdmin
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referred_user_id', payingUserId)
      .neq('status', 'cancelled');
    if ((existingCount ?? 0) > 0) return;

    // Award the months and record the referral
    await Promise.all([
      supabaseAdmin.from('profiles')
        .update({ referral_months_credit: (Number(referrer.referral_months_credit) || 0) + rewardMonths })
        .eq('id', referrer.id),
      supabaseAdmin.from('referrals').insert({
        referrer_id:      referrer.id,
        referred_user_id: payingUserId,
        status:           'rewarded',
        reward_months:    rewardMonths,
        reward_applied_at: new Date().toISOString(),
      }),
    ]);
  }

  if (type === 'payment.succeeded') {
    const payment = data as DodoPayments.WebhookPayload.Payment;
    const userId = payment.metadata?.user_id;
    if (userId) {
      // Capture is_pro state BEFORE updating so we can detect already-Pro users
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('is_pro')
        .eq('id', userId)
        .single();

      await supabaseAdmin.from('profiles').update({ is_pro: true }).eq('id', userId);

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
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('is_pro, subscription_id')
        .eq('id', userId)
        .single();

      await supabaseAdmin.from('profiles').update({
        is_pro: true,
        subscription_id: sub.subscription_id,
        subscription_started_at: sub.created_at,
        subscription_period_end: sub.next_billing_date ?? null,
        cancel_at_period_end: false,
      }).eq('id', userId);

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
      await supabaseAdmin.from('profiles').update({
        is_pro: true,
        subscription_period_end: sub.next_billing_date ?? null,
        cancel_at_period_end: false,
      }).eq('id', userId);
    }
  }

  else if (type === 'subscription.cancelled' || type === 'subscription.expired') {
    const sub = data as DodoPayments.WebhookPayload.Subscription;
    const userId = sub.metadata?.user_id;
    if (userId) {
      await supabaseAdmin.from('profiles').update({
        is_pro: false,
        subscription_id: null,
        subscription_period_end: null,
        cancel_at_period_end: false,
      }).eq('id', userId);
    }
  }

  else if (type === 'refund.succeeded') {
    const refund = data as { payment_id?: string };
    if (refund.payment_id) {
      await supabaseAdmin
        .from('affiliate_conversions')
        .update({ status: 'cancelled' })
        .eq('dodo_payment_id', refund.payment_id)
        .eq('status', 'pending');
    }
  }

  return NextResponse.json({ received: true });
}
