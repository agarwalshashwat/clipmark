/**
 * Side-panel idle ("not watching right now") summary — pure data shaping.
 *
 * The panel's off-YouTube state shows a due-for-review strip and a set of
 * recent-video cards grouped by video. Everything decidable without a DOM or a
 * chrome.* API lives here so it can be unit-tested
 * (tests/unit/idle-summary.test.mjs); src/popup/side-panel.js owns the
 * rendering and the storage/tabs calls.
 *
 * Due-ness is NOT decided here: the caller passes in `isDue`, which is the
 * shared Active Recall engine (src/recall.module.js's isDueForRecall). There is
 * exactly one scheduling implementation in the product and this must not become
 * a second one.
 */

/** Newest-first sort key. createdAt is the real timestamp; id is Date.now() at save. */
export function bookmarkSavedAt(bookmark) {
  const created = bookmark?.createdAt ? new Date(bookmark.createdAt).getTime() : NaN;
  if (Number.isFinite(created)) return created;
  return Number.isFinite(bookmark?.id) ? bookmark.id : 0;
}

/**
 * Flatten a raw `chrome.storage.sync.get(null)` dump into bookmarks tagged with
 * their video id. Storage is a flat key space, so `bm_` prefixed arrays are the
 * only entries that matter here.
 *
 * @param {Record<string, unknown>} storage
 * @returns {Array<object>}
 */
export function collectStoredBookmarks(storage) {
  const bookmarks = [];
  for (const [key, value] of Object.entries(storage || {})) {
    if (!key.startsWith('bm_') || !Array.isArray(value)) continue;
    const videoId = key.slice(3);
    if (!videoId) continue;
    for (const bookmark of value) {
      if (bookmark && typeof bookmark === 'object') bookmarks.push({ ...bookmark, videoId });
    }
  }
  return bookmarks;
}

/**
 * Group by video, newest-saved video first, and newest-saved moment first
 * inside each group.
 *
 * @param {Array<object>} bookmarks
 * @returns {Array<{videoId: string, bookmarks: Array<object>, savedAt: number}>}
 */
export function groupBookmarksByVideo(bookmarks) {
  const groups = new Map();
  for (const bookmark of bookmarks || []) {
    if (!bookmark?.videoId) continue;
    if (!groups.has(bookmark.videoId)) {
      groups.set(bookmark.videoId, { videoId: bookmark.videoId, bookmarks: [], savedAt: 0 });
    }
    const group = groups.get(bookmark.videoId);
    group.bookmarks.push(bookmark);
    group.savedAt = Math.max(group.savedAt, bookmarkSavedAt(bookmark));
  }

  const ordered = Array.from(groups.values());
  for (const group of ordered) {
    group.bookmarks.sort((a, b) => bookmarkSavedAt(b) - bookmarkSavedAt(a));
  }
  ordered.sort((a, b) => b.savedAt - a.savedAt);
  return ordered;
}

/** Best available human label for a video, never an empty string. */
export function resolveVideoTitle(bookmarks, videoTitles, videoId) {
  for (const bookmark of bookmarks || []) {
    if (bookmark?.videoTitle) return bookmark.videoTitle;
  }
  return videoTitles?.[videoId] || 'Untitled video';
}

/**
 * Cards for the idle state: one per video, newest first.
 *
 * `headerTimestamp` is the moment the card header deep-links to — the most
 * recently saved one, not the earliest in the video.
 *
 * @param {{bookmarks: Array<object>, videoTitles?: object, limit?: number, momentLimit?: number}} input
 * @returns {Array<object>}
 */
export function buildIdleVideoCards({ bookmarks, videoTitles = {}, limit = 4, momentLimit = 3 } = {}) {
  return groupBookmarksByVideo(bookmarks)
    .slice(0, Math.max(0, limit))
    .map((group) => {
      const shown = momentLimit >= 0 ? group.bookmarks.slice(0, momentLimit) : group.bookmarks;
      return {
        videoId: group.videoId,
        title: resolveVideoTitle(group.bookmarks, videoTitles, group.videoId),
        momentCount: group.bookmarks.length,
        hiddenMomentCount: Math.max(0, group.bookmarks.length - shown.length),
        headerTimestamp: group.bookmarks[0]?.timestamp ?? 0,
        savedAt: group.savedAt,
        moments: shown.map((bookmark) => ({
          id: bookmark.id,
          timestamp: bookmark.timestamp ?? 0,
          description: bookmark.description || 'Saved moment',
        })),
      };
    });
}

/** "3 moments saved" / "1 moment saved" */
export function momentCountLabel(count) {
  return `${count} moment${count === 1 ? '' : 's'} saved`;
}

/**
 * Active Recall items currently due, grouped by video so the strip can start a
 * review for the video with the most waiting.
 *
 * @param {{bookmarks: Array<object>, isDue: Function, now?: number}} input
 * @returns {{dueCount: number, videos: Array<{videoId: string, count: number, savedAt: number}>, primaryVideoId: string|null}}
 */
export function buildDueSummary({ bookmarks, isDue, now = 0 } = {}) {
  if (typeof isDue !== 'function') return { dueCount: 0, videos: [], primaryVideoId: null };

  const due = (bookmarks || []).filter((bookmark) => {
    try {
      return isDue(bookmark, now);
    } catch {
      return false;
    }
  });

  const videos = groupBookmarksByVideo(due).map((group) => ({
    videoId: group.videoId,
    count: group.bookmarks.length,
    savedAt: group.savedAt,
  }));
  // Most due first; recency breaks ties so "Start review" is predictable.
  videos.sort((a, b) => b.count - a.count || b.savedAt - a.savedAt);

  return {
    dueCount: due.length,
    videos,
    primaryVideoId: videos[0]?.videoId ?? null,
  };
}

/** "4 moments due for review" / "1 moment due for review" */
export function dueCountLabel(count) {
  return `${count} moment${count === 1 ? '' : 's'} due for review`;
}

/**
 * The bookmarks a "Start review" click should actually replay: this video's due
 * moments, in playback order (recall walks the video front to back).
 *
 * @param {{bookmarks: Array<object>, videoId: string, isDue: Function, now?: number}} input
 * @returns {Array<object>}
 */
export function dueBookmarksForVideo({ bookmarks, videoId, isDue, now = 0 } = {}) {
  if (typeof isDue !== 'function' || !videoId) return [];
  return (bookmarks || [])
    .filter((bookmark) => bookmark?.videoId === videoId)
    .filter((bookmark) => {
      try {
        return isDue(bookmark, now);
      } catch {
        return false;
      }
    })
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}
