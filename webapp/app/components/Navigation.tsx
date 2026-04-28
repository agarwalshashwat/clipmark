import React from 'react';

export function Navigation() {
  return (
    <nav style={{
      position: 'fixed', top: 0, width: '100%', zIndex: 50,
      background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 1px 0 rgba(26,28,29,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '0 20px', height: 64 }}>
        <a href="/" style={{ fontSize: 22, fontWeight: 800, color: '#14B8A6', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px', textDecoration: 'none', flexShrink: 0 }}>
          Clipmark
        </a>
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <a href="/#features" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Features</a>
          <a href="/#how-it-works" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>How It Works</a>
          <a href="/upgrade" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Pricing</a>
          <a href="/affiliate" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Affiliate</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/signin" className="nav-login" style={{
            color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 600, fontSize: 14, textDecoration: 'none',
            padding: '10px 16px', whiteSpace: 'nowrap',
          }}>
            Log In
          </a>
          <a href="https://chrome.google.com/webstore" 
             aria-label="Add Clipmark to Chrome browser for free"
             className="nav-cta"
             style={{
            padding: '10px 22px',
            background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
            color: 'white', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}>
            Build Your Second Brain — Free
          </a>
          <a href="https://chrome.google.com/webstore"
             aria-label="Add Clipmark to Chrome for free"
             className="nav-cta-mobile"
             style={{
            padding: '9px 16px',
            background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
            color: 'white', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}>
            Get Free
          </a>
        </div>
      </div>
    </nav>
  );
}
