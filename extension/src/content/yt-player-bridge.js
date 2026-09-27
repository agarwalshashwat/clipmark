/**
 * Page-world bridge for YouTube's caption track list.
 *
 * ── The bug this exists to fix ───────────────────────────────────────────────
 * fetchTranscript() used to read `window.ytInitialPlayerResponse` directly. That
 * can never work: content scripts run in an ISOLATED world with their own JS
 * context, so a global assigned by one of YouTube's own page scripts is simply
 * not there. Measured on a real watch page:
 *
 *     MAIN world      typeof window.ytInitialPlayerResponse === 'object'
 *     ISOLATED world  typeof window.ytInitialPlayerResponse === 'undefined'
 *
 * so every transcript fetch silently returned zero segments, and everything
 * downstream (auto-label, auto-fill, the AI summary) quietly degraded to its
 * fallback. Nothing errored, which is why it survived this long.
 *
 * ── Why a MAIN-world content script ──────────────────────────────────────────
 * `"world": "MAIN"` (Chrome 111+) is the declarative way to get a script into
 * the page's own context — no injected <script> tag, no web_accessible_resource,
 * no new permission.
 *
 * It answers on demand rather than pushing once at load, because YouTube is an
 * SPA: `ytInitialPlayerResponse` is reassigned on each in-page navigation, so a
 * value captured at document_start would be the first video's for the rest of
 * the session.
 *
 * The payload crosses as a JSON STRING. CustomEvent `detail` is subject to the
 * structured-clone/isolated-world boundary, and passing a plain object across it
 * arrives as null in the receiving world.
 */
(function () {
  const REQUEST = 'clipmark:get-caption-tracks';
  const RESPONSE = 'clipmark:caption-tracks';

  document.addEventListener(REQUEST, () => {
    let tracks = null;
    try {
      tracks =
        window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer
          ?.captionTracks ?? null;
    } catch {
      tracks = null;
    }

    let detail = 'null';
    try {
      detail = JSON.stringify(tracks ?? null);
    } catch {
      detail = 'null'; // circular/unserialisable — treat as "no captions"
    }

    document.dispatchEvent(new CustomEvent(RESPONSE, { detail }));
  });
})();
