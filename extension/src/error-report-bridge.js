/**
 * Content-script error bridge — classic script, no imports.
 *
 * Content scripts share one global scope and cannot use ES imports, so they
 * can't pull in src/error-reporting.js. Instead this registers a global that
 * forwards serialised errors to the background service worker, which owns the
 * only Sentry sender in the extension.
 *
 * Forwarding rather than sending directly also means the noise filter lives in
 * one place, and we never ship the reporter into every YouTube page.
 *
 * Registers on globalThis because the crxjs build wraps each content-script
 * entry in its own IIFE — see scripts/content-globals-guard.mjs.
 */
(function () {
  const MESSAGE_TYPE = 'CLIPMARK_REPORT_ERROR';

  /**
   * Injection marker — read by the background worker's install-time backfill
   * (src/background/install-injection.js) to avoid injecting a second copy of
   * the content scripts into a tab that already has a live one.
   *
   * Stamped here because this file is the *first* content script in the
   * manifest, so the marker is set whichever route injected us: Chrome's own
   * declarative injection on navigation, or chrome.scripting on install.
   *
   * The value is the version that injected it, not a boolean: after an update
   * the previous version's scripts are still in the page with an invalidated
   * chrome.runtime, and those must read as stale rather than "already fine".
   */
  try {
    globalThis.clipmarkContentScriptVersion = chrome.runtime.getManifest().version;
  } catch {
    globalThis.clipmarkContentScriptVersion = 'unknown';
  }

  function serialiseError(error) {
    return {
      name: error?.name || 'Error',
      message: error?.message ?? String(error ?? 'Unknown error'),
      stack: typeof error?.stack === 'string' ? error.stack : '',
    };
  }

  function forward(error, extra) {
    try {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPE, error: serialiseError(error), extra }, () => {
        // Reading lastError suppresses "Unchecked runtime.lastError" console
        // noise when the worker is asleep or the extension was just reloaded.
        void chrome.runtime.lastError;
      });
    } catch {
      // "Extension context invalidated" after a reload — the page still has our
      // old script injected. Nothing to report to, and nothing we can do.
    }
  }

  /** Report a handled error explicitly: clipmarkReportError(err, { where: 'saveBookmark' }). */
  globalThis.clipmarkReportError = forward;

  /**
   * Only forward errors whose stack points at our own extension files.
   *
   * This is the load-bearing filter: we run inside youtube.com, so this handler
   * also fires for YouTube's own exceptions. Without the check, the Sentry
   * project fills with unfixable third-party errors and the free-tier quota is
   * gone within hours.
   */
  globalThis.addEventListener('error', (event) => {
    if (typeof event?.filename !== 'string' || !event.filename.startsWith('chrome-extension://')) return;
    forward(event.error ?? new Error(event.message ?? 'Unknown error'), {
      source: event.filename,
      line: event.lineno,
    });
  });

  globalThis.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    // A rejection carries no filename, so attribute it via the stack instead.
    // No extension frame → assume it's the host page's and drop it.
    const stack = typeof reason?.stack === 'string' ? reason.stack : '';
    if (!stack.includes('chrome-extension://')) return;
    forward(reason);
  });
})();
