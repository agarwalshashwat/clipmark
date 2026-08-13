import type { Metadata } from 'next';
import { APP_URL } from '@/app/lib/constants';

/**
 * 404 for the embed surface only.
 *
 * `/embed/{shareId}` is designed to be iframed into someone else's page, so it
 * must NOT fall through to the sitewide `app/not-found.tsx` — that one renders
 * the full nav, a four-card link grid and the footer, which inside a short
 * iframe reads as a broken site rather than a missing clip. This is the same
 * message at embed scale.
 *
 * Both links carry target="_blank": inside an iframe a same-tab navigation
 * would replace only the frame, stranding the visitor in a ClipMark page
 * wearing the host page's dimensions. Absolute URLs for the same reason — the
 * embed may be served through a proxy where a root-relative href resolves
 * against the host's origin, not ours.
 */
export const metadata: Metadata = {
  title: 'Collection not found — ClipMark',
  robots: { index: false, follow: false },
};

export default function EmbedNotFound() {
  return (
    <div
      style={{
        fontFamily: 'var(--font-family-body), -apple-system, BlinkMacSystemFont, sans-serif',
        background: '#ffffff',
        color: 'var(--gray-900)',
        // 100vh, not 100%: nothing sets `height` on html/body, so a percentage
        // resolves against an auto-height parent and collapses to the content
        // box — leaving the card pinned to the top of the iframe with a band of
        // page background under it. In an iframe the viewport IS the frame.
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 20px',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 340 }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 30, color: 'var(--gray-400)' }}
          aria-hidden="true"
        >
          link_off
        </span>
        <div style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 6px' }}>
          This collection isn&apos;t available
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--gray-600)', margin: '0 0 16px' }}>
          It may have been deleted or made private by its owner.
        </p>
        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '9px 18px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-strong)',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Open ClipMark
        </a>
      </div>
    </div>
  );
}
