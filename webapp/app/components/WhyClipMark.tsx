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
    body: 'Free means unlimited bookmarks stored locally, on-device AI notes, 25 Active Recall cards, 30 reviews a month, and 1 Anki export a month — no card, no trial clock. Those are the real limits, listed on the pricing page rather than discovered after you install.',
  },
  {
    icon: 'lock',
    title: 'Two hosts. That’s the whole permission list',
    body: 'ClipMark asks for youtube.com and clipmark.mithahara.com — its own sync domain — and nothing more. It cannot read your banking tab, your email, or any other site, because it was never granted them. AI notes run on Chrome’s on-device model, so transcripts aren’t shipped anywhere for that.',
  },
  {
    icon: 'psychology',
    title: 'It quizzes you — no other YouTube bookmarker does',
    body: 'Saving a timestamp is where every other extension stops. ClipMark schedules the moment for review (1, 3, then 7 days, doubling up to 60), hides your note, and asks you to remember it before it replays the clip. That loop is the product, not a bullet point.',
  },
];

export function WhyClipMark({ tint = false }: { tint?: boolean }) {
  return (
    <section id="why-clipmark" style={{ padding: '112px 32px', background: tint ? '#fcfcfd' : '#ffffff' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <span className="cm-section-label">Why ClipMark</span>
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, marginBottom: 16,
              fontFamily: 'var(--font-display)', letterSpacing: '-0.5px', color: '#1A1C1D',
            }}
          >
            Four things we refuse to get wrong.
          </h2>
          <p style={{ color: '#545f6c', maxWidth: 560, margin: '0 auto', fontSize: 16, lineHeight: 1.7 }}>
            The player stays clear, the free tier stays honest, the permissions stay narrow, and the thing that
            makes it stick is built in.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
          {STRENGTHS.map(({ icon, title, body }) => (
            <div
              key={title}
              style={{
                padding: 32, borderRadius: 28, background: 'white',
                border: '1px solid #e8e8e9', boxShadow: '0 4px 20px rgba(26,28,29,0.04)',
              }}
            >
              <div
                style={{
                  width: 46, height: 46, borderRadius: 14, marginBottom: 22,
                  background: 'rgba(20,184,166,0.12)', color: '#0F766E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined">{icon}</span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--font-display)', color: '#1A1C1D', marginTop: 0 }}>
                {title}
              </h3>
              <p style={{ color: '#545f6c', fontSize: 15, lineHeight: 1.75, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 40, fontSize: 14, color: '#545f6c' }}>
          Switching from an extension that stopped getting updates?{' '}
          <a href="/switch-from-videosegments" style={{ color: '#0F766E', fontWeight: 700, textDecoration: 'none' }}>
            Read the migration guide
          </a>
          .
        </p>
      </div>
    </section>
  );
}
