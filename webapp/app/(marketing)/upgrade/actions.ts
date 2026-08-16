'use server';

import DodoPayments from 'dodopayments';
import * as Sentry from '@sentry/nextjs';
import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/clients';
import { redirect } from 'next/navigation';
import { APP_URL, SUPPORT_EMAIL } from '@/app/lib/constants';
import { recordPendingRefund } from '@/app/lib/pending-refunds';
import { type ProductPrices } from './pricing';

// Lazy, memoized Dodo client. Constructing eagerly at module scope throws when
// DODO_PAYMENTS_API_KEY is unset — and since the landing page imports this module
// (PlanCards + fetchProductPrices), that would 500 `/` in any keyless environment
// (e.g. CI smoke jobs). Defer construction until a Dodo call actually runs; the
// price fetch's try/catch then falls back to PRICE_DEFAULTS instead of crashing.
let _dodo: DodoPayments | null = null;
function dodoClient(): DodoPayments {
  return (_dodo ??= new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
    environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
  }));
}

const PRODUCT_IDS: Record<string, string> = {
  monthly: process.env.DODO_MONTHLY_PRODUCT_ID!,
  annual: process.env.DODO_ANNUAL_PRODUCT_ID!,
  lifetime: process.env.DODO_LIFETIME_PRODUCT_ID!,
};

type DodoPrice = { type: string; price?: number; fixed_price?: number };

function extractCentPrice(p: DodoPrice): number {
  return p.type === 'usage_based_price' ? (p.fixed_price ?? 0) : (p.price ?? 0);
}

function centsToDisplay(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2);
}

const getCachedProductPrices = unstable_cache(
  async (): Promise<ProductPrices> => {
    // Prices are in smallest currency unit (cents per Dodo API docs).
    // NOTE: No try/catch here — if the Dodo API call fails, the error propagates
    // out of the cached function so unstable_cache does NOT store a failed result.
    // The public getProductPrices() wrapper below catches errors without caching them.
    const [monthly, annual, lifetime] = await Promise.all([
      dodoClient().products.retrieve(PRODUCT_IDS.monthly),
      dodoClient().products.retrieve(PRODUCT_IDS.annual),
      dodoClient().products.retrieve(PRODUCT_IDS.lifetime),
    ]);
    // Amounts only: the currency is fixed at USD for every region (see
    // PRICE_CURRENCY in ./pricing), so there is nothing per-product to carry.
    return {
      monthly: centsToDisplay(extractCentPrice(monthly.price as DodoPrice)),
      annual: centsToDisplay(extractCentPrice(annual.price as DodoPrice)),
      lifetime: centsToDisplay(extractCentPrice(lifetime.price as DodoPrice)),
    };
  },
  ['dodo-product-prices'],
  { revalidate: 300, tags: ['dodo-product-prices'] }
);

export async function fetchProductPrices(): Promise<ProductPrices> {
  return getCachedProductPrices();
}

/**
 * Result of a cancellation attempt.
 *
 * Returned rather than thrown because Next redacts Server Action errors in
 * production: the client gets a generic message plus a digest, never the text
 * we wrote. Every carefully-worded `throw new Error(...)` in here was therefore
 * invisible to the person it was written for — they saw "an error occurred".
 * A returned value crosses the boundary intact.
 */
export type CancelResult =
  /**
   * `refund: 'manual'` means the cancellation went through but Dodo could not
   * fund the refund, so a human has to issue it from the Dodo dashboard. The
   * caller must say so — the user is owed money and cannot tell from the UI.
   */
  | { ok: true; refund: 'issued' | 'manual' | 'none' }
  | { ok: false; message: string };

export async function cancelSubscription(): Promise<CancelResult> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: 'Your session has expired. Please sign in again and retry.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_id, subscription_started_at, pro_payment_id')
    .eq('id', user.id)
    .single();

  if (!profile?.subscription_id) {
    return {
      ok: false,
      message: 'No active subscription found. Lifetime access cannot be cancelled here.',
    };
  }

  const daysSinceStart = profile.subscription_started_at
    ? (Date.now() - new Date(profile.subscription_started_at).getTime()) / 86400000
    : Infinity;

  if (daysSinceStart <= 7) {
    // Within the 7-day money-back window: refund the payment, then cancel.
    //
    // The refund has to be requested explicitly. Cancelling a subscription does
    // NOT return the money — Dodo's SubscriptionUpdateParams has no refund field
    // and refunds are a separate API. This branch used to call only `update`,
    // so the button labelled "Cancel & Request Refund" revoked Pro and kept the
    // customer's money, contradicting both the confirm dialog and our own terms.
    if (!profile.pro_payment_id) {
      // No payment on file to refund against — cancelling here would repeat the
      // original bug in a quieter way, so stop and route them to a human.
      Sentry.captureException(new Error('Refund-eligible cancel with no pro_payment_id on profile'), {
        level: 'error',
        tags: { checkout: 'dodo', dodo_action: 'refund_missing_payment_id' },
      });
      return {
        ok: false,
        message: `We couldn't process your refund automatically. Please email ${SUPPORT_EMAIL} and we'll sort it out right away — your subscription has not been cancelled.`,
      };
    }

    // Try the refund first, but do not let an unfundable one block the
    // cancellation — see the INSUFFICIENT_WALLET_FUNDS note below.
    let refund: 'issued' | 'manual' = 'issued';
    try {
      await dodoClient().refunds.create({
        payment_id: profile.pro_payment_id,
        reason: '7-day money-back guarantee',
      });
    } catch (err) {
      // Dodo pays refunds out of the merchant wallet's *available* balance, not
      // by reversing the original charge. Funds take ~21-25 days to settle and
      // only pay out above a $50 threshold, so for a young account a refund
      // requested inside the 7-day window fails with 409
      // INSUFFICIENT_WALLET_FUNDS as a matter of course, not as an anomaly.
      //
      // That is recoverable — the refund can be issued by hand from the Dodo
      // dashboard — so it must not block the cancellation. Cancelling needs no
      // balance and always works, and skipping it would leave a subscription
      // live that bills the customer again next month while they are already
      // owed a refund. So: cancel now, flag the refund for a human, and tell
      // the user plainly that money is still owed to them.
      //
      // Any other refund failure is unexplained, so it stops here instead.
      const dodoCode = (err as { error?: { code?: string } })?.error?.code;
      const unfunded = dodoCode === 'INSUFFICIENT_WALLET_FUNDS';
      console.error(`[cancelSubscription] Dodo refund failed (code=${dodoCode ?? 'unknown'}):`, err);
      Sentry.captureException(err, {
        level: 'error',
        tags: {
          checkout: 'dodo',
          dodo_action: unfunded ? 'refund_needs_manual_processing' : 'refund_failed',
          dodo_error_code: String(dodoCode ?? 'unknown'),
          dodo_status: String((err as { status?: number }).status ?? 'unknown'),
        },
        // Dodo's own opaque payment id, so whoever picks up the alert can issue
        // the refund from the dashboard without another lookup. No PII, per
        // lib/sentry-config.ts.
        extra: { payment_id: profile.pro_payment_id },
      });

      if (!unfunded) {
        return {
          ok: false,
          message: `We couldn't complete your refund, so we've left your subscription active rather than cancel it while you're still owed money. Our team has been alerted — email ${SUPPORT_EMAIL} and we'll finish this by hand.`,
        };
      }

      // Write the obligation somewhere queryable. The Sentry issue above is an
      // alert, not a ledger — resolve it, let it auto-archive, or simply miss
      // it, and nothing left in the system knows this customer is owed money.
      // A row in pending_refunds survives all three. Deliberately not awaited
      // for its result: recordPendingRefund never throws and returns false if
      // it couldn't write (e.g. migration 018 not applied yet), in which case
      // the Sentry alert is the backstop it has always been.
      await recordPendingRefund(getSupabaseAdmin(), {
        paymentId: profile.pro_payment_id,
        userId: user.id,
        reason: 'insufficient_wallet_funds',
      });

      refund = 'manual';
    }

    try {
      await dodoClient().subscriptions.update(profile.subscription_id, { status: 'cancelled' });
    } catch (err) {
      console.error('[cancelSubscription] cancel failed after refund step:', err);
      Sentry.captureException(err, {
        level: 'error',
        tags: { checkout: 'dodo', dodo_action: 'cancel_after_refund_failed' },
        extra: { payment_id: profile.pro_payment_id, refund },
      });
      return {
        ok: false,
        message: refund === 'issued'
          ? `Your refund has been issued, but we hit a problem cancelling the subscription itself. Please email ${SUPPORT_EMAIL} so we can close it out — you will not be charged again.`
          : `We hit a problem cancelling your subscription. Please email ${SUPPORT_EMAIL} and we'll cancel it and refund you by hand.`,
      };
    }
    // Webhook will fire subscription.cancelled → is_pro = false automatically.
    // When the refund lands — whether from the call above or issued by hand
    // later — refund.succeeded reverses any affiliate commission and referral
    // reward for the payment.
    return { ok: true, refund };
  }

  // After 7 days: cancel at next billing date — user keeps Pro until period end
  await dodoClient().subscriptions.update(profile.subscription_id, { cancel_at_next_billing_date: true });
  await supabase.from('profiles').update({ cancel_at_period_end: true }).eq('id', user.id);
  return { ok: true, refund: 'none' };
}

export async function createCheckoutSession(formData: FormData) {
  const plan = formData.get('plan') as string;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin?redirect=/upgrade');
  }

  const productId = PRODUCT_IDS[plan];
  if (!productId) throw new Error(`Unknown plan: ${plan}`);

  const cookieStore = await cookies();
  const affiliateCode = cookieStore.get('clipmark_ref')?.value ?? null;
  const userReferralCode = cookieStore.get('clipmark_user_ref')?.value ?? null;
  if (affiliateCode) cookieStore.delete('clipmark_ref');
  if (userReferralCode) cookieStore.delete('clipmark_user_ref');

  // Look up the affiliate's Dodo discount code to apply at checkout
  let dodoDiscountCode: string | null = null;
  if (affiliateCode) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: affiliateProfile } = await supabaseAdmin
      .from('profiles')
      .select('dodo_discount_code')
      .eq('affiliate_code', affiliateCode)
      .eq('is_affiliate', true)
      .single();
    dodoDiscountCode = (affiliateProfile?.dodo_discount_code as string | null) ?? null;
  }

  // This is the only call here that reaches a third party, so it owns the
  // try/catch. Anything it throws — a 403 MERCHANT_NOT_LIVE while Dodo's
  // live-mode approval is still pending, a 5xx, a network blip, a bad key —
  // used to propagate out of the action and render global-error.tsx, i.e. a
  // crash screen on the one page where the user is trying to pay us. Send them
  // back to /upgrade with a retry prompt instead.
  //
  // Deliberately scoped to the Dodo call: `redirect()` throws NEXT_REDIRECT to
  // do its work, so wrapping the redirect below in the same block would swallow
  // it and silently drop the user on a blank action response.
  let checkoutUrl: string | null = null;
  try {
    const session = await dodoClient().checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email!,
        name: user.user_metadata?.full_name ?? undefined,
      },
      ...(dodoDiscountCode ? { discount_code: dodoDiscountCode } : {}),
      metadata: {
        user_id: user.id,
        ...(affiliateCode ? { affiliate_code: affiliateCode } : {}),
        ...(userReferralCode ? { user_referral_code: userReferralCode } : {}),
      },
      // APP_URL, not the raw env var: the production NEXT_PUBLIC_APP_URL is set
      // WITH a trailing slash, so concatenating `/dashboard` here handed Dodo a
      // return_url of `https://…com//dashboard?success=true`. That path 308s on
      // our side, so the payer's redirect home from checkout depended on a third
      // party following a redirect it never needed to be given.
      return_url: `${APP_URL}/dashboard?success=true`,
    });
    checkoutUrl = session.checkout_url ?? null;
  } catch (err) {
    // Not swallowed: every failure is logged and paged on. A checkout nobody
    // can complete is revenue-affecting, so this is an error, not a warning.
    // Tags carry the plan and Dodo's own status code only — no user id or
    // email, per the no-PII policy in lib/sentry-config.ts.
    console.error('[createCheckoutSession] Dodo checkout session failed:', err);
    Sentry.captureException(err, {
      level: 'error',
      tags: {
        checkout: 'dodo',
        dodo_plan: plan,
        dodo_status: String((err as { status?: number }).status ?? 'unknown'),
      },
    });
    redirect('/upgrade?checkout_error=1');
  }

  // A 2xx with no URL is the same dead end for the user, and just as worth
  // knowing about, so it takes the same path rather than redirecting to
  // `undefined`.
  if (!checkoutUrl) {
    console.error('[createCheckoutSession] Dodo returned a session with no checkout_url');
    Sentry.captureException(new Error('Dodo checkout session returned no checkout_url'), {
      level: 'error',
      tags: { checkout: 'dodo', dodo_plan: plan, dodo_status: 'no_checkout_url' },
    });
    redirect('/upgrade?checkout_error=1');
  }

  redirect(checkoutUrl);
}
