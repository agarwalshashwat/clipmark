import { APP_URL, LEGAL_EMAIL, SUPPORT_EMAIL } from '@/app/lib/constants';

export const metadata = {
  title: 'Affiliate Terms & Conditions — ClipMark',
  description: 'Terms and conditions governing participation in the ClipMark affiliate program.',
  alternates: {
    canonical: '/affiliate/terms',
  },
  openGraph: {
    title: 'Affiliate Terms & Conditions — ClipMark',
    description: 'Terms and conditions governing participation in the ClipMark affiliate program.',
    type: 'website',
    url: '/affiliate/terms',
    siteName: 'ClipMark',
    images: [
      {
        url: `${APP_URL}/clipmark-logo.png`,
        width: 512,
        height: 512,
        alt: 'ClipMark — YouTube Bookmark Extension',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Affiliate Terms & Conditions — ClipMark',
    description: 'Terms and conditions governing participation in the ClipMark affiliate program.',
    images: [`${APP_URL}/clipmark-logo.png`],
  },
};

const SECTION_STYLE = {
  marginBottom: 48,
};

const H2_STYLE = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 22,
  fontWeight: 700,
  color: 'var(--gray-900)',
  marginBottom: 16,
  marginTop: 0,
};

const P_STYLE = {
  fontSize: 15,
  color: 'var(--gray-700)',
  lineHeight: 1.75,
  marginBottom: 12,
  marginTop: 0,
};

const UL_STYLE = {
  paddingLeft: 20,
  marginBottom: 12,
};

const LI_STYLE = {
  fontSize: 15,
  color: 'var(--gray-700)',
  lineHeight: 1.75,
  marginBottom: 6,
};

export default function AffiliateTermsPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gray-50)',
      color: 'var(--gray-900)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* The (marketing) layout already renders the global <Navigation /> and
          <Footer />; this page must not stack its own copies on top of them.
          The back-link below replaces the local nav's only unique affordance. */}

      {/* ── Content ── */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 32px 96px' }}>

        <a href="/affiliate" style={{
          display: 'inline-block', marginBottom: 32,
          fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none',
        }}>
          ← Affiliate Program
        </a>

        <h1 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 40, fontWeight: 800, letterSpacing: '-1px',
          color: 'var(--gray-900)', marginBottom: 12, marginTop: 0,
        }}>
          Affiliate Terms &amp; Conditions
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
          Last updated: April 24, 2026
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 56 }}>
          These Affiliate Terms &amp; Conditions (&quot;Affiliate Terms&quot;) govern your participation in the ClipMark Affiliate Program (&quot;Program&quot;) and form part of the overall{' '}
          <a href="/terms" style={{ color: 'var(--brand-ink)', textDecoration: 'none' }}>ClipMark Terms of Service</a>.
          In the event of a conflict, these Affiliate Terms take precedence with respect to the Program.
        </p>

        {/* 1 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>1. Definitions</h2>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>&quot;Affiliate&quot;</strong> — an approved participant in the Program who has been issued a unique affiliate code.</li>
            <li style={LI_STYLE}><strong>&quot;Affiliate Link&quot;</strong> — the personalised URL in the format <code style={{ fontSize: 13, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>clipmark.mithahara.com/r/[your-code]</code> assigned to you upon approval.</li>
            <li style={LI_STYLE}><strong>&quot;Commission&quot;</strong> — 30% of the net sale amount earned when a Referred Customer completes a qualifying purchase.</li>
            <li style={LI_STYLE}><strong>&quot;Referred Customer&quot;</strong> — a new customer who clicks your Affiliate Link and completes a qualifying purchase within the 30-day attribution window.</li>
            <li style={LI_STYLE}><strong>&quot;Qualifying Purchase&quot;</strong> — a first-time Pro subscription (monthly, annual, or lifetime) by a Referred Customer. Subscription renewals and purchases by existing Pro users do not qualify.</li>
            <li style={LI_STYLE}><strong>&quot;Attribution Window&quot;</strong> — the 30-day period during which a click on your Affiliate Link is tracked via the <code style={{ fontSize: 13, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>clipmark_ref</code> cookie.</li>
          </ul>
        </div>

        {/* 2 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>2. Eligibility &amp; Approval</h2>
          <p style={P_STYLE}>To be eligible to apply for the Program, you must:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}>Hold an active ClipMark Pro subscription (monthly, annual, or lifetime).</li>
            <li style={LI_STYLE}>Have a ClipMark account that is at least 30 days old at the time of application.</li>
            <li style={LI_STYLE}>Not be in breach of the main ClipMark Terms of Service or these Affiliate Terms.</li>
          </ul>
          <p style={P_STYLE}>
            Applications are submitted by email and reviewed by the ClipMark team. ClipMark reserves the right to reject or revoke any application at its sole discretion, including where it determines that the applicant&apos;s promotional channels are unsuitable for the Program.
          </p>
          <p style={P_STYLE}>
            Approved Affiliates may not transfer, assign, or sub-license their affiliate status or Affiliate Link to any other person or entity.
          </p>
        </div>

        {/* 3 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>3. Commission &amp; Payments</h2>

          <h3 style={{ ...H2_STYLE, fontSize: 17, fontWeight: 600, marginBottom: 10 }}>3.1 Commission Rate</h3>
          <p style={P_STYLE}>
            You earn a <strong>30% commission</strong> on the net sale amount (after any referral discount) of each Qualifying Purchase made by a Referred Customer within your Attribution Window.
            Referred Customers automatically receive a <strong>10% discount</strong> at checkout when they arrive via your Affiliate Link and the discount is applied at the payment processor level.
            Commission is therefore calculated on the discounted price. Commission is earned <strong>once per Referred Customer</strong>, on their Qualifying Purchase — it is not a recurring or lifetime revenue share, and subsequent renewals earn nothing further.
            The commission and discount rates for current plans are indicative only and may change with 30 days&apos; notice.
          </p>

          <h3 style={{ ...H2_STYLE, fontSize: 17, fontWeight: 600, marginBottom: 10 }}>3.2 Payout Schedule</h3>
          <p style={P_STYLE}>
            Commissions are held for <strong>30 days</strong> following the date of the Qualifying Purchase to account for potential refunds. After the hold period, eligible commissions are batched and paid out monthly, typically in the first week of the following calendar month.
          </p>

          <h3 style={{ ...H2_STYLE, fontSize: 17, fontWeight: 600, marginBottom: 10 }}>3.3 Minimum Payout Threshold</h3>
          <p style={P_STYLE}>
            A minimum balance of <strong>$25 USD</strong> in eligible (post-hold) commissions is required to trigger a payout. Balances below this threshold roll over to the next month.
          </p>

          <h3 style={{ ...H2_STYLE, fontSize: 17, fontWeight: 600, marginBottom: 10 }}>3.4 Payment Methods</h3>
          <p style={P_STYLE}>
            Payouts are made via Wise (bank transfer) or PayPal. You are responsible for providing accurate payment details and for any fees charged by your payment provider. Contact{' '}
            <a href="mailto:affiliates@clipmark.mithahara.com" style={{ color: 'var(--brand-ink)' }}>affiliates@clipmark.mithahara.com</a> after approval to register your payout method.
          </p>

          <h3 style={{ ...H2_STYLE, fontSize: 17, fontWeight: 600, marginBottom: 10 }}>3.5 Refunds &amp; Chargebacks</h3>
          <p style={P_STYLE}>
            If a Referred Customer receives a refund or initiates a chargeback, the associated commission will be cancelled and removed from your pending balance. If the commission has already been paid out, ClipMark reserves the right to deduct the equivalent amount from a future payout.
          </p>

          <h3 style={{ ...H2_STYLE, fontSize: 17, fontWeight: 600, marginBottom: 10 }}>3.6 Taxes</h3>
          <p style={P_STYLE}>
            You are solely responsible for reporting and paying any taxes applicable to your commissions in your jurisdiction. ClipMark will not withhold taxes on your behalf unless required by law. Where required, ClipMark may request a completed tax form (e.g., W-9 or W-8BEN) before processing payouts.
          </p>
        </div>

        {/* 4 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>4. Permitted Promotional Methods</h2>
          <p style={P_STYLE}>You may promote ClipMark using your Affiliate Link through:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}>Your own YouTube channel, blog, podcast, newsletter, or social media accounts.</li>
            <li style={LI_STYLE}>Organic content such as reviews, tutorials, recommendations, and comparisons.</li>
            <li style={LI_STYLE}>Community participation (forums, Discord servers, Reddit) where you are a genuine member and where such promotion is permitted by the community rules.</li>
          </ul>
        </div>

        {/* 5 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>5. Prohibited Promotion Methods</h2>
          <p style={P_STYLE}>The following activities are strictly prohibited and may result in immediate termination and forfeiture of pending commissions:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Paid search advertising</strong> — running paid ads on Google, Bing, or any other search engine that bid on &quot;ClipMark&quot; or any ClipMark brand keywords, or that display your Affiliate Link as the destination URL.</li>
            <li style={LI_STYLE}><strong>Cookie stuffing / forced clicks</strong> — automatically dropping the affiliate cookie on a user&apos;s browser without a genuine click (e.g., via iframes, pop-unders, or injected scripts).</li>
            <li style={LI_STYLE}><strong>Misleading claims</strong> — making false or exaggerated claims about ClipMark&apos;s features, pricing, or results that are not substantiated by our official materials.</li>
            <li style={LI_STYLE}><strong>Fake discount sites</strong> — operating coupon or deal websites that claim to offer exclusive ClipMark discounts that do not exist.</li>
            <li style={LI_STYLE}><strong>Spam</strong> — sending unsolicited emails or messages at scale promoting your Affiliate Link.</li>
            <li style={LI_STYLE}><strong>Self-referrals</strong> — using your own Affiliate Link to purchase a ClipMark subscription for yourself or any account you control.</li>
            <li style={LI_STYLE}><strong>Incentivised clicks</strong> — offering cash, prizes, or other incentives in exchange for clicking your Affiliate Link or signing up for ClipMark.</li>
          </ul>
        </div>

        {/* 6 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>6. Disclosure Requirements</h2>
          <p style={P_STYLE}>
            You must clearly and conspicuously disclose your affiliate relationship with ClipMark whenever you share your Affiliate Link, in accordance with applicable laws and regulations (including the FTC Endorsement Guidelines in the US and equivalent regulations in your jurisdiction). An acceptable disclosure is:
          </p>
          <div style={{
            background: 'rgba(20,184,166,0.06)', borderLeft: '3px solid var(--accent)',
            padding: '14px 20px', borderRadius: '0 8px 8px 0', margin: '16px 0',
          }}>
            <p style={{ ...P_STYLE, marginBottom: 0, fontStyle: 'italic' }}>
              &quot;This link is an affiliate link. I may earn a commission if you upgrade to Pro through my link, at no extra cost to you.&quot;
            </p>
          </div>
        </div>

        {/* 7 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>7. Tracking &amp; Attribution</h2>
          <p style={P_STYLE}>
            Affiliate attribution is tracked via a first-click, 30-day cookie (<code style={{ fontSize: 13, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>clipmark_ref</code>) set when a visitor clicks your Affiliate Link. If a visitor already has an affiliate cookie from a different affiliate, a new click will <em>not</em> overwrite the existing cookie — first-click attribution applies.
          </p>
          <p style={P_STYLE}>
            ClipMark&apos;s tracking records are the authoritative source for commission calculations. Discrepancies must be reported within 30 days of the relevant payout statement by emailing{' '}
            <a href="mailto:affiliates@clipmark.mithahara.com" style={{ color: 'var(--brand-ink)' }}>affiliates@clipmark.mithahara.com</a>.
          </p>
        </div>

        {/* 8 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>8. Intellectual Property</h2>
          <p style={P_STYLE}>
            ClipMark grants you a limited, non-exclusive, non-transferable, revocable licence to use the ClipMark name, logo, and official marketing assets solely for the purpose of promoting ClipMark through the Program. You may not:
          </p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}>Modify or alter the ClipMark logo or brand assets.</li>
            <li style={LI_STYLE}>Register domain names, social media handles, or app names that incorporate &quot;ClipMark&quot; or any confusingly similar name.</li>
            <li style={LI_STYLE}>Imply an exclusive partnership, endorsement, or special relationship beyond that of an affiliate.</li>
          </ul>
        </div>

        {/* 9 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>9. Termination</h2>
          <p style={P_STYLE}>
            Either party may terminate your participation in the Program at any time, for any reason, with or without notice.
          </p>
          <p style={P_STYLE}>
            ClipMark may terminate your participation immediately and without notice if you breach these Affiliate Terms, including — but not limited to — engaging in any prohibited promotion method listed in Section 5.
          </p>
          <p style={P_STYLE}>
            Upon termination:
          </p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}>Your Affiliate Link will be deactivated immediately.</li>
            <li style={LI_STYLE}>Commissions already paid will not be clawed back unless they arose from fraudulent activity or prohibited methods.</li>
            <li style={LI_STYLE}>Pending commissions that arose from valid referrals before termination will be paid out at the next scheduled payout date, subject to the 30-day hold period. Commissions arising from prohibited activity will be forfeited.</li>
          </ul>
        </div>

        {/* 10 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>10. Limitation of Liability</h2>
          <p style={P_STYLE}>
            ClipMark makes no guarantee of any particular commission amount or that the Program will remain available indefinitely. The Program may be modified, suspended, or discontinued at any time with 30 days&apos; notice, except where immediate action is required to prevent fraud or abuse.
          </p>
          <p style={P_STYLE}>
            ClipMark&apos;s total liability to you under or in connection with these Affiliate Terms shall not exceed the total commissions paid to you in the 12 months immediately preceding the event giving rise to the claim.
          </p>
        </div>

        {/* 11 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>11. Relationship of the Parties</h2>
          <p style={P_STYLE}>
            You are an independent contractor. Nothing in these Affiliate Terms creates an employment, agency, partnership, or joint-venture relationship between you and ClipMark. You have no authority to bind ClipMark to any agreement or obligation.
          </p>
        </div>

        {/* 12 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>12. Governing Law</h2>
          <p style={P_STYLE}>
            These Affiliate Terms are governed by the same jurisdiction as the main ClipMark Terms of Service. Any dispute shall be resolved in accordance with those Terms.
          </p>
        </div>

        {/* 13 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>13. Changes to These Terms</h2>
          <p style={P_STYLE}>
            ClipMark reserves the right to modify these Affiliate Terms at any time. Material changes will be communicated via email to active affiliates at least 14 days before they take effect. Your continued participation in the Program after the effective date constitutes acceptance of the updated terms. If you do not agree, you may terminate your participation before the effective date.
          </p>
        </div>

        {/* 14 */}
        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>14. Contact</h2>
          <p style={P_STYLE}>
            For questions about the Affiliate Program or these terms, contact:<br />
            <a href="mailto:affiliates@clipmark.mithahara.com" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>affiliates@clipmark.mithahara.com</a>
          </p>
          <p style={P_STYLE}>
            For general legal enquiries:<br />
            <a href={`mailto:${LEGAL_EMAIL}`} style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>{LEGAL_EMAIL}</a>
          </p>
        </div>

      </main>

    </div>
  );
}
