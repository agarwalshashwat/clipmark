import { redirect } from 'next/navigation';
// import { ThemeToggle } from './components/ThemeToggle';
import { createServerSupabase } from '@/lib/supabase';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; extensionId?: string }>;
}) {
  const { code, extensionId } = await searchParams;

  // Fallback: if OAuth code lands here (misconfigured redirect URL),
  // forward it to the proper auth callback handler.
  if (code) {
    const params = new URLSearchParams({ code });
    if (extensionId) params.set('extensionId', extensionId);
    redirect(`/auth/callback?${params.toString()}`);
  }

  // Redirect logged-in users to their dashboard
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <main style={{ background: '#f9f9fa', color: '#1A1C1D', fontFamily: "'Inter', sans-serif", minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, width: '100%', zIndex: 50,
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 1px 0 rgba(26,28,29,0.06)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '0 32px', height: 72 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#14B8A6', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px' }}>
            Clipmark
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            <a href="#features" style={{ color: '#006B5F', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, borderBottom: '2px solid #14B8A6', paddingBottom: 2 }}>Features</a>
            <a href="#how-it-works" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14 }}>How It Works</a>
            <a href="/upgrade" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14 }}>Pricing</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* <ThemeToggle /> */}
            <a href="/signin" style={{
              color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 600, fontSize: 14, textDecoration: 'none',
              padding: '10px 16px',
            }}>
              Log In
            </a>
            <a href="https://chrome.google.com/webstore" style={{
              padding: '10px 22px',
              background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
              color: 'white', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}>
              Add to Chrome — Free
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{ paddingTop: 72, position: 'relative', overflow: 'hidden' }}>
        {/* Subtle grid background */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgba(26%2C28%2C29%2C0.04)'%3E%3Cpath d='M0 .5H31.5V32'/%3E%3C/svg%3E\")",
        }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 32px 0', position: 'relative', zIndex: 1, textAlign: 'center' }}>

          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 9999,
            background: 'rgba(20,184,166,0.10)', color: '#006B5F',
            fontWeight: 600, fontSize: 13, marginBottom: 32,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
            The Digital Curator for YouTube Professionals
          </div>

          {/* H1 */}
          <h1 style={{
            fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 800,
            lineHeight: 1.1, letterSpacing: '-2px', maxWidth: 900, margin: '0 auto 32px',
            fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D',
          }}>
            Turn Long YouTube Videos into{' '}<br />
            <em style={{ color: '#006B5F', fontStyle: 'italic' }}>Searchable, Revisable</em> Knowledge.
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: 20, color: '#545f6c', maxWidth: 640, margin: '0 auto 48px', lineHeight: 1.7 }}>
            Stop scrubbing through hours of footage. Clipmark&apos;s Chrome extension and dashboard curate your learning journey instantly.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="https://chrome.google.com/webstore" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '16px 32px', background: '#006B5F', color: 'white',
              borderRadius: 12, fontSize: 17, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 8px 32px rgba(0,107,95,0.20)',
            }}>
              Get Started for Free <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
            </a>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '16px 32px', background: '#f3f3f4', color: '#1A1C1D',
              borderRadius: 12, fontSize: 17, fontWeight: 700, border: 'none',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>play_circle</span> Watch Demo
            </button>
          </div>

          {/* Cinematic UI Mockup */}
          <div style={{ marginTop: 96, position: 'relative', maxWidth: 1000, margin: '96px auto 0' }}>
            <div style={{
              position: 'absolute', inset: -16,
              background: 'linear-gradient(to top right, rgba(20,184,166,0.20), rgba(115,46,228,0.20))',
              borderRadius: 32, filter: 'blur(60px)', zIndex: 0,
            }} />
            <div style={{ position: 'relative', zIndex: 1, background: '#1A1C1D', borderRadius: 32, padding: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.40)' }}>
              <div style={{ aspectRatio: '16/9', background: '#0f172a', borderRadius: 16, position: 'relative', overflow: 'hidden' }}>
                {/* Ambient gradient instead of external image */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)', opacity: 0.9 }} />
                {/* Progress bar */}
                <div style={{ position: 'absolute', bottom: 48, left: 32, right: 32, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 9999 }}>
                  <div style={{ position: 'absolute', left: '15%', height: '100%', width: '24%', background: '#14B8A6', borderRadius: 9999, boxShadow: '0 0 0 4px rgba(20,184,166,0.20)' }} />
                  <div style={{ position: 'absolute', left: '45%', height: '100%', width: '12%', background: '#732EE4', borderRadius: 9999, boxShadow: '0 0 0 4px rgba(115,46,228,0.20)' }} />
                  <div style={{ position: 'absolute', left: '70%', height: '100%', width: '20%', background: '#14B8A6', borderRadius: 9999, boxShadow: '0 0 0 4px rgba(20,184,166,0.20)' }} />
                </div>
                {/* Glass side panel */}
                <div style={{
                  position: 'absolute', top: 16, right: 16, bottom: 16, width: 248,
                  background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1A1C1D', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Clipmark Curator</span>
                    <span className="material-symbols-outlined" style={{ color: '#9ca3af', fontSize: 16 }}>close</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ padding: 12, background: 'white', borderRadius: 8, borderLeft: '3px solid #14B8A6' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#14B8A6', marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>04:12 — Architecture</p>
                      <p style={{ fontSize: 10, color: '#545f6c', lineHeight: 1.5 }}>The key to scaling Next.js is effective server component hydration...</p>
                    </div>
                    <div style={{ padding: 12, background: 'rgba(255,255,255,0.50)', borderRadius: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace" }}>12:45 — State Management</p>
                    </div>
                    <div style={{ padding: 12, background: 'rgba(255,255,255,0.50)', borderRadius: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace" }}>28:10 — Deployment</p>
                    </div>
                  </div>
                  <button style={{
                    marginTop: 'auto', width: '100%', padding: '8px 0',
                    background: '#006B5F', color: 'white', borderRadius: 8, border: 'none',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_circle</span>
                    New Bookmark (Alt+B)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem / Solution ──────────────────────────────────────────── */}
      <section style={{ padding: '128px 32px', background: '#ffffff' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 80, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 44px)', fontWeight: 800, marginBottom: 32, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D', letterSpacing: '-0.5px' }}>
              2 Hours → 6 Minutes
            </h2>
            <p style={{ fontSize: 18, color: '#545f6c', marginBottom: 40, lineHeight: 1.75 }}>
              Stop wasting time re-watching entire lectures just to find that one 30-second explanation. Clipmark&apos;s <strong>Revisit Mode</strong> automatically skips the fluff and only plays your saved clips.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 9999, background: 'rgba(186,26,26,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ba1a1a', flexShrink: 0 }}>
                  <span className="material-symbols-outlined">timer_off</span>
                </div>
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Standard Watching</h4>
                  <p style={{ fontSize: 14, color: '#545f6c', fontStyle: 'italic' }}>&ldquo;Where was that part about database indexing again?&rdquo;</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 9999, background: 'rgba(20,184,166,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#006B5F', flexShrink: 0 }}>
                  <span className="material-symbols-outlined">bolt</span>
                </div>
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Curated Revisit</h4>
                  <p style={{ fontSize: 14, color: '#545f6c', fontStyle: 'italic' }}>&ldquo;Replaying 4 specific bookmarks in 6 minutes. Knowledge locked in.&rdquo;</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ background: '#f9f9fa', padding: 40, borderRadius: 32 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 200, marginBottom: 24 }}>
              <div style={{ flex: 1, background: '#e8e8e9', height: '100%', borderRadius: '8px 8px 0 0', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#9ca3af', whiteSpace: 'nowrap' }}>120m</span>
              </div>
              <div style={{ flex: 1, background: '#14B8A6', height: '5%', borderRadius: '8px 8px 0 0', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#006B5F', whiteSpace: 'nowrap' }}>6m</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', color: '#545f6c', textTransform: 'uppercase' }}>
              <span>Traditional</span>
              <span style={{ color: '#006B5F' }}>With Clipmark</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Showcases ───────────────────────────────────────────── */}
      <section id="features" style={{ padding: '128px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 96 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, marginBottom: 16, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px', color: '#1A1C1D' }}>
              Curated For Your Workflow
            </h2>
            <p style={{ color: '#545f6c', maxWidth: 480, margin: '0 auto', fontSize: 16 }}>
              Whether you&apos;re building, studying, or creating, Clipmark adapts to your mental model.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {/* Developers */}
            <div style={{ padding: 32, borderRadius: 32, background: '#f3f3f4' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#1A1C1D', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
                <span className="material-symbols-outlined">code</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D' }}>For Developers</h3>
              <p style={{ color: '#545f6c', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                Instantly capture code snippets from tutorial videos. Search by keyword across 100+ saved tutorials in your library.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#dbeafe', color: '#1d4ed8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#react</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#tutorial</span>
              </div>
            </div>

            {/* Students */}
            <div style={{ padding: 32, borderRadius: 32, background: '#f3f3f4' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(20,184,166,0.85)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
                <span className="material-symbols-outlined">school</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D' }}>For Students</h3>
              <p style={{ color: '#545f6c', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                Spaced Revisit automatically notifies you to review bookmarks after 1, 3, and 7 days — locking in the physics lecture before exam day.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#ffedd5', color: '#c2410c', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#quantum</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#dcfce7', color: '#15803d', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#review_active</span>
              </div>
            </div>

            {/* Creators */}
            <div style={{ padding: 32, borderRadius: 32, background: '#f3f3f4' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(115,46,228,0.85)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
                <span className="material-symbols-outlined">edit_square</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D' }}>For Creators</h3>
              <p style={{ color: '#545f6c', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                AI-powered social post generation. Turn your favorite video segments into viral X/Twitter and LinkedIn threads instantly.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#f3e8ff', color: '#7c3aed', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>✍️ Post_Ready</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#fce7f3', color: '#be185d', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#inspo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI / Pro Section ────────────────────────────────────────────── */}
      <section style={{ padding: '128px 16px' }}>
        <div style={{ background: '#1A1C1D', color: 'white', borderRadius: 64, padding: '128px 32px', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 80, alignItems: 'center' }}>

            {/* AI feature buttons */}
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: -40, left: -40, width: 160, height: 160, background: 'rgba(115,46,228,0.25)', filter: 'blur(100px)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
                {[
                  { icon: 'auto_awesome', title: '✦ Auto Bookmark', desc: 'AI detects key topic shifts and marks them for you.', active: false },
                  { icon: 'summarize',    title: '✦ Smart Summary',  desc: 'Generate context-aware notes for every clip saved.',    active: true  },
                  { icon: 'label',        title: '✦ Auto Tagging',   desc: 'Categorize your library with intelligent taxonomy.',     active: false },
                ].map(({ icon, title, desc, active }) => (
                  <div key={title} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '20px 24px',
                    background: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${active ? 'rgba(115,46,228,0.45)' : 'rgba(255,255,255,0.10)'}`,
                    borderRadius: 16,
                    boxShadow: active ? '0 0 30px rgba(115,46,228,0.20)' : 'none',
                  }}>
                    <span className="material-symbols-outlined" style={{ color: '#b591ff', fontSize: 22, flexShrink: 0 }}>{icon}</span>
                    <div>
                      <p style={{ fontWeight: 700, marginBottom: 3, fontSize: 15 }}>{title}</p>
                      <p style={{ fontSize: 12, color: active ? '#d1d5db' : '#9ca3af' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <span style={{
                display: 'inline-block', padding: '6px 16px', borderRadius: 9999,
                background: 'rgba(115,46,228,0.20)', color: '#d2bbff',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 24,
              }}>
                Pro Features
              </span>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, marginBottom: 32, lineHeight: 1.2, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Effortless curation powered by Intelligence.
              </h2>
              <p style={{ color: '#9ca3af', fontSize: 18, lineHeight: 1.75, marginBottom: 16 }}>
                The &ldquo;Digital Curator&rdquo; doesn&apos;t just store; it understands. Our AI engine analyzes transcripts in real-time to surface the gold nuggets so you don&apos;t have to.
              </p>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 40, fontStyle: 'italic' }}>
                * AI features use Chrome&apos;s built-in AI (Gemini Nano). Availability is subject to Google&apos;s support and may vary by Chrome version.
              </p>
              <a href="/upgrade" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                color: '#d2bbff', fontWeight: 700, fontSize: 16, textDecoration: 'none',
              }}>
                Explore Pro Features <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: '128px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, textAlign: 'center', marginBottom: 96, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px', color: '#1A1C1D' }}>
            The Curator&apos;s Journey
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 48, position: 'relative' }}>
            {/* Timeline connector (decorative, desktop only) */}
            <div style={{ position: 'absolute', top: 48, left: '16.66%', right: '16.66%', height: 1, background: '#e8e8e9', zIndex: 0, pointerEvents: 'none' }} />

            {[
              { num: '01', title: 'Bookmark Instantly', desc: 'Hit Alt+B as you watch. No distractions, no friction — just capture the moment.' },
              { num: '02', title: 'Organize with AI',   desc: 'Clipmark adds titles, summaries, and tags to your clips automatically.' },
              { num: '03', title: 'Revisit What Matters', desc: 'Your knowledge syncs to a beautiful dashboard for focused, distraction-free study.' },
            ].map(({ num, title, desc }) => (
              <div key={num} style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 96, height: 96, borderRadius: 9999, background: 'white',
                  boxShadow: '0 8px 32px rgba(26,28,29,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 32px',
                  border: '4px solid #f9f9fa',
                  outline: '8px solid #f3f3f4',
                }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#006B5F', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{num}</span>
                </div>
                <h4 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D' }}>{title}</h4>
                <p style={{ color: '#545f6c', fontSize: 14, lineHeight: 1.7 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations strip ──────────────────────────────────────────── */}
      <section style={{ padding: '72px 32px', borderTop: '1px solid rgba(26,28,29,0.06)', borderBottom: '1px solid rgba(26,28,29,0.06)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <p style={{ textAlign: 'center', color: '#9ca3af', fontWeight: 700, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 48 }}>
            Integrated with the Modern Stack
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 56, opacity: 0.5, filter: 'grayscale(1)' }}>
            {[
              { icon: 'video_library',   label: 'YouTube'  },
              { icon: 'chrome_reader_mode', label: 'Chrome' },
              { icon: 'data_object',     label: 'Next.js'  },
              { icon: 'database',        label: 'Supabase' },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 18, color: '#1A1C1D' }}>
                <span className="material-symbols-outlined">{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section style={{ padding: '128px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, background: 'rgba(20,184,166,0.05)', borderRadius: 9999, filter: 'blur(120px)', zIndex: 0, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 800, marginBottom: 24, letterSpacing: '-1px', fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D' }}>
            Ready to curate your knowledge?
          </h2>
          <p style={{ fontSize: 20, color: '#545f6c', marginBottom: 48 }}>
            Join 15,000+ power learners turning YouTube into their second brain.
          </p>
          <a href="https://chrome.google.com/webstore" style={{
            display: 'inline-block', padding: '20px 48px',
            background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
            color: 'white', borderRadius: 16, fontWeight: 700, fontSize: 18, textDecoration: 'none',
            boxShadow: '0 16px 48px rgba(0,107,95,0.28)',
          }}>
            Install Extension &amp; Get Started
          </a>
          <p style={{ marginTop: 24, fontSize: 14, color: '#9ca3af' }}>Available on Chrome, Edge, and Brave. Free forever for individuals.</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ padding: '48px 32px', borderTop: '1px solid rgba(26,28,29,0.06)', background: '#f3f3f4' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D' }}>Clipmark</div>
            <div style={{ fontSize: 13, color: '#545f6c' }}>© 2025 Clipmark. The Digital Curator.</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
            <a href="/upgrade" style={{ color: '#545f6c', fontSize: 14, textDecoration: 'none' }}>Pricing</a>
            <a href="/privacy" style={{ color: '#545f6c', fontSize: 14, textDecoration: 'none' }}>Privacy</a>
            <a href="/terms" style={{ color: '#545f6c', fontSize: 14, textDecoration: 'none' }}>Terms</a>
            <a href="mailto:support@clipmark.app" style={{ color: '#545f6c', fontSize: 14, textDecoration: 'none' }}>Support</a>
          </div>
          {/* <ThemeToggle /> */}
        </div>
      </footer>

    </main>
  );
}
