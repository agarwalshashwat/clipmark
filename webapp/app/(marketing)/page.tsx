import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase';
import PlanCards from './upgrade/PlanCards';
import { fetchProductPrices } from './upgrade/actions';
import { PRICE_DEFAULTS, type ProductPrices } from './upgrade/pricing';
import { GuaranteeLine } from '@/app/components/GuaranteeLine';

export const metadata: Metadata = {
  title: 'Clipmark — Your YouTube Second Brain',
  description: 'Stop forgetting what you watch. Bookmark moments, get AI summaries, and build a searchable repository of video knowledge.',
  keywords: ['youtube bookmarks', 'video notes', 'study tool', 'chrome extension', 'ai summaries', 'timestamp bookmarks', 'second brain'],
};

const FAQ_DATA = [
  {
    q: 'Can I cancel my subscription at any time?',
    a: 'Absolutely. If you cancel, your Pro features will remain active until the end of your current billing period. No hidden fees or lock-ins.',
  },
  {
    q: 'How does AI Auto-fill work?',
    a: 'Our AI analyzes the content of the page you\'re clipping to automatically extract the author, primary topic, and key tags, saving you minutes per clip.',
  },
  {
    q: 'What happens to my clips if I downgrade?',
    a: 'Your data is yours. You will always have access to your existing clips, even if you downgrade to the Free tier. You just won\'t be able to add more beyond the free limit.',
  },
  {
    q: 'Do you offer educational discounts?',
    a: 'Yes! We support students and educators. Contact our support team with your .edu email for a special discount code.',
  },
  {
    q: 'How reliable are the AI features?',
    a: 'AI features run on Chrome\'s built-in AI model (Gemini Nano), processed locally in your browser — your data never leaves your device for AI tasks.',
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; extensionId?: string; ref?: string }>;
}) {
  const { code, extensionId, ref } = await searchParams;

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

  const cookieStore = await cookies();
  const refCookie = cookieStore.get('clipmark_ref')?.value;
  let referrerUsername: string | null = null;
  if (ref && ref === refCookie) {
    const { data: affiliateProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('affiliate_code', ref)
      .eq('is_affiliate', true)
      .single();
    referrerUsername = affiliateProfile?.username ?? null;
  }

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to Use Clipmark for YouTube Bookmarking",
    "description": "Follow the Curator's Journey to capture and organize your favorite YouTube moments with AI-powered tools.",
    "step": [
      {
        "@type": "HowToStep",
        "name": "Bookmark Instantly",
        "text": "Hit Alt+B as you watch. No distractions, no friction — just capture the moment."
      },
      {
        "@type": "HowToStep",
        "name": "Organize with AI",
        "text": "Clipmark adds titles, summaries, and tags to your clips automatically."
      },
      {
        "@type": "HowToStep",
        "name": "Revisit What Matters",
        "text": "Your knowledge syncs to a beautiful dashboard for focused, distraction-free study."
      }
    ]
  };

  // Live prices for the pricing preview; fall back to defaults if Dodo is unreachable.
  let prices: ProductPrices;
  try {
    prices = await fetchProductPrices();
  } catch {
    prices = PRICE_DEFAULTS;
  }

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_DATA.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  return (
    <main style={{ color: 'var(--text)', fontFamily: "var(--font)", overflowX: 'hidden' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      {/* ── Referral Banner ────────────────────────────────────────────── */}
      {referrerUsername && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(20,184,166,0.10) 0%, rgba(139,92,246,0.10) 100%)',
          borderBottom: '1px solid rgba(20,184,166,0.20)',
          padding: '10px 24px',
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--primary-deep)',
          fontWeight: 500,
        }}>
          <span style={{ marginRight: 6 }}>👋</span>
          You were referred by <strong>@{referrerUsername}</strong> — welcome to Clipmark!
        </div>
      )}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Subtle grid background */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgba(0%2C0%2C0%2C0.03)'%3E%3Cpath d='M0 .5H31.5V32'/%3E%3C/svg%3E\")",
        }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '100px 32px 0', position: 'relative', zIndex: 1, textAlign: 'center' }}>

          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 9999,
            background: 'rgba(20,184,166,0.10)', color: '#0D9488',
            fontWeight: 600, fontSize: 13, marginBottom: 32,
            border: '1px solid rgba(20,184,166,0.15)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified</span>
            The Second Brain for YouTube Professionals
          </div>

          {/* H1 */}
          <h1 style={{
            fontSize: 'clamp(44px, 7.5vw, 88px)', fontWeight: 800,
            lineHeight: 0.95, letterSpacing: '-0.05em', maxWidth: 1000, margin: '0 auto 32px',
            fontFamily: "var(--font-display)", color: '#0F172A',
          }}>
            Stop Forgetting What You Watch —<br />
            <em style={{ 
              color: '#0D9488', 
              fontStyle: 'italic', 
              fontWeight: 800,
              textDecoration: 'none',
              background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block'
            }}>Your YouTube Second Brain.</em>
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: 21, color: '#475569', maxWidth: 720, margin: '0 auto 56px', lineHeight: 1.6, fontWeight: 450 }}>
            Quit wasting time rewatching tutorials or losing gems in your watch history. Build a personal knowledge system that remembers exactly where the value is.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a href="https://chrome.google.com/webstore" 
               style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '20px 44px',
              background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
              color: 'white', borderRadius: 16, fontSize: 18, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 20px 50px rgba(13, 148, 136, 0.25)',
              transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}>
              Master YouTube Now — It&apos;s Free <span className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_forward</span>
            </a>
            <button 
              style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              padding: '20px 44px', background: 'white', border: '1px solid #E2E8F0',
              color: '#0F172A', borderRadius: 16, fontSize: 18, fontWeight: 700,
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>play_circle</span>
              Watch Demo
            </button>
          </div>

          <p style={{ marginTop: 24, fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, opacity: 0.7 }}>shield_with_heart</span>
            Privacy First: AI processing (Gemini Nano) happens 100% on your device.
          </p>

          {/* Cinematic UI Mockup */}
          <div style={{ marginTop: 120, position: 'relative', maxWidth: 1080, margin: '120px auto 0' }}>
            
            <div 
              data-testid="ai-summary-label"
              style={{
                position: 'absolute', top: -30, right: -20, zIndex: 10,
                background: 'var(--bg-sub)', padding: '14px 24px', borderRadius: 20,
                boxShadow: '0 12px 40px rgba(0,0,0,0.12)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 12,
                animation: 'float 4.5s ease-in-out infinite'
              }}>
              <div style={{ width: 10, height: 10, background: 'var(--accent)', borderRadius: 9999 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Gemini Nano Insight: Key Architectural Patterns</span>
            </div>

            <div style={{
              position: 'absolute', bottom: 180, left: -40, zIndex: 10,
              background: 'var(--bg-sub)', padding: '14px 24px', borderRadius: 20,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 12,
              animation: 'float 5.5s ease-in-out infinite reverse'
            }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--secondary)', fontSize: 20 }}>history</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Skip the fluff, play only the gems</span>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-12px); }
              }
            `}} />

            <div style={{
              position: 'absolute', inset: -20,
              background: 'linear-gradient(to top right, rgba(20,184,166,0.15), rgba(139,92,246,0.15))',
              borderRadius: 40, filter: 'blur(80px)', zIndex: 0,
            }} />
            <div style={{ position: 'relative', zIndex: 1, background: '#111111', borderRadius: 36, padding: 16, boxShadow: '0 32px 100px rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ aspectRatio: '16/9', background: '#050505', borderRadius: 24, position: 'relative', overflow: 'hidden' }}>
                {/* Ambient gradient instead of external image */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0f172a, #050505, #1e1b4b)', opacity: 0.95 }} />
                {/* Progress bar */}
                <div style={{ position: 'absolute', bottom: 48, left: 32, right: 32, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 9999 }}>
                  <div style={{ position: 'absolute', left: '15%', height: '100%', width: '24%', background: 'var(--accent)', borderRadius: 9999, boxShadow: '0 0 12px rgba(20,184,166,0.3)' }} />
                  <div style={{ position: 'absolute', left: '45%', height: '100%', width: '12%', background: 'var(--secondary)', borderRadius: 9999, boxShadow: '0 0 12px rgba(139,92,246,0.3)' }} />
                  <div style={{ position: 'absolute', left: '70%', height: '100%', width: '20%', background: 'var(--accent)', borderRadius: 9999, boxShadow: '0 0 12px rgba(20,184,166,0.3)' }} />
                </div>
                {/* Glass side panel */}
                <div style={{
                  position: 'absolute', top: 20, right: 20, bottom: 20, width: 260,
                  background: 'rgba(20, 20, 25, 0.7)', backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
                  padding: 24, display: 'flex', flexDirection: 'column', gap: 20
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#ef4444' }} />
                    <div style={{ height: 10, width: 80, background: 'rgba(255,255,255,0.2)', borderRadius: 5 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[1, 2, 3].map(i => (
                      <div key={i} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ height: 8, width: i === 2 ? '85%' : '60%', background: 'rgba(255,255,255,0.15)', borderRadius: 4, marginBottom: 8 }} />
                        <div style={{ height: 6, width: '40%', background: 'var(--accent)', opacity: 0.6, borderRadius: 3 }} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Play icon */}
                <div style={{ position: 'absolute', top: '50%', left: '40%', transform: 'translate(-50%, -50%)' }}>
                  <div style={{ width: 84, height: 84, borderRadius: 9999, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'white', marginLeft: 4 }}>play_arrow</span>
                  </div>
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
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 44px)', fontWeight: 800, marginBottom: 32, fontFamily: "var(--font-display)", color: '#1A1C1D', letterSpacing: '-0.5px' }}>
              Stop Scrubbing, <br /><span style={{ color: 'var(--primary-deep)' }}>Start Remembering.</span>
            </h2>
            <p style={{ fontSize: 18, color: '#545f6c', marginBottom: 40, lineHeight: 1.75 }}>
              The average learner forgets 70% of what they watch within 24 hours. Clipmark&apos;s <strong>Revisit Mode</strong> forces you to focus only on the breakthroughs you saved, turning hours of idle watching into minutes of active mastery.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 9999, background: 'rgba(186,26,26,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ba1a1a', flexShrink: 0 }}>
                  <span className="material-symbols-outlined">timer_off</span>
                </div>
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, fontFamily: "var(--font-display)" }}>Passive Consumption (Bad)</h4>
                  <p style={{ fontSize: 14, color: '#545f6c', fontStyle: 'italic' }}>&ldquo;Where was that part? *scrubs timeline for 15 minutes*&rdquo;</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 9999, background: 'rgba(20,184,166,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-deep)', flexShrink: 0 }}>
                  <span className="material-symbols-outlined">bolt</span>
                </div>
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, fontFamily: "var(--font-display)" }}>The Clipmark System (Pro)</h4>
                  <p style={{ fontSize: 14, color: '#545f6c', fontStyle: 'italic' }}>&ldquo;Playing 4 peak moments in 6 minutes. System locked in.&rdquo;</p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Before / After Transformation Visual */}
            <div style={{ 
              background: '#f9f9fa', 
              padding: 40, 
              borderRadius: 32, 
              border: '1px solid #e8e8e9',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ color: '#ba1a1a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>The Old Way</div>
                  <div style={{ height: 120, background: '#fee2e2', borderRadius: 16, border: '2px dashed #fecaca', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12 }}>
                    <div style={{ width: '80%', height: 8, background: '#fecaca', borderRadius: 4 }} />
                    <div style={{ width: '60%', height: 8, background: '#fecaca', borderRadius: 4 }} />
                    <div style={{ width: '70%', height: 8, background: '#fecaca', borderRadius: 4 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', color: 'var(--primary-deep)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32 }}>arrow_forward</span>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ color: 'var(--primary-deep)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>The Clipmark Way</div>
                  <div style={{ height: 120, background: '#ccfbf1', borderRadius: 16, border: '2px solid #99f6e4', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12 }}>
                    <div style={{ width: '90%', height: 12, background: '#14B8A6', borderRadius: 6 }} />
                    <div style={{ width: '90%', height: 12, background: '#14B8A6', borderRadius: 6 }} />
                  </div>
                </div>
              </div>

              {/* Bar chart */}
              <div style={{ borderTop: '1px solid #e8e8e9', paddingTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 120, marginBottom: 16 }}>
                  <div style={{ flex: 1, background: '#e8e8e9', height: '100%', borderRadius: '8px 8px 0 0', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700, color: '#9ca3af', whiteSpace: 'nowrap' }}>120m</span>
                  </div>
                  <div style={{ flex: 1, background: 'var(--accent)', height: '5%', borderRadius: '8px 8px 0 0', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700, color: 'var(--primary-deep)', whiteSpace: 'nowrap' }}>6m</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', color: '#545f6c', textTransform: 'uppercase' }}>
                  <span>Mental Fatigue</span>
                  <span style={{ color: 'var(--primary-deep)' }}>Knowledge Retained</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Showcases ───────────────────────────────────────────── */}
      <section id="features" style={{ padding: '128px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 96 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, marginBottom: 16, fontFamily: "var(--font-display)", letterSpacing: '-0.5px', color: '#1A1C1D' }}>
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
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)", color: '#1A1C1D' }}>For the Builder</h3>
              <p style={{ color: '#545f6c', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                Stop "tutorial hell." Instantly capture code snippets and architecture shifts from technical deep dives. Build a searchable library of 100+ tutorials you actually understand.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#dbeafe', color: '#1d4ed8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#react</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#architecture</span>
              </div>
            </div>

            {/* Founders */}
            <div style={{ padding: 32, borderRadius: 32, background: '#f3f3f4' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
                <span className="material-symbols-outlined">rocket_launch</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)", color: '#1A1C1D' }}>For the Founder</h3>
              <p style={{ color: '#545f6c', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                Extract insights from 3-hour podcasts with industry leaders in seconds. Use AI to summarize key takeaways and turn them into actionable tasks for your team.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#ffedd5', color: '#c2410c', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#strategy</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#dcfce7', color: '#15803d', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#execution</span>
              </div>
            </div>

            {/* Serious Learners */}
            <div style={{ padding: 32, borderRadius: 32, background: '#f3f3f4' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
                <span className="material-symbols-outlined">psychology</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)", color: '#1A1C1D' }}>For the Serious Learner</h3>
              <p style={{ color: '#545f6c', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                Treat YouTube like a structured course. Spaced Revisit reminds you to review key bookmarks at the optimal time, ensuring 100% retention for exam day.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#f3e8ff', color: '#7c3aed', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#retention</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#fce7f3', color: '#be185d', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#second_brain</span>
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
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, marginBottom: 32, lineHeight: 1.2, fontFamily: "var(--font-display)" }}>
                Effortless curation powered by Intelligence.
              </h2>
              <p style={{ color: '#9ca3af', fontSize: 18, lineHeight: 1.75, marginBottom: 16 }}>
                Your &ldquo;Second Brain&rdquo; doesn&apos;t just store; it understands. Our AI engine analyzes transcripts in real-time to surface the gold nuggets so you don&apos;t have to.
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
      <section id="how-it-works" style={{ padding: '128px 32px', background: 'white' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <span className="cm-section-label">How It Works</span>
            <h2 style={{ 
              fontSize: 'clamp(32px, 5vw, 48px)', 
              fontWeight: 800, 
              marginBottom: 24, 
              fontFamily: "var(--font-display)", 
              letterSpacing: '-0.5px', 
              color: '#1A1C1D' 
            }}>
              The Curator&apos;s Journey
            </h2>
            <p style={{ 
              fontSize: 18, 
              color: '#545f6c', 
              lineHeight: 1.6, 
              maxWidth: 600, 
              margin: '0 auto'
            }}>
              Three steps to turn passive watching into active, searchable knowledge.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32, position: 'relative' }}>
            {/* Timeline connector (decorative, desktop only) */}
            <div className="cm-timeline-line" />

            {[
              { 
                num: '01', 
                title: 'Bookmark Instantly', 
                desc: 'Hit Alt+B as you watch. No distractions, no friction — just capture the moment.',
                icon: 'flash_on'
              },
              { 
                num: '02', 
                title: 'Organize with AI',   
                desc: 'Clipmark adds titles, summaries, and tags to your clips automatically using Gemini Nano.',
                icon: 'psychology'
              },
              { 
                num: '03', 
                title: 'Revisit What Matters', 
                desc: 'Your knowledge syncs to a beautiful dashboard for focused, distraction-free study.',
                icon: 'auto_stories'
              },
            ].map(({ num, title, desc, icon }) => (
              <div key={num} className="cm-card">
                <div className="cm-icon-badge">
                  <span className="material-symbols-outlined" style={{ fontSize: 32 }}>{icon}</span>
                </div>
                <span className="cm-step-tag">Step {num}</span>
                <h4 style={{ 
                  fontSize: 22, 
                  fontWeight: 800, 
                  marginBottom: 16, 
                  fontFamily: "var(--font-display)", 
                  color: '#1A1C1D' 
                }}>
                  {title}
                </h4>
                <p style={{ color: '#545f6c', fontSize: 16, lineHeight: 1.7, margin: 0 }}>{desc}</p>
                
                <a
                  href="#faq"
                  aria-label={`Learn more: ${title}`}
                  style={{ 
                  marginTop: 'auto', 
                  paddingTop: 32, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8, 
                  color: '#14B8A6', 
                  fontWeight: 700, 
                  fontSize: 14,
                  textDecoration: 'none'
                }}
                >
                  Learn more <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compatibility strip ────────────────────────────────────────── */}
      <section style={{ padding: '72px 32px', borderTop: '1px solid rgba(26,28,29,0.06)', borderBottom: '1px solid rgba(26,28,29,0.06)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <p style={{ textAlign: 'center', color: '#9ca3af', fontWeight: 700, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 48 }}>
            Built for Your Ecosystem
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 56, opacity: 0.8 }}>
            {[
              { icon: 'brand_family',    label: 'YouTube Web', color: '#FF0000' },
              { icon: 'browser_updated', label: 'Chrome & Edge', color: '#4285F4' },
              { icon: 'cloud_sync',      label: 'Cloud Sync', color: '#14B8A6' },
              { icon: 'devices',         label: 'Cross-Device', color: '#8B5CF6' },
            ].map(({ icon, label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, fontSize: 16, color: '#1A1C1D' }}>
                <span className="material-symbols-outlined" style={{ color }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing Preview ─────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '128px 32px', background: 'white' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span className="cm-section-label">Pricing</span>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, marginBottom: 16,
              fontFamily: "var(--font-display)", letterSpacing: '-0.5px', color: '#1A1C1D',
            }}>
              Simple pricing. Absurdly affordable.
            </h2>
            <p style={{ color: '#545f6c', maxWidth: 560, margin: '0 auto', fontSize: 16 }}>
              Start free, forever. Upgrade when you&apos;re ready — from <strong>${prices.monthly}/mo</strong> for a permanent second brain.
            </p>
          </div>
          <PlanCards prices={prices} variant="preview" />
          <GuaranteeLine style={{ marginTop: 24 }} />
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <a href="/upgrade" style={{ color: '#0D9488', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              Compare all plans <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle' }}>arrow_forward</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ Section ────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: '96px 32px', background: '#fcfcfd' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, textAlign: 'center',
            marginBottom: 64, fontFamily: "var(--font-display)", color: '#1A1C1D'
          }}>
            Questions? We have answers.
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {FAQ_DATA.map(({ q, a }) => (
              <div key={q} style={{
                background: 'white', padding: '32px', borderRadius: 20,
                boxShadow: '0 4px 20px rgba(26,28,29,0.04)',
                border: '1px solid rgba(26,28,29,0.06)'
              }}>
                <h3 style={{
                  fontSize: 18, fontWeight: 700, marginBottom: 12,
                  fontFamily: "var(--font-display)", color: '#1A1C1D'
                }}>
                  {q}
                </h3>
                <p style={{ color: '#545f6c', fontSize: 15, lineHeight: 1.7 }}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section style={{ padding: '128px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        
        {/* Founder Quote (Item 33) */}
        <div style={{ maxWidth: 640, margin: '0 auto 80px', padding: 48, background: 'white', borderRadius: 32, border: '1px solid #e8e8e9', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -32, left: '50%', transform: 'translateX(-50%)', width: 64, height: 64, background: '#14B8A6', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 8px 24px rgba(20,184,166,0.2)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32 }}>person</span>
          </div>
          <p style={{ fontSize: 18, fontStyle: 'italic', color: '#1A1C1D', lineHeight: 1.6, marginBottom: 24, fontWeight: 500 }}>
            &ldquo;I built Clipmark because I was tired of re-watching the same 3-hour podcasts just to find that one 30-second gem I forgot to write down. YouTube is a goldmine, but only if you have a way to mine it.&rdquo;
          </p>
          <p style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#545f6c' }}>
            — Creator of Clipmark
          </p>
        </div>

        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, background: 'rgba(20,184,166,0.05)', borderRadius: 9999, filter: 'blur(120px)', zIndex: 0, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 800, marginBottom: 24, letterSpacing: '-1px', fontFamily: "var(--font-display)", color: '#1A1C1D' }}>
            Ready to Build Your Second Brain?
          </h2>
          <p style={{ fontSize: 20, color: '#545f6c', marginBottom: 48 }}>
            Join 15,000+ power learners who use Clipmark to turn casual watching into lifelong knowledge.
          </p>
          <a href="https://chrome.google.com/webstore" 
             aria-label="Install Clipmark Chrome Extension"
             style={{
            display: 'inline-block', padding: '20px 48px',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
            color: 'white', borderRadius: 16, fontWeight: 700, fontSize: 18, textDecoration: 'none',
            boxShadow: '0 16px 48px rgba(20, 184, 166, 0.28)',
          }}>
            Install Extension &amp; Get Started
          </a>
          <p style={{ marginTop: 24, fontSize: 14, color: '#9ca3af' }}>Available on Chrome, Edge, and Brave. Free forever for individuals.</p>
        </div>
      </section>
    </main>
  );
}