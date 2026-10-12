// ─── Cloud-sync engine (background service worker only) ─────────────────────
// The single owner of every network interaction with /api/bookmarks. No UI
// surface fetches bookmark data itself any more — the side panel, dashboard,
// content script and background command handlers all just read/write
// chrome.storage.sync as before, and this engine:
//
//   * observes those writes (storage.onChanged), stamps per-bookmark
//     `updatedAt` on whatever actually changed, and records observed removals
//     as tombstones in its ledger — so no write site needs sync-specific code,
//     including future ones;
//   * keeps a durable per-video outbox in chrome.storage.local (survives MV3
//     worker shutdown) and drains it with exponential backoff via
//     chrome.alarms when the network or auth comes back;
//   * pushes with optimistic concurrency (baseRevision → 409 → re-merge →
//     retry) so concurrent edits from two devices merge instead of clobbering;
//   * pulls on worker startup (when stale), on sign-in, on demand from the
//     panels, and on a 5-minute alarm;
//   * runs the one-time backfill of pre-Pro local bookmarks per account;
//   * answers SYNC_STATUS_GET / SYNC_NOW / SYNC_PULL_VIDEO and broadcasts
//     SYNC_STATUS_CHANGED so the side panel indicator reflects real state.
//
// All merge/queue/status decisions live in sync-core.module.js (pure,
// unit-tested); this file is deliberately just plumbing around chrome.* APIs.
// The design record is docs/SYNC-ENGINE.md — read it before "simplifying".

import '../config.js';
import { getValidToken } from '../auth-token.module.js';
import {
  deriveSyncStatus,
  gcTombstones,
  hashArray,
  mergeLocalWithRemote,
  nextBackoffMs,
  stampChanges,
  toWire,
} from './sync-core.module.js';

const STATE_KEY = 'clipmarkSync'; // chrome.storage.local — device-local, on purpose
const PULL_ALARM = 'clipmark_sync_pull';
const RETRY_ALARM = 'clipmark_sync_retry';
const PULL_PERIOD_MIN = 5;
const PUSH_DEBOUNCE_MS = 1500;
const MAX_CAS_RETRIES = 3;

const apiBase = () => globalThis.API_BASE || 'https://clipmark.mithahara.com';
const bmKey = (videoId) => `bm_${videoId}`;
const videoIdOf = (key) => key.slice(3);

// ─── Durable state ───────────────────────────────────────────────────────────
// {
//   queue:      { [videoId]: { attempts, nextAttemptAt } }   — the outbox
//   videos:     { [videoId]: { revision, appliedHash } }     — last server
//               revision we hold, and the hash of the last array WE wrote to
//               storage (so our own writes echoing back are recognised even
//               across a worker restart)
//   tombstones: { [videoId]: { [bookmarkId]: deletedAtISO } } — deletion ledger
//   backfillDoneFor: userId | null
//   lastError:  null | 'network' | 'auth' | 'server'
//   lastSyncAt: ISO | null
// }
async function loadState() {
  const { [STATE_KEY]: s } = await chrome.storage.local.get({ [STATE_KEY]: null });
  return {
    queue: {},
    videos: {},
    tombstones: {},
    backfillDoneFor: null,
    lastError: null,
    lastSyncAt: null,
    ...(s || {}),
  };
}

function saveState(state) {
  return chrome.storage.local.set({ [STATE_KEY]: state });
}

// Every state-mutating operation runs through this chain, so concurrent
// events (a storage change landing while a drain runs) can't interleave
// load-modify-save cycles.
let chain = Promise.resolve();
function serialized(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

async function getUser() {
  const { bmUser } = await chrome.storage.sync.get({ bmUser: null });
  return bmUser;
}

// Server said 403 pro_required — reflect reality locally, same behaviour the
// panels had before the engine owned sync.
async function demoteToFree() {
  const bmUser = await getUser();
  if (bmUser && bmUser.isPro !== false) {
    await chrome.storage.sync.set({ bmUser: { ...bmUser, isPro: false } });
  }
}

// ─── Network ─────────────────────────────────────────────────────────────────

async function fetchVideo(videoId, token) {
  let res;
  try {
    res = await fetch(
      `${apiBase()}/api/bookmarks?videoId=${encodeURIComponent(videoId)}&includeDeleted=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    return { ok: false, errorKind: 'network' };
  }
  if (res.status === 403) {
    await demoteToFree();
    return { ok: false, status: 403, errorKind: 'auth' };
  }
  if (res.status === 401) return { ok: false, status: 401, errorKind: 'auth' };
  if (!res.ok) return { ok: false, status: res.status, errorKind: 'server' };
  const json = await res.json().catch(() => ({}));
  return { ok: true, bookmarks: json.bookmarks ?? [], revision: json.revision ?? 0 };
}

async function fetchAllVideos(token) {
  let res;
  try {
    res = await fetch(`${apiBase()}/api/bookmarks?includeDeleted=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, errorKind: 'network' };
  }
  if (res.status === 403) {
    await demoteToFree();
    return { ok: false, status: 403, errorKind: 'auth' };
  }
  if (res.status === 401) return { ok: false, status: 401, errorKind: 'auth' };
  if (!res.ok) return { ok: false, status: res.status, errorKind: 'server' };
  const json = await res.json().catch(() => ({}));
  return { ok: true, videos: json.videos ?? [] };
}

async function putVideo(videoId, wire, baseRevision, token) {
  let res;
  try {
    res = await fetch(`${apiBase()}/api/bookmarks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ videoId, bookmarks: wire, baseRevision }),
    });
  } catch {
    return { ok: false, errorKind: 'network' };
  }
  if (res.status === 409) {
    const json = await res.json().catch(() => ({}));
    return { ok: false, status: 409, bookmarks: json.bookmarks ?? [], revision: json.revision ?? 0 };
  }
  if (res.status === 403) {
    await demoteToFree();
    return { ok: false, status: 403, errorKind: 'auth' };
  }
  if (res.status === 401) return { ok: false, status: 401, errorKind: 'auth' };
  if (!res.ok) return { ok: false, status: res.status, errorKind: 'server' };
  const json = await res.json().catch(() => ({}));
  return { ok: true, revision: json.revision };
}

// ─── Merge/apply ─────────────────────────────────────────────────────────────

/**
 * Merge a wire array pulled from the server into local state for one video.
 * Writes the merged live array to storage.sync (recording its hash FIRST so
 * the resulting onChanged event is recognised as our own), updates the
 * tombstone ledger and known revision, and enqueues a push when the merged
 * result differs from what the server holds.
 *
 * @returns {boolean} whether the local live array changed
 */
async function applyRemote(videoId, remoteWire, revision) {
  const state = await loadState();
  const { [bmKey(videoId)]: localLive } = await chrome.storage.sync.get({ [bmKey(videoId)]: [] });
  const merged = mergeLocalWithRemote({
    localLive,
    localTombstones: state.tombstones[videoId],
    remoteWire,
    nowMs: Date.now(),
  });

  state.videos[videoId] = { revision, appliedHash: hashArray(merged.live) };
  if (Object.keys(merged.tombstones).length) state.tombstones[videoId] = merged.tombstones;
  else delete state.tombstones[videoId];
  if (merged.dirty) enqueue(state, videoId);
  else delete state.queue[videoId];
  await saveState(state);

  if (merged.changedLocally) {
    await chrome.storage.sync.set({ [bmKey(videoId)]: merged.live });
  }
  return merged.changedLocally;
}

// ─── Local change observation ────────────────────────────────────────────────

function enqueue(state, videoId) {
  if (!state.queue[videoId]) state.queue[videoId] = { attempts: 0, nextAttemptAt: 0 };
}

async function handleLocalBmChange(videoId, oldValue, newValue) {
  const state = await loadState();
  const meta = state.videos[videoId] || {};
  const liveNew = Array.isArray(newValue) ? newValue : [];
  const liveOld = Array.isArray(oldValue) ? oldValue : [];

  // Our own applyRemote / stamp write-back echoing through onChanged.
  if (meta.appliedHash != null && meta.appliedHash === hashArray(liveNew)) return false;

  const nowIso = new Date().toISOString();
  const { stamped, deletedIds, needsWriteBack, dirty } = stampChanges(liveOld, liveNew, nowIso);

  if (deletedIds.length) {
    const ledger = state.tombstones[videoId] || {};
    for (const id of deletedIds) ledger[id] = nowIso;
    state.tombstones[videoId] = ledger;
  }
  // A bookmark that is live again (e.g. merged back) must not stay tombstoned.
  if (state.tombstones[videoId]) {
    for (const entry of stamped) delete state.tombstones[videoId][entry.id];
    if (!Object.keys(state.tombstones[videoId]).length) delete state.tombstones[videoId];
  }

  state.videos[videoId] = { ...meta, appliedHash: hashArray(stamped) };
  if (dirty) enqueue(state, videoId);
  await saveState(state);

  if (needsWriteBack) {
    await chrome.storage.sync.set({ [bmKey(videoId)]: stamped });
  }
  return dirty;
}

// ─── Queue drain ─────────────────────────────────────────────────────────────

async function syncVideo(videoId, token) {
  let state = await loadState();
  let baseRevision = state.videos[videoId]?.revision;

  // Never pushed/pulled this video: fetch-and-merge first so a push can never
  // clobber server state we have not seen (this is also what makes the
  // backfill idempotent and non-destructive).
  if (baseRevision == null) {
    const pulled = await fetchVideo(videoId, token);
    if (!pulled.ok) return pulled;
    await applyRemote(videoId, pulled.bookmarks, pulled.revision);
    baseRevision = pulled.revision;
  }

  for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
    state = await loadState();
    if (!state.queue[videoId]) return { ok: true }; // applyRemote decided nothing to push
    const { [bmKey(videoId)]: live } = await chrome.storage.sync.get({ [bmKey(videoId)]: [] });
    const wire = gcTombstones(toWire(live, state.tombstones[videoId]), Date.now());

    const res = await putVideo(videoId, wire, baseRevision, token);
    if (res.ok) {
      state = await loadState();
      state.videos[videoId] = { revision: res.revision, appliedHash: hashArray(live) };
      delete state.queue[videoId];
      state.lastError = null;
      state.lastSyncAt = new Date().toISOString();
      await saveState(state);
      return { ok: true };
    }
    if (res.status === 409) {
      // Another device wrote in between: take the server's state, re-merge,
      // and try again from the new revision.
      await applyRemote(videoId, res.bookmarks, res.revision);
      baseRevision = res.revision;
      continue;
    }
    return res;
  }
  return { ok: false, errorKind: 'server' };
}

async function drainQueue() {
  const state = await loadState();
  const now = Date.now();
  const due = Object.keys(state.queue).filter((v) => state.queue[v].nextAttemptAt <= now);
  if (!due.length) {
    await scheduleRetryAlarm(state);
    return;
  }

  const bmUser = await getUser();
  if (!bmUser?.accessToken || bmUser.isPro !== true) {
    // Signed out or free: the queue stays (sign-in/upgrade resumes it), but we
    // don't burn retries — status derives to 'disabled'.
    await broadcastStatus();
    return;
  }
  const token = await getValidToken();
  if (!token) {
    await failVideos(due, 'auth');
    return;
  }

  for (const videoId of due) {
    const res = await syncVideo(videoId, token);
    if (!res.ok) {
      await failVideos([videoId], res.errorKind || 'server');
      if (res.errorKind === 'network') break; // no point hammering the rest
    }
  }
  const after = await loadState();
  await scheduleRetryAlarm(after);
  await broadcastStatus(after);
}

async function failVideos(videoIds, errorKind) {
  const state = await loadState();
  const now = Date.now();
  for (const videoId of videoIds) {
    const entry = state.queue[videoId] || { attempts: 0, nextAttemptAt: 0 };
    entry.attempts += 1;
    entry.nextAttemptAt = now + nextBackoffMs(entry.attempts);
    state.queue[videoId] = entry;
  }
  state.lastError = errorKind;
  await saveState(state);
  await scheduleRetryAlarm(state);
  await broadcastStatus(state);
}

async function scheduleRetryAlarm(state) {
  const pending = Object.values(state.queue);
  if (!pending.length) {
    await chrome.alarms.clear(RETRY_ALARM);
    return;
  }
  const when = Math.max(Date.now() + 1000, Math.min(...pending.map((q) => q.nextAttemptAt)));
  chrome.alarms.create(RETRY_ALARM, { when });
}

let drainTimer = null;
function scheduleDrain(delayMs = PUSH_DEBOUNCE_MS) {
  if (drainTimer) clearTimeout(drainTimer);
  drainTimer = setTimeout(() => {
    drainTimer = null;
    serialized(drainQueue);
  }, delayMs);
}

// ─── Pull ────────────────────────────────────────────────────────────────────

async function pullAll(token) {
  const all = await fetchAllVideos(token);
  if (!all.ok) {
    const state = await loadState();
    state.lastError = all.errorKind || 'server';
    await saveState(state);
    return { ok: false, ...all };
  }

  let changedCount = 0;
  const remoteIds = new Set();
  for (const row of all.videos) {
    remoteIds.add(row.videoId);
    if (await applyRemote(row.videoId, row.bookmarks, row.revision ?? 0)) changedCount++;
  }

  // Videos that exist only locally (never uploaded) go through the outbox.
  const state = await loadState();
  const everything = await chrome.storage.sync.get(null);
  for (const key of Object.keys(everything)) {
    if (!key.startsWith('bm_')) continue;
    const videoId = videoIdOf(key);
    if (remoteIds.has(videoId)) continue;
    if (Array.isArray(everything[key]) && everything[key].length) enqueue(state, videoId);
  }
  state.lastError = null;
  state.lastSyncAt = new Date().toISOString();
  await saveState(state);
  scheduleDrain(0);
  return { ok: true, changedCount };
}

// ─── Backfill ────────────────────────────────────────────────────────────────
// A Pro user's bookmarks that predate their sign-in/upgrade exist only in
// chrome.storage.sync. Exactly once per account on this device, enqueue every
// local video through the normal syncVideo path — which always pulls and
// merges before pushing, so the backfill can never clobber newer server
// state, and re-running it would be a no-op anyway (merge is idempotent).
// The flag marks "scheduled", not "finished": the outbox is durable, so once
// enqueued the uploads complete eventually even across worker restarts.

async function maybeBackfill(bmUser) {
  const userId = bmUser?.userId || bmUser?.userEmail;
  if (!userId || bmUser.isPro !== true) return;
  const state = await loadState();
  if (state.backfillDoneFor === userId) return;

  const everything = await chrome.storage.sync.get(null);
  for (const key of Object.keys(everything)) {
    if (key.startsWith('bm_') && Array.isArray(everything[key]) && everything[key].length) {
      enqueue(state, videoIdOf(key));
    }
  }
  state.backfillDoneFor = userId;
  await saveState(state);
  scheduleDrain(0);
}

// ─── Status ──────────────────────────────────────────────────────────────────

async function computeStatus(stateArg) {
  const state = stateArg || (await loadState());
  const bmUser = await getUser();
  const pendingCount = Object.keys(state.queue).length;
  return {
    state: deriveSyncStatus({
      signedIn: !!bmUser?.accessToken,
      isPro: bmUser?.isPro === true,
      queueSize: pendingCount,
      lastError: state.lastError,
    }),
    pendingCount,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
  };
}

async function broadcastStatus(state) {
  const status = await computeStatus(state);
  try {
    await chrome.runtime.sendMessage({ type: 'SYNC_STATUS_CHANGED', status });
  } catch {
    // No page listening right now — normal, not an error.
  }
}

// ─── Entry points ────────────────────────────────────────────────────────────

async function syncNow() {
  const bmUser = await getUser();
  if (!bmUser?.accessToken || bmUser.isPro !== true) {
    return { ok: false, error: 'sync_disabled', status: await computeStatus() };
  }
  const token = await getValidToken();
  if (!token) return { ok: false, error: 'auth', status: await computeStatus() };
  const pulled = await pullAll(token);
  await drainQueue();
  return { ok: pulled.ok, changedCount: pulled.changedCount ?? 0, status: await computeStatus() };
}

async function pullVideo(videoId) {
  const bmUser = await getUser();
  if (!bmUser?.accessToken || bmUser.isPro !== true) return { ok: false, error: 'sync_disabled' };
  const token = await getValidToken();
  if (!token) return { ok: false, error: 'auth' };
  const pulled = await fetchVideo(videoId, token);
  if (!pulled.ok) return { ok: false, error: pulled.errorKind || 'server' };
  const changed = await applyRemote(videoId, pulled.bookmarks, pulled.revision);
  scheduleDrain(0);
  return { ok: true, changed };
}

async function handleAuthChange(newUser) {
  await broadcastStatus();
  if (!newUser?.accessToken || newUser.isPro !== true) return;
  await maybeBackfill(newUser);
  const token = await getValidToken();
  if (token) await pullAll(token);
  await broadcastStatus();
}

async function startup() {
  const state = await loadState();
  const bmUser = await getUser();
  if (!bmUser?.accessToken || bmUser.isPro !== true) return;
  await maybeBackfill(bmUser);
  // Workers wake constantly; only pull when the last sync is actually stale.
  const stale =
    !state.lastSyncAt || Date.now() - Date.parse(state.lastSyncAt) > PULL_PERIOD_MIN * 60_000;
  if (stale) {
    const token = await getValidToken();
    if (token) await pullAll(token);
  }
  scheduleDrain(0);
}

// ─── Wiring (registered synchronously at worker evaluation, per MV3) ────────

export function initSyncEngine() {
  chrome.alarms.create(PULL_ALARM, { periodInMinutes: PULL_PERIOD_MIN });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PULL_ALARM) {
      serialized(async () => {
        const bmUser = await getUser();
        if (!bmUser?.accessToken || bmUser.isPro !== true) return;
        const token = await getValidToken();
        if (token) {
          await pullAll(token);
          await broadcastStatus();
        }
      });
    } else if (alarm.name === RETRY_ALARM) {
      serialized(drainQueue);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.bmUser) {
      serialized(() => handleAuthChange(changes.bmUser.newValue));
    }
    const bmEntries = Object.entries(changes).filter(([key]) => key.startsWith('bm_'));
    if (bmEntries.length) {
      serialized(async () => {
        let anyDirty = false;
        for (const [key, { oldValue, newValue }] of bmEntries) {
          if (await handleLocalBmChange(videoIdOf(key), oldValue, newValue)) anyDirty = true;
        }
        if (anyDirty) {
          scheduleDrain();
          await broadcastStatus();
        }
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SYNC_STATUS_GET') {
      computeStatus().then(sendResponse);
      return true;
    }
    if (message?.type === 'SYNC_NOW') {
      serialized(syncNow).then(sendResponse);
      return true;
    }
    if (message?.type === 'SYNC_PULL_VIDEO') {
      const videoId = String(message.videoId || '');
      if (!videoId) {
        sendResponse({ ok: false, error: 'invalid_video_id' });
        return false;
      }
      serialized(() => pullVideo(videoId)).then(sendResponse);
      return true;
    }
    return false;
  });

  serialized(startup);
}
