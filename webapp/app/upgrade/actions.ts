'use server';

import DodoPayments from 'dodopayments';
import { unstable_cache } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase';
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

const PRICE_DEFAULTS: ProductPrices = { monthly: '5', annual: '40', lifetime: '40' };

function extractCentPrice(p: { type: string; price?: number; fixed_price?: number }): number {
  return p.type === 'usage_based_price' ? (p.fixed_price ?? 0) : (p.price ?? 0);
}

function centsToDisplay(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2);
}

export const fetchProductPrices = unstable_cache(
  async (): Promise<ProductPrices> => {
    // Prices are in smallest currency unit (cents per Dodo API docs)
    try {
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
    } catch (err) {
      console.error('[fetchProductPrices] Dodo API error, using defaults:', err);
      return PRICE_DEFAULTS;
    }
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

  const session = await dodo.checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: {
      email: user.email!,
      name:  user.user_metadata?.full_name ?? undefined,
    },
    // Passed through to webhook payload so we can identify the Supabase user
    metadata: { user_id: user.id },
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
  });

  redirect(session.checkout_url!);
}
