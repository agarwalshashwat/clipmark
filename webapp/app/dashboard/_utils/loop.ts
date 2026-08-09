/**
 * Saved A–B loop helpers for the web dashboard (read-only).
 *
 * ⚠️ TWIN of `isLoopBookmark` / `loopEndForBookmark` / `formatLoopClock` in
 * `extension/src/loop.module.js` — keep in sync. Identical behaviour is enforced
 * by `webapp/tests/unit/loop-parity.test.ts`, which imports BOTH and diffs their
 * results. (Direct import is avoided because the extension module lives outside
 * the Next project root; see _utils/recall.ts for the same trade-off.)
 *
 * The loop RUNTIME deliberately lives only in the extension: looping means
 * driving the YouTube player, so the web surface just displays the range a
 * saved loop covers.
 */

/** Shape of the loop fields the extension writes into the bookmarks JSONB. */
export interface LoopFields {
  timestamp?: number | null;
  loop?: { end?: number | null } | null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** True when a bookmark record carries a valid A–B range. */
export function isLoopBookmark(bookmark: LoopFields | null | undefined): boolean {
  return !!bookmark &&
    finite(bookmark.timestamp) &&
    finite(bookmark.loop?.end) &&
    (bookmark.loop!.end as number) > (bookmark.timestamp as number);
}

/** The B point of a loop bookmark, or null for a plain bookmark. */
export function loopEndForBookmark(bookmark: LoopFields | null | undefined): number | null {
  return isLoopBookmark(bookmark) ? (bookmark!.loop!.end as number) : null;
}

/** m:ss (or h:mm:ss past an hour) — matches the player's own timecode style. */
export function formatLoopClock(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(finite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "0:42 → 1:15" for a loop, or null when the record isn't a loop. */
export function formatLoopRange(bookmark: LoopFields | null | undefined): string | null {
  const end = loopEndForBookmark(bookmark);
  if (end === null) return null;
  return `${formatLoopClock(bookmark!.timestamp as number)} → ${formatLoopClock(end)}`;
}
