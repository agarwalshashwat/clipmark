// ─── Access-token helper (shared) ────────────────────────────────────────────
// The one copy of "give me a fresh access token, refreshing if needed".
// Previously side-panel.js and dashboard.js each carried an identical
// getValidToken(); the background sync engine would have been the third copy.
// ESM only — no content script needs this (the content script never calls the
// API), so there is no classic-script twin.
//
// Callers must ensure globalThis.API_BASE is set first (import '../config.js'
// — the page entries and the background engine both do).

/**
 * Does this JWT still have at least `skewMs` of validity left?
 * Pure — exported for unit tests. Malformed tokens are simply "not fresh".
 */
export function isTokenFresh(jwt, nowMs, skewMs = 60_000) {
  try {
    const payload = JSON.parse(
      atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return payload.exp * 1000 > nowMs + skewMs;
  } catch {
    return false;
  }
}

/**
 * Returns a valid access token for the signed-in user, refreshing through
 * /api/refresh (and persisting the rotated pair) when the cached one is
 * expired. Returns null when signed out or the refresh fails — callers treat
 * that as "not signed in right now", never as fatal.
 */
export async function getValidToken() {
  const apiBase = globalThis.API_BASE || 'https://clipmark.mithahara.com';
  const { bmUser } = await new Promise((resolve) =>
    chrome.storage.sync.get({ bmUser: null }, resolve),
  );
  if (!bmUser?.accessToken) return null;
  if (isTokenFresh(bmUser.accessToken, Date.now())) return bmUser.accessToken;
  if (!bmUser.refreshToken) return null;
  try {
    const res = await fetch(`${apiBase}/api/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: bmUser.refreshToken }),
    });
    if (!res.ok) return null;
    const { access_token, refresh_token } = await res.json();
    await new Promise((resolve) =>
      chrome.storage.sync.set(
        { bmUser: { ...bmUser, accessToken: access_token, refreshToken: refresh_token } },
        resolve,
      ),
    );
    return access_token;
  } catch {
    return null;
  }
}
