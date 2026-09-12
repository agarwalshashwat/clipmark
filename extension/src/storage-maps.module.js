/**
 * Bounding the co-tenant maps in chrome.storage.sync (`videoTitles`,
 * `videoDurations`).
 *
 * These are per-key maps, not per-video keys, so they are subject to
 * QUOTA_BYTES_PER_ITEM (8192) as a single item — and they grow on every video
 * the user WATCHES, not every video they bookmark: scheduleTitleRefresh() runs
 * on each SPA navigation and writes videoTitles[videoId] regardless of whether
 * anything was saved. At roughly 72 bytes per entry that crosses the per-item
 * ceiling after ~113 distinct videos.
 *
 * That mattered far more than it should have, because the save path used to
 * write the bookmark array and these maps in ONE chrome.storage.sync.set().
 * Once videoTitles alone was oversized the whole call failed, so the bookmark
 * save failed too — a user who had merely watched ~113 videos could no longer
 * save a bookmark on the next one, with nothing in the UI explaining why. The
 * callers now write the bookmark first and alone; these helpers keep the maps
 * from reaching the ceiling in the first place.
 *
 * Pure functions, no chrome.* access, so they are decidable without a browser
 * (tests/unit/storage-maps.test.mjs).
 *
 * Twin file: storage-maps.js is the classic-script copy loaded by the content
 * script. EDIT BOTH TOGETHER — see .claude/CLAUDE.md.
 */

/**
 * Bytes a value occupies as a storage item, measured the way the quota does:
 * chrome.storage counts the JSON serialisation of the value plus the key.
 *
 * @param {unknown} value
 * @param {string} [key]
 * @returns {number}
 */
export function storageItemBytes(value, key = '') {
  try {
    return key.length + JSON.stringify(value ?? null).length;
  } catch {
    return Infinity; // unserialisable — treat as over budget rather than throw
  }
}

/**
 * 75% of QUOTA_BYTES_PER_ITEM (8192). The headroom is deliberate: the write
 * that matters lands *after* this prune, and a title can be long, so trimming
 * to exactly the ceiling would leave the next entry to overflow it again.
 */
export const MAP_BYTE_BUDGET = 6144;

/**
 * Drop entries from a `{ videoId: value }` map until it fits `budgetBytes`,
 * oldest-inserted first, never dropping anything in `keepKeys`.
 *
 * Insertion order is JS object key order, which for string keys is the order
 * they were added — so the oldest cached video goes first. This is a cache of
 * display metadata: a dropped title costs one re-fetch on next view, never a
 * bookmark. Bookmarks are NOT stored here and are never touched by this.
 *
 * @param {Record<string, unknown>} map
 * @param {{ keepKeys?: string[], budgetBytes?: number, mapKey?: string }} [opts]
 * @returns {{ map: Record<string, unknown>, dropped: string[] }}
 */
export function pruneMapToBudget(map, { keepKeys = [], budgetBytes = MAP_BYTE_BUDGET, mapKey = '' } = {}) {
  const source = map && typeof map === 'object' ? map : {};
  if (storageItemBytes(source, mapKey) <= budgetBytes) return { map: { ...source }, dropped: [] };

  const keep = new Set(keepKeys.filter((k) => k in source));
  // Evictable in insertion order — oldest first.
  const evictable = Object.keys(source).filter((k) => !keep.has(k));

  const pruned = { ...source };
  const dropped = [];
  for (const key of evictable) {
    if (storageItemBytes(pruned, mapKey) <= budgetBytes) break;
    delete pruned[key];
    dropped.push(key);
  }
  // Still over budget with only keepKeys left: that is the caller's real data,
  // so return it rather than dropping something they asked us to keep. The
  // split write means an oversized map can no longer fail a bookmark save.
  return { map: pruned, dropped };
}

/**
 * Bound both co-tenant maps in one call, always preserving the video currently
 * being saved so a save never evicts its own title.
 *
 * @param {{ videoTitles?: object, videoDurations?: object, keepVideoId?: string|null }} input
 * @returns {{ videoTitles: object, videoDurations: object, dropped: string[] }}
 */
export function pruneVideoMaps({ videoTitles, videoDurations, keepVideoId = null } = {}) {
  const keepKeys = keepVideoId ? [keepVideoId] : [];
  const titles = pruneMapToBudget(videoTitles, { keepKeys, mapKey: 'videoTitles' });
  const durations = pruneMapToBudget(videoDurations, { keepKeys, mapKey: 'videoDurations' });
  return {
    videoTitles: titles.map,
    videoDurations: durations.map,
    dropped: [...new Set([...titles.dropped, ...durations.dropped])],
  };
}
