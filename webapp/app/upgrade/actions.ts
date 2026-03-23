'use server';

import DodoPayments from 'dodopayments';
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
