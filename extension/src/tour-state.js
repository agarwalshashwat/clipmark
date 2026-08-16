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
 * The one-shot flag, read across BOTH storage areas.
 *
 * `chrome.storage.sync` is the home of the flag — it is what makes "seen" follow
 * the user between machines. But sync can refuse a write: it is capped
 * (QUOTA_BYTES, ~100KB, shared with every `bm_{videoId}` bookmark), rate-limited
 * per minute, and simply unavailable when the profile has sync turned off. The
 * write path treats a failed write as "not stored yet" and retries on the next
 * video — correct in isolation, but if the write can never succeed, the tour
 * re-shows on EVERY video with nothing the user can do about it. That is the
 * trap this closes: a local mirror is written when sync refuses, and either area
 * saying "seen" is believed.
 *
 * Deliberately OR, not merge-and-prefer-sync: the mirror only ever gets written
 * after the user genuinely ended a tour, so it can't manufacture a false "seen",
 * and a sync value arriving later from another machine is equally trusted.
 *
 * @param {{syncState?: {youtubeTour?: boolean}, localState?: {youtubeTour?: boolean}}} areas
 * @returns {boolean}
 */
export function hasSeenYoutubeTour({ syncState, localState } = {}) {
  return !!(syncState?.youtubeTour || localState?.youtubeTour);
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
