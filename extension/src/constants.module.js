export const TAG_COLORS = {
  important: '#ef4444',
  review: '#f97316',
  note: '#3b82f6',
  question: '#22c55e',
  todo: '#a855f7',
  key: '#ec4899',
};

export function parseTags(description) {
  if (!description) return [];
  const matches = description.match(/#(\w+)/g);
  return matches ? matches.map((t) => t.slice(1).toLowerCase()) : [];
}

export function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
}

export function getTagColor(tags) {
  if (!tags || tags.length === 0) return '#4da1ee';
  return TAG_COLORS[tags[0]] || stringToColor(tags[0]);
}

export function ytWatchUrl(videoId, t = 0) {
  return `https://www.youtube.com/watch?v=${videoId}${t ? `&t=${Math.floor(t)}s` : ''}`;
}

export function ytThumbnailUrl(videoId, quality = 'mqdefault') {
  // i.ytimg.com is YouTube's thumbnail CDN; img.youtube.com is a redirect to
  // it. Pointing straight at the CDN saves the hop and is what the webapp's
  // newer dashboard views already use. Same image either way.
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export const APP_EXPORT_PREFIX = 'clipmark';
export const MAX_RECONNECT_ATTEMPTS = 3;
export const RECONNECT_DELAY = 1000;

// An extension page (side panel, dashboard) can stay open across an extension
// reload/update — Chrome then revokes its chrome.runtime/chrome.storage
// bindings without unloading the already-running page, so a subsequent API
// call throws instead of the page simply going away. Mirrors content.js's own
// isContextValid(), which classic scripts can't import.
export function isExtensionContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}
