import type { Metadata } from 'next';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';
import { CHROME_STORE_URL } from './lib/constants';

/**
 * Sitewide 404.
 *
 * Two jobs, and the second is the reason this file exists at all: catch typo'd
 * URLs, and catch every `notFound()` thrown by a share surface —
 * `/v/{shareId}`, `/u/{username}` and `/embed/{shareId}` all call it when the
 * row is missing. Those are the links that travel (a classmate pastes a
 * collection into a group chat), so a dead one used to land a first-time
 * visitor on Next.js's unstyled black-on-white "404 | This page could not be
 * found" — no wordmark, no nav, nothing to click. This replaces that.
 *
 * Unlike `global-error.tsx` (which substitutes for the root layout and so must
 * ship its own <html>/<body> and cannot use the fonts or the theme provider),
 * `not-found.tsx` renders *inside* the root layout: tokens resolve, the theme
 * script has already run, and dark mode works for free. Nav and Footer are
 * rendered here rather than inherited because the nearest boundary for a
 * `notFound()` in `(marketing)` is this root file, which sits above the
 * marketing layout that would otherwise supply them.
 *
 * Reachable-only-by-accident pages are `noindex`: a 404 that Google indexes
 * competes with the real pages in the sitemap.
 */
export const metadata: Metadata = {
  title: 'Page not found — ClipMark',
  description: 'That ClipMark link is no longer available. Browse the site or install the extension to start saving YouTube moments.',
  robots: { index: false, follow: true },
};

const LINK_CARDS = [
  {
    href: '/',
    icon: 'home',
    title: 'Home',
    desc: 'What ClipMark does, and why saved moments stick.',
  },
  {
    href: '/dashboard',
    icon: 'dashboard',
    title: 'Your dashboard',
    desc: 'Signed in? Every collection you own lives here.',
  },
  {
    href: '/upgrade',
    icon: 'workspace_premium',
    title: 'Plans',
    desc: 'What Free covers, and what Pro adds.',
  },
  {
    href: '/faq',
    icon: 'help',
    title: 'FAQ',
    desc: 'Common questions about clips, recall and export.',
  },
];

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navigation />
      {/* Matches (marketing)/layout.tsx — the nav is fixed, so content needs the offset. */}
      <main style={{ flex: 1, paddingTop: 80, background: 'var(--surface)' }}>
        <section style={{ padding: '80px 32px 72px', maxWidth: 880, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 14px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--accent-light)',
                color: 'var(--brand-ink)',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.3px',
                marginBottom: 24,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }} aria-hidden="true">
                link_off
              </span>
              Error 404
            </div>

            <h1
              style={{
                fontSize: 'clamp(30px, 4.6vw, 46px)',
                fontWeight: 800,
                fontFamily: 'var(--font-display)',
                letterSpacing: '-1px',
                lineHeight: 1.15,
                color: 'var(--text)',
                margin: '0 0 18px',
              }}
            >
              We couldn&apos;t find that page
            </h1>

            <p
              style={{
                fontSize: 17,
                lineHeight: 1.75,
                color: 'var(--text-muted)',
                maxWidth: 580,
                margin: '0 auto 34px',
              }}
            >
              The link may be mistyped, or it pointed at a shared collection whose owner has
              since deleted it or made it private. Nothing of yours has been lost — your own
              clips are exactly where you left them.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                justifyContent: 'center',
                marginBottom: 64,
              }}
            >
              <a
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 28px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--accent-strong)',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: 'none',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 19 }} aria-hidden="true">
                  arrow_back
                </span>
                Back to home
              </a>
              <a
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 28px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--btn-secondary-bg)',
                  color: 'var(--btn-secondary-text)',
                  border: '1px solid var(--border)',
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Get the extension — Free
              </a>
            </div>
          </div>

          <nav aria-label="Popular pages">
            <div
              style={{
                display: 'grid',
                // 170px, not 210: at 210 the four cards need 882px inside an
                // 816px content box, so the fourth orphaned onto its own row on
                // a desktop viewport. 170 fits 4-up here and still degrades to
                // 2-up then 1-up as the viewport narrows.
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 14,
              }}
            >
              {LINK_CARDS.map((card) => (
                <a
                  key={card.href}
                  href={card.href}
                  style={{
                    display: 'block',
                    padding: '20px 20px 22px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    textDecoration: 'none',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 22, color: 'var(--brand-ink)' }}
                    aria-hidden="true"
                  >
                    {card.icon}
                  </span>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'var(--text)',
                      margin: '8px 0 5px',
                    }}
                  >
                    {card.title}
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-muted)' }}>
                    {card.desc}
                  </div>
                </a>
              ))}
            </div>
          </nav>
        </section>
      </main>
      <Footer />
    </div>
  );
}
