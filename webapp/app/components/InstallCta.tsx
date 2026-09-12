import React from 'react';
import { CHROME_STORE_URL } from '@/app/lib/constants';

/**
 * PROPOSAL (docs/gtm/HOMEPAGE-AUDIT.md F3) — an in-body install CTA.
 *
 * The homepage carried 9 upgrade CTAs against 3 install CTAs, and 11,767px of
 * desktop page — 89% of it — sat between the hero button and the final one with
 * no install control in the body at all. Everything a warm reader met in that
 * stretch ("See what else Pro unlocks", "Explore Pro Features", three plan
 * buttons, "Compare all plans") sold an upgrade for a product they had never
 * run. The fixed nav does keep an install button on screen, but a nav CTA is a
 * far weaker converter than one placed at the moment of conviction.
 *
 * Every claim in `note` has to stay checkable against shipped code. The default
 * repeats the free-tier numbers from extension/src/usage-caps.js, which are the
 * same ones WhyClipMark and /faq already print — no invented social proof, no
 * install counts, no urgency.
 */
export function InstallCta({
  headline,
  note = 'Free: unlimited bookmarks stored locally, 25 Active Recall cards, 30 reviews a month. No card, no trial clock.',
  label = 'Add to Chrome — Free',
}: {
  headline?: string;
  note?: string;
  label?: string;
}) {
  return (
    <div style={{ textAlign: 'center', marginTop: 64 }}>
      {headline && (
        <p style={{
          fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 20px',
          fontFamily: 'var(--font-display)',
        }}>
          {headline}
        </p>
      )}
      <a
        href={CHROME_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Add ClipMark to Chrome — free"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '16px 36px', minHeight: 44,
          background: 'var(--accent-strong)', color: 'white',
          borderRadius: 14, fontSize: 16, fontWeight: 700, textDecoration: 'none',
          boxShadow: '0 12px 32px rgba(20, 184, 166, 0.22)',
        }}
      >
        {label}
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>arrow_forward</span>
      </a>
      <p style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)', maxWidth: 520, margin: '14px auto 0', lineHeight: 1.6 }}>
        {note}
      </p>
    </div>
  );
}
