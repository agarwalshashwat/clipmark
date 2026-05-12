import { createServerSupabase } from '@/lib/supabase';
import { createCheckoutSession, fetchProductPrices } from './actions';
import CancelSubscriptionButton from './CancelSubscriptionButton';
import LifetimeCountdown from './LifetimeCountdown';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import styles from './upgrade.module.css';

function Check() {
  return (
    <span className={styles.check}>✓</span>
  );
}

function Cross() {
  return (
    <span className={styles.cross}>—</span>
  );
}

const FEATURES: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: 'Unlimited local bookmarks',          free: true,  pro: true  },
  { label: 'Shareable public pages',             free: true,  pro: true  },
  { label: 'Public collections limit',           free: '5',   pro: '∞'   },
  { label: 'Cloud sync across devices',          free: false, pro: true  },
  { label: 'AI auto-fill from transcript',       free: false, pro: true  },
  { label: 'AI summaries',                       free: false, pro: true  },
  { label: 'Smart tag suggestions',              free: false, pro: true  },
  { label: 'Social post generation',             free: false, pro: true  },
  { label: 'Revision Mode',                      free: false, pro: true  },
  { label: 'Spaced revision',                    free: false, pro: true  },
  { label: 'Request a feature',                  free: false, pro: true  },
];

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let isPro = false;
  let subscriptionId: string | null = null;
  let subscriptionStartedAt: string | null = null;
  let subscriptionPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    isPro = profile?.is_pro ?? false;
    subscriptionId = profile?.subscription_id ?? null;
    subscriptionStartedAt = profile?.subscription_started_at ?? null;
    subscriptionPeriodEnd = profile?.subscription_period_end ?? null;
    cancelAtPeriodEnd = profile?.cancel_at_period_end ?? false;
  }

  let prices: import('./actions').ProductPrices;
  try {
    prices = await fetchProductPrices();
  } catch (err) {
    console.error('[UpgradePage] Could not fetch Dodo prices, using defaults:', err);
    prices = { monthly: '1.99', annual: '19.99', lifetime: '39.99' };
  }
  const savingsPct = Math.round(
    (1 - (Number(prices.annual) / 12) / Number(prices.monthly)) * 100
  );

  // ── Referral discount banner ──────────────────────────────────────────────
  // Only available to non-Pro users who arrived via an affiliate link.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const cookieStore = await cookies();
  const refCode = cookieStore.get('clipmark_ref')?.value;
  let referralBanner: { username: string; discountPct: number } | null = null;
  if (refCode && !isPro) {
    const { data: affiliateProfile } = await supabaseAdmin
      .from('profiles')
      .select('username, affiliate_discount_pct, dodo_discount_code')
      .eq('affiliate_code', refCode)
      .eq('is_affiliate', true)
      .single();
    // Only show banner if the affiliate has an active Dodo discount code (real discount)
    if (affiliateProfile?.dodo_discount_code) {
      referralBanner = {
        username:    affiliateProfile.username as string,
        discountPct: (affiliateProfile.affiliate_discount_pct as number | null) ?? 10,
      };
    }
  }

  const daysSinceStart = subscriptionStartedAt
    ? (Date.now() - new Date(subscriptionStartedAt).getTime()) / 86400000
    : Infinity;
  const isRefundEligible = subscriptionId !== null && daysSinceStart <= 14;
  const periodEndFormatted = subscriptionPeriodEnd
    ? new Date(subscriptionPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className={styles.upgradePage}>
      <h1>Upgrade to Pro</h1>
      <div className={styles.featureList}>
        {FEATURES.map((feature, index) => (
          <div key={index} className={styles.featureItem}>
            <div>{feature.label}</div>
            <div>{feature.free ? <Check /> : <Cross />}</div>
            <div>{feature.pro ? <Check /> : <Cross />}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
