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

  // ── Helper: record affiliate commission if affiliate_code is in metadata ──
  async function recordAffiliateConversion(
    payingUserId: string,
    affiliateCode: string | undefined,
    plan: 'monthly' | 'annual' | 'lifetime',
    paymentId?: string,
  ) {
    if (!affiliateCode) return;

    const PLAN_AMOUNTS: Record<string, number> = {
      monthly:  5.00,
      annual:   40.00,
      lifetime: 39.99,
    };
    const amount = PLAN_AMOUNTS[plan];
    if (!amount) return;

    const { data: affiliate } = await supabaseAdmin
      .from('profiles')
      .select('id, commission_rate')
      .eq('affiliate_code', affiliateCode)
      .eq('is_affiliate', true)
      .single();

    if (!affiliate) return;

    // Guard: do not reward self-referrals
    if (affiliate.id === payingUserId) return;

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
      // Stored so a payment.refunded webhook can cancel this row within the 30-day window
      dodo_payment_id:  paymentId ?? null,
    });
  }

  // payment.succeeded fires for one-time purchases (Lifetime plan)
  if (type === 'payment.succeeded') {
    const payment = data as DodoPayments.WebhookPayload.Payment;
    const userId = payment.metadata?.user_id;
    if (userId) {
      await supabaseAdmin.from('profiles').update({ is_pro: true }).eq('id', userId);
      await recordAffiliateConversion(userId, payment.metadata?.affiliate_code, 'lifetime', payment.payment_id);
    }
  }

  // subscription.active fires when a new subscription starts
  else if (type === 'subscription.active') {
    const sub = data as DodoPayments.WebhookPayload.Subscription;
    const userId = sub.metadata?.user_id;
    if (userId) {
      // Determine plan from product ID
      const productId = (sub as unknown as { product_id?: string }).product_id ?? '';
      const plan = productId === process.env.DODO_ANNUAL_PRODUCT_ID ? 'annual' : 'monthly';

      await supabaseAdmin.from('profiles').update({
        is_pro: true,
        subscription_id: sub.subscription_id,
        subscription_started_at: sub.created_at,
        subscription_period_end: sub.next_billing_date ?? null,
        cancel_at_period_end: false,
      }).eq('id', userId);

      // Use subscription_id as the payment reference for subscription plans
      await recordAffiliateConversion(userId, sub.metadata?.affiliate_code, plan, sub.subscription_id);
    }
  }

  // subscription.renewed fires on each successful billing cycle
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

  // subscription.cancelled / expired — revoke Pro access
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

  // refund.succeeded — cancel any pending affiliate commission tied to this payment.
  // This ensures affiliates are never paid for sales refunded within the 30-day window.
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
