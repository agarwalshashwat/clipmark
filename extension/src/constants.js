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
  // i.ytimg.com is YouTube's thumbnail CDN; img.youtube.com is a redirect to
  // it. Pointing straight at the CDN saves the hop and is what the webapp's
  // newer dashboard views already use. Same image either way.
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

// ─── App constants ──────────────────────────────────────────────────────────
const APP_EXPORT_PREFIX = 'clipmark';

// ─── Retry / timing ────────────────────────────────────────────────────────
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY        = 1000; // ms

// ─── String limits ──────────────────────────────────────────────────────────
const TITLE_TRUNCATE_LENGTH      = 60;
const TRANSCRIPT_TRUNCATE_LENGTH = 120;

/* ── Typography (Design System Aligned) ────────────────────────────────────── */
const FONT_FAMILY_DISPLAY = "'Plus Jakarta Sans', system-ui, sans-serif";
const FONT_FAMILY_BODY    = "'Inter', system-ui, sans-serif";
const FONT_FAMILY_MONO    = "'JetBrains Mono', monospace";
const FONT_FAMILY_NATIVE  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ─── Global registration (REQUIRED for the packaged build) ───────────────────
// The crxjs/Vite build wraps each content-script entry in its own IIFE scope
// and tree-shakes entries with no side effects — without these assignments this
// whole file compiles to an EMPTY chunk in dist/, while the built content.js
// still references TAG_COLORS / getTagColor / etc. as bare globals →
// ReferenceError in the Web-Store-packaged extension. (Unpacked dev loads and
// the Playwright E2E suite load raw source files, so they never catch this.)
// Same pattern as src/recall.js and src/ai/local-ai.js. Do not remove.
if (typeof globalThis !== 'undefined') {
  globalThis.TAG_COLORS = TAG_COLORS;
  globalThis.parseTags = parseTags;
  globalThis.stringToColor = stringToColor;
  globalThis.getTagColor = getTagColor;
  globalThis.ytWatchUrl = ytWatchUrl;
  globalThis.ytThumbnailUrl = ytThumbnailUrl;
  globalThis.APP_EXPORT_PREFIX = APP_EXPORT_PREFIX;
  globalThis.MAX_RECONNECT_ATTEMPTS = MAX_RECONNECT_ATTEMPTS;
  globalThis.RECONNECT_DELAY = RECONNECT_DELAY;
  globalThis.TITLE_TRUNCATE_LENGTH = TITLE_TRUNCATE_LENGTH;
  globalThis.TRANSCRIPT_TRUNCATE_LENGTH = TRANSCRIPT_TRUNCATE_LENGTH;
  globalThis.FONT_FAMILY_DISPLAY = FONT_FAMILY_DISPLAY;
  globalThis.FONT_FAMILY_BODY = FONT_FAMILY_BODY;
  globalThis.FONT_FAMILY_MONO = FONT_FAMILY_MONO;
  globalThis.FONT_FAMILY_NATIVE = FONT_FAMILY_NATIVE;
}

