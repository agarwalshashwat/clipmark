/**
 * Bridge from the web app to the Clipmark extension.
 *
 * Chrome injects a limited `chrome.runtime` into pages listed in the extension's
 * `externally_connectable` manifest entry, which lets this origin message the
 * background service worker directly. We use it to start an Active Recall
 * session from the web dashboard — the session itself still runs in the
 * extension, which is the only thing that can drive the YouTube player.
 *
 * Two things are needed for the bridge to work:
 *   1. the page origin must be in `externally_connectable` (production domain
 *      only — localhost was removed during the launch hardening, so this is a
 *      no-op in local dev), and
 *   2. we must know the extension's id. Chrome gives it to us during the OAuth
 *      handoff (`/auth/extension-success?extensionId=…`), so we persist it then;
 *      NEXT_PUBLIC_EXTENSION_ID can supply/override it once published.
 *
 * Every helper degrades quietly: if the extension isn't installed or the id is
 * unknown, callers fall back to a plain link.
 */

const EXTENSION_ID_KEY = 'clipmark_extension_id';
// Chrome extension ids are 32 chars, a–p.
const EXTENSION_ID_RE = /^[a-p]{32}$/;

type ChromeRuntimeLike = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: unknown) => void,
  ) => void;
  lastError?: { message?: string };
};

function runtime(): ChromeRuntimeLike | null {
  if (typeof window === 'undefined') return null;
  const cr = (window as unknown as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime;
  return typeof cr?.sendMessage === 'function' ? cr : null;
}

/** Persist the extension id handed to us during the OAuth handoff. */
export function rememberExtensionId(id: string | null | undefined): void {
  if (typeof window === 'undefined' || !id || !EXTENSION_ID_RE.test(id)) return;
  try {
    window.localStorage.setItem(EXTENSION_ID_KEY, id);
  } catch {
    /* private mode / storage disabled — the bridge just stays unavailable */
  }
}

/** The extension id, if we've seen one (or it's configured at build time). */
export function getExtensionId(): string | null {
  const configured = process.env.NEXT_PUBLIC_EXTENSION_ID;
  if (configured && EXTENSION_ID_RE.test(configured)) return configured;
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(EXTENSION_ID_KEY);
    return stored && EXTENSION_ID_RE.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** True when we could plausibly message the extension right now. */
export function isExtensionBridgeAvailable(): boolean {
  return runtime() !== null && getExtensionId() !== null;
}

export type StartRecallResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Ask the extension to start Active Recall for a video.
 *
 * `bookmarkIds` are the ones the dashboard believes are due — the extension
 * treats them as a filter over its own stored bookmarks, never as content.
 */
export async function startRecallInExtension(
  videoId: string,
  bookmarkIds?: number[],
): Promise<StartRecallResult> {
  const cr = runtime();
  const extensionId = getExtensionId();
  if (!cr || !extensionId) return { ok: false, error: 'extension_unavailable' };

  return new Promise<StartRecallResult>(resolve => {
    let settled = false;
    const done = (r: StartRecallResult) => { if (!settled) { settled = true; resolve(r); } };

    // Chrome never calls back if the extension is gone mid-flight.
    const timer = setTimeout(() => done({ ok: false, error: 'timeout' }), 5000);

    try {
      cr.sendMessage(extensionId, { type: 'START_RECALL', videoId, bookmarkIds }, response => {
        clearTimeout(timer);
        if (cr.lastError) { done({ ok: false, error: cr.lastError.message || 'send_failed' }); return; }
        const r = response as StartRecallResult | undefined;
        done(r?.ok ? r : { ok: false, error: (r as { error?: string })?.error || 'no_response' });
      });
    } catch (err) {
      clearTimeout(timer);
      done({ ok: false, error: err instanceof Error ? err.message : 'send_threw' });
    }
  });
}
