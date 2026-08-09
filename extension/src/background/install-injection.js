/**
 * Install-time content-script backfill — pure decision logic.
 *
 * Chrome only injects `content_scripts` declared in the manifest on *navigation*.
 * A tab that was already open when the extension was installed or updated keeps
 * running without them until the user reloads it, so anything that messages the
 * content script (the side panel, the context menus, the toolbar commands) fails
 * with "Content script not available" until then — the v1.0.1 first-install bug.
 *
 * The background worker fixes that by replaying the manifest's own
 * `content_scripts` entries through `chrome.scripting` on `onInstalled`. All the
 * Chrome API calls live in background.js; everything decidable without a browser
 * lives here so it can be unit-tested (tests/unit/install-injection.test.mjs).
 *
 * Deliberately drives off `chrome.runtime.getManifest()` at runtime rather than a
 * hardcoded file list: the crxjs build rewrites content-script paths, so the
 * shipped manifest is the only thing that knows the real ones.
 */

/**
 * Global that every injected content script stamps with the version that
 * injected it (see src/error-report-bridge.js, the first content script to run).
 *
 * Read back through `chrome.scripting.executeScript` before injecting so we skip
 * tabs that already have a live content script. Stamping the *version* rather
 * than a bare boolean means an orphaned script left behind by a previous version
 * — still in the page, but with an invalidated `chrome.runtime` — reads as stale
 * and gets replaced instead of being mistaken for a working one.
 */
export const CONTENT_SCRIPT_MARKER = 'clipmarkContentScriptVersion';

/** onInstalled reasons that can leave already-open tabs without a content script. */
export const BACKFILL_REASONS = ['install', 'update'];

/**
 * Compile a Chrome match pattern into a RegExp.
 *
 * Only the subset the manifest actually uses is supported (`*://*.youtube.com/*`
 * and friends) plus `<all_urls>`; anything unparseable returns null so the caller
 * treats it as "does not match" rather than accidentally matching everything.
 *
 * @param {string} pattern
 * @returns {RegExp|null}
 */
export function matchPatternToRegExp(pattern) {
  if (typeof pattern !== 'string' || !pattern) return null;
  if (pattern === '<all_urls>') return /^(?:https?|file|ftp):\/\//;

  const parts = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!parts) return null;
  const [, scheme, host, path] = parts;

  const schemeRe = scheme === '*' ? 'https?' : scheme;

  let hostRe;
  if (host === '*') {
    hostRe = '[^/]+';
  } else if (host.startsWith('*.')) {
    // `*.youtube.com` matches youtube.com itself and any subdomain of it.
    hostRe = `(?:[^/]+\\.)?${escapeRe(host.slice(2))}`;
  } else if (host.includes('*')) {
    return null; // a wildcard anywhere else in the host is not a legal pattern
  } else {
    hostRe = escapeRe(host);
  }

  const pathRe = escapeRe(path).replace(/\\\*/g, '.*');

  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`);
}

function escapeRe(str) {
  return str.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '\\*');
}

/**
 * @param {string} url
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function urlMatchesAnyPattern(url, patterns) {
  if (typeof url !== 'string' || !Array.isArray(patterns)) return false;
  return patterns.some((pattern) => {
    const re = matchPatternToRegExp(pattern);
    return !!re && re.test(url);
  });
}

/**
 * Tabs we can even attempt to script.
 *
 * `chrome://`, the Web Store and other extensions' pages always refuse, and a
 * discarded tab has no document to inject into (Chrome will inject on its own
 * when the tab is restored). Filtering them here keeps the log clean instead of
 * relying on a swallowed exception per tab.
 *
 * @param {{id?: number, url?: string, discarded?: boolean}} tab
 * @returns {boolean}
 */
export function isInjectableTab(tab) {
  if (!tab || typeof tab.id !== 'number' || tab.id < 0) return false;
  if (tab.discarded === true) return false;
  return typeof tab.url === 'string' && /^https?:\/\//i.test(tab.url);
}

/**
 * Work out what to inject where, from the manifest's own content_scripts.
 *
 * A tab matched by several entries gets their files unioned in declaration
 * order — load order is load-bearing (the error bridge and constants.js must run
 * before content.js; see tests/unit/manifest.test.mjs).
 *
 * @param {{contentScripts?: Array, tabs?: Array}} input
 * @returns {Array<{tabId: number, url: string, js: string[], css: string[]}>}
 */
export function planInjections({ contentScripts = [], tabs = [] } = {}) {
  const plans = [];

  for (const tab of tabs) {
    if (!isInjectableTab(tab)) continue;

    const js = [];
    const css = [];
    for (const entry of contentScripts) {
      if (!entry || !urlMatchesAnyPattern(tab.url, entry.matches || [])) continue;
      if (urlMatchesAnyPattern(tab.url, entry.exclude_matches || [])) continue;
      for (const file of entry.js || []) if (!js.includes(file)) js.push(file);
      for (const file of entry.css || []) if (!css.includes(file)) css.push(file);
    }

    if (js.length || css.length) plans.push({ tabId: tab.id, url: tab.url, js, css });
  }

  return plans;
}

/**
 * Every distinct match pattern across the manifest's content scripts — the
 * `chrome.tabs.query` filter, so the query mirrors the manifest exactly.
 *
 * @param {Array} contentScripts
 * @returns {string[]}
 */
export function contentScriptMatchPatterns(contentScripts = []) {
  const patterns = [];
  for (const entry of contentScripts) {
    for (const pattern of entry?.matches || []) {
      if (!patterns.includes(pattern)) patterns.push(pattern);
    }
  }
  return patterns;
}

/**
 * Double-injection guard: inject only when the page has no marker at all, or
 * carries one from a previous version (an orphaned script after an update).
 *
 * @param {unknown} markerValue - value of CONTENT_SCRIPT_MARKER read from the page
 * @param {string} currentVersion - the running extension's manifest version
 * @returns {boolean}
 */
export function shouldInjectIntoTab(markerValue, currentVersion) {
  if (typeof markerValue !== 'string' || !markerValue) return true;
  return markerValue !== currentVersion;
}

/**
 * @param {string|undefined} reason - chrome.runtime.onInstalled details.reason
 * @returns {boolean}
 */
export function shouldBackfillOnInstalled(reason) {
  return BACKFILL_REASONS.includes(reason);
}
