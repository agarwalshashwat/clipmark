import { createCheckoutSession } from './actions';
import type { ProductPrices } from './pricing';
import styles from './upgrade.module.css';

function Check() {
  return (
    <span className="material-symbols-outlined" style={{ color: '#14B8A6', fontWeight: 700, fontSize: 20 }}>
      check_circle
    </span>
  );
}

interface Plan {
  id: 'monthly' | 'annual' | 'lifetime';
  name: string;
  priceKey: keyof ProductPrices;
  period: string;
  /** Optional struck-through anchor price shown next to the current price. */
  strikePrice?: string;
  badge?: { label: string; color?: string };
  pro?: boolean;
  features: React.ReactNode[];
  cta: string;
}

const PLANS: Plan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    priceKey: 'monthly',
    period: '/month',
    features: [
      'Sync to Notion & Obsidian',
      'Daily Review Dashboard',
      'Deep Transcript Search',
      'Unlimited Shared Pages',
      'Priority Support',
    ],
    cta: 'Go Pro Monthly',
  },
  {
    id: 'annual',
    name: 'Annual',
    priceKey: 'annual',
    period: '/year',
    pro: true,
    features: [
      'Everything in Monthly',
      <><strong>Pro: Local AI Optimization</strong></>,
      'Anki, Obsidian & Notion exports',
      'Advanced Learning Stats',
      'Spaced Repetition Logic',
    ],
    cta: 'Go Pro Annual',
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    priceKey: 'lifetime',
    period: '',
    strikePrice: '$79.99',
    badge: { label: 'Launch Special', color: '#732EE4' },
    features: [
      'Everything in Pro',
      'Own your data forever',
      'Lifetime Cloud Archiving',
      'No recurring fees',
      'Early access to all labs',
    ],
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
              {plan.strikePrice ? (
                <span className={styles.period} style={{ textDecoration: 'line-through', marginLeft: 8 }}>
                  {plan.strikePrice}
                </span>
              ) : (
                <span className={styles.period}>{plan.period}</span>
              )}
            </div>
            <div className={styles.featureList}>
              {plan.features.map((f, i) => (
                <div key={i} className={styles.featureItem}>
                  <Check /> {f}
                </div>
              ))}
            </div>
            {variant === 'full' ? (
              <form action={createCheckoutSession}>
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
                className={`${styles.ctaBtn} ${plan.pro ? styles.ctaBtnPro : ''}`}
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
