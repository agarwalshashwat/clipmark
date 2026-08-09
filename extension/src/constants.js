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
  // Was the retired blue #4da1ee; untagged clips fall back to a neutral.
  if (!tags || tags.length === 0) return '#6b7280';
  return TAG_COLORS[tags[0]] || stringToColor(tags[0]);
}

/**
 * A tag hue works as a low-alpha TINT but almost never as TEXT on that tint.
 * The six named hues measure as low as 3.76:1 against a tinted-white pill, the
 * generated hsl(h,55%,45%) hues as low as 2.57:1, and a bookmark's default
 * brand teal #14b8a6 is 2.49:1 — all below WCAG AA. Rather than change the hues
 * (they are an established, user-visible convention), derive two values from
 * the SAME hue: the tint keeps the identity, the ink is darkened until it is
 * readable on it. Clamping lightness to 28% clears AA for every hue on the
 * wheel — the most luminous (yellow-green) still measures 5.29:1 on white.
 *
 * Both accept either `#rrggbb` or `hsl(h, s%, l%)`, because getTagColor()
 * returns hex for known tags and hsl() for hash-derived ones. The old call
 * sites concatenated an alpha suffix onto that return value, which silently
 * produced invalid CSS (`hsl(210,55%,45%)18`) and therefore NO tint at all for
 * every hash-derived tag.
 */
function toHsl(color) {
  if (typeof color !== 'string') return null;
  const hsl = color.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
  if (hsl) return { h: +hsl[1], s: +hsl[2], l: +hsl[3] };

  const hex = color.trim().replace('#', '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
}



/**
 * Per-item hues (tag pills, a clip's own colour) have to work on BOTH themes,
 * and JS renders these strings once — it cannot re-run when the user flips the
 * theme. So JS emits only the HUE, as custom properties, and CSS decides the
 * lightness per theme. A single baked-in ink was readable on white and measured
 * 1.41:1 on the dark card.
 *
 * Accepts `#rrggbb` or `hsl(h, s%, l%)`, because getTagColor() returns hex for
 * the six named tags and hsl() for hash-derived ones.
 */
function tagHueVars(color) {
  const hsl = toHsl(color);
  if (!hsl) return '--tag-h:220;--tag-s:9%';        // gray-500's hue
  return '--tag-h:' + Math.round(hsl.h) + ';--tag-s:' + Math.round(Math.max(hsl.s, 45)) + '%';
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

// ─── Active Recall handoff ──────────────────────────────────────────────────
// When an extension page (side panel, dashboard) starts a recall session and
// there is no reachable content script to message, it hands the session over
// through chrome.storage.local; content.js consumes it on the next player init
// for that video. Nothing guarantees that load ever happens though — the user
// can close the tab, or never open the video — so an unconsumed record would
// sit in storage indefinitely and ambush an unrelated visit to the same video
// days later. Stamp every handoff and treat anything past the TTL as stale.
const PENDING_REVISION_TTL_MS = 5 * 60 * 1000;

function buildPendingRevision(videoId, bookmarks, recall = true, now = Date.now()) {
  return { videoId, bookmarks, recall: !!recall, createdAt: now };
}

function isPendingRevisionExpired(pending, now = Date.now()) {
  if (!pending) return true;
  // Records written before createdAt existed are honoured rather than dropped,
  // so an extension update mid-handoff doesn't swallow the user's session.
  if (!Number.isFinite(pending.createdAt)) return false;
  return now - pending.createdAt > PENDING_REVISION_TTL_MS;
}

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
  globalThis.toHsl = toHsl;
  globalThis.tagHueVars = tagHueVars;
  globalThis.ytWatchUrl = ytWatchUrl;
  globalThis.ytThumbnailUrl = ytThumbnailUrl;
  globalThis.APP_EXPORT_PREFIX = APP_EXPORT_PREFIX;
  globalThis.MAX_RECONNECT_ATTEMPTS = MAX_RECONNECT_ATTEMPTS;
  globalThis.RECONNECT_DELAY = RECONNECT_DELAY;
  globalThis.PENDING_REVISION_TTL_MS = PENDING_REVISION_TTL_MS;
  globalThis.buildPendingRevision = buildPendingRevision;
  globalThis.isPendingRevisionExpired = isPendingRevisionExpired;
  globalThis.TITLE_TRUNCATE_LENGTH = TITLE_TRUNCATE_LENGTH;
  globalThis.TRANSCRIPT_TRUNCATE_LENGTH = TRANSCRIPT_TRUNCATE_LENGTH;
  globalThis.FONT_FAMILY_DISPLAY = FONT_FAMILY_DISPLAY;
  globalThis.FONT_FAMILY_BODY = FONT_FAMILY_BODY;
  globalThis.FONT_FAMILY_MONO = FONT_FAMILY_MONO;
  globalThis.FONT_FAMILY_NATIVE = FONT_FAMILY_NATIVE;
}

