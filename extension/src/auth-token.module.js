/**
 * Shared access-token resolver for every extension surface — side panel,
 * dashboard, and the background service worker.
 *
 * This lives here because it was duplicated verbatim in side-panel.js and
 * dashboard.js and MISSING from background.js, which sent `bmUser.accessToken`
 * raw: Supabase access tokens last an hour, so every reminder sync 401'd an hour
 * after sign-in and revisit alarms silently stopped being scheduled.
 *
 * Three invariants the duplicated copies didn't have:
 *
 *  - Single-flight. Supabase rotates the refresh token on every use, so N
 *    concurrent callers POSTing the same token race each other: the winner's
 *    rotation revokes that token for everyone else once GoTrue's reuse interval
 *    lapses, and the last `storage.sync.set` to land decides which token is
 *    kept — which can be one the server has already revoked, permanently
 *    breaking the session. The dashboard alone calls this from ten places,
 *    several of them on load.
 *  - A merge on write. The old copies spread a `bmUser` snapshot read before the
 *    request, so a refresh that overlapped an entitlement check could resurrect
 *    a stale `isPro`.
 *  - A distinguishable failure reason. Callers that sign the user out must only
 *    do so when the server actually rejected the refresh token; a fetch failure
 *    while offline is transient, and treating it as a dead session signed people
 *    out for being briefly offline.
 */

import { createDevLogger } from './dev-logger.js';

// Set by config.js on pages that load it; the service worker has no HTML host
// for that classic script, so it falls back to the same production default.
const API_BASE = globalThis.API_BASE || 'https://clipmark.mithahara.com';

// Refresh a minute early — a token that expires mid-request is as useless as
// one that already has.
const EXPIRY_MARGIN_MS = 60_000;

/** A usable token was returned. */
export const TOKEN_OK = 'ok';
/** No stored session at all — signed out, or never signed in. */
export const TOKEN_NO_SESSION = 'no-session';
/** The server rejected the refresh token. The session is gone; sign out. */
export const TOKEN_SESSION_EXPIRED = 'session-expired';
/** Transient failure (offline, 5xx, malformed body). Keep the session. */
export const TOKEN_REFRESH_FAILED = 'refresh-failed';

const logger = createDevLogger('Auth');

/**
 * True if `accessToken` is a JWT that is still valid `marginMs` from now.
 * An unparseable token counts as stale, which sends the caller to refresh.
 *
 * @param {string | null | undefined} accessToken
 * @param {{ now?: number, marginMs?: number }} [options]
 * @returns {boolean}
 */
export function isAccessTokenFresh(accessToken, { now = Date.now(), marginMs = EXPIRY_MARGIN_MS } = {}) {
  if (!accessToken) return false;
  try {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload));
    return exp * 1000 > now + marginMs;
  } catch {
    return false;
  }
}

// The in-flight refresh, shared by every caller in this context until it
// settles. Nothing can dedupe across contexts (the side panel, the dashboard and
// the worker are separate realms), but Supabase's refresh-token reuse interval
// covers that much narrower overlap.
let inFlightRefresh = null;

/**
 * Resolves a usable access token, refreshing via POST /api/refresh when the
 * stored one has expired.
 *
 * @param {{ fetchImpl?: typeof fetch, storage?: chrome.storage.StorageArea }} [deps]
 * @returns {Promise<{ token: string | null, reason: string }>}
 */
export async function resolveAccessToken(deps = {}) {
  const { fetchImpl = fetch, storage = chrome.storage.sync } = deps;
  const { bmUser } = await storage.get({ bmUser: null });
  if (!bmUser?.accessToken) return { token: null, reason: TOKEN_NO_SESSION };
  if (isAccessTokenFresh(bmUser.accessToken)) return { token: bmUser.accessToken, reason: TOKEN_OK };
  if (!bmUser.refreshToken) return { token: null, reason: TOKEN_SESSION_EXPIRED };

  inFlightRefresh ??= refreshStoredSession({ fetchImpl, storage })
    .finally(() => { inFlightRefresh = null; });
  return inFlightRefresh;
}

/**
 * Thin wrapper for the many call sites that only care whether they have a token.
 *
 * @param {{ fetchImpl?: typeof fetch, storage?: chrome.storage.StorageArea }} [deps]
 * @returns {Promise<string | null>}
 */
export async function getValidToken(deps) {
  const { token } = await resolveAccessToken(deps);
  return token;
}

async function refreshStoredSession({ fetchImpl, storage }) {
  // Re-read rather than trusting the caller's snapshot: another context may
  // already have rotated the token while this one was deciding to.
  const { bmUser } = await storage.get({ bmUser: null });
  if (!bmUser?.refreshToken) return { token: null, reason: TOKEN_NO_SESSION };
  if (isAccessTokenFresh(bmUser.accessToken)) return { token: bmUser.accessToken, reason: TOKEN_OK };

  let res;
  try {
    res = await fetchImpl(`${API_BASE}/api/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: bmUser.refreshToken }),
    });
  } catch (err) {
    logger.warn('Token refresh could not reach the server', err?.message);
    return { token: null, reason: TOKEN_REFRESH_FAILED };
  }

  if (!res.ok) {
    // 401 is the server telling us the refresh token itself is no longer
    // valid — retrying with it never helps, and the session is unrecoverable.
    // Every other status is a fault on the way there, not a verdict on the
    // session, so it must not sign the user out.
    const reason = res.status === 401 ? TOKEN_SESSION_EXPIRED : TOKEN_REFRESH_FAILED;
    logger.warn(`Token refresh rejected with ${res.status}`, reason);
    return { token: null, reason };
  }

  let access_token, refresh_token;
  try {
    ({ access_token, refresh_token } = await res.json());
  } catch {
    return { token: null, reason: TOKEN_REFRESH_FAILED };
  }
  if (!access_token || !refresh_token) return { token: null, reason: TOKEN_REFRESH_FAILED };

  // Merge onto the latest record, not the one this refresh started from, so a
  // concurrent write to another `bmUser` field survives. A record that vanished
  // mid-flight means the user signed out — don't resurrect it.
  const { bmUser: latest } = await storage.get({ bmUser: null });
  if (!latest) return { token: null, reason: TOKEN_NO_SESSION };
  await storage.set({ bmUser: { ...latest, accessToken: access_token, refreshToken: refresh_token } });
  return { token: access_token, reason: TOKEN_OK };
}
