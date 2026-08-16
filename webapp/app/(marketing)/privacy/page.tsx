import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import { PRIVACY_EMAIL } from '@/app/lib/constants';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy — ClipMark',
  description: 'How ClipMark collects, uses, and protects your data.',
  path: '/privacy',
  ogTitle: 'Privacy Policy',
});

const SECTION_STYLE = {
  marginBottom: 48,
};

const H2_STYLE = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 22,
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 16,
  marginTop: 0,
};

const P_STYLE = {
  fontSize: 15,
  color: 'var(--text-sub)',
  lineHeight: 1.75,
  marginBottom: 12,
};

const UL_STYLE = {
  paddingLeft: 20,
  marginBottom: 12,
};

const LI_STYLE = {
  fontSize: 15,
  color: 'var(--text-sub)',
  lineHeight: 1.75,
  marginBottom: 6,
};

export default function PrivacyPage() {
  return (
    <>
      {/* ── Content ── */}
      <main style={{ maxWidth: 840, margin: '0 auto', padding: '60px 32px 128px' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <span className="cm-section-label">Trust & Safety</span>
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 800, letterSpacing: '-1.5px',
            color: 'var(--text)', marginBottom: 16, marginTop: 0,
          }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 0 }}>
            Last updated: March 25, 2026 • We respect your data.
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>info</span>
          </div>
          <p style={P_STYLE}>
            ClipMark (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a YouTube bookmark manager. This policy explains
            what data we collect, how we use it, and your rights regarding that data.
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>database</span>
          </div>
          <h2 style={H2_STYLE}>1. Data We Collect</h2>
          <p style={P_STYLE}>When you use ClipMark, we may collect the following:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Bookmarks</strong> — timestamps, descriptions, and tags you create for YouTube videos.</li>
            <li style={LI_STYLE}><strong>Video metadata</strong> — video IDs and titles for videos you bookmark.</li>
            <li style={LI_STYLE}><strong>Account data</strong> — your name, email address, and profile photo from Google, obtained only when you sign in with Google OAuth.</li>
            <li style={LI_STYLE}><strong>Auth tokens</strong> — OAuth access and refresh tokens, stored encrypted in your browser&apos;s Chrome storage and our secure database.</li>
            <li style={LI_STYLE}><strong>Usage data</strong> — view counts for shared collections (no personal identifying data).</li>
            <li style={LI_STYLE}><strong>Feedback you submit</strong> — the rating and answers you send from the <a href="/feedback" style={{ color: 'var(--brand-ink)' }}>feedback form</a>, plus the name and email address only if you choose to fill them in. Both are optional; leaving them blank keeps the submission anonymous.</li>
            <li style={LI_STYLE}><strong>Uninstall feedback</strong> — if you remove the extension, Chrome opens our <a href="/uninstall" style={{ color: 'var(--brand-ink)' }}>uninstall page</a>. Answering is entirely optional. If you do, we store the reason you picked, anything you write, the version of the extension you had, and an email address only if you choose to leave one — used solely to reply to you and to decide what to fix. Nothing that identifies you is added automatically, and no account or sign-in is involved.</li>
          </ul>
          <p style={P_STYLE}>
            We do <strong>not</strong> collect browsing history, track pages outside of YouTube, or use third-party advertising trackers.
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>lock</span>
          </div>
          <h2 style={H2_STYLE}>2. How We Store Your Data</h2>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Local storage</strong> — bookmarks are stored in Chrome&apos;s <code>chrome.storage.sync</code>, which is encrypted and managed by Google.</li>
            <li style={LI_STYLE}><strong>Cloud storage</strong> — if you sign in, bookmarks and account data are stored in Supabase (PostgreSQL), hosted on secured infrastructure with row-level security policies.</li>
            <li style={LI_STYLE}><strong>Shared collections</strong> — when you explicitly share a collection, it is stored in our database and accessible to anyone with the link.</li>
          </ul>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>hub</span>
          </div>
          <h2 style={H2_STYLE}>3. Third-Party Services</h2>
          <p style={P_STYLE}>ClipMark uses the following third-party services:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Google OAuth</strong> — for sign-in. Governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)' }}>Google&apos;s Privacy Policy</a>.</li>
            <li style={LI_STYLE}><strong>Supabase</strong> — our database provider. Data is stored in the United States. See <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)' }}>Supabase&apos;s Privacy Policy</a>.</li>
            <li style={LI_STYLE}><strong>On-device AI (Gemini Nano)</strong> — AI features like note drafting are processed entirely within your browser using Chrome&apos;s built-in models. Your data never leaves your device for AI processing, ensuring maximum privacy and zero data retention by external AI providers.</li>
            <li style={LI_STYLE}><strong>Dodo Payments</strong> — for Pro subscriptions. Payment details are handled entirely by Dodo Payments and are never stored on our servers.</li>
            <li style={LI_STYLE}><strong>Vercel</strong> — our web hosting provider. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)' }}>Vercel&apos;s Privacy Policy</a>.</li>
            <li style={LI_STYLE}><strong>Vercel Web Analytics</strong> — aggregate visitor counts for this website (pages viewed, referrer, country, device type). It sets no cookies, does not fingerprint you, and cannot follow you to other sites, so there is nothing here to consent to or opt out of. It does not run inside the extension and never sees your bookmarks.</li>
          </ul>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>play_arrow</span>
          </div>
          <h2 style={H2_STYLE}>4. How We Use Your Data</h2>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}>To provide and sync your bookmarks across devices.</li>
            <li style={LI_STYLE}>To enable shareable public collection pages.</li>
            <li style={LI_STYLE}>To provide AI-powered features (Pro tier only).</li>
            <li style={LI_STYLE}>To manage your subscription and verify Pro access.</li>
            <li style={LI_STYLE}>To communicate important account-related updates (no marketing emails without consent).</li>
            <li style={LI_STYLE}>To read the feedback you send us, and to reply to it if you left an email address. A feedback email address is not added to any mailing list.</li>
          </ul>
          <p style={P_STYLE}>
            We do not sell your data to third parties. We do not use your data for advertising.
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>verified_user</span>
          </div>
          <h2 style={H2_STYLE}>5. Your Rights</h2>
          <p style={P_STYLE}>You have the right to:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Access</strong> — request a copy of the data we hold about you.</li>
            <li style={LI_STYLE}><strong>Delete</strong> — delete your account and all associated data. You can do this from the dashboard settings, or by contacting us.</li>
            <li style={LI_STYLE}><strong>Export</strong> — export all your bookmarks at any time from the ClipMark dashboard (JSON, CSV, or Markdown).</li>
            <li style={LI_STYLE}><strong>Correction</strong> — request correction of inaccurate data.</li>
          </ul>
          <p style={P_STYLE}>
            If you are located in the EU/EEA, you also have rights under the EU GDPR. If you are in
            the <strong>United Kingdom</strong>, you have the equivalent rights under the{' '}
            <strong>UK GDPR</strong> and the Data Protection Act 2018. In both cases that includes
            the right to data portability, the right to object to or restrict processing, and the
            right to lodge a complaint with a supervisory authority — in the UK that is the{' '}
            <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)' }}>
              Information Commissioner&apos;s Office (ICO)
            </a>
            . Australian users have rights under the Privacy Act 1988 and may complain to the OAIC.
          </p>
          <p style={P_STYLE}>
            <strong>Who is responsible, and on what basis.</strong> ClipMark is the data controller
            for the data described in this policy; reach us at{' '}
            <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--brand-ink)' }}>{PRIVACY_EMAIL}</a>.
            We process your bookmarks and account data to <em>perform the contract</em> you enter
            into by using ClipMark; we rely on <em>legitimate interests</em> for keeping the service
            secure and for the aggregate, cookieless site measurement described above; and we rely on{' '}
            <em>consent</em> where you volunteer something optional, such as an email address on a
            feedback or uninstall form. You can withdraw that consent at any time by asking us to
            delete it. Data is stored in the United States (see §3).
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>cookie</span>
          </div>
          <h2 style={H2_STYLE}>6. Cookies</h2>
          <p style={P_STYLE}>ClipMark sets a small number of cookies. None of them are advertising cookies, and none are used to build a profile of you:</p>
          <ul style={UL_STYLE}>
            <li style={LI_STYLE}><strong>Sign-in cookies</strong> — set by Supabase when you sign in, to keep you signed in. Strictly necessary; without them the dashboard cannot know who you are.</li>
            <li style={LI_STYLE}><strong><code>clipmark_ref</code></strong> — set for <strong>30 days</strong> when you arrive through an affiliate link (a <code>/r/&lt;code&gt;</code> URL). It stores only that affiliate&apos;s code so the referrer is credited if you later upgrade, and it is set only on the first such visit — a later affiliate link will not overwrite it. It is <code>httpOnly</code> and <code>SameSite=Lax</code>, so it is not readable by page scripts and is not sent to other sites. It contains no identifier for you.</li>
            <li style={LI_STYLE}><strong>Theme preference</strong> — stored in your browser&apos;s local storage, not a cookie, and never sent to us.</li>
          </ul>
          <p style={P_STYLE}>
            The sign-in cookies are strictly necessary, so they do not require consent. The
            <code> clipmark_ref</code> attribution cookie is not strictly necessary: if you would
            rather not have it, decline it by visiting ClipMark directly instead of through an
            affiliate link, or clear it in your browser at any time — nothing about the product
            stops working without it. We do not currently show a cookie banner; you can block or
            delete any of these cookies through your browser settings.
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>history</span>
          </div>
          <h2 style={H2_STYLE}>7. Data Retention</h2>
          <p style={P_STYLE}>
            We retain your data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where retention is required by law.
            Shared collection pages are deleted immediately upon account deletion.
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>child_care</span>
          </div>
          <h2 style={H2_STYLE}>8. Children&apos;s Privacy</h2>
          <p style={P_STYLE}>
            ClipMark is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such data, please contact us immediately.
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>edit_note</span>
          </div>
          <h2 style={H2_STYLE}>9. Changes to This Policy</h2>
          <p style={P_STYLE}>
            We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the date at the top of this page. Your continued use of ClipMark after any changes constitutes acceptance of the updated policy.
          </p>
        </div>

        <div className="cm-card" style={{ marginBottom: 32, padding: '40px' }}>
          <div className="cm-icon-badge" style={{ width: 48, height: 48, marginBottom: 20 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>mail</span>
          </div>
          <h2 style={H2_STYLE}>10. Contact</h2>
          <p style={P_STYLE}>
            If you have questions or requests regarding your data, please contact us at:<br />
            <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>{PRIVACY_EMAIL}</a>
          </p>
        </div>

      </main>
    </>
  );
}
