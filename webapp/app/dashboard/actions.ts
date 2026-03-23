'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, type Bookmark } from '@/lib/supabase';

// ─── Delete a single bookmark ─────────────────────────────────────────────────
export async function deleteBookmark(videoId: string, bookmarkId: number) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: row } = await supabase
    .from('user_bookmarks')
    .select('bookmarks')
    .eq('user_id', user.id)
    .eq('video_id', videoId)
    .single();

  if (!row) return;

  const updated = (row.bookmarks as Bookmark[]).filter(b => b.id !== bookmarkId);

  if (updated.length === 0) {
    // Remove the entire video row when no bookmarks remain
    await supabase
      .from('user_bookmarks')
      .delete()
      .eq('user_id', user.id)
      .eq('video_id', videoId);
  } else {
    await supabase
      .from('user_bookmarks')
      .update({ bookmarks: updated, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('video_id', videoId);
  }

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
    .select('video_id, bookmarks')
    .eq('user_id', user.id)
    .in('video_id', videoIds);

  if (!rows) return;

  for (const row of rows) {
    const toDelete = byVideo.get(row.video_id as string);
    if (!toDelete) continue;

    const updated = (row.bookmarks as Bookmark[]).filter(b => !toDelete.has(b.id));

    if (updated.length === 0) {
      await supabase
        .from('user_bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('video_id', row.video_id);
    } else {
      await supabase
        .from('user_bookmarks')
        .update({ bookmarks: updated, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('video_id', row.video_id);
    }
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
    .select('video_id, bookmarks')
    .eq('user_id', user.id)
    .in('video_id', videoIds);

  const existingMap = new Map<string, Bookmark[]>(
    (existing ?? []).map(row => [row.video_id as string, (row.bookmarks as Bookmark[]) ?? []])
  );

  for (const { videoId, bookmarks: newBms } of incoming) {
    const current = existingMap.get(videoId) ?? [];
    const existingIds = new Set(current.map(b => b.id));
    const merged = [...current, ...newBms.filter(b => !existingIds.has(b.id))];

    await supabase
      .from('user_bookmarks')
      .upsert(
        { user_id: user.id, video_id: videoId, bookmarks: merged, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,video_id' }
      );
  }

  revalidatePath('/dashboard');
}
