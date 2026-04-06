import { createServerSupabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ extensionId?: string; error?: string }>;
}) {
  const { extensionId, error } = await searchParams;

  async function signInWithGoogle() {
    'use server';
    const supabase = await createServerSupabase();

    const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const callbackUrl = new URL(`${appUrl}/auth/callback`);
    if (extensionId) callbackUrl.searchParams.set('extensionId', extensionId);

    const { data } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    });

    if (data.url) redirect(data.url);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9f9fa',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: '#1a1c1d',
      display: 'flex',
      flexDirection: 'column',
      backgroundImage: `
        radial-gradient(at 0% 0%, rgba(20,184,166,0.06) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(115,46,228,0.05) 0px, transparent 50%)
      `,
    }}>

      {/* ── Fixed glass header (matches home page) ── */}
      <nav style={{
        position: 'fixed', top: 0, width: '100%', zIndex: 50,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 1px 0 rgba(26,28,29,0.06)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          maxWidth: 1280, margin: '0 auto', padding: '0 32px', height: 72,
        }}>
          <a href="/" style={{
            fontSize: 22, fontWeight: 800, color: '#14B8A6',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            letterSpacing: '-0.5px', textDecoration: 'none',
          }}>
            Clipmark
          </a>
          <a href="/signin" style={{
            color: '#545f6c',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 600, fontSize: 14, textDecoration: 'none',
          }}>
            Sign Up
          </a>
        </div>
      </nav>

      {/* ── Main ── */}
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '96px 24px 80px',
      }}>
        <div style={{ width: '100%', maxWidth: 440 }}>

          {/* Glassmorphic card */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: '48px',
            boxShadow: '0 12px 40px rgba(26,28,29,0.06)',
            border: '1px solid rgba(187,202,198,0.15)',
          }}>

            {/* Heading */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h1 style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 30, fontWeight: 800, color: '#1a1c1d',
                letterSpacing: '-0.5px', margin: '0 0 12px',
              }}>
                Welcome Back
              </h1>
              <p style={{
                fontSize: 14, color: '#545f6c', lineHeight: 1.6,
                maxWidth: 280, margin: '0 auto',
              }}>
                {extensionId
                  ? 'Sign in to manage your collections and unlock Pro features.'
                  : 'Sign in to manage your bookmark collections.'}
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div style={{
                fontSize: 13, color: '#ba1a1a', background: '#ffdad6',
                padding: '10px 14px', borderRadius: 10, marginBottom: 24,
              }}>
                Sign-in failed — please try again.
              </div>
            )}

            {/* Google SSO */}
            <form action={signInWithGoogle}>
              <button
                type="submit"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 12, padding: '14px 24px',
                  background: '#f3f3f4',
                  border: '1px solid rgba(187,202,198,0.25)',
                  borderRadius: 12, fontSize: 15, fontWeight: 600, color: '#1a1c1d',
                  cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </form>

            {/* Trust signals */}
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <p style={{ fontSize: 11, color: '#6c7a77', marginBottom: 10 }}>
                By signing in you agree to our{' '}
                <a href="/terms" style={{ color: '#006b5f', textDecoration: 'underline' }}>terms</a>.
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 5, color: 'rgba(0,107,95,0.55)',
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}
                >
                  lock
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  Your bookmarks are private by default
                </span>
              </div>
            </div>
          </div>

          <p style={{ marginTop: 28, textAlign: 'center', fontSize: 14, color: '#545f6c' }}>
            Don&apos;t have an account?{' '}
            <a href="/signin" style={{ color: '#006b5f', fontWeight: 700, textDecoration: 'none' }}>
              Create collection
            </a>
          </p>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        textAlign: 'center', paddingBottom: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{ display: 'flex', gap: 32 }}>
          {['Privacy', 'Terms', 'Help'].map(label => (
            <a
              key={label}
              href={`/${label.toLowerCase()}`}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11, fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '0.1em',
                color: '#9ca3af', textDecoration: 'none',
              }}
            >
              {label}
            </a>
          ))}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'rgba(156,163,175,0.6)',
        }}>
          © {new Date().getFullYear()} Clipmark. The Digital Curator.
        </div>
      </footer>

    </div>
  );
}
