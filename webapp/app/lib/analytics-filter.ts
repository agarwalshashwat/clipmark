/**
 * Which pageviews count as a *website visit*.
 *
 * Split out of components/SiteAnalytics.tsx so it can be unit-tested without
 * pulling in React or the analytics client: this is the one piece of that
 * component with logic worth asserting, and getting it wrong is silent — the
 * numbers are simply wrong, with nothing to notice.
 */

/** Fallback base for the rare relative event URL; never used for its host. */
const URL_BASE = 'https://clipmark.mithahara.com';

/**
 * True for /embed/* pageviews.
 *
 * /embed/* is deliberately framed by third-party sites (X-Frame-Options is
 * ALLOWALL there — see lib/security-headers.mjs), so each impression is someone
 * else's page rendering, not a visit to ours. Counting them would inflate every
 * top-line visitor number with embed traffic and make the marketing metric
 * useless exactly as embeds start working.
 */
export function isEmbedView(url: string): boolean {
  try {
    return new URL(url, URL_BASE).pathname.startsWith('/embed/');
  } catch {
    // An unparseable URL is not a reason to drop a real pageview.
    return false;
  }
}
