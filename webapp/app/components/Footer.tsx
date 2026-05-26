import React from 'react';
import { SUPPORT_EMAIL } from '@/app/lib/constants';

export function Footer() {
  return (
    <footer style={{ padding: '80px 32px 48px', borderTop: '1px solid #f1f5f9', background: '#ffffff' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#0f172a', letterSpacing: '-0.5px' }}>Clipmark</div>
          <div style={{ fontSize: 13, color: '#64748b', maxWidth: 240, lineHeight: 1.6 }}>Building the ultimate digital second brain for YouTube learners and curators.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product</span>
            <a href="/upgrade" style={{ color: '#475569', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Pricing</a>
            <a href="/affiliate" style={{ color: '#475569', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Affiliate Program</a>
            <a href="https://chrome.google.com/webstore" style={{ color: '#475569', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Chrome Extension</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legal</span>
            <a href="/privacy" style={{ color: '#475569', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</a>
            <a href="/terms" style={{ color: '#475569', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Terms of Service</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#475569', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Support Email</a>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1280, margin: '64px auto 0', padding: '24px 0 0', borderTop: '1px solid #f8fafc', fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
        © {new Date().getFullYear()} Clipmark. Built with ❤️ for curators.
      </div>
    </footer>
  );
}
