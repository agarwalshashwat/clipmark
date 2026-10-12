// ─── Cloud-sync core (pure functions) ────────────────────────────────────────
// The merge/conflict/queue logic behind extension/src/sync/sync-engine.js.
// Everything here is pure — no chrome.* APIs, no fetch, no Date.now() — so it
// is unit-tested directly (tests/unit/sync-core.test.mjs) and the engine stays
// a thin orchestration shell.
//
// NOT a twin file: no content script consumes these as bare globals (the
// content script never talks to the network; the background engine observes
// its storage writes instead), so there is deliberately no sync-core.js
// classic-script counterpart and no content-globals-guard entry.
//
// ## The wire format
// The server stores one JSONB array per (user, video) — see
// webapp/app/api/bookmarks/handler.ts. With sync v2 that array ("wire" here)
// may contain two kinds of entry:
//   * live bookmarks, optionally carrying `updatedAt` (ISO) — stamped by
//     whichever side last mutated the entry;
//   * tombstones `{ id, deleted: true, deletedAt }` — a deletion is an event,
//     and the tombstone is how other devices learn of it instead of
//     resurrecting the bookmark from their own copy.
//
// Locally the two are kept apart: `bm_<videoId>` in chrome.storage.sync holds
// live bookmarks only (so no UI surface ever needs to filter), while the
// engine keeps a per-video tombstone ledger in chrome.storage.local. toWire /
// splitWire convert between the two representations at the sync boundary.
//
// ## Conflict resolution contract
// Per-bookmark last-write-wins on freshnessMs() — updatedAt, else deletedAt,
// else createdAt, else the id (which is Date.now() at creation). Ties break
// deterministically: a tombstone beats a live entry (deletion wins), then a
// stable-stringify comparison — so merge is commutative and two devices
// merging in either order converge on the same array.

/** Milliseconds after which a tombstone no longer needs to be carried. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function isTombstone(entry) {
  return entry != null && entry.deleted === true;
}

export function makeTombstone(id, nowIso) {
  return { id, deleted: true, deletedAt: nowIso };
}

/**
 * When this entry last changed, for last-write-wins ordering. Live bookmarks
 * that predate sync v2 have no updatedAt and fall back to createdAt, then to
 * their id — which is Date.now() at creation, so it is itself a timestamp.
 */
export function freshnessMs(entry) {
  if (!entry) return 0;
  const iso = isTombstone(entry) ? entry.deletedAt : (entry.updatedAt || entry.createdAt);
  const parsed = Date.parse(iso);
  if (!Number.isNaN(parsed)) return parsed;
  return typeof entry.id === 'number' ? entry.id : 0;
}

/** JSON.stringify with recursively sorted object keys, so comparisons don't
 *  depend on property insertion order. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Small non-cryptographic hash (djb2) — used only to recognise the engine's
 *  own storage writes echoing back through storage.onChanged. */
export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function hashArray(arr) {
  return hashString(stableStringify(arr ?? []));
}

function pickWinner(a, b) {
  const fa = freshnessMs(a);
  const fb = freshnessMs(b);
  if (fa !== fb) return fa > fb ? a : b;
  const ta = isTombstone(a);
  const tb = isTombstone(b);
  if (ta !== tb) return ta ? a : b; // equal freshness: deletion wins
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

/**
 * Merge two wire arrays per bookmark id (see contract above). Result is
 * sorted by id ascending (= creation order) so equal sets always serialize
 * identically regardless of merge order.
 */
export function mergeWire(a, b) {
  const byId = new Map();
  for (const entry of [...(a ?? []), ...(b ?? [])]) {
    if (entry == null || entry.id == null) continue;
    const existing = byId.get(entry.id);
    byId.set(entry.id, existing ? pickWinner(existing, entry) : entry);
  }
  return [...byId.values()].sort((x, y) => (x.id > y.id ? 1 : x.id < y.id ? -1 : 0));
}

/** Drop tombstones older than TOMBSTONE_TTL_MS; live entries always pass. */
export function gcTombstones(wire, nowMs, ttlMs = TOMBSTONE_TTL_MS) {
  return (wire ?? []).filter(
    (entry) => !isTombstone(entry) || nowMs - freshnessMs(entry) <= ttlMs,
  );
}

/** wire array → { live: Bookmark[], tombstones: {id → deletedAt} } */
export function splitWire(wire) {
  const live = [];
  const tombstones = {};
  for (const entry of wire ?? []) {
    if (isTombstone(entry)) tombstones[entry.id] = entry.deletedAt;
    else live.push(entry);
  }
  return { live, tombstones };
}

/** Inverse of splitWire. Live entries keep their array order; tombstones for
 *  ids that are (again) live are dropped rather than shipped alongside. */
export function toWire(live, tombstones) {
  const liveIds = new Set((live ?? []).map((b) => b.id));
  const wire = [...(live ?? [])];
  for (const [id, deletedAt] of Object.entries(tombstones ?? {})) {
    const numericId = Number(id);
    if (!liveIds.has(numericId)) wire.push(makeTombstone(numericId, deletedAt));
  }
  return wire;
}

function contentEquals(a, b) {
  const strip = ({ updatedAt: _ignored, ...rest }) => rest;
  return stableStringify(strip(a)) === stableStringify(strip(b));
}

/**
 * Diff one local storage write (old array → new array, both live-only) and
 * decide what the engine must do about it:
 *   * entries whose content changed get `updatedAt` stamped — unless the
 *     writer already re-stamped them itself (then its stamp is trusted, so a
 *     merged-in remote edit is not falsely claimed as a fresh local one);
 *   * ids that vanished are the deletions this write expressed.
 *
 * @returns {{ stamped: object[], deletedIds: number[], needsWriteBack: boolean, dirty: boolean }}
 *   needsWriteBack — stamping changed the array, write it back to storage;
 *   dirty — anything (content or membership) actually changed, so a push is due.
 */
export function stampChanges(oldArr, newArr, nowIso) {
  const oldById = new Map((oldArr ?? []).map((e) => [e.id, e]));
  let needsWriteBack = false;

  const stamped = (newArr ?? []).map((entry) => {
    const prev = oldById.get(entry.id);
    if (!prev) {
      if (entry.updatedAt) return entry;
      needsWriteBack = true;
      return { ...entry, updatedAt: nowIso };
    }
    if (contentEquals(prev, entry)) return entry;
    if (entry.updatedAt && entry.updatedAt !== prev.updatedAt) return entry;
    needsWriteBack = true;
    return { ...entry, updatedAt: nowIso };
  });

  const newIds = new Set((newArr ?? []).map((e) => e.id));
  const deletedIds = [...oldById.keys()].filter((id) => !newIds.has(id));

  const dirty =
    deletedIds.length > 0 || stableStringify(stamped) !== stableStringify(oldArr ?? []);
  return { stamped, deletedIds, needsWriteBack, dirty };
}

/**
 * One-call merge of local state (live array + tombstone ledger) with a wire
 * array pulled from the server.
 *
 * @returns {{ live, tombstones, wire, changedLocally, dirty }}
 *   changedLocally — the merged live array differs from localLive (write it);
 *   dirty — the merged wire differs from what the server has (push it).
 */
export function mergeLocalWithRemote({ localLive, localTombstones, remoteWire, nowMs }) {
  const localWire = toWire(localLive, localTombstones);
  const merged = gcTombstones(mergeWire(localWire, remoteWire ?? []), nowMs);
  const { live, tombstones } = splitWire(merged);
  const changedLocally = stableStringify(live) !== stableStringify(
    mergeWire(localLive ?? [], []), // canonical (id-sorted) form of the local array
  );
  const dirty =
    stableStringify(merged) !== stableStringify(gcTombstones(mergeWire(remoteWire ?? [], []), nowMs));
  return { live, tombstones, wire: merged, changedLocally, dirty };
}

// ─── Offline queue / retry ───────────────────────────────────────────────────

const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000];

/** Delay before retry `attempts` (1-based); capped at 30 min. */
export function nextBackoffMs(attempts) {
  const idx = Math.max(0, Math.min(attempts - 1, BACKOFF_MS.length - 1));
  return BACKOFF_MS[idx];
}

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * The single place sync state becomes a user-facing status.
 *   disabled — signed out or not Pro: sync isn't part of the plan, show nothing
 *   offline  — the last attempt failed at the network layer; queue will drain
 *   error    — the last attempt failed some other way (auth, server)
 *   pending  — local changes are queued and being pushed
 *   synced   — queue empty, last attempt (if any) succeeded
 */
export function deriveSyncStatus({ signedIn, isPro, queueSize, lastError }) {
  if (!signedIn || !isPro) return 'disabled';
  if (lastError === 'network') return 'offline';
  if (lastError) return 'error';
  if (queueSize > 0) return 'pending';
  return 'synced';
}
