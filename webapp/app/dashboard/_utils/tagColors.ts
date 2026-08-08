export const TAG_COLORS: Record<string, string> = {
  important: '#ef4444',
  review:    '#f97316',
  note:      '#3b82f6',
  question:  '#22c55e',
  todo:      '#a855f7',
  key:       '#ec4899',
};

export function stringToColor(str: string): string {
  let hash = 0;
  for (const ch of str) hash = ((hash << 5) - hash) + ch.charCodeAt(0);
  return `hsl(${Math.abs(hash) % 360},55%,45%)`;
}

export function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] ?? stringToColor(tag);
}

/**
 * See extension/src/constants.js for the full rationale: a tag hue is fine as a
 * low-alpha tint but fails WCAG AA as text on that tint (as low as 2.57:1), so
 * the pill derives a tint and a darkened ink from the SAME hue rather than
 * changing the established hues. Kept byte-comparable with the extension twins.
 */
export function toHsl(color: string): { h: number; s: number; l: number } | null {
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

/** The pill fill: the hue itself, at low alpha so it reads as a tint. */
export function tagTint(color: string, alpha = 0.12): string {
  const hsl = toHsl(color);
  if (!hsl) return `rgba(107, 114, 128, ${alpha})`;
  return `hsla(${Math.round(hsl.h)}, ${Math.round(Math.max(hsl.s, 45))}%, 45%, ${alpha})`;
}

/** The pill label: the same hue, darkened until it clears WCAG AA on the tint. */
export function tagInk(color: string): string {
  const hsl = toHsl(color);
  if (!hsl) return '#374151';
  return `hsl(${Math.round(hsl.h)}, ${Math.round(Math.max(hsl.s, 45))}%, 28%)`;
}
