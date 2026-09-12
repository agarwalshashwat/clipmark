/**
 * The uninstall-feedback URL.
 *
 * Chrome opens the URL registered with chrome.runtime.setUninstallURL() in a new
 * tab when the user removes the extension. There is no way to show anything
 * inside the extension at that moment — no popup, no content script, the worker
 * is already gone — so the hosted page at /uninstall IS the survey.
 *
 * The URL-building is pure and lives here (rather than inline in background.js)
 * for the same reason install-injection.js does: it is the part with rules worth
 * asserting, and it can then be unit-tested without a browser.
 *
 * PRIVACY: the query string carries the extension version and nothing else. No
 * user id, no install id, no email, no bookmark count. That is a deliberate
 * limit, not an oversight — the version is what makes a complaint actionable
 * ("everyone leaving is on 1.0.4"), and anything more would be tracking someone
 * who has just chosen to remove the product.
 */

/** Path of the hosted survey. Mirrors webapp/app/(marketing)/uninstall/page.tsx. */
export const UNINSTALL_PATH = '/uninstall';

/** Fallback origin, matching the convention in src/auth-token.module.js. */
const DEFAULT_BASE = 'https://clipmark.mithahara.com';

/**
 * A Chrome manifest version is always dot-separated integers, but this is
 * validated rather than trusted: it is the one value that crosses from the
 * extension into a URL, and the webapp applies the same rule on the way in
 * (normaliseVersion in app/lib/uninstall-feedback.ts). Anything else is dropped
 * and the URL is sent without a version — never with junk attached.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function normaliseVersion(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 32) return null;
  return /^\d+(\.\d+){0,3}$/.test(trimmed) ? trimmed : null;
}

/**
 * @param {{ apiBase?: string, version?: unknown }} [options]
 * @returns {string} Absolute URL, with ?v= only when the version is valid.
 */
export function buildUninstallUrl({ apiBase, version } = {}) {
  // Trailing slashes stripped for the same reason app/lib/constants.ts does it:
  // a base set with one turns `${base}/uninstall` into a `//uninstall` that
  // 308-redirects instead of resolving directly.
  const base = (typeof apiBase === 'string' && apiBase.trim() ? apiBase.trim() : DEFAULT_BASE)
    .replace(/\/+$/, '');

  const normalised = normaliseVersion(version);
  return normalised
    ? `${base}${UNINSTALL_PATH}?v=${encodeURIComponent(normalised)}`
    : `${base}${UNINSTALL_PATH}`;
}

/**
 * Register the URL with Chrome. Safe to call repeatedly — the call is
 * idempotent, and it runs on both install and startup because the registration
 * belongs to the worker's lifetime, not to a one-off install event.
 *
 * Never throws: failing to register a survey URL must not be able to break
 * startup for a user who is not uninstalling anything.
 *
 * @param {{ runtime?: typeof chrome.runtime, apiBase?: string }} [deps]
 * @returns {Promise<string|null>} The URL registered, or null if it could not be.
 */
export async function registerUninstallUrl({ runtime, apiBase } = {}) {
  const api = runtime ?? (typeof chrome !== 'undefined' ? chrome.runtime : undefined);
  if (!api?.setUninstallURL) return null;

  try {
    const version = api.getManifest?.().version;
    const url = buildUninstallUrl({
      apiBase: apiBase ?? globalThis.API_BASE,
      version,
    });
    await api.setUninstallURL(url);
    return url;
  } catch {
    return null;
  }
}
