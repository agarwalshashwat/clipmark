/**
 * Pure guard used by the extension build to prevent shipping a dev API base.
 *
 * Extracted from vite.config.mjs so it can be unit-tested in isolation
 * (audit gap #7). No filesystem or Vite dependency — takes the source text of
 * config.js and returns the validated API_BASE, throwing on a dev value.
 */

/**
 * @param {string} source - the text contents of extension/src/config.js
 * @returns {string} the validated production API_BASE
 * @throws if API_BASE is missing or points at a local dev server
 */
export function assertProdApiBase(source) {
  const match = source.match(/API_BASE\s*=\s*['"`]([^'"`]*)['"`]/);
  if (!match) {
    throw new Error('Could not find API_BASE in src/config.js.');
  }
  const apiBase = match[1];
  if (/localhost|127\.0\.0\.1/i.test(apiBase)) {
    throw new Error(
      `API_BASE points at a local dev server ("${apiBase}"). Set it to the ` +
        'production URL in src/config.js before building for release.',
    );
  }
  return apiBase;
}

/**
 * Finds source files that bake a literal "<apiBase>/api/…" endpoint URL
 * directly into a string, instead of deriving the base from `API_BASE` at
 * runtime and appending the path separately.
 *
 * This is the exact shape of the bug fixed for REMINDERS_API in
 * background.js: `const REMINDERS_API = 'https://clipmark.mithahara.com/api/reminders'`
 * ignores config.js entirely, so pointing config.js at a local dev server
 * for local testing still hit production for that call. The safe pattern —
 * `` const API_BASE = globalThis.API_BASE || 'https://clipmark.mithahara.com'; ``
 * followed by `` `${API_BASE}/api/reminders` `` — never matches here, because
 * the bare origin and the `/api/` path never sit inside the same string
 * literal. That's also why config.js/config.example.js themselves (which
 * only ever hold the bare origin) are excluded rather than specially cased.
 *
 * @param {string} apiBase - the production origin, from assertProdApiBase
 * @param {{path: string, source: string}[]} files - candidate source files
 *   (already excluding src/config.js and src/config.example.js)
 * @returns {string[]} paths that contain a hardcoded "<apiBase>/api/…" URL
 */
export function findHardcodedApiUrls(apiBase, files) {
  const escaped = apiBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}/api/`);
  return files.filter((f) => pattern.test(f.source)).map((f) => f.path);
}

/**
 * @param {string} apiBase - the production origin, from assertProdApiBase
 * @param {{path: string, source: string}[]} files - candidate source files
 *   (already excluding src/config.js and src/config.example.js)
 * @returns {true}
 * @throws if any file hardcodes a "<apiBase>/api/…" endpoint URL
 */
export function assertNoHardcodedApiUrls(apiBase, files) {
  const offenders = findHardcodedApiUrls(apiBase, files);
  if (offenders.length) {
    throw new Error(
      `Found a hardcoded "${apiBase}/api/…" URL outside src/config.js in: ${offenders.join(', ')}. ` +
        'A literal endpoint bypasses API_BASE entirely, so a dev config.js pointed at localhost ' +
        "would still hit production for that call. Derive the base with `globalThis.API_BASE || " +
        `'${apiBase}'\` (see dashboard.js) and append the path via template literal instead.`,
    );
  }
  return true;
}
