import { createServerSupabase } from '@/lib/supabase';
import styles from './page.module.css';
import RemindersContent from './RemindersContent';

export const metadata = { title: 'Reminders — Clipmark' };

export default async function RemindersPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date().toISOString();

  // Fetch reminders, user bookmarks, and groups in parallel
  const [{ data: remindersData }, { data: userBookmarksData }, { data: groupsData }] = await Promise.all([
    supabase
      .from('revisit_reminders')
      .select('*')
      .eq('user_id', user.id)
      .order('next_due_at', { ascending: true }),
    supabase
      .from('user_bookmarks')
      .select('video_id, bookmarks')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('groups')
      .select('id, name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  type BookmarkRow = { videoTitle?: string; tags?: string[] };

  const collections = (userBookmarksData ?? []).map(row => ({
    id: row.video_id as string,
    video_id: row.video_id as string,
    video_title: ((row.bookmarks as BookmarkRow[])?.[0]?.videoTitle) ?? null,
    tags: Array.from(new Set((row.bookmarks as BookmarkRow[] ?? []).flatMap(b => b.tags ?? []))).slice(0, 4),
  }));

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

  const collectionTargets = collections.map(c => ({
    id: c.id,
    label: c.video_title ?? 'Untitled Video',
    videoId: c.video_id,
    tags: c.tags,
    type: 'collection' as const,
  }));
  const groupTargets = (groupsData ?? []).map((g: { id: string; name: string }) => ({
    id: g.id,
    label: g.name,
    type: 'group' as const,
  }));

  return (
    <div className={styles.pageWrap}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Reminders &amp; Re-engagement</h1>
        <p className={styles.sub}>Set intentional moments to revisit your curated content. Use the editorial scheduler to keep your learning loop continuous.</p>
      </div>

      <RemindersContent
        dueReminders={dueReminders}
        upcomingReminders={upcomingReminders}
        collections={collectionTargets}
        groups={groupTargets}
      />
    </div>
  );
}
