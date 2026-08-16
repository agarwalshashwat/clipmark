import React from 'react';
import { createServerSupabase } from '@/lib/supabase';
import { CHROME_STORE_URL, SUPPORT_EMAIL } from '@/app/lib/constants';

// Auth-aware for one reason: the footer is the only sign-in route a phone has.
// Below 640px the header's "Log In" link is display:none, and until now nothing
// in the footer replaced it, so a returning mobile user had to know /signin.
// Mirrors the getUser() call Navigation already makes in this same layout, so
// marketing pages were dynamic either way.
export async function Footer() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

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
            {user
              ? <a href="/dashboard" className="footer-link">Your Dashboard</a>
              : <a href="/signin" className="footer-link">Sign In</a>}
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
            {/* The footer is the only nav entry point for /feedback: the header
                already carries three CTAs and a feedback link there would be
                competing with the install button for attention. */}
            <a href="/feedback?from=footer" className="footer-link">Send feedback</a>
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
