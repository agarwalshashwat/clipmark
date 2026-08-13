import type { MetadataRoute } from 'next';

import { APP_NAME } from './lib/constants';

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * ClipMark is not a PWA and deliberately does not claim to be one: the product
 * is a Chrome extension plus a companion site, and offering an "install app"
 * prompt for the marketing site would compete with the install CTA that
 * actually matters. `display: 'browser'` keeps browsers from treating this as an
 * installable app while still giving them proper icon and naming metadata —
 * which is what Android/Chrome use for a home-screen shortcut, and what makes
 * the 192/512 icons discoverable at all.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — YouTube Timestamp Bookmarks`,
    short_name: APP_NAME,
    description:
      'Bookmark YouTube moments, get AI summaries, and revisit key insights with spaced review.',
    start_url: '/',
    display: 'browser',
    background_color: '#ffffff',
    // Matches the logo artwork, not --teal-700: this paints the Android task
    // switcher and address bar, where the lighter brand teal is what reads as
    // ClipMark. Contrast rules for --accent-strong govern text, not chrome.
    theme_color: '#18af9e',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Separate entry, not `purpose: 'any maskable'` — a single icon claiming
        // both makes Android apply the adaptive-icon crop to artwork that has no
        // safe-zone padding, clipping the mark.
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
