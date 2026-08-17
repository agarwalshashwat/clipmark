// ─── Bounding the co-tenant maps in chrome.storage.sync ────────────────────
// TWIN FILE of storage-maps.module.js — EDIT BOTH TOGETHER (.claude/CLAUDE.md).
// Classic script: declares functions and registers them on globalThis for the
// content script, which shares one global scope and cannot use ESM imports.
//
// `videoTitles` / `videoDurations` are single storage items, so they are bound
// by QUOTA_BYTES_PER_ITEM (8192) — and they grow on every video WATCHED, not
// every video bookmarked (scheduleTitleRefresh writes a title on each SPA
// navigation). At ~72 bytes an entry that ceiling arrives after ~113 videos.
//
// It used to break saving, because the bookmark array and these maps were
// written in ONE chrome.storage.sync.set(): once videoTitles was oversized the
// whole call failed and took the bookmark with it. Callers now write the
// bookmark first and alone; these helpers stop the maps reaching the ceiling.

/** Bytes an item occupies, counted the way the quota counts: key + JSON value. */
function storageItemBytes(value, key = '') {
  try {
    return key.length + JSON.stringify(value ?? null).length;
  } catch {
    return Infinity; // unserialisable — treat as over budget rather than throw
  }
}

// 75% of QUOTA_BYTES_PER_ITEM. Headroom is deliberate: the real write lands
// after this prune, and titles vary in length.
const MAP_BYTE_BUDGET = 6144;

/**
 * Drop entries until the map fits the budget, oldest-inserted first, never
 * dropping `keepKeys`. This is a cache of display metadata — a dropped title
 * costs one re-fetch, never a bookmark. Bookmarks are not stored here.
 */
function pruneMapToBudget(map, opts) {
  const { keepKeys = [], budgetBytes = MAP_BYTE_BUDGET, mapKey = '' } = opts || {};
  const source = map && typeof map === 'object' ? map : {};
  if (storageItemBytes(source, mapKey) <= budgetBytes) return { map: { ...source }, dropped: [] };

  const keep = new Set(keepKeys.filter((k) => k in source));
  const evictable = Object.keys(source).filter((k) => !keep.has(k));

  const pruned = { ...source };
  const dropped = [];
  for (const key of evictable) {
    if (storageItemBytes(pruned, mapKey) <= budgetBytes) break;
    delete pruned[key];
    dropped.push(key);
  }
  return { map: pruned, dropped };
}

/** Bound both maps at once, always preserving the video being saved. */
function pruneVideoMaps(input) {
  const { videoTitles, videoDurations, keepVideoId = null } = input || {};
  const keepKeys = keepVideoId ? [keepVideoId] : [];
  const titles = pruneMapToBudget(videoTitles, { keepKeys, mapKey: 'videoTitles' });
  const durations = pruneMapToBudget(videoDurations, { keepKeys, mapKey: 'videoDurations' });
  return {
    videoTitles: titles.map,
    videoDurations: durations.map,
    dropped: [...new Set([...titles.dropped, ...durations.dropped])],
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.storageItemBytes = storageItemBytes;
  globalThis.MAP_BYTE_BUDGET = MAP_BYTE_BUDGET;
  globalThis.pruneMapToBudget = pruneMapToBudget;
  globalThis.pruneVideoMaps = pruneVideoMaps;
}
