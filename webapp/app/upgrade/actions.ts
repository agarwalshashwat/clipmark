'use server';

import DodoPayments from 'dodopayments';
import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
});

const PRODUCT_IDS: Record<string, string> = {
  monthly:  process.env.DODO_MONTHLY_PRODUCT_ID!,
  annual:   process.env.DODO_ANNUAL_PRODUCT_ID!,
  lifetime: process.env.DODO_LIFETIME_PRODUCT_ID!,
};

export interface ProductPrices {
  monthly:  string;
  annual:   string;
  lifetime: string;
}

const PRICE_DEFAULTS: ProductPrices = { monthly: '1.99', annual: '19.99', lifetime: '39.99' };

function extractCentPrice(p: { type: string; price?: number; fixed_price?: number }): number {
  return p.type === 'usage_based_price' ? (p.fixed_price ?? 0) : (p.price ?? 0);
}

function centsToDisplay(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2);
}

export const fetchProductPrices = unstable_cache(
  async (): Promise<ProductPrices> => {
    // Prices are in smallest currency unit (cents per Dodo API docs).
    // NOTE: No try/catch here — if the Dodo API call fails, the error propagates
    // out of the cached function so unstable_cache does NOT store a failed result.
    // The public getProductPrices() wrapper below catches errors without caching them.
    const [monthly, annual, lifetime] = await Promise.all([
      dodo.products.retrieve(PRODUCT_IDS.monthly),
      dodo.products.retrieve(PRODUCT_IDS.annual),
      dodo.products.retrieve(PRODUCT_IDS.lifetime),
    ]);
    return {
      monthly:  centsToDisplay(extractCentPrice(monthly.price  as { type: string; price?: number; fixed_price?: number })),
      annual:   centsToDisplay(extractCentPrice(annual.price   as { type: string; price?: number; fixed_price?: number })),
      lifetime: centsToDisplay(extractCentPrice(lifetime.price as { type: string; price?: number; fixed_price?: number })),
    };
  },
  ['dodo-product-prices'],
  { revalidate: 300, tags: ['dodo-product-prices'] }
);

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

  if (daysSinceStart <= 14) {
    // Within 14-day window: immediate cancellation
    await dodo.subscriptions.update(profile.subscription_id, { status: 'cancelled' });
    // Webhook will fire subscription.cancelled → is_pro = false automatically
  } else {
    // After 14 days: cancel at next billing date — user keeps Pro until period end
    await dodo.subscriptions.update(profile.subscription_id, { cancel_at_next_billing_date: true });
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
  const affiliateCode   = cookieStore.get('clipmark_ref')?.value ?? null;
  const userReferralCode = cookieStore.get('clipmark_user_ref')?.value ?? null;
  if (affiliateCode)    cookieStore.delete('clipmark_ref');
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

  const session = await dodo.checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: {
      email: user.email!,
      name:  user.user_metadata?.full_name ?? undefined,
    },
    ...(dodoDiscountCode ? { discount_code: dodoDiscountCode } : {}),
    metadata: {
      user_id: user.id,
      ...(affiliateCode    ? { affiliate_code:    affiliateCode    } : {}),
      ...(userReferralCode ? { user_referral_code: userReferralCode } : {}),
    },
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
  });

  redirect(session.checkout_url!);
}
