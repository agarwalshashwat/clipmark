import { createServerSupabase } from '@/lib/supabase';
import { createCheckoutSession } from './actions';
// import { ThemeToggle } from '../components/ThemeToggle';

const FEATURES = [
  { label: 'Unlimited local bookmarks',          free: true,  pro: true  },
  { label: 'Shareable public pages',             free: true,  pro: true  },
  { label: 'Cloud sync across devices',          free: true,  pro: true  },
  { label: 'Public collections limit',           free: '5',   pro: '∞'   },
  { label: 'AI auto-fill from transcript',       free: false, pro: true  },
  { label: 'AI summaries',                       free: false, pro: true  },
  { label: 'Smart tag suggestions',              free: false, pro: true  },
  { label: 'Social post generation',             free: false, pro: true  },
  { label: 'Revision Mode',                      free: false, pro: true  },
  { label: 'Spaced revision',                    free: false, pro: true  },
];

function Check() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: '50%',
      background: '#14B8A615', color: '#006b5f', fontWeight: 700, fontSize: 13,
    }}>✓</span>
  );
}
function Cross() {
  return (
    <span style={{ color: '#bbcac6', fontSize: 18, lineHeight: 1 }}>—</span>
  );
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let isPro = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', user.id)
      .single();
    isPro = profile?.is_pro ?? false;
  }

  return (
    <div style={{
        minHeight: '100vh',
        background: '#f9f9fa',
        color: '#1a1c1d',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}>

        {/* ── Fixed Glass Header (matches home page) ── */}
        <nav style={{
          position: 'fixed', top: 0, width: '100%', zIndex: 50,
          background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 1px 0 rgba(26,28,29,0.06)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '0 32px', height: 72 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#14B8A6', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px' }}>
              <a href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Clipmark</a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
              <a href="/#features" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Features</a>
              <a href="/#how-it-works" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>How It Works</a>
              <a href="/upgrade" style={{ color: '#006B5F', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, borderBottom: '2px solid #14B8A6', paddingBottom: 2, textDecoration: 'none' }}>Pricing</a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* <ThemeToggle /> */}
              {user ? (
                <a href="/dashboard" style={{
                  padding: '10px 22px',
                  background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
                  color: 'white', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
                }}>
                  Dashboard
                </a>
              ) : (
                <>
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
                    Get Started
                  </a>
                </>
              )}
            </div>
          </div>
        </nav>

        <main style={{ paddingTop: 72 }}>

          {/* ── Banner: Success ── */}
          {success && (
            <div style={{
              background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)',
              borderRadius: 10, padding: '14px 24px', margin: '24px auto 0',
              maxWidth: 640, textAlign: 'center', fontSize: 15, color: '#006b5f',
              fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Payment successful — welcome to Clipmark Pro! 🎉
            </div>
          )}

          {/* ── Banner: Already Pro ── */}
          {isPro && !success && (
            <div style={{
              background: 'rgba(115,46,228,0.08)', border: '1px solid rgba(115,46,228,0.2)',
              borderRadius: 10, padding: '14px 24px', margin: '24px auto 0',
              maxWidth: 640, textAlign: 'center', fontSize: 15, color: '#732EE4',
              fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              You&apos;re already on Clipmark Pro
            </div>
          )}

          {/* ── Hero ── */}
          <section style={{
            textAlign: 'center', padding: '80px 24px 72px',
          }}>
            <h1
              className="hero-h1"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 72, fontWeight: 800, letterSpacing: '-2px',
                lineHeight: 1.05, color: '#1a1c1d', marginBottom: 24,
              }}
            >
              The Curated{' '}
              <span style={{ color: '#14B8A6' }}>Mind.</span>
            </h1>
            <p
              className="hero-sub"
              style={{
                fontSize: 18, color: '#545f6c', maxWidth: 560, margin: '0 auto',
                lineHeight: 1.7, fontWeight: 500,
              }}
            >
              Elevate your digital library from a collection of links to an editorial
              powerhouse. Unlock AI-driven insights and professional curation tools.
            </p>
          </section>

          {/* ── Pricing Bento Grid ── */}
          <section id="pricing" style={{ padding: '0 24px 96px', maxWidth: 1100, margin: '0 auto' }}>
            <div
              className="pricing-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: '4fr 8fr',
                gap: 24,
              }}
            >

              {/* Free Card */}
              <div style={{
                background: '#ffffff',
                border: '1px solid rgba(26,28,29,0.08)',
                borderRadius: 16,
                padding: 32,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                boxShadow: '0 12px 40px rgba(26,28,29,0.06)',
              }}>
                <div>
                  <span style={{
                    color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700, fontSize: 11, letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                  }}>
                    Essential
                  </span>
                  <h2 style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 40, fontWeight: 800, marginTop: 16, marginBottom: 8, color: '#1a1c1d',
                  }}>
                    Free
                  </h2>
                  <p style={{ color: '#545f6c', fontSize: 14, marginBottom: 32 }}>
                    Organize your digital life with the basics.
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[
                      'Unlimited basic clips',
                      'Standard collections',
                      'Chrome extension access',
                    ].map((item) => (
                      <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#3c4947', fontSize: 14 }}>
                        <span className="material-symbols-filled" style={{ color: '#14B8A6', fontSize: 20 }}>check_circle</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div style={{ marginTop: 40 }}>
                  <button className="ghost-btn" disabled>
                    {isPro ? 'Previous plan' : 'Current Plan'}
                  </button>
                </div>
              </div>

              {/* Pro Card */}
              <div style={{
                background: '#ffffff',
                border: '1px solid rgba(0,107,95,0.2)',
                borderRadius: 16,
                position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 12px 40px rgba(0,107,95,0.08)',
              }}>
                {/* Most Popular badge */}
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  background: '#14B8A6', color: '#00423b',
                  padding: '5px 20px',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  borderBottomLeftRadius: 12,
                }}>
                  Most Popular
                </div>

                {/* Inner split: left pricing + right features */}
                <div className="pro-card-inner" style={{ display: 'flex', flex: 1 }}>

                  {/* Left half */}
                  <div
                    className="pro-left"
                    style={{
                      flex: '0 0 50%', padding: 32,
                      borderRight: '1px solid rgba(187,202,198,0.2)',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <span style={{
                        color: '#006b5f', fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 700, fontSize: 11, letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                      }}>
                        The Curator
                      </span>
                      <h2 style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: 40, fontWeight: 800, marginTop: 16, marginBottom: 8, color: '#1a1c1d',
                      }}>
                        Pro
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 16, marginBottom: 32 }}>
                        <span style={{
                          fontSize: 52, fontWeight: 800, color: '#1a1c1d',
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          letterSpacing: '-2px',
                        }}>
                          $5
                        </span>
                        <span style={{ color: '#545f6c', fontWeight: 500 }}>/month</span>
                      </div>

                      {/* AI Powerups box */}
                      <div style={{
                        background: 'rgba(115,46,228,0.07)',
                        border: '1px solid rgba(115,46,228,0.18)',
                        borderRadius: 12, padding: '16px 20px',
                      }}>
                        <p style={{
                          color: '#732EE4', fontFamily: "'Plus Jakarta Sans', sans-serif",
                          fontWeight: 700, fontSize: 11, letterSpacing: '0.1em',
                          textTransform: 'uppercase', marginBottom: 12,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#732EE4' }}>auto_awesome</span>
                          AI Powerups Included
                        </p>
                        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <li style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1a1c1d', fontSize: 14, fontWeight: 500 }}>
                            <span className="material-symbols-filled" style={{ color: '#732EE4', fontSize: 20 }}>colors_spark</span>
                            AI Auto-fill Metadata
                          </li>
                          <li style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1a1c1d', fontSize: 14, fontWeight: 500 }}>
                            <span className="material-symbols-filled" style={{ color: '#732EE4', fontSize: 20 }}>summarize</span>
                            AI Intelligent Summaries
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* CTAs */}
                    <div style={{ marginTop: 32 }}>
                      <p style={{ fontSize: 12, color: '#545f6c', marginBottom: 12, fontStyle: 'italic' }}>
                        Billed annually at $40/yr (Save 33%)
                      </p>
                      <form action={createCheckoutSession}>
                        <input type="hidden" name="plan" value="annual" />
                        <button type="submit" className="primary-btn" disabled={isPro}>
                          {isPro ? 'Current Plan' : 'Get Pro Annual'}
                        </button>
                      </form>
                      <form action={createCheckoutSession}>
                        <input type="hidden" name="plan" value="monthly" />
                        <button type="submit" className="switch-link" disabled={isPro}>
                          Switch to Monthly ($5/mo)
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right half: feature list */}
                  <div style={{
                    flex: '0 0 50%', padding: 32,
                    background: 'rgba(243,243,244,0.4)',
                  }}>
                    <h3 style={{
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontWeight: 700, color: '#1a1c1d', marginBottom: 28, fontSize: 16,
                    }}>
                      Pro Features
                    </h3>
                    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
                      {[
                        { icon: 'history_edu', title: 'Social Post Generation', desc: 'Turn any clip into a LinkedIn or Twitter post instantly.' },
                        { icon: 'psychology_alt', title: 'Spaced Revisit', desc: 'AI-scheduled reminders to help you actually learn your clips.' },
                        { icon: 'folder_managed', title: 'Unlimited Collections', desc: 'Infinite depth for your personal knowledge base.' },
                        { icon: 'devices', title: 'Priority Support', desc: 'Direct line to our curation experts and tech team.' },
                      ].map((feat) => (
                        <li key={feat.icon} style={{ display: 'flex', gap: 14 }}>
                          <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: '#ffffff', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(26,28,29,0.08)',
                          }}>
                            <span className="material-symbols-outlined" style={{ color: '#006b5f', fontSize: 20 }}>{feat.icon}</span>
                          </div>
                          <div>
                            <h4 style={{
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                              fontSize: 14, fontWeight: 700, color: '#1a1c1d',
                            }}>
                              {feat.title}
                            </h4>
                            <p style={{ fontSize: 13, color: '#545f6c', marginTop: 4, lineHeight: 1.5 }}>
                              {feat.desc}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>{/* end pro-card-inner */}
              </div>{/* end Pro Card */}

            </div>{/* end pricing-grid */}
          </section>

          {/* ── Feature Comparison Table ── */}
          <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 96px' }}>
            <h2 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 32, fontWeight: 800, textAlign: 'center',
              color: '#1a1c1d', marginBottom: 48,
            }}>
              Feature Comparison
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(187,202,198,0.35)' }}>
                    <th style={{
                      textAlign: 'left', padding: '20px 16px',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      color: '#545f6c', fontWeight: 700, fontSize: 13,
                    }}>
                      Capabilities
                    </th>
                    <th style={{
                      textAlign: 'center', padding: '20px 16px', width: 100,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      color: '#1a1c1d', fontWeight: 800, fontSize: 13,
                    }}>
                      Free
                    </th>
                    <th style={{
                      textAlign: 'center', padding: '20px 16px', width: 100,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      color: '#006b5f', fontWeight: 800, fontSize: 13,
                    }}>
                      Pro
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map(({ label, free, pro }) => (
                    <tr
                      key={label}
                      className="feature-row"
                      style={{ borderBottom: '1px solid rgba(187,202,198,0.15)', transition: 'background 0.15s' }}
                    >
                      <td style={{ padding: '18px 16px', color: '#1a1c1d', fontWeight: 500 }}>{label}</td>
                      <td style={{ textAlign: 'center', padding: '18px 16px' }}>
                        {free === true ? <Check /> : free === false ? <Cross /> : (
                          <span style={{ color: '#545f6c', fontSize: 13 }}>{free}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', padding: '18px 16px' }}>
                        {pro === true ? <Check /> : pro === false ? <Cross /> : (
                          <span style={{ color: '#006b5f', fontSize: 13, fontWeight: 700 }}>{pro}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── FAQ ── */}
          <section style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 96px' }}>
            <h2 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 32, fontWeight: 800, textAlign: 'center',
              color: '#1a1c1d', marginBottom: 40,
            }}>
              Frequently Asked Questions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
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
              ].map(({ q, a }) => (
                <div key={q} className="faq-card">
                  <h3 style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700, fontSize: 16, color: '#1a1c1d', marginBottom: 8,
                  }}>
                    {q}
                  </h3>
                  <p style={{ fontSize: 14, color: '#545f6c', lineHeight: 1.65 }}>{a}</p>
                </div>
              ))}
            </div>
          </section>

        </main>

        {/* ── Footer ── */}
        <footer style={{
          background: '#e8e8e9', padding: '48px 32px',
        }}>
          <div style={{
            maxWidth: 1280, margin: '0 auto',
            display: 'flex', flexWrap: 'wrap',
            justifyContent: 'space-between', alignItems: 'center', gap: 24,
          }}>
            <div>
              <span style={{
                fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px',
                color: '#006b5f', fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                Clipmark
              </span>
              <p style={{ fontSize: 12, color: '#545f6c', marginTop: 6 }}>
                © {new Date().getFullYear()} Clipmark. The Digital Curator&apos;s choice.
              </p>
            </div>
            <nav style={{ display: 'flex', gap: 32 }}>
              <a href="/privacy" className="footer-link">Privacy Policy</a>
              <a href="/terms" className="footer-link">Terms of Service</a>
              <a href="/contact" className="footer-link">Contact</a>
            </nav>
          </div>
        </footer>

      </div>
  );
}
