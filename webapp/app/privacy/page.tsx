export const metadata = {
  title: 'Privacy Policy — Clipmark',
  description: 'How Clipmark collects, uses, and protects your data.',
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

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 56 }}>
          Last updated: March 25, 2026
        </p>

        <div style={SECTION_STYLE}>
          <p style={P_STYLE}>
            Clipmark (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a YouTube bookmark manager. This policy explains
            what data we collect, how we use it, and your rights regarding that data.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>1. Data We Collect</h2>
          <p style={P_STYLE}>When you use Clipmark, we may collect the following:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Bookmarks</strong> — timestamps, descriptions, and tags you create for YouTube videos.</li>
            <li style={LI_STYLE}><strong>Video metadata</strong> — video IDs and titles for videos you bookmark.</li>
            <li style={LI_STYLE}><strong>Account data</strong> — your name, email address, and profile photo from Google, obtained only when you sign in with Google OAuth.</li>
            <li style={LI_STYLE}><strong>Auth tokens</strong> — OAuth access and refresh tokens, stored encrypted in your browser&apos;s Chrome storage and our secure database.</li>
            <li style={LI_STYLE}><strong>Usage data</strong> — view counts for shared collections (no personal identifying data).</li>
          </ul>
          <p style={P_STYLE}>
            We do <strong>not</strong> collect browsing history, track pages outside of YouTube, or use third-party advertising trackers.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>2. How We Store Your Data</h2>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Local storage</strong> — bookmarks are stored in Chrome&apos;s <code>chrome.storage.sync</code>, which is encrypted and managed by Google.</li>
            <li style={LI_STYLE}><strong>Cloud storage</strong> — if you sign in, bookmarks and account data are stored in Supabase (PostgreSQL), hosted on secured infrastructure with row-level security policies.</li>
            <li style={LI_STYLE}><strong>Shared collections</strong> — when you explicitly share a collection, it is stored in our database and accessible to anyone with the link.</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>3. Third-Party Services</h2>
          <p style={P_STYLE}>Clipmark uses the following third-party services:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Google OAuth</strong> — for sign-in. Governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6' }}>Google&apos;s Privacy Policy</a>.</li>
            <li style={LI_STYLE}><strong>Supabase</strong> — our database provider. Data is stored in the United States. See <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6' }}>Supabase&apos;s Privacy Policy</a>.</li>
            <li style={LI_STYLE}><strong>Anthropic Claude</strong> (Pro tier only) — bookmark descriptions and transcripts are sent to Anthropic&apos;s API solely to generate AI summaries and tag suggestions. Data is not retained by Anthropic for training per their API usage policy.</li>
            <li style={LI_STYLE}><strong>Dodo Payments</strong> — for Pro subscriptions. Payment details are handled entirely by Dodo Payments and are never stored on our servers.</li>
            <li style={LI_STYLE}><strong>Vercel</strong> — our web hosting provider. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6' }}>Vercel&apos;s Privacy Policy</a>.</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>4. How We Use Your Data</h2>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}>To provide and sync your bookmarks across devices.</li>
            <li style={LI_STYLE}>To enable shareable public collection pages.</li>
            <li style={LI_STYLE}>To provide AI-powered features (Pro tier only).</li>
            <li style={LI_STYLE}>To manage your subscription and verify Pro access.</li>
            <li style={LI_STYLE}>To communicate important account-related updates (no marketing emails without consent).</li>
          </ul>
          <p style={P_STYLE}>
            We do not sell your data to third parties. We do not use your data for advertising.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>5. Your Rights</h2>
          <p style={P_STYLE}>You have the right to:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Access</strong> — request a copy of the data we hold about you.</li>
            <li style={LI_STYLE}><strong>Delete</strong> — delete your account and all associated data. You can do this from the dashboard settings, or by contacting us.</li>
            <li style={LI_STYLE}><strong>Export</strong> — export all your bookmarks at any time from the Clipmark dashboard (JSON, CSV, or Markdown).</li>
            <li style={LI_STYLE}><strong>Correction</strong> — request correction of inaccurate data.</li>
          </ul>
          <p style={P_STYLE}>
            If you are located in the EU/EEA, you also have rights under the GDPR, including the right to data portability and to lodge a complaint with a supervisory authority.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>6. Data Retention</h2>
          <p style={P_STYLE}>
            We retain your data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where retention is required by law.
            Shared collection pages are deleted immediately upon account deletion.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>7. Children&apos;s Privacy</h2>
          <p style={P_STYLE}>
            Clipmark is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such data, please contact us immediately.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>8. Changes to This Policy</h2>
          <p style={P_STYLE}>
            We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the date at the top of this page. Your continued use of Clipmark after any changes constitutes acceptance of the updated policy.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>9. Contact</h2>
          <p style={P_STYLE}>
            If you have questions or requests regarding your data, please contact us at:<br />
            <a href="mailto:privacy@clipmark.app" style={{ color: '#14B8A6', fontWeight: 600 }}>privacy@clipmark.app</a>
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
