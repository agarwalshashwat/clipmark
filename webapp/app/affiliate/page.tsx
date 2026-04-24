import { Metadata } from 'next';
import { Navigation } from '@/app/components/Navigation';
import { Footer } from '@/app/components/Footer';
import { fetchProductPrices } from '@/app/upgrade/actions';

export const metadata: Metadata = {
  title: 'Affiliate Program — Clipmark',
  description: 'Earn 30% revenue share on every Pro upgrade you drive. Join the Clipmark affiliate program and monetize your audience.',
};

const H2 = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 28,
  fontWeight: 800,
  color: '#1a1c1d',
  marginBottom: 16,
  marginTop: 0,
  letterSpacing: '-0.5px',
};

const P = {
  fontSize: 15,
  color: '#3c4947',
  lineHeight: 1.75,
  marginBottom: 12,
  marginTop: 0,
};

const CARD = {
  background: 'white',
  borderRadius: 16,
  border: '1px solid #e8e8e9',
  padding: '28px 32px',
};

const SECTION = {
  marginBottom: 72,
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
    title: 'Apply in your dashboard',
    body: 'Pro subscribers with a 30-day-old account can apply in under a minute. Eligible applications are auto-approved — no waiting.',
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
    <div style={{
      minHeight: '100vh',
      background: '#f9f9fa',
      color: '#1a1c1d',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>
      <Navigation />

      {/* ── Hero ── */}
      <section style={{
        paddingTop: 140,
        paddingBottom: 80,
        background: 'linear-gradient(180deg, #fff 0%, #f9f9fa 100%)',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 32px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(20,184,166,0.1)', borderRadius: 9999,
            padding: '6px 16px', marginBottom: 28,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#14B8A6' }}>campaign</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#006b5f', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Affiliate Program
            </span>
          </div>

          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 52, fontWeight: 800, letterSpacing: '-2px',
            color: '#1a1c1d', marginBottom: 20, marginTop: 0,
            lineHeight: 1.1,
          }}>
            Earn 30% revenue share.<br />
            <span style={{ color: '#14B8A6' }}>Every single Pro upgrade.</span>
          </h1>

          <p style={{ fontSize: 18, color: '#545f6c', lineHeight: 1.7, marginBottom: 40, marginTop: 0 }}>
            Recommend Clipmark to your audience — YouTube creators, students, researchers, lifelong learners.
            Everyone who upgrades to Pro through your link gets <strong>10% off</strong>,
            and you keep <strong>30%</strong> of every sale.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/dashboard/affiliate" style={{
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
              color: 'white', borderRadius: 12, fontSize: 15, fontWeight: 700,
              textDecoration: 'none', display: 'inline-block',
            }}>
              Apply in Your Dashboard →
            </a>
            <a href="/affiliate/terms" style={{
              padding: '14px 28px',
              background: 'white', border: '1px solid #e8e8e9',
              color: '#545f6c', borderRadius: 12, fontSize: 15, fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}>
              Read Affiliate Terms
            </a>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 32px 40px' }}>

        {/* ── Quick Stats ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 20, marginBottom: 80,
        }}>
          {[
            { value: '30%', label: 'Revenue share on every sale' },
            { value: '10% off', label: 'Discount for every referred user' },
            { value: '30 days', label: 'Cookie attribution window' },
            { value: '$25', label: 'Minimum payout threshold' },
          ].map((stat) => (
            <div key={stat.label} style={{ ...CARD, textAlign: 'center' }}>
              <p style={{
                fontSize: 34, fontWeight: 800, color: '#14B8A6',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginBottom: 6, marginTop: 0,
              }}>
                {stat.value}
              </p>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ── How It Works ── */}
        <div style={SECTION}>
          <h2 style={{ ...H2, marginBottom: 40, textAlign: 'center' }}>How It Works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {STEPS.map((step) => (
              <div key={step.number} style={{ ...CARD, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(20,184,166,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#14B8A6' }}>{step.icon}</span>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: '#d1d5db',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    letterSpacing: '0.05em', marginTop: 10,
                  }}>
                    STEP {step.number}
                  </span>
                </div>
                <h3 style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 17, fontWeight: 700, color: '#1a1c1d',
                  marginBottom: 10, marginTop: 0,
                }}>
                  {step.title}
                </h3>
                <p style={{ ...P, marginBottom: 0 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Commission Structure ── */}
        <div style={SECTION}>
          <h2 style={H2}>Commission Structure</h2>
          <p style={P}>
            You earn <strong>30%</strong> of the net sale amount on every qualifying Pro upgrade.
            Your referred users automatically get <strong>10% off</strong> at checkout via your link,
            so commissions are calculated on the discounted price. Commissions are displayed in your dashboard in real time.
          </p>

          <div style={{ ...CARD, padding: 0, overflow: 'hidden', marginTop: 28 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9f9fa' }}>
                  {['Plan', 'Price', 'Your Commission', 'Notes'].map((h) => (
                    <th key={h} style={{
                      padding: '14px 24px', textAlign: 'left', fontSize: 12,
                      fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMMISSION_ROWS.map((row, i) => (
                  <tr key={row.plan} style={{ borderTop: i === 0 ? '1px solid #e8e8e9' : '1px solid #f0f0f0' }}>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#1a1c1d' }}>{row.plan}</td>
                    <td style={{ padding: '16px 24px', color: '#545f6c' }}>{row.price}</td>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#006b5f' }}>{row.commission}</td>
                    <td style={{ padding: '16px 24px', color: '#9ca3af', fontSize: 13 }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ ...P, marginTop: 16, fontSize: 13, color: '#9ca3af' }}>
            * Commissions from refunded purchases are automatically cancelled. Renewals on existing subscriptions do not generate new commissions.
          </p>
        </div>

        {/* ── Eligibility ── */}
        <div style={SECTION}>
          <h2 style={H2}>Eligibility Requirements</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {[
              { icon: 'workspace_premium', title: 'Active Pro subscriber', body: 'You must have an active Clipmark Pro subscription (monthly, annual, or lifetime) to apply.' },
              { icon: 'calendar_today', title: 'Account at least 30 days old', body: 'Your Clipmark account must be at least 30 days old at the time of application.' },
              { icon: 'check_circle', title: 'Good standing', body: 'Your account must be in good standing with no violations of the main Terms of Service or these Affiliate Terms.' },
              { icon: 'campaign', title: 'Genuine audience', body: 'You should have a real audience — YouTube subscribers, newsletter readers, social media followers, or a community — relevant to the product.' },
            ].map((item) => (
              <div key={item.title} style={{ ...CARD, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(20,184,166,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#14B8A6' }}>{item.icon}</span>
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#1a1c1d', marginBottom: 4, marginTop: 0, fontSize: 15 }}>{item.title}</p>
                  <p style={{ ...P, marginBottom: 0, fontSize: 14 }}>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Payouts ── */}
        <div style={SECTION}>
          <h2 style={H2}>Payouts</h2>
          <div style={{ ...CARD }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
              {[
                { icon: 'schedule', title: '30-day hold', body: 'Commissions are held for 30 days to cover potential refund windows before becoming eligible for payout.' },
                { icon: 'event_repeat', title: 'Monthly payouts', body: 'Eligible commissions are paid out once a month, typically in the first week of the following month.' },
                { icon: 'attach_money', title: '$25 minimum', body: 'You must have at least $25 in eligible (non-held) commissions to trigger a payout.' },
                { icon: 'account_balance', title: 'Payment methods', body: 'Payouts via bank transfer (Wise) or PayPal. Email affiliates@clipmark.app to set up your payout method after approval.' },
              ].map((item) => (
                <div key={item.title}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#14B8A6' }}>{item.icon}</span>
                    <p style={{ fontWeight: 700, color: '#1a1c1d', margin: 0, fontSize: 15 }}>{item.title}</p>
                  </div>
                  <p style={{ ...P, marginBottom: 0, fontSize: 14, paddingLeft: 28 }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── FAQ ── */}
        <div style={SECTION}>
          <h2 style={H2}>Frequently Asked Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} style={{ ...CARD }}>
                <p style={{ fontWeight: 700, color: '#1a1c1d', marginBottom: 8, marginTop: 0, fontSize: 15 }}>{item.q}</p>
                <p style={{ ...P, marginBottom: 0, fontSize: 14 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ── */}
        <div style={{
          ...CARD,
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, rgba(139,92,246,0.08) 100%)',
          border: '1px solid rgba(20,184,166,0.2)',
          padding: '56px 40px',
          marginBottom: 40,
        }}>
          <h2 style={{ ...H2, fontSize: 32, marginBottom: 12 }}>Ready to start earning?</h2>
          <p style={{ ...P, marginBottom: 36, fontSize: 16 }}>
            Apply from your dashboard in under a minute. Eligible applications are approved instantly.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/dashboard/affiliate" style={{
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
              color: 'white', borderRadius: 12, fontSize: 15, fontWeight: 700,
              textDecoration: 'none', display: 'inline-block',
            }}>
              Apply Now →
            </a>
            <a href="/affiliate/terms" style={{
              padding: '14px 28px',
              background: 'white', border: '1px solid #e8e8e9',
              color: '#545f6c', borderRadius: 12, fontSize: 15, fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}>
              Read Affiliate Terms
            </a>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
          Questions? Email us at{' '}
          <a href="mailto:affiliates@clipmark.app" style={{ color: '#14B8A6', textDecoration: 'none' }}>affiliates@clipmark.app</a>
        </p>

      </div>

      <Footer />
    </div>
  );
}
