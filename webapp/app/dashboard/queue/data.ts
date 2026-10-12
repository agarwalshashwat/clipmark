import type { SupabaseClient } from '@supabase/supabase-js';
import { liveBookmarks } from '@/lib/bookmarks';

export interface QueueTarget {
  id: string;
  label: string;
  videoId?: string;
  tags?: string[];
  type: 'collection' | 'group';
}

export type QueuePageData =
  | { blocked: true }
  | {
      blocked: false;
      dueReminders: any[];
      upcomingReminders: any[];
      collectionTargets: QueueTarget[];
      groupTargets: QueueTarget[];
    };

/**
 * Reminders are a Pro-only feature (same entitlement /api/reminders enforces).
 * Check is_pro server-side via the caller's own RLS-scoped client *before*
 * touching revisit_reminders — RLS only scopes rows to their owner, it does
 * not know about Pro status, so skipping this check would serve a free
 * user's own reminder data for free.
 */
export async function loadRemindersQueue(
  supabase: SupabaseClient,
  userId: string,
): Promise<QueuePageData> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', userId)
    .single();

  if (profile?.is_pro !== true) return { blocked: true };

  const now = new Date().toISOString();

  const [{ data: remindersData }, { data: userBookmarksData }, { data: groupsData }] = await Promise.all([
    supabase
      .from('revisit_reminders')
      .select('*')
      .eq('user_id', userId)
      .order('next_due_at', { ascending: true }),
    supabase
      .from('user_bookmarks')
      .select('video_id, bookmarks')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('groups')
      .select('id, name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  // liveBookmarks: the JSONB may carry sync tombstones — never surface those.
  const collections = (userBookmarksData ?? []).map(row => {
    const bookmarks = liveBookmarks(row.bookmarks);
    return {
      id: row.video_id as string,
      video_id: row.video_id as string,
      video_title: bookmarks[0]?.videoTitle ?? null,
      tags: Array.from(new Set(bookmarks.flatMap(b => b.tags ?? []))).slice(0, 4),
    };
  });

  const collectionMap = new Map(collections.map(c => [c.id, c]));
  const groupMap = new Map((groupsData ?? []).map((g: { id: string; name: string }) => [g.id, g]));

  const reminders = (remindersData ?? []).map(r => {
    let targetLabel = 'Unknown';
    let videoId: string | undefined;

    if (r.target_type === 'collection') {
      const c = collectionMap.get(r.target_id);
      targetLabel = c?.video_title ?? 'Untitled Video';
      videoId = c?.video_id;
    } else {
      const g = groupMap.get(r.target_id);
      targetLabel = g?.name ?? 'Unknown Group';
    }

    return { ...r, targetLabel, videoId };
  });

  const dueReminders = reminders.filter(r => r.next_due_at <= now);
  const upcomingReminders = reminders.filter(r => r.next_due_at > now);

  const collectionTargets: QueueTarget[] = collections.map(c => ({
    id: c.id,
    label: c.video_title ?? 'Untitled Video',
    videoId: c.video_id,
    tags: c.tags,
    type: 'collection' as const,
  }));
  const groupTargets: QueueTarget[] = (groupsData ?? []).map((g: { id: string; name: string }) => ({
    id: g.id,
    label: g.name,
    type: 'group' as const,
  }));

  return { blocked: false, dueReminders, upcomingReminders, collectionTargets, groupTargets };
}
