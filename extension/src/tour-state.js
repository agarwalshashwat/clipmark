/**
 * Guided-tour state rules, shared by Sub-tour A (src/content/tour.js, on the
 * YouTube page) and Sub-tour B (src/popup/side-panel.js, the Active Recall
 * coach-mark). See docs/guided-tour-spec.md.
 *
 * Both surfaces are bundled ES modules, so they import this directly; the rules
 * live here rather than being duplicated so they stay decidable without a
 * browser (tests/unit/tour-state.test.mjs).
 *
 * The v1.0.1 trap this exists to close: driver.js fires `onDestroyed` for
 * *every* teardown, and v1.0.1 marked the tour seen from there unconditionally.
 * A YouTube SPA navigation mid-tour therefore burned the one-shot flag for good,
 * even though the user had neither finished nor dismissed anything. "Seen" now
 * means a step really rendered *and* the user was the one who ended it.
 */

/**
 * @param {{youtubeTour?: boolean}} tourState
 * @returns {boolean}
 */
export function shouldStartYoutubeTour(tourState) {
  return !tourState?.youtubeTour;
}

/**
 * @param {{stepShown?: boolean, abandonedForNavigation?: boolean}} outcome
 * @returns {boolean}
 */
export function shouldMarkTourSeen({ stepShown, abandonedForNavigation } = {}) {
  if (!stepShown) return false; // nothing ever rendered — the user saw no tour
  return !abandonedForNavigation; // torn down by a YouTube SPA nav, not by the user
}

/**
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function isYoutubeWatchUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)youtube\.com$/i.test(parsed.hostname)) return false;
    return parsed.pathname === '/watch' && !!parsed.searchParams.get('v');
  } catch {
    return false;
  }
}

/**
 * Sub-tour B auto-runs on the first side-panel open — except while Sub-tour A is
 * still pending on the YouTube tab in front of the user. The spec has A hand off
 * to B ("open the ClipMark icon in your toolbar"); firing B first both spoils
 * that handoff and puts two coach-marks on screen at once. Deferring is safe
 * because the panel re-runs this when `youtubeTour` flips (see the storage
 * listener in side-panel.js).
 *
 * @param {{tourState?: object, activeTabUrl?: string|null}} input
 * @returns {boolean}
 */
export function shouldAutoRunSidePanelTour({ tourState, activeTabUrl } = {}) {
  if (tourState?.sidePanelTour) return false;
  if (isYoutubeWatchUrl(activeTabUrl) && !tourState?.youtubeTour) return false;
  return true;
}

/**
 * True when a `chrome.storage.onChanged` entry for `tourState` shows Sub-tour A
 * completing — the moment Sub-tour B should take over.
 *
 * @param {{oldValue?: object, newValue?: object}} change
 * @returns {boolean}
 */
export function didYoutubeTourComplete(change) {
  if (!change) return false;
  return !change.oldValue?.youtubeTour && !!change.newValue?.youtubeTour;
}
