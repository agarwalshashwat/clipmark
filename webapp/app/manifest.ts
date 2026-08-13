import type { MetadataRoute } from 'next';
import { APP_NAME } from './lib/constants';

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * Present so Android/Chrome has a name, a theme colour and real 192/512 icons
 * to work with when someone installs the site or adds it to a home screen —
 * without it the install prompt falls back to a screenshot of the page and the
 * bare hostname.
 *
 * Deliberately NOT a PWA claim: `display: 'browser'` keeps the site in a normal
 * tab. ClipMark's actual product is the Chrome extension; presenting the webapp
 * standalone would imply an offline-capable app that has no service worker
 * behind it.
 *
 * Icons carry `purpose: 'any'` only. A `maskable` icon needs the mark to sit
 * inside a 40% safe zone, and the artwork is a full-bleed rounded square —
 * declaring it maskable would let Android crop into the play mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — YouTube Timestamp Bookmarks`,
    short_name: APP_NAME,
    description:
      'Bookmark YouTube moments, quiz yourself with Active Recall, and export to Anki.',
    start_url: '/',
    display: 'browser',
    // --teal-500 / --gray-50, inlined: a manifest is fetched as JSON and
    // resolves no CSS custom properties.
    theme_color: '#14b8a6',
    background_color: '#f9fafb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
