import { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import * as Sentry from '@sentry/nextjs';
import { fetchProductPrices } from '@/app/(marketing)/upgrade/actions';
import { formatPrice, PRICE_DEFAULTS, type ProductPrices } from '@/app/(marketing)/upgrade/pricing';

const META_DESCRIPTION =
  'Earn a one-time 30% commission on every Pro upgrade you refer. Your audience gets 10% off, and referrals are attributed for 30 days.';

export const metadata: Metadata = buildPageMetadata({
  title: 'Affiliate Program — ClipMark',
  description: META_DESCRIPTION,
  path: '/affiliate',
  ogTitle: 'Affiliate Program',
  ogSubtitle: 'Earn 30% on every Pro upgrade you refer.',
});

const H2 = {
  fontFamily: "var(--font-display)",
  fontSize: 32,
  fontWeight: 800,
  color: 'var(--text)',
  marginBottom: 20,
  marginTop: 0,
  letterSpacing: '-1px',
};

const P = {
  fontSize: 16,
  color: 'var(--text-muted)',
  lineHeight: 1.6,
  marginBottom: 16,
  marginTop: 0,
};

const CARD = {
  background: 'var(--surface)',
  borderRadius: 20,
  padding: '32px',
};

const SECTION = {
  marginBottom: 120,
};

const FAQ_ITEMS = [
  {
    q: 'Who can join the affiliate program?',
    a: 'Any active ClipMark Pro subscriber whose account is at least 30 days old. There is no minimum audience size requirement — just a genuine audience interested in productivity, YouTube, or learning.',
  },
  {
    q: 'Is the 30% commission recurring?',
    a: 'No. The commission is a one-time payment on a referred user’s first Pro purchase. Subscription renewals after that first payment do not generate further commissions, and there is no lifetime revenue share.',
  },
  {
    q: 'Where do I see my referrals and earnings?',
    a: 'By email. Clicks and conversions are recorded automatically on our side, but there is no self-serve affiliate dashboard yet — email affiliates@clipmark.mithahara.com and we’ll send you your current click, conversion, and commission totals.',
  },
  {
    q: 'How do I get paid?',
    a: 'Payouts are handled manually today, by bank transfer (via Wise) or PayPal, once your eligible balance reaches $25 USD. Conversions are held for 30 days before becoming eligible, to cover the refund window. Email affiliates@clipmark.mithahara.com to register your payout method and to request a payout.',
  },
  {
    q: 'How long does my referral cookie last?',
    a: 'Your affiliate cookie is valid for 30 days from the day a visitor clicks your link. If they upgrade within that window — even on a return visit — you earn the commission.',
  },
  {
    q: 'What counts as a conversion?',
    a: 'The first Pro purchase (monthly, annual, or lifetime) made by a user who clicked your affiliate link within the past 30 days. Renewals on existing subscriptions do not generate additional commissions.',
  },
  {
    q: 'What promotional methods are not allowed?',
    a: 'Paid search ads bidding on "ClipMark" keywords, misleading claims, coupon sites that falsely claim exclusive discounts, and spam are strictly prohibited. See the full Affiliate Terms for details.',
  },
  {
    q: 'What happens if a referred user requests a refund?',
    a: "If a user you referred refunds their purchase within our refund window, that conversion is cancelled and the corresponding commission is removed from your pending balance.",
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Apply by email',
    body: 'Pro subscribers with a 30-day-old account are eligible. Email us and we’ll set up your affiliate link.',
    icon: 'how_to_reg',
  },
  {
    number: '02',
    title: 'Share your unique link — they get 10% off',
    body: 'Get a personalized link like clipmark.mithahara.com/r/yourname. Drop it in YouTube descriptions, newsletters, Twitter threads, or anywhere your audience hangs out. Anyone who clicks your link gets 10% off automatically at checkout.',
    icon: 'share',
  },
  {
    number: '03',
    title: 'Earn a one-time 30% commission',
    body: 'When someone clicks your link and upgrades to Pro within 30 days, you earn 30% of that first sale. Conversions are tracked automatically; we email you your totals and arrange payout — there is no self-serve affiliate dashboard yet.',
    icon: 'payments',
  },
];

const COMMISSION_RATE = 0.30;
const REFERRAL_DISCOUNT = 0.10; // 10% off for referred visitors

export default async function AffiliatePage() {
  // PRICE_DEFAULTS rather than an inline literal: this page's own fallback had
  // drifted to 5 / 40 / 40 against the real 7.99 / 59.99 / 99.99, so a Dodo
  // outage published a commission table computed from prices we don't charge.
  let prices: ProductPrices = PRICE_DEFAULTS;
  try {
    prices = await fetchProductPrices();
  } catch (err) {
    // Dodo unreachable — use fallback prices, but page us: these numbers drive
    // the published commission table, so quoting stale ones is worse than loud.
    console.error('[AffiliatePage] Could not fetch Dodo prices, using defaults:', err);
    Sentry.captureException(err, {
      level: 'error',
      tags: { dodo: 'price_fetch_fallback', surface: 'affiliate' },
    });
  }

  // Every plan pays the same one-time commission on the referred user's FIRST
  // payment — a monthly referral does not pay 30% again each month, so the
  // commission column never carries a "/ mo" or "/ yr" suffix.
  function commissionDisplay(priceStr: string) {
    const net = Number(priceStr) * (1 - REFERRAL_DISCOUNT);
    const commission = net * COMMISSION_RATE;
    return `${formatPrice(commission.toFixed(2), prices.currency)} one-time`;
  }

  const COMMISSION_ROWS = [
    { plan: 'Monthly',  price: `${formatPrice(prices.monthly, prices.currency)} / mo`,      commission: commissionDisplay(prices.monthly),  note: 'On the first month, after the 10% referral discount' },
    { plan: 'Annual',   price: `${formatPrice(prices.annual, prices.currency)} / yr`,       commission: commissionDisplay(prices.annual),   note: 'On the first year, after the 10% referral discount' },
    { plan: 'Lifetime', price: `${formatPrice(prices.lifetime, prices.currency)} one-time`, commission: commissionDisplay(prices.lifetime), note: 'After the 10% referral discount' },
  ];
  return (
    <>
      {/* ── Hero ── */}
      <section style={{
        paddingTop: 160,
        paddingBottom: 96,
        background: 'radial-gradient(circle at top right, rgba(20, 184, 166, 0.05), transparent 400px), radial-gradient(circle at bottom left, rgba(139, 92, 246, 0.03), transparent 400px)',
        textAlign: 'center',
        position: 'relative'
      }}>
        <div style={{ maxWidth: 840, margin: '0 auto', padding: '0 32px' }}>
          <div className="cm-section-label" style={{ margin: '0 auto 32px' }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>campaign</span>
            Affiliate Program
          </div>

          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: 'clamp(40px, 8vw, 64px)', fontWeight: 800, letterSpacing: '-3px',
            color: 'var(--text)', marginBottom: 24, marginTop: 0,
            lineHeight: 1,
          }}>
            Share ClipMark.<br />
            <span style={{ color: 'var(--brand-ink)' }}>Earn 30% per referral.</span>
          </h1>

          <p style={{
            fontSize: 20, color: 'var(--text-muted)', lineHeight: 1.6,
            marginBottom: 48, marginTop: 0, fontWeight: 500,
            maxWidth: 640, margin: '0 auto 48px'
          }}>
            Help your audience become better curators. Everyone who joins through your link gets <strong>10% off</strong>, and you keep a <strong>one-time 30% cut</strong> of their first Pro purchase.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* Applications are handled over email. The in-app version
                (webapp/app/dashboard/affiliate) is parked on
                feature/dashboard-extras-hold and has no route on main, so
                the copy on this page must not promise a dashboard. */}
            <a href="mailto:affiliates@clipmark.mithahara.com?subject=Affiliate%20Program%20Application" className="cm-card" style={{
              padding: '16px 32px',
              background: 'var(--gray-900)',
              color: 'white', borderRadius: 14, fontSize: 16, fontWeight: 800,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
              transition: 'all 0.2s'
            }}>
              Apply via Email <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>arrow_forward</span>
            </a>
            <a href="/affiliate/terms" className="cm-card" style={{
              padding: '16px 32px',
              background: 'var(--surface)',
              color: 'var(--text)', borderRadius: 14, fontSize: 16, fontWeight: 800,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}>
              Affiliate Terms
            </a>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 100px' }}>

        {/* ── Quick Stats ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 24, marginBottom: 120,
        }}>
          {[
            { value: '30%', label: 'One-time commission per referred upgrade', icon: 'payments' },
            { value: '10% off', label: 'Incentive discount for your audience', icon: 'sell' },
            { value: '30 days', label: 'Long-lasting cookie attribution', icon: 'history' },
            { value: '$25 USD', label: 'Low minimum payout threshold', icon: 'account_balance_wallet' },
          ].map((stat) => (
            <div key={stat.label} className="cm-card" style={{ padding: '32px', textAlign: 'center' }}>
              <div className="cm-icon-badge" style={{ margin: '0 auto 20px', width: 48, height: 48 }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>{stat.icon}</span>
              </div>
              <p style={{
                fontSize: 36, fontWeight: 800, color: 'var(--text)',
                fontFamily: "var(--font-display)",
                marginBottom: 8, marginTop: 0, letterSpacing: '-1px'
              }}>
                {stat.value}
              </p>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontWeight: 600 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ── How It Works ── */}
        <div style={SECTION}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="cm-section-label" style={{ margin: '0 auto 16px' }}>Workflow</div>
            <h2 style={{ ...H2, margin: 0, fontSize: 40 }}>Three steps to profit</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32 }}>
            {STEPS.map((step) => (
              <div key={step.number} className="cm-card" style={{ padding: '40px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                  <div className="cm-icon-badge" style={{ width: 48, height: 48 }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>{step.icon}</span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
                    fontFamily: "var(--font-display)",
                    letterSpacing: '0.1em',
                  }}>
                    STEP {step.number}
                  </span>
                </div>
                <h3 style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 20, fontWeight: 800, color: 'var(--text)',
                  marginBottom: 12, marginTop: 0, letterSpacing: '-0.5px'
                }}>
                  {step.title}
                </h3>
                <p style={{ ...P, fontSize: 16, color: 'var(--text-muted)', marginBottom: 0 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Commission Structure ── */}
        <div style={SECTION}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>table_chart</span>
            </div>
            <h2 style={{ ...H2, margin: 0 }}>Commission Structure</h2>
          </div>
          <p style={{ ...P, fontSize: 16, color: 'var(--text-muted)' }}>
            Earn a <strong>one-time 30%</strong> of the net sale on each referred user&apos;s first Pro purchase.
            Referred users get <strong>10% off</strong> automatically via your link, and commissions are calculated on the revenue after discount.
          </p>

          {/* The header cells are nowrap, so this table has a ~500px min
              width — wider than a 390px phone. Scroll it inside its own card
              rather than letting it push the whole page sideways. */}
          <div className="cm-card" style={{ padding: 0, overflow: 'hidden', marginTop: 32 }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 520 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Plan', 'Price', 'Your Commission', 'Notes'].map((h) => (
                    <th key={h} style={{
                      padding: '16px 24px', textAlign: 'left', fontSize: 12,
                      fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase',
                      letterSpacing: '0.1em', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMMISSION_ROWS.map((row, i) => (
                  <tr key={row.plan} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '20px 24px', fontWeight: 800, color: 'var(--text)' }}>{row.plan}</td>
                    <td style={{ padding: '20px 24px', color: 'var(--text-muted)', fontWeight: 500 }}>{row.price}</td>
                    <td style={{ padding: '20px 24px', fontWeight: 800, color: 'var(--brand-ink)' }}>{row.commission}</td>
                    <td style={{ padding: '20px 24px', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <p style={{ ...P, marginTop: 24, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            * Each referred user earns you a single commission, paid on their first Pro purchase — the commission is not recurring, and
            renewals on existing subscriptions do not generate new commissions. Commissions from refunded purchases are automatically cancelled.
          </p>
        </div>

        {/* ── Eligibility ── */}
        <div style={SECTION}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>verified_user</span>
            </div>
            <h2 style={{ ...H2, margin: 0 }}>Eligibility Requirements</h2>
          </div>
          {/* min() so the 400px track collapses on a phone instead of
              forcing the grid wider than the viewport. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 24 }}>
            {[
              { icon: 'workspace_premium', title: 'Active Pro subscriber', body: 'You must have an active ClipMark Pro subscription (monthly, annual, or lifetime) to apply.' },
              { icon: 'calendar_today', title: 'Account maturity', body: 'Your ClipMark account must be at least 30 days old at the time of your application.' },
              { icon: 'check_circle', title: 'Good standing', body: 'Your account must have no violations of our main Terms of Service or Affiliate guidelines.' },
              { icon: 'campaign', title: 'Genuine audience', body: 'You should have a real audience — YouTube subscribers, newsletter readers, or a community.' },
            ].map((item) => (
              <div key={item.title} className="cm-card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: '32px' }}>
                <div className="cm-icon-badge" style={{ flexShrink: 0 }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>{item.icon}</span>
                </div>
                <div>
                  <p style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 8, marginTop: 0, fontSize: 17, letterSpacing: '-0.3px' }}>{item.title}</p>
                  <p style={{ ...P, marginBottom: 0, fontSize: 15, color: 'var(--text-muted)' }}>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Payouts ── */}
        <div style={SECTION}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>payments</span>
            </div>
            <h2 style={{ ...H2, margin: 0 }}>Payouts & Terms</h2>
          </div>
          <div className="cm-card" style={{ padding: '40px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 40 }}>
              {[
                { icon: 'schedule', title: '30-day hold', body: 'Commissions are held for 30 days to cover refund windows before becoming eligible.' },
                { icon: 'event_repeat', title: 'Monthly review', body: 'We review eligible balances each month and settle them by hand — payouts are not yet automated.' },
                { icon: 'attach_money', title: '$25 USD threshold', body: 'Once your eligible commissions reach $25 USD, email us and we’ll arrange the payout.' },
                { icon: 'account_balance', title: 'Payout methods', body: 'We support Bank Transfer (via Wise) or PayPal for all global affiliates.' },
              ].map((item) => (
                <div key={item.title}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20, color: 'var(--brand-ink)' }}>{item.icon}</span>
                    <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: 15 }}>{item.title}</span>
                  </div>
                  <p style={{ ...P, fontSize: 14, color: 'var(--text-muted)', marginBottom: 0, lineHeight: 1.6 }}>{item.body}</p>
                </div>
              ))}
            </div>
            <p style={{ ...P, marginTop: 32, marginBottom: 0, fontSize: 14, fontWeight: 500 }}>
              There is no self-serve affiliate dashboard yet. Clicks, conversions and commissions are recorded automatically, but you
              get them by asking us — email{' '}
              <a href="mailto:affiliates@clipmark.mithahara.com" style={{ color: 'var(--brand-ink)', textDecoration: 'none', fontWeight: 700 }}>affiliates@clipmark.mithahara.com</a>{' '}
              any time for your current totals.
            </p>
          </div>
        </div>

        {/* ── FAQ ── */}
        <div style={SECTION}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>quiz</span>
            </div>
            <h2 style={{ ...H2, margin: 0 }}>Frequently Asked Questions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} className="cm-card" style={{ padding: '32px' }}>
                <p style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 12, marginTop: 0, fontSize: 17, letterSpacing: '-0.3px' }}>{item.q}</p>
                <p style={{ ...P, marginBottom: 0, fontSize: 15, color: 'var(--text-muted)' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="cm-card" style={{
          textAlign: 'center',
          background: 'var(--gray-900)',
          padding: '80px 40px',
          marginBottom: 48,
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative radial blur */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 400, height: 400, background: 'radial-gradient(circle, rgba(20, 184, 166, 0.15), transparent 70%)',
            pointerEvents: 'none'
          }} />

          <h2 style={{ ...H2, fontSize: 40, color: 'white', marginBottom: 16, position: 'relative' }}>Ready to start earning?</h2>
          <p style={{ ...P, marginBottom: 48, fontSize: 18, color: 'var(--gray-300)', maxWidth: 500, margin: '0 auto 48px', position: 'relative' }}>
            The program is open to Pro subscribers. Email us and we&apos;ll set up your link.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
            {/* See the hero CTA above for why this points to email instead
                of /dashboard/affiliate. */}
            <a href="mailto:affiliates@clipmark.mithahara.com?subject=Affiliate%20Program%20Application" className="cm-card" style={{
              padding: '16px 32px',
              background: 'var(--accent-strong)',
              color: 'white', borderRadius: 14, fontSize: 16, fontWeight: 800,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              transition: 'all 0.2s', border: 'none'
            }}>
              Apply via Email <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>arrow_forward</span>
            </a>
            <a href="/affiliate/terms" className="cm-card" style={{
              padding: '16px 32px',
              background: 'rgba(255,255,255,0.05)',
              color: 'white', borderRadius: 14, fontSize: 16, fontWeight: 800,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s', border: '1px solid rgba(255,255,255,0.1)'
            }}>
              View Terms
            </a>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>
          Have a unique partnership request?{' '}
          <a href="mailto:affiliates@clipmark.mithahara.com" style={{ color: 'var(--brand-ink)', textDecoration: 'none', fontWeight: 700 }}>Contact partnerships</a>
        </p>

      </div>
    </>
  );
}
