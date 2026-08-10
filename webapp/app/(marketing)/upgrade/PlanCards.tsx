import { createCheckoutSession } from './actions';
import type { ProductPrices } from './pricing';
import styles from './upgrade.module.css';

function Check() {
  return (
    <span className="material-symbols-outlined" aria-hidden="true" style={{ color: 'var(--brand-ink)', fontWeight: 700, fontSize: 20 }}>
      check_circle
    </span>
  );
}

interface Plan {
  id: 'monthly' | 'annual' | 'lifetime';
  name: string;
  priceKey: keyof ProductPrices;
  period: string;
  badge?: { label: string; color?: string };
  pro?: boolean;
  /** Shipped benefits. These — and only these — get a checkmark. */
  features: React.ReactNode[];
  /**
   * Not built yet. Rendered under a separate "On the roadmap" heading with no
   * checkmark, so nobody buying under the 7-day guarantee can read them as
   * something they are paying for today.
   */
  soon?: string[];
  cta: string;
}

/**
 * Every paid plan unlocks the *same* Pro feature set — the plans differ only in
 * billing period and price. The Monthly card therefore lists the full set
 * rather than a subset, so it can't be read as a cheaper, capped tier; that
 * also keeps it consistent with the single "Pro" column in the comparison
 * table on /upgrade.
 */
const PRO_CORE: string[] = [
  'Cloud Sync across devices',
  'Unlimited Active Recall flashcards & reviews',
  'Unlimited Anki export',
  'Export to Notion & Obsidian',
  'Spaced Repetition Reminders',
  'Unlimited Shared Collections',
  'Priority Support',
];

const PRO_SOON: string[] = [
  'Deep Search inside transcripts',
  'Permanent Transcript Archiving',
];

const PLANS: Plan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    priceKey: 'monthly',
    period: '/month',
    features: PRO_CORE,
    soon: PRO_SOON,
    cta: 'Go Pro Monthly',
  },
  {
    id: 'annual',
    name: 'Annual',
    priceKey: 'annual',
    period: '/year',
    pro: true,
    features: [
      <><strong>Everything in Pro Monthly</strong></>,
      'Billed once a year at a lower effective rate',
      'One payment instead of twelve',
    ],
    soon: PRO_SOON,
    cta: 'Go Pro Annual',
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    priceKey: 'lifetime',
    period: '',
    badge: { label: 'Founding Price', color: 'var(--accent-strong)' },
    features: [
      <><strong>Everything in Pro</strong></>,
      'Pay once — no recurring fees',
      'Export your data any time',
    ],
    soon: ['Lifetime Cloud Archiving', 'Early access to all labs'],
    cta: 'Get Lifetime Pro',
  },
];

/**
 * Shared pricing cards, used both on the full /upgrade page (variant="full",
 * cards submit to checkout) and as a landing-page preview (variant="preview",
 * cards link to /upgrade). Single source of truth for plan copy + prices.
 */
export default function PlanCards({
  prices,
  variant = 'full',
}: {
  prices: ProductPrices;
  variant?: 'full' | 'preview';
}) {
  const savingsPct = Math.round((1 - Number(prices.annual) / 12 / Number(prices.monthly)) * 100);

  return (
    <div className={styles.grid}>
      {PLANS.map((plan) => {
        const badge =
          plan.id === 'annual' ? { label: `Save ${savingsPct}%` } : plan.badge;
        return (
          <div
            key={plan.id}
            className={`${styles.pricingCard} ${plan.pro ? styles.pricingCardPro : ''}`}
          >
            {badge && (
              <div className={styles.badge} style={badge.color ? { background: badge.color } : undefined}>
                {badge.label}
              </div>
            )}
            <div className={styles.planName}>{plan.name}</div>
            <div className={styles.price}>
              <span className={styles.amount}>${prices[plan.priceKey]}</span>
              <span className={styles.period}>{plan.period}</span>
            </div>
            {plan.id === 'lifetime' && (
              <p className={styles.foundingNote}>
                Founding price — lock in lifetime access at ${prices.lifetime} before it goes up.
              </p>
            )}
            <div className={styles.featureList}>
              {plan.features.map((f, i) => (
                <div key={i} className={styles.featureItem}>
                  <Check /> {f}
                </div>
              ))}
              {plan.soon && plan.soon.length > 0 && (
                <div className={styles.soonBlock}>
                  <p className={styles.soonHeading}>On the roadmap — not included yet</p>
                  {plan.soon.map((f) => (
                    <div key={f} className={styles.soonItem}>
                      <span className={styles.comingSoon}>Coming soon</span> {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {variant === 'full' ? (
              <form action={createCheckoutSession} className={styles.ctaWrap}>
                <input type="hidden" name="plan" value={plan.id} />
                <button
                  type="submit"
                  className={`${styles.ctaBtn} ${plan.pro ? styles.ctaBtnPro : ''}`}
                >
                  {plan.cta}
                </button>
              </form>
            ) : (
              <a
                href="/upgrade"
                className={`${styles.ctaBtn} ${styles.ctaWrap} ${plan.pro ? styles.ctaBtnPro : ''}`}
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
              >
                {plan.cta}
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
