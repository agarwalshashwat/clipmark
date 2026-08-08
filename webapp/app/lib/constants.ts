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

// Canonical Chrome Web Store listing. The item id is permanent — it survives
// listing updates and stays valid once the listing is public — so it is safe to
// hardcode. Single source of truth for every "Add to Chrome" / install CTA.
export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/clipmark/iboippnihpcnnglgboaiedaiimbiolgg';

export const SUPPORT_EMAIL = 'support@clipmark.mithahara.com';
export const PRIVACY_EMAIL = 'privacy@clipmark.mithahara.com';
export const LEGAL_EMAIL   = 'legal@clipmark.mithahara.com';
