import React from 'react';

export function Navigation() {
  return (
    <nav style={{
      position: 'fixed', top: 0, width: '100%', zIndex: 50,
      background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 1px 0 rgba(26,28,29,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '0 32px', height: 72 }}>
        <a href="/" style={{ fontSize: 22, fontWeight: 800, color: '#14B8A6', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px', textDecoration: 'none' }}>
          Clipmark
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <a href="/#features" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Features</a>
          <a href="/#how-it-works" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>How It Works</a>
          <a href="/upgrade" style={{ color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Pricing</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/signin" style={{
            color: '#545f6c', fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 600, fontSize: 14, textDecoration: 'none',
            padding: '10px 16px',
          }}>
            Log In
          </a>
          <a href="https://chrome.google.com/webstore" 
             aria-label="Add Clipmark to Chrome browser for free"
             style={{
            padding: '10px 22px',
            background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
            color: 'white', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
          }}>
            Add to Chrome — Free
          </a>
        </div>
      </div>
    </nav>
  );
}
