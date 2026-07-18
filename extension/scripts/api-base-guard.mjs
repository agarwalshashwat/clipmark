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
