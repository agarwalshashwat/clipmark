/**
 * The response-header rules Next serves the app with.
 *
 * Extracted from next.config.mjs so they can be asserted without booting a
 * server (same pure-fn-extraction pattern as extension/scripts/*-guard.mjs).
 * next.config.mjs imports `securityHeaders()` and returns it verbatim.
 *
 * The rule that most needs pinning is the /embed/* override: embeds are meant
 * to be iframed by third parties (X-Frame-Options: ALLOWALL +
 * frame-ancestors *), and that permissiveness must never widen to cover the
 * rest of the app. See webapp/tests/unit/headers.test.ts.
 *
 * Plain .mjs, not .ts: next.config.mjs is loaded by Node directly and cannot
 * import TypeScript.
 */

/** @typedef {{ source: string, headers: Array<{ key: string, value: string }> }} HeaderRule */

/** Path prefix whose pages are intentionally embeddable in third-party sites. */
export const EMBED_SOURCE = '/embed/:path*';

/** @returns {HeaderRule[]} the array next.config.mjs's `headers()` resolves to */
export function securityHeaders() {
  return [
    {
      // Security headers for all routes
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
    {
      // Allow Chrome extension to call the API.
      // CORS wildcard is intentional: Chrome extension background scripts
      // do not send an Origin header the same way browsers do, so restricting
      // to a specific origin would block extension requests.
      // Authorization header is required for Bearer token auth.
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
      ],
    },
    {
      // Allow embed pages to be used in iframes (overrides global X-Frame-Options: DENY)
      source: EMBED_SOURCE,
      headers: [
        { key: 'X-Frame-Options', value: 'ALLOWALL' },
        { key: 'Content-Security-Policy', value: "frame-ancestors *" },
      ],
    },
  ];
}

/**
 * Which of a rule's `source` patterns a pathname matches.
 *
 * Test support, not used at runtime — Next does its own matching. Deliberately
 * handles only the `/prefix/:param*` form this config uses; anything else throws
 * rather than silently mismatching, so a new pattern style has to come with an
 * update here instead of quietly passing.
 */
export function matchesSource(source, pathname) {
  const m = /^(.*)\/:[A-Za-z_]\w*\*$/.exec(source);
  if (!m) throw new Error(`unsupported header source pattern: ${source}`);
  const prefix = m[1]; // '' for '/:path*', '/api' for '/api/:path*'
  if (prefix === '') return pathname.startsWith('/');
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The headers a pathname ends up with, as a flat key → value map.
 *
 * Later rules win on a key collision — that is what makes the /embed/* entry an
 * override of the global X-Frame-Options: DENY, as its comment in this file says.
 */
export function headersForPath(pathname, rules = securityHeaders()) {
  /** @type {Record<string, string>} */
  const resolved = {};
  for (const rule of rules) {
    if (!matchesSource(rule.source, pathname)) continue;
    for (const { key, value } of rule.headers) resolved[key] = value;
  }
  return resolved;
}
