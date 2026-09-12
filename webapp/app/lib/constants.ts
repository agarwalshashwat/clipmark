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

// Canonical Chrome Web Store listing, and the single source of truth for every
// "Add to Chrome" / install CTA on the site — never inline a store URL at a call
// site. The item id is permanent: it survives listing updates and stays valid
// once the listing goes public, so the fallback below is a real URL, not a
// placeholder.
//
// The env var exists so the listing can be re-pointed (a replacement item, or a
// staging/unlisted build) without a code change. It is NEXT_PUBLIC_*, so Next
// inlines it at BUILD time — changing it in Vercel needs a redeploy, not just a
// restart. Leave it unset to use the fallback.
// `||` and the trim are load-bearing, not defensive noise: `??` would let an env
// var that exists but is EMPTY (the state you get by clearing the field in the
// Vercel UI rather than deleting the variable) through as '', turning every
// install CTA into href="" — a button that silently reloads the page.
export const CHROME_STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL?.trim() ||
  'https://chromewebstore.google.com/detail/clipmark/iboippnihpcnnglgboaiedaiimbiolgg';

export const SUPPORT_EMAIL = 'support@clipmark.mithahara.com';
export const PRIVACY_EMAIL = 'privacy@clipmark.mithahara.com';
export const LEGAL_EMAIL   = 'legal@clipmark.mithahara.com';
