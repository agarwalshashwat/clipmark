export const APP_NAME      = 'ClipMark';

// Trailing slashes are stripped defensively: the production NEXT_PUBLIC_APP_URL is
// set WITH one, and because most callers build URLs by concatenating `/path`, that
// produced `https://clipmark.mithahara.com//clipmark-logo.png` for every og:image,
// `//<path>` for every sitemap <loc>, and `//sitemap.xml` in robots.txt. Those all
// 308-redirect rather than 404, so nothing broke visibly — but a sitemap <loc> that
// redirects gets reported as "Page with redirect" instead of being indexed, and the
// audit notes some link-preview scrapers don't follow the hop for og:image.
// Verified on the deployed preview, not locally: a local build without the trailing
// slash in the env var cannot reproduce it (docs/gtm/SEO-AUDIT.md §1.6, quick win #6).
export const APP_URL       = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com')
  .replace(/\/+$/, '');

// Canonical Chrome Web Store listing — verified live and publicly reachable.
// The item id is permanent: it survives listing updates and store-listing edits,
// so it is safe to hardcode as the default.
//
// Single source of truth for every "Add to Chrome" / install CTA. Nothing in the
// webapp should ever link to `chrome.google.com/webstore` (the store *root*, a
// generic search page) — import this instead. `tests/unit/install-cta.test.ts`
// fails the build if a bare store-root link reappears.
//
// The NEXT_PUBLIC_ override exists so a preview deploy can point CTAs at a draft
// or region-specific listing without a code change. It is inlined at build time
// (like every NEXT_PUBLIC_ var), so changing it needs a redeploy, not a restart.
export const CHROME_STORE_URL =
  (process.env.NEXT_PUBLIC_CHROME_STORE_URL || '').trim() ||
  'https://chromewebstore.google.com/detail/clipmark/iboippnihpcnnglgboaiedaiimbiolgg';

export const SUPPORT_EMAIL = 'support@clipmark.mithahara.com';
export const PRIVACY_EMAIL = 'privacy@clipmark.mithahara.com';
export const LEGAL_EMAIL   = 'legal@clipmark.mithahara.com';
