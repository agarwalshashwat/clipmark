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
