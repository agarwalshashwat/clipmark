import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Metadata } from 'next';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabase } from '@/lib/supabase';
import PlanCards from './upgrade/PlanCards';
import { fetchProductPrices } from './upgrade/actions';
import { PRICE_DEFAULTS, type ProductPrices } from './upgrade/pricing';
import { CHROME_STORE_URL } from '@/app/lib/constants';
import { GuaranteeLine } from '@/app/components/GuaranteeLine';
import { ScrollReveal } from './ScrollReveal';
import { HeroDemoVideo } from '@/app/components/HeroDemoVideo';
import { WhyClipMark } from '@/app/components/WhyClipMark';
import { buildPageMetadata } from '@/app/lib/seo';

// Built through buildPageMetadata so the homepage's own openGraph/twitter copy
// matches its <title> rather than inheriting the root layout's weaker generic
// block — the share-card mismatch in docs/gtm/SEO-AUDIT.md §1.3 (quick win #4).
export const metadata: Metadata = buildPageMetadata({
  title: 'ClipMark — Turn YouTube Into Video Flashcards You Remember',
  description: 'Bookmark the moments that matter, then let Active Recall quiz you on them before replaying the clip. Spaced review, local AI notes, and one-click export to Anki.',
  path: '/',
  cardTitle: 'Turn YouTube Into Video Flashcards You Remember',
  cardSubtitle: 'Save the moment. Get quizzed on it. Export the deck to Anki.',
  keywords: [
    'youtube bookmarks', 'video flashcards', 'active recall', 'spaced repetition',
    'anki export', 'video notes', 'study tool', 'chrome extension', 'ai summaries',
    'timestamp bookmarks', 'remember what you watch', 'second brain',
  ],
});

const FAQ_DATA = [
  {
    q: 'Can I cancel my subscription at any time?',
    a: 'Absolutely. If you cancel, your Pro features will remain active until the end of your current billing period. No hidden fees or lock-ins.',
  },
  {
    q: 'How does AI Auto-fill work?',
    a: 'When you save a moment, ClipMark reads the transcript around that timestamp and drafts a short note for you, then suggests tags based on what the clip is about. You can edit either before saving.',
  },
  {
    q: 'How does Active Recall decide what to show me?',
    a: 'Each saved moment gets a review schedule (1, 3 and 7 days to start). When a moment comes due, Active Recall shows you the timestamp and tags but hides your note, so you have to remember it before you reveal and replay the clip. Answer "Got it" and the next interval doubles, up to 60 days; answer "Again" and it comes back tomorrow.',
  },
  {
    q: 'Does ClipMark replace Anki?',
    a: 'No — it feeds it. Anki can\'t bookmark and replay the actual moment from a lecture, which is exactly what ClipMark does. Pro users can export their clips as an Anki-importable file, and every card links straight back to the second it came from, so you keep the deck you already trust.',
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
    "name": "How to Use ClipMark for YouTube Bookmarking",
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
        "text": "ClipMark drafts a note from the transcript and suggests tags for every clip, using Chrome's on-device Gemini Nano."
      },
      {
        "@type": "HowToStep",
        "name": "Recall It Until It Sticks",
        "text": "Active Recall brings saved moments back on a spaced schedule and quizzes you before replaying the clip."
      }
    ]
  };

  // Live prices for the pricing preview; fall back to defaults if Dodo is unreachable.
  let prices: ProductPrices;
  try {
    prices = await fetchProductPrices();
  } catch (err) {
    // See the same block on /upgrade: the fallback renders a normal-looking
    // page, so a broken Dodo key has to page us rather than hide here.
    console.error('[LandingPage] Could not fetch Dodo prices, using defaults:', err);
    Sentry.captureException(err, {
      level: 'error',
      tags: { dodo: 'price_fetch_fallback', surface: 'landing' },
    });
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
          background: 'linear-gradient(90deg, rgba(20,184,166,0.10) 0%, var(--ai-light) 100%)',
          borderBottom: '1px solid rgba(20,184,166,0.20)',
          padding: '10px 24px',
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--primary-deep)',
          fontWeight: 500,
        }}>
          <span style={{ marginRight: 6 }}>👋</span>
          You were referred by <strong>@{referrerUsername}</strong> — welcome to ClipMark!
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
            background: 'rgba(20,184,166,0.10)', color: 'var(--brand-ink)',
            fontWeight: 600, fontSize: 13, marginBottom: 32,
            border: '1px solid rgba(20,184,166,0.15)'
          }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>verified</span>
            The Second Brain for YouTube Professionals
          </div>

          {/* H1 */}
          <h1 style={{
            fontSize: 'clamp(44px, 7.5vw, 88px)', fontWeight: 800,
            lineHeight: 0.95, letterSpacing: '-0.05em', maxWidth: 1000, margin: '0 auto 32px',
            fontFamily: "var(--font-display)", color: 'var(--gray-900)',
          }}>
            Stop Forgetting What You Watch —<br />
            <em style={{ 
              color: 'var(--accent-strong)', 
              fontStyle: 'italic', 
              fontWeight: 800,
              textDecoration: 'none',
              background: 'var(--gradient-brand)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block'
            }}>Your YouTube Second Brain.</em>
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: 21, color: 'var(--gray-600)', maxWidth: 720, margin: '0 auto 56px', lineHeight: 1.6, fontWeight: 450 }}>
            Quit wasting time rewatching tutorials or losing gems in your watch history. Build a personal knowledge system that remembers exactly where the value is.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a href={CHROME_STORE_URL}
               target="_blank"
               rel="noopener noreferrer"
               style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '20px 44px',
              background: 'var(--accent-strong)',
              color: 'white', borderRadius: 16, fontSize: 18, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 20px 50px rgba(13, 148, 136, 0.25)',
              transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}>
              Master YouTube Now — It&apos;s Free <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>arrow_forward</span>
            </a>
            <a href="#pricing"
              style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '20px 44px', background: 'white', border: '1px solid var(--gray-200)',
              color: 'var(--gray-900)', borderRadius: 16, fontSize: 18, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24, color: 'var(--brand-ink)' }}>bolt</span>
              See Pricing
            </a>
          </div>

          <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, opacity: 0.7 }}>shield_with_heart</span>
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
              <span className="material-symbols-outlined" aria-hidden="true" style={{ color: 'var(--secondary)', fontSize: 20 }}>history</span>
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
              background: 'linear-gradient(to top right, rgba(20,184,166,0.15), var(--ai-light))',
              borderRadius: 40, filter: 'blur(80px)', zIndex: 0,
            }} />
            <div style={{ position: 'relative', zIndex: 1, background: 'var(--gray-900)', borderRadius: 36, padding: 16, boxShadow: '0 32px 100px rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <HeroDemoVideo />
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem / Solution ──────────────────────────────────────────── */}
      <section style={{ padding: '128px 32px', background: '#ffffff' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 80, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 44px)', fontWeight: 800, marginBottom: 32, fontFamily: "var(--font-display)", color: 'var(--gray-900)', letterSpacing: '-0.5px' }}>
              Stop Scrubbing, <br /><span style={{ color: 'var(--primary-deep)' }}>Start Remembering.</span>
            </h2>
            <p style={{ fontSize: 18, color: 'var(--text-muted)', marginBottom: 40, lineHeight: 1.75 }}>
              Most of what you watch fades within a day. ClipMark&apos;s <strong>Active Recall</strong> quizzes you on the moments you saved before replaying them — turning hours of idle watching into minutes of active mastery.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 9999, background: 'rgba(186,26,26,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" aria-hidden="true">timer_off</span>
                </div>
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, fontFamily: "var(--font-display)" }}>Passive Consumption (Bad)</h4>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>&ldquo;Where was that part? *scrubs timeline for 15 minutes*&rdquo;</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 9999, background: 'rgba(20,184,166,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-deep)', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" aria-hidden="true">bolt</span>
                </div>
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, fontFamily: "var(--font-display)" }}>The ClipMark System (Pro)</h4>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>&ldquo;Playing 4 peak moments in 6 minutes. System locked in.&rdquo;</p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Before / After Transformation Visual */}
            <div style={{ 
              background: 'var(--gray-50)', 
              padding: 40, 
              borderRadius: 32, 
              border: '1px solid var(--gray-200)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>The Old Way</div>
                  <div style={{ height: 120, background: 'var(--danger-light)', borderRadius: 16, border: '2px dashed var(--danger-light)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12 }}>
                    <div style={{ width: '80%', height: 8, background: 'var(--danger-light)', borderRadius: 4 }} />
                    <div style={{ width: '60%', height: 8, background: 'var(--danger-light)', borderRadius: 4 }} />
                    <div style={{ width: '70%', height: 8, background: 'var(--danger-light)', borderRadius: 4 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', color: 'var(--primary-deep)' }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 32 }}>arrow_forward</span>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ color: 'var(--primary-deep)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>The ClipMark Way</div>
                  <div style={{ height: 120, background: 'var(--teal-100)', borderRadius: 16, border: '2px solid var(--teal-200)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12 }}>
                    <div style={{ width: '90%', height: 12, background: 'var(--accent)', borderRadius: 6 }} />
                    <div style={{ width: '90%', height: 12, background: 'var(--accent)', borderRadius: 6 }} />
                  </div>
                </div>
              </div>

              {/* Bar chart */}
              <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 120, marginBottom: 16 }}>
                  <div style={{ flex: 1, background: 'var(--gray-200)', height: '100%', borderRadius: '8px 8px 0 0', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>120m</span>
                  </div>
                  <div style={{ flex: 1, background: 'var(--accent)', height: '5%', borderRadius: '8px 8px 0 0', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700, color: 'var(--primary-deep)', whiteSpace: 'nowrap' }}>6m</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  <span>Mental Fatigue</span>
                  <span style={{ color: 'var(--primary-deep)' }}>Knowledge Retained</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Active Recall ───────────────────────────────────────────────── */}
      <section id="active-recall" style={{ padding: '128px 32px', background: 'var(--gray-50)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 72 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span className="cm-section-label" style={{ margin: 0 }}>Active Recall</span>
              <span style={{
                padding: '3px 10px', borderRadius: 9999,
                background: 'var(--accent-strong)',
                color: 'white', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
              }}>PRO</span>
            </div>
            <h2 style={{
              fontSize: 'clamp(32px, 4.5vw, 48px)', fontWeight: 800, marginBottom: 20,
              fontFamily: "var(--font-display)", letterSpacing: '-0.5px', color: 'var(--gray-900)',
            }}>
              Don&apos;t just rewatch it.<br />Try to <em style={{ color: 'var(--brand-ink)', fontStyle: 'italic' }}>remember</em> it.
            </h2>
            <p style={{ fontSize: 18, color: 'var(--text-muted)', maxWidth: 620, margin: '0 auto', lineHeight: 1.7 }}>
              Rewatching feels like studying, but recognition isn&apos;t recall. ClipMark shows you the
              timestamp and hides your note — so you have to retrieve it before the clip plays.
            </p>
          </div>

          {/* Real product UI: the two panels you actually see on YouTube */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 32, alignItems: 'stretch', maxWidth: 900, margin: '0 auto 72px',
          }}>
            {[
              { src: '/active-recall-prompt.png', w: 330, h: 190, alt: 'ClipMark asking you to recall a saved moment: the timestamp and tag are shown, the note is hidden, with a Reveal and Play button.', cap: '1 · You get the cue, not the answer' },
              { src: '/active-recall-grade.png', w: 330, h: 130, alt: 'ClipMark revealing the saved note after the clip played, with Again and Got it buttons.', cap: '2 · Watch, then grade yourself' },
            ].map(({ src, w, h, alt, cap }) => (
              <figure key={src} style={{ margin: 0, textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  background: 'var(--gray-900)', borderRadius: 20, padding: 20,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 230,
                }}>
                  <img src={src} width={w} height={h} alt={alt}
                       style={{ width: '100%', maxWidth: w, height: 'auto', display: 'block', borderRadius: 12 }} />
                </div>
                <figcaption style={{ marginTop: 16, fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{cap}</figcaption>
              </figure>
            ))}
          </div>

          {/* What the schedule actually does */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {[
              { icon: 'schedule', title: 'Spaced, not random', desc: 'Every saved moment starts on a 1 / 3 / 7-day schedule and surfaces in a "due for recall" queue when it\'s ready.' },
              { icon: 'trending_up', title: 'Remembered it? Wait longer', desc: 'Each "Got it" doubles the next interval — up to 60 days — so easy material stops stealing your time.' },
              { icon: 'replay', title: 'Blanked? See it tomorrow', desc: '"Again" resets the streak and brings the moment back the next day, until it finally sticks.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ padding: 28, borderRadius: 24, background: 'white', border: '1px solid var(--gray-200)' }}>
                <div className="cm-icon-badge" style={{ marginBottom: 20 }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 26 }}>{icon}</span>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, fontFamily: "var(--font-display)", color: 'var(--gray-900)' }}>{title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Works with Anki ─────────────────────────────────────────────── */}
      <section id="anki" style={{ padding: '128px 32px' }}>
        <div style={{
          maxWidth: 1000, margin: '0 auto', display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 64, alignItems: 'center',
        }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span className="cm-section-label" style={{ margin: 0 }}>Works with Anki</span>
              <span style={{
                padding: '3px 10px', borderRadius: 9999,
                background: 'var(--accent-strong)',
                color: 'white', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
              }}>PRO</span>
            </div>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, marginBottom: 20,
              fontFamily: "var(--font-display)", letterSpacing: '-0.5px', color: 'var(--gray-900)',
            }}>
              Keep your deck. Add the moment.
            </h2>
            <p style={{ fontSize: 17, color: 'var(--text-muted)', lineHeight: 1.75, marginBottom: 24 }}>
              ClipMark isn&apos;t trying to replace the deck you&apos;ve spent years building. Anki can&apos;t
              bookmark and replay the exact second a concept was explained — that&apos;s the part we add.
              Export your clips and every card links straight back to the source.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'One-click export to an Anki-importable file (Front / Back / Tags)',
                'Every card carries a “▶ Replay the moment” link to the exact second',
                'Your ClipMark tags come across as Anki tags',
                'Export from the extension or the web dashboard',
              ].map(item => (
                <li key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, color: 'var(--gray-900)' }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20, color: 'var(--brand-ink)', flexShrink: 0 }}>check_circle</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <a href="/upgrade" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--brand-ink)', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              See what else Pro unlocks
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>arrow_forward</span>
            </a>
          </div>

          {/* A representative exported card */}
          <div style={{
            background: 'var(--gray-900)', borderRadius: 28, padding: 32, color: 'white',
            boxShadow: '0 24px 70px rgba(0,0,0,0.25)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gray-300)', marginBottom: 20 }}>
              Exported card
            </p>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-300)', marginBottom: 6 }}>FRONT</p>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 24, lineHeight: 1.5 }}>
              Spaced repetition beats re-reading every time
            </p>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: 24 }} />
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-300)', marginBottom: 6 }}>BACK</p>
            <p style={{ fontSize: 14, marginBottom: 10, color: 'var(--gray-300)' }}>
              <strong style={{ color: 'white' }}>Study Skills 101</strong> — 5:05
            </p>
            <p style={{ fontSize: 14, color: 'var(--accent-soft)', marginBottom: 24 }}>▶ Replay the moment</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['key', 'retention'].map(t => (
                <span key={t} style={{
                  padding: '3px 10px', borderRadius: 9999, background: 'rgba(20,184,166,0.18)',
                  color: 'var(--accent-soft)', fontSize: 11, fontWeight: 700,
                }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Showcases ───────────────────────────────────────────── */}
      <section id="features" style={{ padding: '128px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 96 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, marginBottom: 16, fontFamily: "var(--font-display)", letterSpacing: '-0.5px', color: 'var(--gray-900)' }}>
              Curated For Your Workflow
            </h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto', fontSize: 16 }}>
              Whether you&apos;re building, studying, or creating, ClipMark adapts to your mental model.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {/* Developers */}
            <div style={{ padding: 32, borderRadius: 32, background: 'var(--gray-100)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gray-900)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
                <span className="material-symbols-outlined" aria-hidden="true">code</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)", color: 'var(--gray-900)' }}>For the Builder</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                Stop "tutorial hell." Instantly capture code snippets and architecture shifts from technical deep dives. Build a searchable library of 100+ tutorials you actually understand.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#react</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: 'var(--gray-100)', color: 'var(--gray-600)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#architecture</span>
              </div>
            </div>

            {/* Founders */}
            <div style={{ padding: 32, borderRadius: 32, background: 'var(--gray-100)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-strong)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
                <span className="material-symbols-outlined" aria-hidden="true">rocket_launch</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)", color: 'var(--gray-900)' }}>For the Founder</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                Extract insights from 3-hour podcasts with industry leaders in seconds. Use AI to summarize key takeaways and turn them into actionable tasks for your team.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#ffedd5', color: '#c2410c', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#strategy</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#dcfce7', color: 'var(--success)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#execution</span>
              </div>
            </div>

            {/* Serious Learners */}
            <div style={{ padding: 32, borderRadius: 32, background: 'var(--gray-100)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--ai)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
                <span className="material-symbols-outlined" aria-hidden="true">psychology</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)", color: 'var(--gray-900)' }}>For the Serious Learner</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.75 }}>
                Treat YouTube like a structured course. Active Recall resurfaces your saved moments on a spaced schedule and quizzes you before the reveal — so what you study actually sticks by exam day.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: 'var(--ai-light)', color: 'var(--ai-strong)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#retention</span>
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: '#fce7f3', color: '#be185d', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#second_brain</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI / Pro Section ────────────────────────────────────────────── */}
      <section style={{ padding: '128px 16px' }}>
        <div style={{ background: 'var(--gray-900)', color: 'white', borderRadius: 64, padding: '128px 32px', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 80, alignItems: 'center' }}>

            {/* AI feature buttons */}
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: -40, left: -40, width: 160, height: 160, background: 'rgba(115,46,228,0.25)', filter: 'blur(100px)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
                {[
                  { icon: 'label',     title: '✦ Auto Tagging',   desc: 'Suggests tags for each clip from what it\'s actually about.',        active: false },
                  { icon: 'summarize', title: '✦ Smart Summary',  desc: 'Drafts your note from the transcript around the timestamp.',        active: true  },
                  { icon: 'share',     title: '✦ Post Insights',  desc: 'Turns a set of saved clips into a draft post you can share.',      active: false },
                ].map(({ icon, title, desc, active }) => (
                  <div key={title} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '20px 24px',
                    background: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${active ? 'rgba(115,46,228,0.45)' : 'rgba(255,255,255,0.10)'}`,
                    borderRadius: 16,
                    boxShadow: active ? '0 0 30px rgba(115,46,228,0.20)' : 'none',
                  }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ color: 'var(--ai)', fontSize: 22, flexShrink: 0 }}>{icon}</span>
                    <div>
                      <p style={{ fontWeight: 700, marginBottom: 3, fontSize: 15 }}>{title}</p>
                      <p style={{ fontSize: 12, color: active ? 'var(--gray-300)' : 'var(--gray-400)' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <span style={{
                display: 'inline-block', padding: '6px 16px', borderRadius: 9999,
                background: 'var(--ai-light)', color: 'var(--ai-soft)',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 24,
              }}>
                Pro Features
              </span>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, marginBottom: 32, lineHeight: 1.2, fontFamily: "var(--font-display)" }}>
                Effortless curation powered by Intelligence.
              </h2>
              <p style={{ color: 'var(--gray-300)', fontSize: 18, lineHeight: 1.75, marginBottom: 16 }}>
                Your &ldquo;Second Brain&rdquo; doesn&apos;t just store; it understands. Our AI engine analyzes transcripts in real-time to surface the gold nuggets so you don&apos;t have to.
              </p>
              <p style={{ fontSize: 11, color: 'var(--gray-300)', marginBottom: 40, fontStyle: 'italic' }}>
                * AI features use Chrome&apos;s built-in AI (Gemini Nano). Availability is subject to Google&apos;s support and may vary by Chrome version.
              </p>
              <a href="/upgrade" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                color: 'var(--ai-soft)', fontWeight: 700, fontSize: 16, textDecoration: 'none',
              }}>
                Explore Pro Features <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: '128px 32px', background: 'white' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <ScrollReveal>
            <div style={{ textAlign: 'center', marginBottom: 80 }}>
              <span className="cm-section-label">How It Works</span>
              <h2 style={{
                fontSize: 'clamp(32px, 5vw, 48px)',
                fontWeight: 800,
                marginBottom: 24,
                fontFamily: "var(--font-display)",
                letterSpacing: '-0.5px',
                color: 'var(--gray-900)'
              }}>
                The Curator&apos;s Journey
              </h2>
              <p style={{
                fontSize: 18,
                color: 'var(--text-muted)',
                lineHeight: 1.6,
                maxWidth: 600,
                margin: '0 auto'
              }}>
                Three steps to turn passive watching into active, searchable knowledge.
              </p>
            </div>
          </ScrollReveal>

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
                desc: 'ClipMark drafts a note from the transcript and suggests tags, using Chrome\'s on-device Gemini Nano.',
                icon: 'psychology'
              },
              { 
                num: '03', 
                title: 'Recall It Until It Sticks', 
                desc: 'Active Recall brings saved moments back on a spaced schedule and quizzes you before replaying the clip.',
                icon: 'psychology_alt'
              },
            ].map(({ num, title, desc, icon }, i) => (
              <ScrollReveal key={num} delayMs={i * 150}>
                <div className="cm-card">
                  <div className="cm-icon-badge">
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 32 }}>{icon}</span>
                  </div>
                  <span className="cm-step-tag">Step {num}</span>
                  <h4 style={{
                    fontSize: 22,
                    fontWeight: 800,
                    marginBottom: 16,
                    fontFamily: "var(--font-display)",
                    color: 'var(--gray-900)'
                  }}>
                    {title}
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: 16, lineHeight: 1.7, margin: 0 }}>{desc}</p>

                  <a
                    href="#faq"
                    aria-label={`Learn more: ${title}`}
                    style={{
                    marginTop: 'auto',
                    paddingTop: 32,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--brand-ink)',
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: 'none'
                  }}
                  >
                    Learn more <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>arrow_forward</span>
                  </a>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compatibility strip ────────────────────────────────────────── */}
      <section style={{ padding: '72px 32px', borderTop: '1px solid rgba(17, 24, 39,0.06)', borderBottom: '1px solid rgba(17, 24, 39,0.06)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 48 }}>
            Built for Your Ecosystem
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 56, opacity: 0.8 }}>
            {[
              { icon: 'brand_family',    label: 'YouTube Web', color: '#FF0000' },
              { icon: 'browser_updated', label: 'Chrome & Edge', color: '#4285F4' },
              { icon: 'style',           label: 'Anki Export', color: 'var(--brand-ink)' },
              { icon: 'description',     label: 'Notion & Obsidian', color: 'var(--ai)' },
              { icon: 'cloud_sync',      label: 'Cloud Sync', color: 'var(--brand-ink)' },
            ].map(({ icon, label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, fontSize: 16, color: 'var(--gray-900)' }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ color }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why ClipMark (differentiators) ──────────────────────────────── */}
      {/* Sits directly above pricing on purpose: the free-tier card is the claim
          people are most sceptical of, so the honest-limits panel lands first. */}
      <WhyClipMark tint />

      {/* ── Pricing Preview ─────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '128px 32px', background: 'white' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span className="cm-section-label">Pricing</span>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, marginBottom: 16,
              fontFamily: "var(--font-display)", letterSpacing: '-0.5px', color: 'var(--gray-900)',
            }}>
              Simple pricing. Absurdly affordable.
            </h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: 560, margin: '0 auto', fontSize: 16 }}>
              Start free, forever. Upgrade when you&apos;re ready — from <strong>${prices.monthly}/mo</strong> for a permanent second brain.
            </p>
          </div>
          <PlanCards prices={prices} variant="preview" />
          <GuaranteeLine refundDays={7} style={{ marginTop: 24 }} />
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <a href="/upgrade" style={{ color: 'var(--brand-ink)', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              Compare all plans <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, verticalAlign: 'middle' }}>arrow_forward</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ Section ────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: '96px 32px', background: 'var(--gray-50)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, textAlign: 'center',
            marginBottom: 64, fontFamily: "var(--font-display)", color: 'var(--gray-900)'
          }}>
            Questions? We have answers.
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {FAQ_DATA.map(({ q, a }) => (
              <div key={q} style={{
                background: 'white', padding: '32px', borderRadius: 20,
                boxShadow: '0 4px 20px rgba(17, 24, 39,0.04)',
                border: '1px solid rgba(17, 24, 39,0.06)'
              }}>
                <h3 style={{
                  fontSize: 18, fontWeight: 700, marginBottom: 12,
                  fontFamily: "var(--font-display)", color: 'var(--gray-900)'
                }}>
                  {q}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.7 }}>{a}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <a href="/faq" style={{ color: 'var(--accent-strong)', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              Read the full FAQ <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, verticalAlign: 'middle' }}>arrow_forward</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Retention cluster links ─────────────────────────────────────── */}
      {/* Crawl path from the homepage into the retention pages — without this the
          cluster is only reachable from the footer and the sitemap. */}
      <section style={{ padding: '96px 32px', background: 'white' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span className="cm-section-label">Go Deeper</span>
            <h2 style={{
              fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, marginBottom: 16,
              fontFamily: "var(--font-display)", letterSpacing: '-0.5px', color: 'var(--text)',
            }}>
              How remembering actually works here
            </h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: 520, margin: '0 auto', fontSize: 16, lineHeight: 1.7 }}>
              The retrieval loop, the review schedule, and the road out to Anki — each explained on its own page.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
            {[
              { href: '/active-recall-youtube',      icon: 'quiz',        label: 'Active recall from YouTube',  desc: 'Answer before you replay — the step rewatching skips.' },
              { href: '/spaced-repetition-youtube',  icon: 'event_repeat', label: 'Spaced repetition for YouTube', desc: '1, 3, 7 days — doubling to 60. How to revise lectures.' },
              { href: '/youtube-flashcards',         icon: 'style',       label: 'Turn YouTube into flashcards', desc: 'Cards whose answer is the moment, not a paraphrase.' },
              { href: '/youtube-to-anki',            icon: 'download',    label: 'YouTube to Anki',             desc: 'Export into the deck you already run, timestamps intact.' },
            ].map(({ href, icon, label, desc }) => (
              <a key={href} href={href} style={{
                display: 'block', padding: 24, borderRadius: 24, textDecoration: 'none',
                background: 'var(--bg)', border: '1px solid var(--border)',
              }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ color: 'var(--accent-strong)', fontSize: 24, marginBottom: 12, display: 'block' }}>{icon}</span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6, fontFamily: "var(--font-display)" }}>{label}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section style={{ padding: '128px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        
        {/* Founder Quote (Item 33) */}
        <div style={{ maxWidth: 640, margin: '0 auto 80px', padding: 48, background: 'white', borderRadius: 32, border: '1px solid var(--gray-200)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -32, left: '50%', transform: 'translateX(-50%)', width: 64, height: 64, background: 'var(--accent-strong)', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 8px 24px rgba(20,184,166,0.2)' }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 32 }}>person</span>
          </div>
          <p style={{ fontSize: 18, fontStyle: 'italic', color: 'var(--gray-900)', lineHeight: 1.6, marginBottom: 24, fontWeight: 500 }}>
            &ldquo;I built ClipMark because I was tired of re-watching the same 3-hour podcasts just to find that one 30-second gem I forgot to write down. YouTube is a goldmine, but only if you have a way to mine it.&rdquo;
          </p>
          <p style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
            — Creator of ClipMark
          </p>
        </div>

        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, background: 'rgba(20,184,166,0.05)', borderRadius: 9999, filter: 'blur(120px)', zIndex: 0, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 800, marginBottom: 24, letterSpacing: '-1px', fontFamily: "var(--font-display)", color: 'var(--gray-900)' }}>
            Ready to Build Your Second Brain?
          </h2>
          <p style={{ fontSize: 20, color: 'var(--text-muted)', marginBottom: 48 }}>
            Turn casual watching into lifelong knowledge — build a second brain you&apos;ll actually revisit.
          </p>
          <a href={CHROME_STORE_URL}
             target="_blank"
             rel="noopener noreferrer"
             aria-label="Install ClipMark Chrome Extension"
             style={{
            display: 'inline-block', padding: '20px 48px',
            background: 'var(--accent-strong)',
            color: 'white', borderRadius: 16, fontWeight: 700, fontSize: 18, textDecoration: 'none',
            boxShadow: '0 16px 48px rgba(20, 184, 166, 0.28)',
          }}>
            Install Extension &amp; Get Started
          </a>
          <p style={{ marginTop: 24, fontSize: 14, color: 'var(--text-muted)' }}>Available on Chrome, Edge, and Brave. Free forever for individuals.</p>
        </div>
      </section>
    </main>
  );
}