import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import { SUPPORT_EMAIL } from '@/app/lib/constants';
import { UninstallForm } from './UninstallForm';

/**
 * /uninstall — where Chrome sends someone after they remove the extension.
 *
 * Registered via chrome.runtime.setUninstallURL() in the background service
 * worker. Chrome opens it in a new tab on uninstall; there is no way to show
 * anything inside the extension at that point, so this page IS the survey.
 *
 * `noindex, follow`, for the same reasons as /feedback: a utility page that
 * targets no query and would be a spam magnet if indexed. Deliberately NOT in
 * robots.ts's Disallow list — a blocked crawler never reads the noindex tag, so
 * blocking is the weaker of the two — and deliberately absent from sitemap.ts,
 * which would contradict it.
 *
 * The tone is the point. This person has already left; the page's job is to be
 * easy to ignore and easy to answer, in that order. No "are you sure?", no
 * discount, no reinstall button before they have said anything — the Web Store
 * link appears only in the thank-you state.
 */
export const metadata: Metadata = {
  ...buildPageMetadata({
    title: 'ClipMark Uninstalled — Tell Us Why',
    description:
      'One tap to tell us what made you uninstall ClipMark. No account, nothing required, and the answer goes straight to the person building it.',
    path: '/uninstall',
  }),
  robots: { index: false, follow: true },
};

export default function UninstallPage() {
  return (
    <>
      <section style={{ padding: '72px 32px 24px', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <span className="cm-section-label">ClipMark is uninstalled</span>
          <h1
            style={{
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.035em',
              fontFamily: 'var(--font-display)',
              color: 'var(--text)',
              margin: '0 auto 24px',
            }}
          >
            It&apos;s gone. What went wrong?
          </h1>
          <p style={{ fontSize: 19, color: 'var(--text-sub)', lineHeight: 1.7, margin: '0 auto 16px', maxWidth: 620 }}>
            ClipMark has been removed from your browser and your local bookmarks went with
            it. Nothing here will try to talk you out of that.
          </p>
          <p style={{ fontSize: 17, color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 auto', maxWidth: 620 }}>
            If you have ten seconds, one tap below tells us what to fix. Everything else on
            this page is optional, and closing the tab is a perfectly good answer too.
          </p>
        </div>
      </section>

      <section style={{ padding: '16px 32px 88px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <UninstallForm />

          <p
            style={{
              fontSize: 15,
              color: 'var(--text-muted)',
              lineHeight: 1.7,
              textAlign: 'center',
              margin: '28px auto 0',
              maxWidth: 560,
            }}
          >
            Rather say it directly?{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>
              {SUPPORT_EMAIL}
            </a>{' '}
            reaches the same person. We store your answer, the extension version, and an
            email only if you leave one — nothing that identifies you otherwise, never sold,
            never used for advertising —{' '}
            <a href="/privacy" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>
              privacy policy
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
