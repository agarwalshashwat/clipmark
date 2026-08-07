import { createServerSupabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { APP_URL } from '@/app/lib/constants';

export const metadata: Metadata = {
  title: 'Sign In — Clipmark',
  description: 'Sign in to Clipmark to sync your YouTube bookmarks, Active Recall decks, and shared collections across every device.',
  alternates: {
    canonical: '/signin',
  },
  openGraph: {
    title: 'Sign In — Clipmark',
    description: 'Sign in to Clipmark to sync your YouTube bookmarks, Active Recall decks, and shared collections across every device.',
    type: 'website',
    url: '/signin',
    siteName: 'Clipmark',
    images: [
      {
        url: `${APP_URL}/clipmark-logo.png`,
        width: 512,
        height: 512,
        alt: 'Clipmark — YouTube Bookmark Extension',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sign In — Clipmark',
    description: 'Sign in to Clipmark to sync your YouTube bookmarks, Active Recall decks, and shared collections across every device.',
    images: [`${APP_URL}/clipmark-logo.png`],
  },
};

/**
 * Password sign-in is a TESTING affordance, not a product feature.
 *
 * Real users sign in with Google. But seeded test accounts (test-monthly@,
 * test-annual@, test-lifetime@) are email/password users, and without a form
 * there is no way to reach them through the browser — the OAuth callback only
 * accepts `?code=`, and no client-side Supabase client runs on the page, so
 * neither an admin magic link nor a console sign-in establishes the cookie
 * session that the server components read.
 *
 * Off in production unless ENABLE_PASSWORD_LOGIN=true is set deliberately;
 * on by default in dev. Keeping it off in prod avoids adding a
 * credential-stuffing surface to an otherwise OAuth-only product.
 */
function isPasswordLoginEnabled(): boolean {
  if (process.env.ENABLE_PASSWORD_LOGIN === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ extensionId?: string; error?: string }>;
}) {
  const { extensionId, error } = await searchParams;
  const passwordLoginEnabled = isPasswordLoginEnabled();

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

  async function signInWithPassword(formData: FormData) {
    'use server';
    // Guard here as well as in the UI: a server action is reachable by URL even
    // when its form isn't rendered, so hiding the form is not a control.
    if (!isPasswordLoginEnabled()) redirect('/signin?error=disabled');

    const email    = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    if (!email || !password) redirect('/signin?error=missing');

    const supabase = await createServerSupabase();
    // Writing cookies is allowed in a server action, so this establishes the
    // same session the OAuth callback would.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) redirect('/signin?error=bad_credentials');

    redirect('/dashboard');
  }

  return (
    <>
      {/* ── Main ── */}
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '96px 24px 80px',
      }}>
        <div style={{ width: '100%', maxWidth: 440 }}>

          {/* Glassmorphic card */}
          <div className="cm-card" style={{
            background: '#ffffff',
            padding: '48px',
          }}>

            {/* Heading */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div className="cm-icon-badge" style={{ margin: '0 auto 24px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>login</span>
              </div>
              <h1 style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 32, fontWeight: 800, color: '#1a1c1d',
                letterSpacing: '-1px', margin: '0 0 12px',
              }}>
                Welcome Back
              </h1>
              <p style={{
                fontSize: 15, color: '#64748b', lineHeight: 1.6,
                maxWidth: 280, margin: '0 auto', fontWeight: 500
              }}>
                {extensionId
                  ? 'Sign in to manage your collections and unlock Pro features.'
                  : 'Sign in to manage your bookmark collections.'}
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fee2e2',
                borderRadius: 12, padding: '12px 16px', marginBottom: 24,
                display: 'flex', alignItems: 'center', gap: 10,
                color: '#dc2626', fontSize: 13, fontWeight: 600,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                Sign-in failed — please try again.
              </div>
            )}

            {/* Google SSO */}
            <form action={signInWithGoogle}>
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  color: '#1e293b',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
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

            {/* Test-only password sign-in (see isPasswordLoginEnabled) */}
            {passwordLoginEnabled && (
              <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px dashed #e2e8f0' }}>
                <p style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: '#94a3b8', textAlign: 'center', marginBottom: 16,
                }}>
                  Testing only · email &amp; password
                </p>
                <form action={signInWithPassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="email" name="email" required autoComplete="off"
                    placeholder="test-monthly@clipmark.test"
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 10,
                      border: '1px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit',
                    }}
                  />
                  <input
                    type="password" name="password" required autoComplete="off"
                    placeholder="Password"
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 10,
                      border: '1px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #cbd5e1',
                      background: '#f8fafc', color: '#475569', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Sign in with password
                  </button>
                </form>
              </div>
            )}

            {/* Trust signals */}
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, fontWeight: 500 }}>
                By signing in you agree to our{' '}
                <a href="/terms" style={{ color: '#14B8A6', textDecoration: 'underline', fontWeight: 700 }}>Terms</a>.
              </p>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '8px 16px', background: '#f8fafc', borderRadius: 999
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16, color: '#14B8A6' }}
                >
                  lock
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: '#64748b'
                }}>
                  Always Private by default
                </span>
              </div>
            </div>
          </div>

          <p style={{ marginTop: 32, textAlign: 'center', fontSize: 14, color: '#64748b', fontWeight: 500 }}>
            Don&apos;t have an account?{' '}
            <a href="/signin" style={{ color: '#14B8A6', fontWeight: 700, textDecoration: 'none' }}>
              Create collection
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
