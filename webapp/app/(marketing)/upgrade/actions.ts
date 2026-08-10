'use server';

import DodoPayments from 'dodopayments';
import * as Sentry from '@sentry/nextjs';
import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
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

function extractCentPrice(p: { type: string; price?: number; fixed_price?: number }): number {
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
    return {
      monthly: centsToDisplay(extractCentPrice(monthly.price as { type: string; price?: number; fixed_price?: number })),
      annual: centsToDisplay(extractCentPrice(annual.price as { type: string; price?: number; fixed_price?: number })),
      lifetime: centsToDisplay(extractCentPrice(lifetime.price as { type: string; price?: number; fixed_price?: number })),
    };
  },
  ['dodo-product-prices'],
  { revalidate: 300, tags: ['dodo-product-prices'] }
);

export async function fetchProductPrices(): Promise<ProductPrices> {
  return getCachedProductPrices();
}

export async function cancelSubscription() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_id, subscription_started_at')
    .eq('id', user.id)
    .single();

  if (!profile?.subscription_id) {
    throw new Error('No active subscription found. Lifetime access cannot be cancelled here.');
  }

  const daysSinceStart = profile.subscription_started_at
    ? (Date.now() - new Date(profile.subscription_started_at).getTime()) / 86400000
    : Infinity;

  if (daysSinceStart <= 7) {
    // Within the 7-day money-back window: immediate cancellation + refund
    await dodoClient().subscriptions.update(profile.subscription_id, { status: 'cancelled' });
    // Webhook will fire subscription.cancelled → is_pro = false automatically
  } else {
    // After 7 days: cancel at next billing date — user keeps Pro until period end
    await dodoClient().subscriptions.update(profile.subscription_id, { cancel_at_next_billing_date: true });
    await supabase.from('profiles').update({ cancel_at_period_end: true }).eq('id', user.id);
  }
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
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
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
