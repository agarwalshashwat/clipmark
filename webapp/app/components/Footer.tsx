import React from 'react';
import { SUPPORT_EMAIL } from '@/app/lib/constants';

export function Footer() {
  return (
    <footer style={{ padding: '48px 32px', borderTop: '1px solid rgba(26,28,29,0.06)', background: '#f3f3f4' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1C1D' }}>Clipmark</div>
          <div style={{ fontSize: 13, color: '#545f6c' }}>© {new Date().getFullYear()} Clipmark. The Digital Curator.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
          <a href="/upgrade" style={{ color: '#545f6c', fontSize: 14, textDecoration: 'none' }}>Pricing</a>
          <a href="/privacy" style={{ color: '#545f6c', fontSize: 14, textDecoration: 'none' }}>Privacy</a>
          <a href="/terms" style={{ color: '#545f6c', fontSize: 14, textDecoration: 'none' }}>Terms</a>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#545f6c', fontSize: 14, textDecoration: 'none' }}>Support</a>
        </div>
      </div>
    </footer>
  );
}
