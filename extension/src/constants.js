// ─── Tag colours (single source of truth for all extension files) ──────────
// Must stay in sync with webapp/app/dashboard/_utils/tagColors.ts
const TAG_COLORS = {
  important: '#ef4444',
  review:    '#f97316',
  note:      '#3b82f6',
  question:  '#22c55e',
  todo:      '#a855f7',
  key:       '#ec4899',
};

function parseTags(description) {
  if (!description) return [];
  const matches = description.match(/#(\w+)/g);
  return matches ? matches.map(t => t.slice(1).toLowerCase()) : [];
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
}

function getTagColor(tags) {
  if (!tags || tags.length === 0) return '#4da1ee';
  return TAG_COLORS[tags[0]] || stringToColor(tags[0]);
}

// ─── YouTube URL helpers ────────────────────────────────────────────────────
function ytWatchUrl(videoId, t = 0) {
  return `https://www.youtube.com/watch?v=${videoId}${t ? `&t=${Math.floor(t)}s` : ''}`;
}

function ytThumbnailUrl(videoId, quality = 'mqdefault') {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

// ─── App constants ──────────────────────────────────────────────────────────
const APP_EXPORT_PREFIX = 'clipmark';

// ─── Retry / timing ────────────────────────────────────────────────────────
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY        = 1000; // ms

// ─── String limits ──────────────────────────────────────────────────────────
const TITLE_TRUNCATE_LENGTH      = 60;
const TRANSCRIPT_TRUNCATE_LENGTH = 120;
