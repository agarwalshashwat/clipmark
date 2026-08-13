import { MetadataRoute } from 'next';
import { APP_NAME } from '@/app/lib/constants';

/**
 * Web app manifest, served by Next at /manifest.webmanifest.
 *
 * Mostly here so Android/Chrome has a real icon and name to work with — the site
 * previously offered none, so an "add to home screen" produced a screenshot
 * thumbnail. The icons are the committed full-bleed PNGs (see
 * scripts/generate-icons.py), not the raw logo, which has transparent corners.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — YouTube Timestamp Bookmarks`,
    short_name: APP_NAME,
    description:
      'Bookmark the moments that matter in any YouTube video, then let Active Recall quiz you on them before replaying the clip.',
    start_url: '/',
    display: 'standalone',
    // --teal-500 / --surface from packages/design-system/tokens.css.
    theme_color: '#14b8a6',
    background_color: '#ffffff',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
