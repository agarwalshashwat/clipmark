import React from 'react';
import { CHROME_STORE_URL } from '@/app/lib/constants';

/**
 * Presentational building blocks shared by the retention/SEO content pages
 * (/active-recall-youtube, /spaced-repetition-youtube, /youtube-flashcards,
 * /youtube-to-anki, /switch-from-videosegments, /faq).
 *
 * Styling deliberately mirrors app/(marketing)/page.tsx — inline styles, Material
 * Symbols icons, the same type scale and teal accent — rather than introducing a
 * second styling approach. These pages are content-first and can be restyled
 * against packages/design-system/tokens.css later without touching their copy.
 */

const INK = '#1A1C1D';
const INK_SUB = '#545f6c';
const ACCENT_DEEP = '#0F766E';

export const PROSE: React.CSSProperties = {
  fontSize: 17,
  color: INK_SUB,
  lineHeight: 1.8,
  marginTop: 0,
  marginBottom: 20,
};

export const H2: React.CSSProperties = {
  fontSize: 'clamp(26px, 3.4vw, 36px)',
  fontWeight: 800,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.5px',
  color: INK,
  marginTop: 0,
  marginBottom: 20,
};

export const H3: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  color: INK,
  marginTop: 0,
  marginBottom: 10,
};

/** Page header: eyebrow label, single H1, supporting paragraph, install CTA. */
export function PageHero({
  label,
  title,
  intro,
  ctaLabel = 'Get the extension — Free',
}: {
  label: string;
  title: React.ReactNode;
  intro: React.ReactNode;
  ctaLabel?: string;
}) {
  return (
    <section style={{ padding: '80px 32px 64px', background: '#ffffff' }}>
      <div style={{ maxWidth: 840, margin: '0 auto', textAlign: 'center' }}>
        <span className="cm-section-label">{label}</span>
        <h1
          style={{
            fontSize: 'clamp(34px, 5.4vw, 60px)',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            fontFamily: 'var(--font-display)',
            color: '#0F172A',
            margin: '0 auto 24px',
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: 19, color: '#475569', lineHeight: 1.7, margin: '0 auto 40px', maxWidth: 680 }}>
          {intro}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '17px 36px',
              background: 'linear-gradient(135deg, #14B8A6 0%, #0F766E 100%)',
              color: 'white', borderRadius: 16, fontSize: 17, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 16px 40px rgba(13, 148, 136, 0.22)',
            }}
          >
            {ctaLabel}
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_forward</span>
          </a>
          <a
            href="/upgrade"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '17px 36px', background: 'white', border: '1px solid #E2E8F0',
              color: '#0F172A', borderRadius: 16, fontSize: 17, fontWeight: 700, textDecoration: 'none',
            }}
          >
            See what&apos;s free
          </a>
        </div>
      </div>
    </section>
  );
}

/** A titled content band. `tint` alternates the background like the homepage does. */
export function Section({
  id,
  heading,
  intro,
  tint = false,
  children,
}: {
  id?: string;
  heading?: React.ReactNode;
  intro?: React.ReactNode;
  tint?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} style={{ padding: '72px 32px', background: tint ? '#fcfcfd' : '#ffffff' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        {heading && <h2 style={H2}>{heading}</h2>}
        {intro && <p style={PROSE}>{intro}</p>}
        {children}
      </div>
    </section>
  );
}

/** Numbered how-it-works steps. */
export function Steps({ items }: { items: { title: string; desc: React.ReactNode }[] }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {items.map(({ title, desc }, i) => (
        <li key={title} style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <span
            style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: 12,
              background: 'rgba(20,184,166,0.12)', color: ACCENT_DEEP,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14,
            }}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <div>
            <h3 style={H3}>{title}</h3>
            <p style={{ ...PROSE, fontSize: 16, marginBottom: 0 }}>{desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Icon cards, 2–3 up. */
export function CardGrid({ items }: { items: { icon: string; title: string; desc: React.ReactNode }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
      {items.map(({ icon, title, desc }) => (
        <div key={title} style={{ padding: 28, borderRadius: 24, background: '#f3f3f4' }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 12, background: INK, color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
            }}
          >
            <span className="material-symbols-outlined">{icon}</span>
          </div>
          <h3 style={H3}>{title}</h3>
          <p style={{ ...PROSE, fontSize: 15, marginBottom: 0 }}>{desc}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Q&A cards. The same `items` array is what callers hand to `buildFaqLd`, so the
 * marked-up answer text is always the visible answer text.
 *
 * Questions render as `h2` because on /faq they sit directly under the page `h1`
 * with no intervening section heading — using `h3` there skipped a level. The
 * homepage's own FAQ block is separate code and keeps its `h2` → `h3` nesting.
 */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {items.map(({ q, a }) => (
        <div
          key={q}
          style={{
            background: 'white', padding: 28, borderRadius: 20,
            boxShadow: '0 4px 20px rgba(26,28,29,0.04)',
            border: '1px solid rgba(26,28,29,0.06)',
          }}
        >
          <h2 style={{ ...H3, fontSize: 17 }}>{q}</h2>
          <p style={{ ...PROSE, fontSize: 15, marginBottom: 0 }}>{a}</p>
        </div>
      ))}
    </div>
  );
}

/** Two-column feature comparison. Values are plain strings — no ✓/✗ theatre. */
export function ComparisonTable({
  columns,
  rows,
}: {
  columns: [string, string];
  rows: { label: string; left: string; right: string }[];
}) {
  const cell: React.CSSProperties = {
    padding: '14px 16px',
    fontSize: 14,
    color: INK_SUB,
    borderTop: '1px solid #e8e8e9',
    verticalAlign: 'top',
    lineHeight: 1.6,
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ ...cell, borderTop: 'none', fontWeight: 700, color: INK, textAlign: 'left' }} />
            <th style={{ ...cell, borderTop: 'none', fontWeight: 700, color: INK, textAlign: 'left' }}>{columns[0]}</th>
            <th style={{ ...cell, borderTop: 'none', fontWeight: 700, color: ACCENT_DEEP, textAlign: 'left' }}>{columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, left, right }) => (
            <tr key={label}>
              <th style={{ ...cell, fontWeight: 700, color: INK, textAlign: 'left', width: '28%' }} scope="row">{label}</th>
              <td style={cell}>{left}</td>
              <td style={{ ...cell, color: INK }}>{right}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Internal links out to the sibling retention pages — keeps the cluster crawlable. */
export function RelatedLinks({ links }: { links: { href: string; label: string; desc: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
      {links.map(({ href, label, desc }) => (
        <a
          key={href}
          href={href}
          style={{
            display: 'block', padding: 22, borderRadius: 20, textDecoration: 'none',
            background: 'white', border: '1px solid #e8e8e9',
          }}
        >
          <span style={{ display: 'block', fontWeight: 700, fontSize: 15, color: ACCENT_DEEP, marginBottom: 6, fontFamily: 'var(--font-display)' }}>
            {label}
          </span>
          <span style={{ display: 'block', fontSize: 14, color: INK_SUB, lineHeight: 1.6 }}>{desc}</span>
        </a>
      ))}
    </div>
  );
}

/** Closing install CTA. */
export function CtaBand({ heading, sub }: { heading: React.ReactNode; sub: React.ReactNode }) {
  return (
    <section style={{ padding: '96px 32px', textAlign: 'center', background: '#fcfcfd' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h2 style={{ ...H2, fontSize: 'clamp(26px, 4vw, 40px)' }}>{heading}</h2>
        <p style={{ ...PROSE, fontSize: 17, marginBottom: 36 }}>{sub}</p>
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block', padding: '18px 44px',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
            color: 'white', borderRadius: 16, fontWeight: 700, fontSize: 17, textDecoration: 'none',
            boxShadow: '0 16px 44px rgba(20, 184, 166, 0.26)',
          }}
        >
          Add ClipMark to Chrome — Free
        </a>
        {/* #64748B, not the lighter #94A3B8 used elsewhere for fine print: at 13px
            that failed WCAG AA (2.5:1), and this line carries the free-tier promise. */}
        <p style={{ marginTop: 20, fontSize: 13, color: '#64748B' }}>
          Free tier needs no card. Works in Chrome, Edge, and Brave.
        </p>
      </div>
    </section>
  );
}
