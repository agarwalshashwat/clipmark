import { createServerSupabase, type Collection } from '@/lib/supabase';
import styles from './page.module.css';
import GroupsContent from './GroupsContent';

export const metadata = { title: 'Groups — Clipmark' };

export default async function GroupsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userBookmarksData } = await supabase
    .from('user_bookmarks')
    .select('video_id, bookmarks, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  type BmRow = { tags?: string[]; videoTitle?: string };
  const collections: Collection[] = (userBookmarksData ?? []).map(row => ({
    id: row.video_id as string,
    video_id: row.video_id as string,
    video_title: ((row.bookmarks as BmRow[])?.[0]?.videoTitle) ?? null,
    bookmarks: (row.bookmarks as unknown) as import('@/lib/supabase').Bookmark[],
    created_at: row.updated_at as string,
    view_count: 0,
    user_id: user.id,
  }));

  // ── User-created groups ──────────────────────────────────────────────────
  const { data: groupsData } = await supabase
    .from('groups')
    .select('*, group_collections(collection_id)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const collectionMap = new Map(collections.map(c => [c.id, c]));

  const userGroups = (groupsData ?? []).map(g => {
    let groupCollections: Collection[];

    if (g.type === 'tag' && g.tag_name) {
      // Tag group: auto-populate from collections where any bookmark has this tag
      groupCollections = collections.filter(c =>
        (c.bookmarks ?? []).some((b: { tags?: string[] }) => (b.tags ?? []).includes(g.tag_name!))
      );
    } else {
      // Custom group: use junction table memberships
      const ids: string[] = (g.group_collections ?? []).map((gc: { collection_id: string }) => gc.collection_id);
      groupCollections = ids.map(id => collectionMap.get(id)).filter(Boolean) as Collection[];
    }

    return { id: g.id, name: g.name, type: g.type as 'custom' | 'tag', tag_name: g.tag_name ?? null, collections: groupCollections };
  });

  // ── Auto-tag groups (existing behaviour) ────────────────────────────────
  const tagMap = new Map<string, Collection[]>();
  for (const c of collections) {
    const tags = Array.from(new Set((c.bookmarks ?? []).flatMap((b: { tags?: string[] }) => b.tags ?? [])));
    if (tags.length === 0) {
      if (!tagMap.has('Untagged')) tagMap.set('Untagged', []);
      tagMap.get('Untagged')!.push(c);
    } else {
      for (const tag of tags) {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag)!.push(c);
      }
    }
  }
  const autoTagGroups = Array.from(tagMap.entries()).map(([tag, cols]) => ({ tag, collections: cols }));

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Groups</h1>
        <p className={styles.sub}>Organise your videos into custom groups or browse by tag.</p>
      </div>

      {collections.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(0,107,95,0.3)' }}>folder_shared</span>
          </div>
          <h3 className={styles.emptyTitle}>No bookmarks yet</h3>
          <p className={styles.emptyText}>
            Start bookmarking videos in the extension and they&apos;ll appear here for grouping.
          </p>
        </div>
      ) : (
        <GroupsContent userGroups={userGroups} autoTagGroups={autoTagGroups} allCollections={collections} />
      )}
    </div>
  );
}
