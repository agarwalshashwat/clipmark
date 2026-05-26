import { createServerSupabase } from '@/lib/supabase';
import { createCheckoutSession, fetchProductPrices } from './actions';
import { PRICE_DEFAULTS, type ProductPrices } from './pricing';
import CancelSubscriptionButton from './CancelSubscriptionButton';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import styles from './upgrade.module.css';
import { Navigation } from '@/app/components/Navigation';
import { Footer } from '@/app/components/Footer';

const FEATURES = [
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

function Check() {
  return (
    <span className="material-symbols-outlined" style={{
      color: '#14B8A6', fontWeight: 700, fontSize: 20,
    }}>check_circle</span>
  );
}
function Cross() {
  return (
    <span className="material-symbols-outlined" style={{ 
      color: '#cbd5e1', fontSize: 20 
    }}>cancel</span>
  );
}

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

  let prices: ProductPrices;
  try {
    prices = await fetchProductPrices();
  } catch (err) {
    console.error('[UpgradePage] Could not fetch Dodo prices, using defaults:', err);
    prices = PRICE_DEFAULTS;
  }
  const savingsPct = Math.round(
    (1 - (Number(prices.annual) / 12) / Number(prices.monthly)) * 100
  );

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
    <div className={styles.pageWrap}>
      <Navigation />

      <main className={styles.main}>
        {success && (
          <div className={styles.bannerSuccess}>
            Payment successful — welcome to Clipmark Pro! 🎉
          </div>
        )}

        {referralBanner && (
          <div className={styles.bannerReferral}>
            <span style={{ fontSize: 18 }}>🎉</span>
            <span>
              <strong>{referralBanner.discountPct}% off</strong> automatically applied
              {' '}— referred by <strong>{referralBanner.username}</strong>
            </span>
          </div>
        )}

        <div className={styles.header}>
          <h1 className={styles.title}>Future-proof your learning</h1>
          <p className={styles.sub}>Clipmark is the easiest way to organize YouTube research. Upgrade to Pro for AI-powered intelligence.</p>
        </div>

        {isPro && !success && (
          <div className={styles.manageBox}>
            <div className={styles.manageHeader}>
              <span className="material-symbols-outlined" style={{ color: '#14B8A6' }}>verified</span>
              <span className={styles.manageTitle}>You&apos;re on Clipmark Pro</span>
            </div>
            {!subscriptionId ? (
              <p className={styles.manageText}>Lifetime Access — your Pro benefits never expire.</p>
            ) : cancelAtPeriodEnd && periodEndFormatted ? (
              <p className={styles.manageText}>Your subscription cancels on <strong>{periodEndFormatted}</strong>.</p>
            ) : (
              <div className={styles.manageBody}>
                {periodEndFormatted && <p className={styles.manageText}>Next billing date: <strong>{periodEndFormatted}</strong></p>}
                <CancelSubscriptionButton isRefundEligible={isRefundEligible} />
              </div>
            )}
          </div>
        )}

        {!isPro && (
          <div className={styles.grid}>
            <div className={styles.pricingCard}>
              <div className={styles.planName}>Monthly</div>
              <div className={styles.price}>
                <span className={styles.amount}>${prices.monthly}</span>
                <span className={styles.period}>/month</span>
              </div>
              <div className={styles.featureList}>
                <div className={styles.featureItem}><Check /> AI auto-fill snippets</div>
                <div className={styles.featureItem}><Check /> AI-generated summaries</div>
                <div className={styles.featureItem}><Check /> Smart tag suggestions</div>
                <div className={styles.featureItem}><Check /> Unlimited shared pages</div>
                <div className={styles.featureItem}><Check /> Priority support</div>
              </div>
              <form action={createCheckoutSession}>
                <input type="hidden" name="plan" value="monthly" />
                <button type="submit" className={styles.ctaBtn}>Go Pro Monthly</button>
              </form>
            </div>

            <div className={`${styles.pricingCard} ${styles.pricingCardPro}`}>
              <div className={styles.badge}>Save {savingsPct}%</div>
              <div className={styles.planName}>Annual</div>
              <div className={styles.price}>
                <span className={styles.amount}>${prices.annual}</span>
                <span className={styles.period}>/year</span>
              </div>
              <div className={styles.featureList}>
                <div className={styles.featureItem}><Check /> Everything in Monthly</div>
                <div className={styles.featureItem}><Check /> <strong>Exclusive: Beta AI Beta features</strong></div>
                <div className={styles.featureItem}><Check /> Custom social posts (X/LinkedIn)</div>
                <div className={styles.featureItem}><Check /> Advanced analytics</div>
                <div className={styles.featureItem}><Check /> Pro Badge on profile</div>
              </div>
              <form action={createCheckoutSession}>
                <input type="hidden" name="plan" value="annual" />
                <button type="submit" className={`${styles.ctaBtn} ${styles.ctaBtnPro}`}>Go Pro Annual</button>
              </form>
            </div>
          </div>
        )}

        <div className={styles.comparisonSection}>
          <h2 className={styles.compTitle}>Choose your experience</h2>
          <table className={styles.compTable}>
            <tbody>
              {FEATURES.map(f => (
                <tr key={f.label} className={styles.compRow}>
                  <td className={`${styles.compCell} ${styles.compLabel}`}>{f.label}</td>
                  <td className={`${styles.compCell} ${styles.compVal}`}>
                    {typeof f.free === 'boolean' ? (f.free ? <Check /> : <Cross />) : f.free}
                  </td>
                  <td className={`${styles.compCell} ${styles.compVal} ${styles.compValPro}`}>
                    {typeof f.pro === 'boolean' ? (f.pro ? <Check /> : <Cross />) : f.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <Footer />
    </div>
  );
}
