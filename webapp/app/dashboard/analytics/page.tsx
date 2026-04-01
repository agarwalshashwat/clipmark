import { createServerSupabase, type Bookmark } from '@/lib/supabase';
import AnalyticsContent from './_components/AnalyticsContent';
import styles from './page.module.css';

export const metadata = { title: 'Analytics — Clipmark' };

import { getTagColor } from '../_utils/tagColors';

export default async function AnalyticsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from('user_bookmarks')
    .select('bookmarks')
    .eq('user_id', user.id);

  const allBookmarks: Bookmark[] = (rows ?? []).flatMap(r => (r.bookmarks as Bookmark[]) ?? []);

  if (allBookmarks.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Analytics</h1>
          <p className={styles.pageSub}>Insights into your bookmarking habits.</p>
        </div>
        <div className={styles.empty}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'rgba(0,107,95,0.3)' }}>bar_chart</span>
          <h3>No data yet</h3>
          <p>Bookmark moments from YouTube videos to see analytics here.</p>
        </div>
      </div>
    );
  }

  // ── Activity heatmap: last 14 days ──────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const heatmap: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    heatmap.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  for (const b of allBookmarks) {
    const day = b.createdAt?.slice(0, 10);
    const cell = heatmap.find(c => c.date === day);
    if (cell) cell.count++;
  }

  // ── Tag breakdown ────────────────────────────────────────────────────────────
  const tagMap = new Map<string, { count: number; color: string }>();
  for (const b of allBookmarks) {
    for (const tag of (b.tags ?? [])) {
      if (!tagMap.has(tag)) tagMap.set(tag, { count: 0, color: getTagColor(tag) });
      tagMap.get(tag)!.count++;
    }
  }
  const tags = Array.from(tagMap.entries())
    .map(([name, { count, color }]) => ({ name, count, color }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Analytics</h1>
        <p className={styles.pageSub}>
          {allBookmarks.length} total bookmarks · {tags.length} unique tags
        </p>
      </div>
      <AnalyticsContent heatmap={heatmap} tags={tags} totalBookmarks={allBookmarks.length} />
    </div>
  );
}
