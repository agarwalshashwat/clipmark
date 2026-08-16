import React from 'react';
import { createServerSupabase } from '@/lib/supabase';
import { CHROME_STORE_URL } from '@/app/lib/constants';
import { ThemeToggle } from './ThemeToggle';

export async function Navigation() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // "Go Pro" used to render unconditionally — this component knew whether you
  // were signed in (that is what swaps Log In for Dashboard) but never whether
  // you had already paid, so subscribers were still sold the thing they own.
  // Pro users keep their route to billing via the Pricing link, which is the
  // same /upgrade page and renders the manage/cancel card.
  let isPro = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', user.id)
      .single();
    isPro = profile?.is_pro === true;
  }

  return (
    <nav style={{
      position: 'fixed', top: 0, width: '100%', zIndex: 100,
      background: 'var(--nav-bg)', backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1240, margin: '0 auto', padding: '0 24px', height: 80 }}>
        <a href="/" style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-1px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)' }}>
          <img src="/clipmark-logo.png" style={{ width: 34, height: 34, objectFit: 'contain' }} alt="ClipMark" />
          ClipMark
        </a>
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/#features" style={{ color: 'var(--text-sub)', fontWeight: 600, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Features</a>
          <a href="/upgrade" style={{ color: 'var(--text-sub)', fontWeight: 600, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing</a>
          <a href="/affiliate" style={{ color: 'var(--text-sub)', fontWeight: 600, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Join Affiliate</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Sits in the actions cluster rather than the links group so it stays
              reachable at 375px — .nav-links is the part that collapses. */}
          <ThemeToggle />
          {user ? (
            <a href="/dashboard" className="nav-login" style={{
              color: 'var(--text)',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
              padding: '10px 20px',
            }}>
              Dashboard
            </a>
          ) : (
            <a href="/signin" className="nav-login" style={{
              color: 'var(--text)',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
              padding: '10px 20px',
            }}>
              Log In
            </a>
          )}
          {!isPro && (
            <a href="/upgrade"
               className="nav-gopro"
               style={{
              padding: '12px 20px',
              background: 'transparent',
              color: 'var(--brand-ink)', borderRadius: 14, fontSize: 14, fontWeight: 800, textDecoration: 'none',
              border: '1px solid var(--accent)',
              transition: 'all 0.2s ease',
            }}>
              ✦ Go Pro
            </a>
          )}
          <a href={CHROME_STORE_URL}
             target="_blank"
             rel="noopener noreferrer"
             aria-label="Add ClipMark to Chrome browser for free"
             className="nav-cta"
             style={{
            padding: '12px 24px',
            background: 'var(--accent-strong)',
            boxShadow: '0 4px 14px 0 rgba(20, 184, 166, 0.39)',
            color: 'white', borderRadius: 14, fontSize: 14, fontWeight: 800, textDecoration: 'none',
            transition: 'all 0.2s ease',
          }}>
            <span className="desktop-text">Get the extension — Free</span>
            <span className="mobile-text">Get Extension</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
