import React from 'react';
import { createServerSupabase } from '@/lib/supabase';

export async function Navigation() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <nav style={{
      position: 'fixed', top: 0, width: '100%', zIndex: 100,
      background: 'var(--nav-bg)', backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1240, margin: '0 auto', padding: '0 24px', height: 80 }}>
        <a href="/" style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-1px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)' }}>
          <div style={{ width: 34, height: 34, background: 'var(--accent)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(20, 184, 166, 0.2)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'white' }}>bookmark</span>
          </div>
          Clipmark
        </a>
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/#features" style={{ color: 'var(--text-sub)', fontWeight: 600, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Features</a>
          <a href="/upgrade" style={{ color: 'var(--text-sub)', fontWeight: 600, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing</a>
          <a href="/affiliate" style={{ color: 'var(--text-sub)', fontWeight: 600, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Join Affiliate</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
          <a href="https://chrome.google.com/webstore" 
             aria-label="Add Clipmark to Chrome browser for free"
             className="nav-cta"
             style={{
            padding: '12px 24px',
            background: 'var(--accent)',
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
