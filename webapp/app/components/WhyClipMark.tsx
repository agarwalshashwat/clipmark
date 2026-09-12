import React from 'react';

/**
 * The four differentiators worth leading with, shared by the homepage and every
 * retention content page.
 *
 * Each claim is checkable against shipped code rather than asserted:
 *   • Side panel      — manifest.json `side_panel` + `sidePanel` permission; the
 *                       content script binds Alt+B and only claims [ / ] while a
 *                       revisit session is running, so YouTube's own keys are free.
 *   • Free tier       — the exact numbers in extension/src/usage-caps.js and the
 *                       FEATURES table on /upgrade. Stated as numbers, not as
 *                       "generous", so nobody can feel misled after installing.
 *   • Permissions     — manifest.json `host_permissions`: youtube.com plus
 *                       ClipMark's own domain for sync. Nothing else.
 *   • Active Recall   — the scheduler in extension/src/recall.js.
 *
 * Comparative framing is kept to what ClipMark itself does. No competitor ratings,
 * user counts, or review quotes — those would be unsubstantiated claims on a
 * public page (see CLAUDE.md conventions).
 *
 * The fourth card used to read "It quizzes you — no other YouTube bookmarker
 * does". That was false: docs/gtm/COMPETITIVE-BRIEF.md §2 found two shipping
 * extensions that quiz on YouTube content and schedule the review themselves
 * (Web Highlights, ~200K users; Ulearn). The card now states the distinction
 * that actually survives — those tools generate questions FROM the transcript,
 * ClipMark hides the note YOU wrote and replays the source as the answer key.
 * Keep it that way: describe our own mechanism, never a claim about "every"
 * other tool, which cannot be verified and dates badly.
 */

const STRENGTHS = [
  {
    icon: 'dock_to_right',
    title: 'Lives in the side panel, not on top of your video',
    body: 'ClipMark opens in Chrome’s own side panel beside the player. Nothing floats over the video, nothing covers the controls, and YouTube’s keyboard shortcuts keep working — ClipMark only claims Alt+B to save, and [ / ] to step between clips while you’re actively revisiting.',
  },
  {
    icon: 'volunteer_activism',
    title: 'A free tier with the numbers printed on it',
    body: 'Free means unlimited bookmarks stored locally, on-device AI notes, 25 Active Recall cards, 30 reviews a month, and 10 Anki exports a month — no card, no trial clock. Those are the real limits, listed on the pricing page rather than discovered after you install.',
  },
  {
    icon: 'lock',
    title: 'Two hosts. That’s the whole permission list',
    body: 'ClipMark asks for youtube.com and clipmark.mithahara.com — its own sync domain — and nothing more. It cannot read your banking tab, your email, or any other site, because it was never granted them. AI notes run on Chrome’s on-device model, so transcripts aren’t shipped anywhere for that.',
  },
  {
    icon: 'psychology',
    title: 'Your note is the question. The clip is the answer.',
    body: 'Tools that quiz you on a video generate the questions themselves, from the transcript. ClipMark does the opposite: it hides the note you wrote and replays the exact second, so you check your own recall against the source. Every saved moment goes on a schedule — 1, 3, then 7 days, doubling up to 60. That retrieval loop is the product, not a bullet point.',
  },
];

export function WhyClipMark({ tint = false }: { tint?: boolean }) {
  return (
    <section id="why-clipmark" style={{ padding: '112px 32px', background: tint ? 'var(--bg)' : 'var(--surface)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <span className="cm-section-label">Why ClipMark</span>
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, marginBottom: 16,
              fontFamily: 'var(--font-display)', letterSpacing: '-0.5px', color: 'var(--text)',
            }}
          >
            Four things we refuse to get wrong.
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 560, margin: '0 auto', fontSize: 16, lineHeight: 1.7 }}>
            The player stays clear, the free tier stays honest, the permissions stay narrow, and the thing that
            makes it stick is built in.
          </p>
        </div>

        {/* Two columns, not auto-fit: there are always exactly four cards, and an
            auto-fitted track put three on the first row and orphaned the fourth.
            Grid definition lives in globals.css (.cm-why-grid) because the
            single-column collapse needs a media query. */}
        <div className="cm-why-grid">
          {STRENGTHS.map(({ icon, title, body }) => (
            <div
              key={title}
              style={{
                padding: 32, borderRadius: 28, background: 'var(--surface)',
                border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
              }}
            >
              <div
                style={{
                  width: 46, height: 46, borderRadius: 14, marginBottom: 22,
                  background: 'var(--accent-light)', color: 'var(--brand-ink)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--font-display)', color: 'var(--text)', marginTop: 0 }}>
                {title}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.75, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 40, fontSize: 14, color: 'var(--text-muted)' }}>
          Switching from an extension that stopped getting updates?{' '}
          <a href="/switch-from-videosegments" style={{ color: 'var(--brand-ink)', fontWeight: 700, textDecoration: 'none' }}>
            Read the migration guide
          </a>
          .
        </p>
      </div>
    </section>
  );
}
