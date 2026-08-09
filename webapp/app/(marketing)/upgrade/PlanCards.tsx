import { createCheckoutSession } from './actions';
import type { ProductPrices } from './pricing';
import styles from './upgrade.module.css';

function Check() {
  return (
    <span className="material-symbols-outlined" style={{ color: 'var(--brand-ink)', fontWeight: 700, fontSize: 20 }}>
      check_circle
    </span>
  );
}

function ComingSoon() {
  return <span className={styles.comingSoon}>Coming soon</span>;
}

interface Plan {
  id: 'monthly' | 'annual' | 'lifetime';
  name: string;
  priceKey: keyof ProductPrices;
  period: string;
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
      'Export to Notion & Obsidian',
      'Review Reminders',
      <>Deep Transcript Search <ComingSoon /></>,
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
      <><strong>Unlimited Active Recall & Anki exports</strong></>,
      'Export to Notion & Obsidian',
      'Learning Stats',
      'Spaced Repetition Logic',
    ],
    cta: 'Go Pro Annual',
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    priceKey: 'lifetime',
    period: '',
    badge: { label: 'Founding Price', color: 'var(--accent-strong)' },
    features: [
      'Everything in Pro',
      'Own your data forever',
      <>Lifetime Cloud Archiving <ComingSoon /></>,
      'No recurring fees',
      <>Early access to all labs <ComingSoon /></>,
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
