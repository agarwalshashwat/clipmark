import React from 'react';
import { CHROME_STORE_URL, SUPPORT_EMAIL } from '@/app/lib/constants';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-brand">
          <div className="footer-logo">ClipMark</div>
          <div className="footer-desc">Building the ultimate digital second brain for YouTube learners and curators.</div>
        </div>
        <div className="footer-links-grid">
          <div className="footer-links-col">
            <span className="footer-links-title">Product</span>
            <a href="/upgrade" className="footer-link">Pricing</a>
            <a href="/affiliate" className="footer-link">Affiliate Program</a>
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" className="footer-link">Chrome Extension</a>
          </div>
          <div className="footer-links-col">
            <span className="footer-links-title">Learn</span>
            <a href="/active-recall-youtube" className="footer-link">Active Recall from YouTube</a>
            <a href="/spaced-repetition-youtube" className="footer-link">Spaced Repetition for YouTube</a>
            <a href="/youtube-flashcards" className="footer-link">YouTube Flashcards</a>
            <a href="/youtube-to-anki" className="footer-link">YouTube to Anki</a>
            <a href="/faq" className="footer-link">FAQ</a>
            <a href="/switch-from-videosegments" className="footer-link">Switching from VideoSegments</a>
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
          © {new Date().getFullYear()} ClipMark. Built with ❤️ for curators.
        </div>
      </div>
    </footer>
  );
}
