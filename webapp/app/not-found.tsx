/**
 * Root 404.
 *
 * This is not just for mistyped URLs. The three most shareable surfaces on the
 * site all call notFound() when their record is missing or unshared —
 * /v/[shareId], /u/[username] and /embed/[shareId] — so an expired or revoked
 * share link was landing on Next.js's unstyled black-on-white default. That is
 * the first thing many people ever see of ClipMark, arriving from someone else's
 * link, with no way onward except the back button.
 *
 * Rendered inside the root layout, so it inherits the fonts and ThemeProvider —
 * unlike app/global-error.tsx, which replaces the layout and has to restate
 * them. The visual language is deliberately the same as global-error's so the
 * two failure screens read as one family.
 *
 * Server component on purpose: nothing here is interactive, and a 404 should not
 * ship or block on client JS. Plain <a> rather than next/link for the same
 * reason — these are escape hatches, and a full navigation is the safer default
 * when the router has already failed to match a route.
 */
import type { Metadata } from 'next';
import { CHROME_STORE_URL } from './lib/constants';

export const metadata: Metadata = {
  title: 'Page not found — ClipMark',
  description: 'That ClipMark link is missing, expired, or was never shared publicly.',
  // A 404 must never be indexed, and must never be treated as a canonical
  // destination for the URL that produced it.
  robots: { index: false, follow: true },
};

/** The routes worth offering someone who landed here from a dead share link. */
const DESTINATIONS: { href: string; label: string; desc: string; icon: string }[] = [
  { href: '/',        label: 'Home',       desc: 'What ClipMark does',            icon: 'home' },
  { href: '/upgrade', label: 'Pricing',    desc: 'Free and Pro plans',            icon: 'sell' },
  { href: '/faq',     label: 'FAQ',        desc: 'Common questions',              icon: 'help' },
  { href: '/dashboard', label: 'Dashboard', desc: 'Your saved clips',             icon: 'dashboard' },
];

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        // Theme-aware pair (--bg/--text), not the raw --gray-50/--gray-900 ramp
        // that global-error.tsx uses. That file replaces the root layout and so
        // renders without ThemeProvider, where a fixed light palette is the only
        // safe choice; this one renders inside it, so a dark-mode visitor must
        // not be flashed a white page.
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
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
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--brand-ink)',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 30 }}>
            link_off
          </span>
        </div>

        <p
          style={{
            margin: '0 0 10px',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Error 404
        </p>

        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 12px' }}>
          This page isn&apos;t here
        </h1>

        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--text-muted)',
            margin: '0 auto 32px',
            maxWidth: 420,
          }}
        >
          The link may be mistyped, or it pointed at a shared collection or profile
          that has since been deleted or made private. Nothing of yours is missing.
        </p>

        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '13px 28px',
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
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
            marginTop: 40,
            textAlign: 'left',
          }}
        >
          {DESTINATIONS.map(({ href, label, desc, icon }) => (
            <a
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{ fontSize: 20, color: 'var(--brand-ink)' }}
              >
                {icon}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</span>
              </span>
            </a>
          ))}
        </div>

        <p style={{ marginTop: 32, fontSize: 13, color: 'var(--text-muted)' }}>
          New here?{' '}
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--brand-ink)', fontWeight: 700 }}
          >
            Get the free Chrome extension
          </a>
          .
        </p>
      </div>
    </main>
  );
}
