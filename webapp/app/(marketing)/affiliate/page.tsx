import { Metadata } from 'next';
import { fetchProductPrices } from '@/app/(marketing)/upgrade/actions';

export const metadata: Metadata = {
  title: 'Affiliate Program — Clipmark',
  description: 'Earn 30% revenue share on every Pro upgrade you drive. Join the Clipmark affiliate program and monetize your audience.',
  alternates: {
    canonical: '/affiliate',
  },
};

const H2 = {
  fontFamily: "var(--font-display)",
  fontSize: 32,
  fontWeight: 800,
  color: '#0f172a',
  marginBottom: 20,
  marginTop: 0,
  letterSpacing: '-1px',
};

const P = {
  fontSize: 16,
  color: '#64748b',
  lineHeight: 1.6,
  marginBottom: 16,
  marginTop: 0,
};

const CARD = {
  background: 'white',
  borderRadius: 20,
  padding: '32px',
};

const SECTION = {
  marginBottom: 120,
};

const FAQ_ITEMS = [
  {
    q: 'Who can join the affiliate program?',
    a: 'Any active Clipmark Pro subscriber whose account is at least 30 days old. There is no minimum audience size requirement — just a genuine audience interested in productivity, YouTube, or learning.',
  },
  {
    q: 'How do I get paid?',
    a: 'Commissions are paid out monthly via bank transfer or PayPal, provided your pending balance exceeds $25. Conversions are held for 30 days before becoming eligible for payout to account for refund windows.',
  },
  {
    q: 'How long does my referral cookie last?',
    a: 'Your affiliate cookie is valid for 30 days from the day a visitor clicks your link. If they upgrade within that window — even on a return visit — you earn the commission.',
  },
  {
    q: 'What counts as a conversion?',
    a: 'A Pro upgrade (monthly, annual, or lifetime) made by a user who clicked your affiliate link within the past 30 days. Renewals on existing subscriptions do not generate additional commissions.',
  },
  {
    q: 'What promotional methods are not allowed?',
    a: 'Paid search ads bidding on "Clipmark" keywords, misleading claims, coupon sites that falsely claim exclusive discounts, and spam are strictly prohibited. See the full Affiliate Terms for details.',
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
    body: 'Get a personalised link like clipmark.mithahara.com/r/yourname. Drop it in YouTube descriptions, newsletters, Twitter threads, or anywhere your audience hangs out. Anyone who clicks your link gets 10% off automatically at checkout.',
    icon: 'share',
  },
  {
    number: '03',
    title: 'Earn 30% on every upgrade',
    body: 'When someone clicks your link and upgrades to Pro within 30 days, you earn 30% of the sale — automatically tracked and shown in your dashboard.',
    icon: 'payments',
  },
];

const COMMISSION_RATE = 0.30;
const REFERRAL_DISCOUNT = 0.10; // 10% off for referred visitors

export default async function AffiliatePage() {
  let prices = { monthly: '5', annual: '40', lifetime: '40' };
  try {
    prices = await fetchProductPrices();
  } catch {
    // Dodo unreachable — use fallback prices
  }

  function commissionDisplay(priceStr: string, suffix: string) {
    const net = Number(priceStr) * (1 - REFERRAL_DISCOUNT);
    const commission = net * COMMISSION_RATE;
    return `$${commission.toFixed(2)}${suffix}`;
  }

  const COMMISSION_ROWS = [
    { plan: 'Monthly',  price: `$${prices.monthly} / mo`,      commission: commissionDisplay(prices.monthly,  ' / mo'),      note: 'After 10% referral discount' },
    { plan: 'Annual',   price: `$${prices.annual} / yr`,       commission: commissionDisplay(prices.annual,   ' / yr'),       note: 'After 10% referral discount' },
    { plan: 'Lifetime', price: `$${prices.lifetime} one-time`, commission: commissionDisplay(prices.lifetime, ' one-time'),   note: 'After 10% referral discount' },
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
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>campaign</span>
            Affiliate Program
          </div>

          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: 'clamp(40px, 8vw, 64px)', fontWeight: 800, letterSpacing: '-3px',
            color: '#0f172a', marginBottom: 24, marginTop: 0,
            lineHeight: 1,
          }}>
            Share Clipmark.<br />
            <span style={{ color: '#14B8A6' }}>Earn 30% for life.</span>
          </h1>

          <p style={{
            fontSize: 20, color: '#64748b', lineHeight: 1.6,
            marginBottom: 48, marginTop: 0, fontWeight: 500,
            maxWidth: 640, margin: '0 auto 48px'
          }}>
            Help your audience become better curators. Everyone who joins through your link gets <strong>10% off</strong>, and you keep a <strong>30% cut</strong> of every sale.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* In-app application (webapp/app/dashboard/affiliate) is
                temporarily on hold (see feature/dashboard-extras-hold) —
                route applications through email in the meantime rather
                than link to a page that doesn't exist on this branch. */}
            <a href="mailto:affiliates@clipmark.mithahara.com?subject=Affiliate%20Program%20Application" className="cm-card" style={{
              padding: '16px 32px',
              background: '#0f172a',
              color: 'white', borderRadius: 14, fontSize: 16, fontWeight: 800,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
              transition: 'all 0.2s'
            }}>
              Apply via Email <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
            </a>
            <a href="/affiliate/terms" className="cm-card" style={{
              padding: '16px 32px',
              background: 'white',
              color: '#0f172a', borderRadius: 14, fontSize: 16, fontWeight: 800,
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
            { value: '30%', label: 'Recurring commission on every upgrade', icon: 'payments' },
            { value: '10% off', label: 'Incentive discount for your audience', icon: 'sell' },
            { value: '30 days', label: 'Long-lasting cookie attribution', icon: 'history' },
            { value: '$25', label: 'Low minimum payout threshold', icon: 'account_balance_wallet' },
          ].map((stat) => (
            <div key={stat.label} className="cm-card" style={{ padding: '32px', textAlign: 'center' }}>
              <div className="cm-icon-badge" style={{ margin: '0 auto 20px', width: 48, height: 48 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{stat.icon}</span>
              </div>
              <p style={{
                fontSize: 36, fontWeight: 800, color: '#0f172a',
                fontFamily: "var(--font-display)",
                marginBottom: 8, marginTop: 0, letterSpacing: '-1px'
              }}>
                {stat.value}
              </p>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5, fontWeight: 600 }}>{stat.label}</p>
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
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{step.icon}</span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 800, color: '#94a3b8',
                    fontFamily: "var(--font-display)",
                    letterSpacing: '0.1em',
                  }}>
                    STEP {step.number}
                  </span>
                </div>
                <h3 style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 20, fontWeight: 800, color: '#0f172a',
                  marginBottom: 12, marginTop: 0, letterSpacing: '-0.5px'
                }}>
                  {step.title}
                </h3>
                <p style={{ ...P, fontSize: 16, color: '#64748b', marginBottom: 0 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Commission Structure ── */}
        <div style={SECTION}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>table_chart</span>
            </div>
            <h2 style={{ ...H2, margin: 0 }}>Commission Structure</h2>
          </div>
          <p style={{ ...P, fontSize: 16, color: '#64748b' }}>
            Earn <strong>30%</strong> of the net sale on every qualifying Pro upgrade. 
            Referred users get <strong>10% off</strong> automatically via your link, and commissions are calculated on the revenue after discount.
          </p>

          <div className="cm-card" style={{ padding: 0, overflow: 'hidden', marginTop: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Plan', 'Price', 'Your Commission', 'Notes'].map((h) => (
                    <th key={h} style={{
                      padding: '16px 24px', textAlign: 'left', fontSize: 12,
                      fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase',
                      letterSpacing: '0.1em', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMMISSION_ROWS.map((row, i) => (
                  <tr key={row.plan} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '20px 24px', fontWeight: 800, color: '#0f172a' }}>{row.plan}</td>
                    <td style={{ padding: '20px 24px', color: '#64748b', fontWeight: 500 }}>{row.price}</td>
                    <td style={{ padding: '20px 24px', fontWeight: 800, color: '#14B8A6' }}>{row.commission}</td>
                    <td style={{ padding: '20px 24px', color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...P, marginTop: 24, fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
            * Commissions from refunded purchases are automatically cancelled. Renewals on existing subscriptions do not generate new commissions.
          </p>
        </div>

        {/* ── Eligibility ── */}
        <div style={SECTION}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>verified_user</span>
            </div>
            <h2 style={{ ...H2, margin: 0 }}>Eligibility Requirements</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
            {[
              { icon: 'workspace_premium', title: 'Active Pro subscriber', body: 'You must have an active Clipmark Pro subscription (monthly, annual, or lifetime) to apply.' },
              { icon: 'calendar_today', title: 'Account maturity', body: 'Your Clipmark account must be at least 30 days old at the time of your application.' },
              { icon: 'check_circle', title: 'Good standing', body: 'Your account must have no violations of our main Terms of Service or Affiliate guidelines.' },
              { icon: 'campaign', title: 'Genuine audience', body: 'You should have a real audience — YouTube subscribers, newsletter readers, or a community.' },
            ].map((item) => (
              <div key={item.title} className="cm-card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: '32px' }}>
                <div className="cm-icon-badge" style={{ flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{item.icon}</span>
                </div>
                <div>
                  <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8, marginTop: 0, fontSize: 17, letterSpacing: '-0.3px' }}>{item.title}</p>
                  <p style={{ ...P, marginBottom: 0, fontSize: 15, color: '#64748b' }}>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Payouts ── */}
        <div style={SECTION}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>payments</span>
            </div>
            <h2 style={{ ...H2, margin: 0 }}>Payouts & Terms</h2>
          </div>
          <div className="cm-card" style={{ padding: '40px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 40 }}>
              {[
                { icon: 'schedule', title: '30-day hold', body: 'Commissions are held for 30 days to cover refund windows before becoming eligible.' },
                { icon: 'event_repeat', title: 'Monthly cycle', body: 'Eligible commissions are paid out in the first week of every month.' },
                { icon: 'attach_money', title: '$25 threshold', body: 'Payouts are triggered automatically once you reach $25 in eligible commissions.' },
                { icon: 'account_balance', title: 'Payout methods', body: 'We support Bank Transfer (via Wise) or PayPal for all global affiliates.' },
              ].map((item) => (
                <div key={item.title}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#14B8A6' }}>{item.icon}</span>
                    <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{item.title}</span>
                  </div>
                  <p style={{ ...P, fontSize: 14, color: '#64748b', marginBottom: 0, lineHeight: 1.6 }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── FAQ ── */}
        <div style={SECTION}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>quiz</span>
            </div>
            <h2 style={{ ...H2, margin: 0 }}>Frequently Asked Questions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} className="cm-card" style={{ padding: '32px' }}>
                <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12, marginTop: 0, fontSize: 17, letterSpacing: '-0.3px' }}>{item.q}</p>
                <p style={{ ...P, marginBottom: 0, fontSize: 15, color: '#64748b' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="cm-card" style={{
          textAlign: 'center',
          background: '#0f172a',
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
          <p style={{ ...P, marginBottom: 48, fontSize: 18, color: '#94a3b8', maxWidth: 500, margin: '0 auto 48px', position: 'relative' }}>
            Join hundreds of creators already monetizing their curations with Clipmark.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
            {/* See the hero CTA above for why this points to email instead
                of /dashboard/affiliate. */}
            <a href="mailto:affiliates@clipmark.mithahara.com?subject=Affiliate%20Program%20Application" className="cm-card" style={{
              padding: '16px 32px',
              background: '#14B8A6',
              color: 'white', borderRadius: 14, fontSize: 16, fontWeight: 800,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              transition: 'all 0.2s', border: 'none'
            }}>
              Apply via Email <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
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

        <p style={{ textAlign: 'center', fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>
          Have a unique partnership request?{' '}
          <a href="mailto:affiliates@clipmark.mithahara.com" style={{ color: '#14B8A6', textDecoration: 'none', fontWeight: 700 }}>Contact partnerships</a>
        </p>

      </div>
    </>
  );
}
