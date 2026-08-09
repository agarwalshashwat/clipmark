/**
 * Trust gate + payload shaping for messages the web app sends the extension
 * (`chrome.runtime.onMessageExternal`).
 *
 * Extracted from background.js purely so it can be unit-tested: AUTH_SUCCESS is
 * the message that hands every signed-in feature (Pro entitlement, cloud sync,
 * reminders) from the web app to the extension, and a regression in either the
 * sender check or the stored shape silently breaks sign-in for every user.
 *
 * ESM only — the background service worker is `type: "module"`, so unlike the
 * content-script helpers this needs no classic-script twin.
 */

// Only the ClipMark web app may talk to the extension. `externally_connectable`
// in the manifest is the real gate (Chrome refuses to deliver from any other
// origin); this is defence in depth, and it matters more now that an external
// message can take an action (opening tabs) rather than just storing tokens.
export const APP_ORIGIN = 'https://clipmark.mithahara.com';

/**
 * True when an `onMessageExternal` sender is the production web app.
 *
 * Matches the exact origin or any path under it, and nothing else — notably not
 * a look-alike host that merely *contains* the app origin as a substring.
 */
export function isTrustedExternalSender(sender) {
  const origin = sender?.origin || sender?.url || '';
  return origin === APP_ORIGIN || origin.startsWith(`${APP_ORIGIN}/`);
}

/**
 * The `bmUser` record written to chrome.storage.sync on AUTH_SUCCESS.
 *
 * Nothing here is validated: the sender is already origin-gated above, and the
 * tokens are opaque to the extension. `isPro` is the one field coerced, because
 * a missing entitlement must read as "not Pro" rather than undefined.
 */
export function buildAuthUser(message) {
  return {
    userId:       message.userId,
    userEmail:    message.userEmail,
    accessToken:  message.accessToken,
    refreshToken: message.refreshToken,
    isPro:        message.isPro || false,
  };
}
