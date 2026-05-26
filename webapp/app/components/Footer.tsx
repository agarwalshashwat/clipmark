import React from 'react';
import { SUPPORT_EMAIL } from '@/app/lib/constants';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-brand">
          <div className="footer-logo">Clipmark</div>
          <div className="footer-desc">Building the ultimate digital second brain for YouTube learners and curators.</div>
        </div>
        <div className="footer-links-grid">
          <div className="footer-links-col">
            <span className="footer-links-title">Product</span>
            <a href="/upgrade" className="footer-link">Pricing</a>
            <a href="/affiliate" className="footer-link">Affiliate Program</a>
            <a href="https://chrome.google.com/webstore" className="footer-link">Chrome Extension</a>
          </div>
          <div className="footer-links-col">
            <span className="footer-links-title">Legal</span>
            <a href="/privacy" className="footer-link">Privacy Policy</a>
            <a href="/terms" className="footer-link">Terms of Service</a>
          </div>
          <div className="footer-links-col">
            <span className="footer-links-title">Contact</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="footer-link">Support Email</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="footer-bottom-content">
          © {new Date().getFullYear()} Clipmark. Built with ❤️ for curators.
        </div>
      </div>
    </footer>
  );
}
