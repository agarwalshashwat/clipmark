/**
 * Which pageviews count as a *website visit*.
 *
 * Kept out of the client component so it can be unit-tested without pulling in
 * React or the analytics client. It is the one piece of that component with
 * logic worth asserting, and getting it wrong fails silently — the visitor
 * numbers are simply wrong, with nothing to notice.
 *
 * (Approach adopted from PR #118 during the consolidation of #118/#119/#120.)
 */

/** Fallback base for the rare relative event URL; never used for its host. */
const URL_BASE = 'https://clipmark.mithahara.com';

/**
 * True for /embed/* pageviews.
 *
 * /embed/* is deliberately framed by third-party sites — X-Frame-Options is
 * ALLOWALL there, see lib/security-headers.mjs — so each impression is someone
 * else's page rendering, not a visit to ours. Counting them would inflate every
 * top-line visitor number with embed traffic, and would do it exactly as embeds
 * start working, which is when the marketing metric most needs to be trusted.
 */
export function isEmbedView(url: string): boolean {
  try {
    return new URL(url, URL_BASE).pathname.startsWith('/embed/');
  } catch {
    // An unparseable URL is not a reason to drop a real pageview.
    return false;
  }
}
