import React from 'react';
import { createServerSupabase } from '@/lib/supabase';

export async function Navigation() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <nav style={{
      position: 'fixed', top: 0, width: '100%', zIndex: 100,
      background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid rgba(15, 23, 42, 0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1240, margin: '0 auto', padding: '0 24px', height: 80 }}>
        <a href="/" style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-1px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, background: '#14B8A6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'white' }}>bookmark</span>
          </div>
          Clipmark
        </a>
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/#features" style={{ color: '#475569', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Features</a>
          <a href="/upgrade" style={{ color: '#475569', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing</a>
          <a href="/affiliate" style={{ color: '#475569', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Join Affiliate</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {user ? (
            <a href="/dashboard" className="nav-login" style={{
              color: '#1e293b', fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800, fontSize: 14, textDecoration: 'none',
              padding: '10px 20px',
            }}>
              Dashboard
            </a>
          ) : (
            <a href="/signin" className="nav-login" style={{
              color: '#1e293b', fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800, fontSize: 14, textDecoration: 'none',
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
            background: '#14B8A6',
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
