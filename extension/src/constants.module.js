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
  // Was the retired blue #4da1ee; untagged clips fall back to a neutral.
  if (!tags || tags.length === 0) return '#6b7280';
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
export function toHsl(color) {
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
 * the six named tags and hsl() for hash-derived ones. Twin of the same helper in
 * constants.js — edit both together.
 */
export function tagHueVars(color) {
  const hsl = toHsl(color);
  if (!hsl) return '--tag-h:220;--tag-s:9%';        // gray-500's hue
  return '--tag-h:' + Math.round(hsl.h) + ';--tag-s:' + Math.round(Math.max(hsl.s, 45)) + '%';
}
