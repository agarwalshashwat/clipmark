'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, type Bookmark } from '@/lib/supabase';
import { isTombstone, makeTombstone, type WireBookmark } from '@/lib/bookmarks';

// Sync notes (Phase 10a), shared by every writer below:
//  * Deleting writes a TOMBSTONE into the JSONB instead of dropping the entry
//    (and the row is kept even when only tombstones remain) — dropping it
//    would erase the deletion record and other devices would resurrect the
//    bookmark on their next merge.
//  * Every write bumps `revision` so sync clients' compare-and-swap sees it.
//  * These actions run as the signed-in user, so RLS applies: a lapsed
//    (non-Pro) user's UPDATE matches 0 rows — same outcome as today, no
//    policy change needed (see migrations/016).

// ─── Delete a single bookmark ─────────────────────────────────────────────────
export async function deleteBookmark(videoId: string, bookmarkId: number) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: row } = await supabase
    .from('user_bookmarks')
    .select('bookmarks, revision')
    .eq('user_id', user.id)
    .eq('video_id', videoId)
    .single();

  if (!row) return;

  const now = new Date().toISOString();
  const updated = (row.bookmarks as WireBookmark[]).map(b =>
    b.id === bookmarkId ? makeTombstone(bookmarkId, now) : b
  );

  await supabase
    .from('user_bookmarks')
    .update({ bookmarks: updated, updated_at: now, revision: ((row.revision as number | null) ?? 0) + 1 })
    .eq('user_id', user.id)
    .eq('video_id', videoId);

  revalidatePath('/dashboard');
}

// ─── Update a bookmark's Extended Notes (Pro) ─────────────────────────────────
// Mirrors extension/src/popup/dashboard.js::updateBookmark's notes path. The
// extension only gates this client-side (chrome.storage.sync has no server
// round-trip to enforce against); the webapp does have one, so — matching how
// the rest of this codebase treats server-callable Pro features (see
// queue/data.ts::loadRemindersQueue) — Pro is re-checked here too, not just
// in the UI, so a free user can't bypass the client gate by calling the
// action directly.
export async function updateBookmarkNotes(videoId: string, bookmarkId: number, notes: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', user.id)
    .single();
  if (profile?.is_pro !== true) throw new Error('Extended Notes is a Pro feature');

  const { data: row } = await supabase
    .from('user_bookmarks')
    .select('bookmarks, revision')
    .eq('user_id', user.id)
    .eq('video_id', videoId)
    .single();

  if (!row) return;

  const now = new Date().toISOString();
  const updated = (row.bookmarks as WireBookmark[]).map(b =>
    b.id === bookmarkId && !isTombstone(b) ? { ...b, notes, updatedAt: now } : b
  );

  await supabase
    .from('user_bookmarks')
    .update({ bookmarks: updated, updated_at: now, revision: ((row.revision as number | null) ?? 0) + 1 })
    .eq('user_id', user.id)
    .eq('video_id', videoId);

  revalidatePath('/dashboard');
}

// ─── Bulk delete bookmarks ────────────────────────────────────────────────────
export async function bulkDeleteBookmarks(pairs: { videoId: string; bookmarkId: number }[]) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Group by videoId to minimize DB reads
  const byVideo = new Map<string, Set<number>>();
  for (const { videoId, bookmarkId } of pairs) {
    if (!byVideo.has(videoId)) byVideo.set(videoId, new Set());
    byVideo.get(videoId)!.add(bookmarkId);
  }

  const videoIds = Array.from(byVideo.keys());
  const { data: rows } = await supabase
    .from('user_bookmarks')
    .select('video_id, bookmarks, revision')
    .eq('user_id', user.id)
    .in('video_id', videoIds);

  if (!rows) return;

  for (const row of rows) {
    const toDelete = byVideo.get(row.video_id as string);
    if (!toDelete) continue;

    const now = new Date().toISOString();
    const updated = (row.bookmarks as WireBookmark[]).map(b =>
      toDelete.has(b.id) && !isTombstone(b) ? makeTombstone(b.id, now) : b
    );

    await supabase
      .from('user_bookmarks')
      .update({ bookmarks: updated, updated_at: now, revision: ((row.revision as number | null) ?? 0) + 1 })
      .eq('user_id', user.id)
      .eq('video_id', row.video_id);
  }

  revalidatePath('/dashboard');
}

// ─── Import bookmarks (merge + dedup by id) ───────────────────────────────────
export async function importBookmarks(
  incoming: { videoId: string; bookmarks: Bookmark[] }[]
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const videoIds = incoming.map(g => g.videoId);
  const { data: existing } = await supabase
    .from('user_bookmarks')
    .select('video_id, bookmarks, revision')
    .eq('user_id', user.id)
    .in('video_id', videoIds);

  const existingMap = new Map<string, { bookmarks: WireBookmark[]; revision: number }>(
    (existing ?? []).map(row => [
      row.video_id as string,
      { bookmarks: (row.bookmarks as WireBookmark[]) ?? [], revision: (row.revision as number | null) ?? 0 },
    ])
  );

  for (const { videoId, bookmarks: newBms } of incoming) {
    const current = existingMap.get(videoId) ?? { bookmarks: [], revision: 0 };
    // Tombstone ids count as "existing" too — importing must not resurrect a
    // bookmark another device deleted.
    const existingIds = new Set(current.bookmarks.map(b => b.id));
    const merged = [...current.bookmarks, ...newBms.filter(b => !existingIds.has(b.id))];

    await supabase
      .from('user_bookmarks')
      .upsert(
        {
          user_id: user.id, video_id: videoId, bookmarks: merged,
          updated_at: new Date().toISOString(), revision: current.revision + 1,
        },
        { onConflict: 'user_id,video_id' }
      );
  }

  revalidatePath('/dashboard');
}
