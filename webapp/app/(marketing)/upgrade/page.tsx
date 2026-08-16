import { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabase } from '@/lib/supabase';
import { fetchProductPrices } from './actions';
import { PRICE_DEFAULTS, type ProductPrices } from './pricing';
import CancelSubscriptionButton from './CancelSubscriptionButton';
import PlanCards from './PlanCards';
import { GuaranteeLine } from '@/app/components/GuaranteeLine';
import { SocialProof } from '@/app/components/SocialProof';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import styles from './upgrade.module.css';

export const metadata: Metadata = buildPageMetadata({
  title: 'ClipMark Pricing — Free & Pro Plans',
  description: 'Compare ClipMark Free and Pro. Free covers unlimited local bookmarks and Active Recall basics; Pro adds cloud sync, unlimited flashcards, and Anki export.',
  path: '/upgrade',
  ogTitle: 'Pricing — Free & Pro Plans',
  ogSubtitle: 'Start free. Pro adds cloud sync, unlimited flashcards and Anki export.',
});

const FEATURES = [
  { label: 'Unlimited local bookmarks',          free: true,       pro: true       },
  { label: 'Cloud Sync across devices',          free: false,      pro: true       },
  { label: 'Active Recall flashcards',           free: '25 cards', pro: 'Unlimited' },
  { label: 'Active Recall reviews',              free: '30/month', pro: 'Unlimited' },
  { label: 'Anki export',                        free: '10/month', pro: 'Unlimited' },
  { label: 'Export to Notion & Obsidian',        free: false,      pro: true       },
  { label: 'Permanent Transcript Archiving',     free: false,      pro: 'coming-soon' as const },
  { label: 'Deep Search (inside transcripts)',   free: false,      pro: 'coming-soon' as const },
  { label: 'Smart AI Synthesis (Local-only)',    free: true,       pro: true       },
  { label: 'Shared Collections',                 free: '10',       pro: '∞'        },
  { label: 'Spaced Repetition Reminders',        free: false,      pro: true       },
  { label: 'Priority Support',                   free: false,      pro: true       },
];

function Check() {
  return (
    <span className="material-symbols-outlined" aria-hidden="true" style={{
      color: 'var(--brand-ink)', fontWeight: 700, fontSize: 20,
    }}>check_circle</span>
  );
}
function Cross() {
  return (
    <span className="material-symbols-outlined" aria-hidden="true" style={{ 
      color: 'var(--gray-300)', fontSize: 20 
    }}>cancel</span>
  );
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; checkout_error?: string }>;
}) {
  // `checkout_error` is set by createCheckoutSession when Dodo refuses to open
  // a session, so the user lands back here with a retry prompt instead of the
  // global error boundary.
  const { success, checkout_error: checkoutError } = await searchParams;

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
    // Paged on, not just logged: falling back to PRICE_DEFAULTS renders a
    // perfectly normal-looking pricing page, which is exactly how a broken Dodo
    // key went unnoticed before. A silent fallback here means we are quoting
    // prices we did not read from Dodo.
    Sentry.captureException(err, {
      level: 'error',
      tags: { dodo: 'price_fetch_fallback', surface: 'upgrade' },
    });
    prices = PRICE_DEFAULTS;
  }
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
  const isRefundEligible = subscriptionId !== null && daysSinceStart <= 7;
  const periodEndFormatted = subscriptionPeriodEnd
    ? new Date(subscriptionPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className={styles.pageWrap}>
      <main className={styles.main}>
        {success && (
          <div className={styles.bannerSuccess}>
            Payment successful — welcome to ClipMark Pro! 🎉
          </div>
        )}

        {checkoutError && (
          <div className={styles.bannerRetry} role="alert">
            <span className="material-symbols-outlined" aria-hidden="true">error_outline</span>
            <span>
              Couldn&apos;t start checkout — please try again shortly. Nothing was charged.
            </span>
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
          <h1 className={styles.title}>Simple, transparent pricing</h1>
          <p className={styles.sub}>Choose the plan that fits your learning pace. From casual bookmarking to a full-scale research engine.</p>
          {/* Renders nothing until verified Web Store numbers land (decision D6). */}
          <SocialProof style={{ marginTop: 16 }} />
        </div>

        {isPro && !success && (
          <div className={styles.manageBox}>
            <div className={styles.manageHeader}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ color: 'var(--brand-ink)' }}>verified</span>
              <span className={styles.manageTitle}>You&apos;re on ClipMark Pro</span>
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
          <>
            <PlanCards prices={prices} variant="full" />
            {/* Risk reversal directly under the CTAs (D1: 7-day window). */}
            <GuaranteeLine refundDays={7} />
          </>
        )}

        <div className={styles.comparisonSection}>
          <h2 className={styles.compTitle}>Choose your experience</h2>
          <div className={styles.compTableWrapper}>
            <table className={styles.compTable}>
              <thead>
                <tr className={styles.compHeadRow}>
                  <th className={`${styles.compCell} ${styles.compHeadCell}`}></th>
                  <th className={`${styles.compCell} ${styles.compVal} ${styles.compHeadCell}`}>Free</th>
                  <th className={`${styles.compCell} ${styles.compVal} ${styles.compValPro} ${styles.compHeadCell}`}>Pro</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map(f => (
                  <tr key={f.label} className={styles.compRow}>
                    <td className={`${styles.compCell} ${styles.compLabel}`}>{f.label}</td>
                    <td className={`${styles.compCell} ${styles.compVal}`}>
                      {typeof f.free === 'boolean' ? (f.free ? <Check /> : <Cross />) : f.free}
                    </td>
                    <td className={`${styles.compCell} ${styles.compVal} ${styles.compValPro}`}>
                      {f.pro === 'coming-soon' ? (
                        <span className={styles.comingSoon}>Coming soon</span>
                      ) : typeof f.pro === 'boolean' ? (f.pro ? <Check /> : <Cross />) : f.pro}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
