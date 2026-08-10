import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import { SUPPORT_EMAIL } from '@/app/lib/constants';
import { FeedbackForm } from './FeedbackForm';

/**
 * /feedback — the early-user feedback form.
 *
 * `noindex, follow`: this is a utility page, not an SEO surface. It targets no
 * query, would compete with nothing, and an indexed feedback form is a spam
 * magnet. Deliberately NOT added to robots.ts's Disallow list — a blocked
 * crawler never reads the noindex tag, so blocking is the weaker of the two —
 * and deliberately absent from sitemap.ts, which would contradict it. Links out
 * of the page are still followed.
 */
export const metadata: Metadata = {
  ...buildPageMetadata({
    title: 'Send ClipMark Feedback — Tell Us What Is Missing',
    description:
      'Tell us what works, what is confusing, and what you want next in ClipMark. Three questions, no account needed — it goes straight to the person building it.',
    path: '/feedback',
  }),
  robots: { index: false, follow: true },
};

const INK = 'var(--text)';

export default function FeedbackPage() {
  return (
    <>
      <section style={{ padding: '72px 32px 40px', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <span className="cm-section-label">Early feedback</span>
          <h1
            style={{
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.035em',
              fontFamily: 'var(--font-display)',
              color: INK,
              margin: '0 auto 24px',
            }}
          >
            Tell me what ClipMark gets wrong.
          </h1>
          <p style={{ fontSize: 19, color: 'var(--text-sub)', lineHeight: 1.7, margin: '0 auto 16px', maxWidth: 620 }}>
            ClipMark is early, and the people using it right now are friends, family, and a
            handful of first users. That is on purpose — the half-formed, slightly awkward
            reactions are the useful ones at this stage, and I would much rather hear them
            now than guess later.
          </p>
          <p style={{ fontSize: 17, color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 auto', maxWidth: 620 }}>
            Pick a rating, answer whichever questions you have something to say about, and
            skip the rest. No account, no card, nothing to install. Blunt is more helpful
            than kind.
          </p>
        </div>
      </section>

      <section style={{ padding: '8px 32px 88px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <FeedbackForm />

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
            Prefer email, or found something broken enough to need a back-and-forth?{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>
              {SUPPORT_EMAIL}
            </a>{' '}
            reaches the same person. What you write here is stored so it can be read and
            replied to; it is never sold and never used for advertising —{' '}
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
