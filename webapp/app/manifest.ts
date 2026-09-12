import { MetadataRoute } from 'next';
import { APP_NAME } from '@/app/lib/constants';

/**
 * Web app manifest, served by Next at /manifest.webmanifest.
 *
 * Mostly here so Android/Chrome has a real icon and name to work with — the site
 * previously offered none, so an "add to home screen" produced a screenshot
 * thumbnail. The icons are the committed full-bleed PNGs (see
 * scripts/generate-icons.py), not the raw logo, which has transparent corners.
 *
 * `display: 'browser'`, deliberately: ClipMark is not a PWA. The product is a
 * Chrome extension plus a companion site, there is no service worker behind an
 * offline claim, and an "install app" prompt for the marketing site would
 * compete with the install CTA that actually matters. This still gives browsers
 * proper naming and icon metadata for a home-screen shortcut.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — YouTube Timestamp Bookmarks`,
    short_name: APP_NAME,
    description:
      'Bookmark the moments that matter in any YouTube video, then let Active Recall quiz you on them before replaying the clip.',
    start_url: '/',
    display: 'browser',
    // --teal-500 / --surface from packages/design-system/tokens.css. A manifest
    // is fetched as JSON and resolves no CSS custom properties, so these are
    // inlined rather than var() references.
    theme_color: '#14b8a6',
    background_color: '#ffffff',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        // Its own entry rather than `purpose: 'any maskable'` on the icons above:
        // one icon claiming both makes Android apply the adaptive-icon crop to
        // artwork with no safe-zone padding, clipping the mark. This variant is
        // generated with the mark inset to ~52% so the crop can't reach it.
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
