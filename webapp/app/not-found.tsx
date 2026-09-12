import type { Metadata } from 'next';
import { CHROME_STORE_URL } from './lib/constants';

/**
 * Custom 404.
 *
 * Three routes call notFound() on a miss — /v/[shareId], /u/[username] and
 * /embed/[shareId] — so this page is not just for mistyped URLs: it is what a
 * visitor sees when someone shares a collection link that has since been
 * deleted. Shared links are the site's main organic surface, and without this
 * file they landed on Next's unstyled default 404 with no route back.
 *
 * Deliberately NOT wrapped in the marketing <Navigation/>: that component is an
 * async server component that reads auth state from cookies, which would make
 * this page dynamically rendered on every unmatched URL — including the bot
 * traffic that probes for /wp-login.php. The links below are hardcoded instead,
 * so the 404 stays a static render.
 *
 * Colours come from tokens rather than literals so the page follows the theme
 * toggle, and so it passes the R1 ramp check in scripts/design-audit.mjs.
 */
// No `robots` here on purpose: Next already emits <meta name="robots"
// content="noindex"> for this route, and declaring it again just ships two
// robots tags that say the same thing.
export const metadata: Metadata = {
  title: 'Page Not Found — ClipMark',
  description: 'That page, clip or collection could not be found.',
};

const LINK_STYLE = {
  color: 'var(--brand-ink)',
  fontWeight: 600,
  fontSize: 15,
  textDecoration: 'none',
} as const;

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font)',
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <a
          href="/"
          style={{
            display: 'inline-block',
            marginBottom: 40,
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: 'var(--text)',
            textDecoration: 'none',
            fontFamily: 'var(--font-display)',
          }}
        >
          ClipMark
        </a>

        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 24px',
            borderRadius: 16,
            background: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-ink)',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 30 }}>
            link_off
          </span>
        </div>

        <p
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Error 404
        </p>

        <h1
          style={{
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-1px',
            lineHeight: 1.2,
            margin: '0 0 16px',
          }}
        >
          This page isn&apos;t here
        </h1>

        <p
          style={{
            fontSize: 16,
            lineHeight: 1.65,
            color: 'var(--text-sub)',
            margin: '0 0 32px',
          }}
        >
          The link may be mistyped, or the clip or collection it pointed to has been
          deleted by its owner. Nothing of yours has been lost — your own bookmarks
          are safe.
        </p>

        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '14px 30px',
            borderRadius: 12,
            background: 'var(--accent-strong)',
            color: '#ffffff',
            fontSize: 15,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Back to home
        </a>

        <div
          style={{
            marginTop: 40,
            paddingTop: 28,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <a href="/dashboard" style={LINK_STYLE}>My clips</a>
          <a href="/faq" style={LINK_STYLE}>FAQ</a>
          <a href="/upgrade" style={LINK_STYLE}>Pricing</a>
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
            Get the extension
          </a>
        </div>
      </div>
    </main>
  );
}
