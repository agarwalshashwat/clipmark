/**
 * Wire-format helpers for the per-video bookmarks JSONB (Phase 10a sync).
 *
 * The array stored in user_bookmarks.bookmarks may now contain, per entry:
 *   - a live Bookmark (optionally carrying `updatedAt` for the sync engine's
 *     per-bookmark last-write-wins merge), or
 *   - a tombstone `{ id, deleted: true, deletedAt }` — the record that a
 *     bookmark was deleted, so other devices delete it too instead of
 *     resurrecting it from their local copy.
 *
 * Anything that DISPLAYS bookmarks must go through liveBookmarks(); only the
 * sync engine (GET ?includeDeleted=1) sees the raw wire array.
 */
import type { Bookmark } from './supabase';

export type BookmarkTombstone = {
  id: number;
  deleted: true;
  deletedAt: string; // ISO timestamp of the deletion event
};

export type WireBookmark = Bookmark | BookmarkTombstone;

export function isTombstone(entry: unknown): entry is BookmarkTombstone {
  return !!entry && typeof entry === 'object' && (entry as { deleted?: unknown }).deleted === true;
}

/** Filter tombstones out of a wire array. Tolerates null/undefined/non-array rows. */
export function liveBookmarks(arr: unknown): Bookmark[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((entry): entry is Bookmark => !isTombstone(entry));
}

export function makeTombstone(id: number, nowIso: string): BookmarkTombstone {
  return { id, deleted: true, deletedAt: nowIso };
}
