import { SUPPORT_EMAIL, LEGAL_EMAIL } from '@/app/lib/constants';

export const metadata = {
  title: 'Terms of Service — Clipmark',
  description: 'Terms and conditions for using Clipmark.',
};

const SECTION_STYLE = {
  marginBottom: 48,
};

const H2_STYLE = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 22,
  fontWeight: 700,
  color: '#1a1c1d',
  marginBottom: 16,
  marginTop: 0,
};

const P_STYLE = {
  fontSize: 15,
  color: '#3c4947',
  lineHeight: 1.75,
  marginBottom: 12,
};

const UL_STYLE = {
  paddingLeft: 20,
  marginBottom: 12,
};

const LI_STYLE = {
  fontSize: 15,
  color: '#3c4947',
  lineHeight: 1.75,
  marginBottom: 6,
};

export default function TermsPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9f9fa',
      color: '#1a1c1d',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 1px 0 rgba(26,28,29,0.06)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 20, fontWeight: 800, color: '#14B8A6', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px', textDecoration: 'none' }}>
            Clipmark
          </a>
        </div>
      </nav>

      {/* ── Content ── */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 32px 96px' }}>

        <h1 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 40, fontWeight: 800, letterSpacing: '-1px',
          color: '#1a1c1d', marginBottom: 12, marginTop: 0,
        }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 56 }}>
          Last updated: March 25, 2026
        </p>

        <div style={SECTION_STYLE}>
          <p style={P_STYLE}>
            These Terms of Service (&quot;Terms&quot;) govern your use of Clipmark (&quot;the Service&quot;) operated by Clipmark
            (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By using Clipmark, you agree to these Terms. If you do not agree, do not use the Service.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>1. Use of the Service</h2>
          <p style={P_STYLE}>You may use Clipmark to:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}>Save timestamped bookmarks on YouTube videos for personal use.</li>
            <li style={LI_STYLE}>Organize, tag, and share collections of bookmarks.</li>
            <li style={LI_STYLE}>Use AI-powered features (Pro tier) to generate summaries and tags.</li>
          </ul>
          <p style={P_STYLE}>You may <strong>not</strong> use Clipmark to:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}>Violate any applicable laws or regulations.</li>
            <li style={LI_STYLE}>Infringe on the intellectual property rights of others.</li>
            <li style={LI_STYLE}>Distribute harmful, offensive, or illegal content via shared collections.</li>
            <li style={LI_STYLE}>Attempt to reverse-engineer, scrape, or abuse the Service or its APIs.</li>
            <li style={LI_STYLE}>Use automated bots or scripts to create bookmarks at scale.</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>2. Accounts</h2>
          <p style={P_STYLE}>
            You may use Clipmark without an account (bookmarks stored locally). To access cloud sync and sharing features, you must sign in with a Google account. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>3. Pro Subscription</h2>
          <p style={P_STYLE}>
            Clipmark offers a paid Pro tier that unlocks AI features, unlimited shared collections, and spaced revisit. The following terms apply to Pro subscriptions:
          </p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Billing</strong> — subscriptions are billed monthly or annually as selected. Payments are processed by Dodo Payments.</li>
            <li style={LI_STYLE}><strong>Cancellation</strong> — you may cancel at any time. Pro features remain active until the end of the current billing period. No prorated refunds for partial periods on monthly plans.</li>
            <li style={LI_STYLE}><strong>Refunds</strong> — we offer a 7-day money-back guarantee for new subscribers. Contact <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#14B8A6' }}>{SUPPORT_EMAIL}</a> within 7 days of your first payment to request a full refund.</li>
            <li style={LI_STYLE}><strong>Lifetime plans</strong> — one-time payment grants lifetime access to Pro features available at time of purchase. Future features may require a subscription upgrade.</li>
            <li style={LI_STYLE}><strong>Price changes</strong> — we may change subscription prices with 30 days&apos; notice. Existing subscribers will be grandfathered at their current rate for one additional billing cycle.</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>4. Your Content</h2>
          <p style={P_STYLE}>
            You own the content you create in Clipmark (bookmark descriptions, tags, notes). By sharing a collection publicly, you grant us a non-exclusive license to display that content at the shared URL. You can revoke this by deleting the shared collection.
          </p>
          <p style={P_STYLE}>
            You represent that any content you create or share does not violate third-party rights or applicable laws.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>5. Third-Party Content</h2>
          <p style={P_STYLE}>
            Clipmark interacts with YouTube videos and content. We do not host, cache, or redistribute any YouTube video content. YouTube&apos;s own <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6' }}>Terms of Service</a> apply to your use of YouTube.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>6. Service Availability</h2>
          <p style={P_STYLE}>
            We strive to maintain high availability but do not guarantee uninterrupted access to the Service. We may perform maintenance, updates, or experience outages. We are not liable for any losses resulting from service downtime.
          </p>
          <p style={P_STYLE}>
            We reserve the right to modify, suspend, or discontinue any part of the Service with reasonable notice.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>7. Limitation of Liability</h2>
          <p style={P_STYLE}>
            To the maximum extent permitted by law, Clipmark is provided &quot;as is&quot; without warranties of any kind. We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including but not limited to loss of data, loss of bookmarks, or service interruption.
          </p>
          <p style={P_STYLE}>
            Our total liability to you for any claim arising from these Terms or the Service shall not exceed the amount you paid us in the 12 months preceding the claim.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>8. Termination</h2>
          <p style={P_STYLE}>
            You may terminate your account at any time by deleting it from the dashboard. We may suspend or terminate your access if you violate these Terms. Upon termination, your data will be deleted according to our <a href="/privacy" style={{ color: '#14B8A6' }}>Privacy Policy</a>.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>9. Governing Law</h2>
          <p style={P_STYLE}>
            These Terms are governed by the laws of the jurisdiction in which Clipmark is incorporated, without regard to conflict of law principles.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>10. Changes to These Terms</h2>
          <p style={P_STYLE}>
            We may update these Terms from time to time. We will notify you of material changes by updating the date at the top of this page and, where appropriate, by email. Continued use of the Service after changes constitutes acceptance.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>11. Contact</h2>
          <p style={P_STYLE}>
            Questions about these Terms? Contact us at:<br />
            <a href={`mailto:${LEGAL_EMAIL}`} style={{ color: '#14B8A6', fontWeight: 600 }}>{LEGAL_EMAIL}</a>
          </p>
        </div>

      </main>

      {/* ── Footer ── */}
      <footer style={{ padding: '32px', borderTop: '1px solid rgba(26,28,29,0.06)', background: '#f3f3f4' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>© 2026 Clipmark.</span>
          <div style={{ display: 'flex', gap: 24 }}>
            <a href="/privacy" style={{ fontSize: 13, color: '#545f6c', textDecoration: 'none', fontWeight: 600 }}>Privacy</a>
            <a href="/terms" style={{ fontSize: 13, color: '#545f6c', textDecoration: 'none' }}>Terms</a>
            <a href="/" style={{ fontSize: 13, color: '#545f6c', textDecoration: 'none' }}>Home</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
