import { createServerSupabase, type Bookmark } from '@/lib/supabase';
import AnalyticsContent from './_components/AnalyticsContent';
import styles from './page.module.css';

export const metadata = { title: 'Analytics — ClipMark' };

import { getTagColor } from '../_utils/tagColors';

export default async function AnalyticsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Analytics is a Pro feature — mirrors the extension dashboard, which shows
  // an upgrade prompt in place of the view for free users (see
  // extension/src/popup/dashboard.js::renderAnalyticsView).
  const { data: profileData } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', user.id)
    .single();
  const isPro = (profileData?.is_pro as boolean | null) ?? false;

  if (!isPro) {
    return (
      <div className={styles.wrap}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Analytics</h1>
          <p className={styles.pageSub}>Insights into your bookmarking habits.</p>
        </div>
        <div className={styles.empty}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 40, color: 'var(--text-faint)' }}>bar_chart</span>
          <h3>Analytics — Pro Feature</h3>
          <p className={styles.emptyText}>
            See which topics you save most, activity over time, and tag insights — all from your own data.
          </p>
          <a
            href="/upgrade"
            style={{
              display: 'inline-block', marginTop: 16, padding: '10px 22px', borderRadius: 10,
              background: 'var(--accent-strong)', color: 'white', fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}
          >
            ✦ Upgrade to Pro
          </a>
        </div>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from('user_bookmarks')
    .select('video_id, bookmarks')
    .eq('user_id', user.id);

  // videoId normally travels with each bookmark already, but fall back to the
  // row's video_id defensively (needed for the per-tag video count below).
  const allBookmarks: Bookmark[] = (rows ?? []).flatMap(r =>
    ((r.bookmarks as Bookmark[]) ?? []).map(b => ({ ...b, videoId: b.videoId || (r.video_id as string) }))
  );

  if (allBookmarks.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Analytics</h1>
          <p className={styles.pageSub}>Insights into your bookmarking habits.</p>
        </div>
        <div className={styles.empty}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 40, color: 'var(--text-faint)' }}>bar_chart</span>
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
  // videos: Set of videoIds a tag appears in — mirrors the extension's
  // analytics-meta "N videos" line (dashboard.js::renderAnalyticsView).
  const tagMap = new Map<string, { count: number; color: string; videos: Set<string> }>();
  for (const b of allBookmarks) {
    for (const tag of (b.tags ?? [])) {
      if (!tagMap.has(tag)) tagMap.set(tag, { count: 0, color: getTagColor(tag), videos: new Set() });
      const entry = tagMap.get(tag)!;
      entry.count++;
      if (b.videoId) entry.videos.add(b.videoId);
    }
  }
  const tags = Array.from(tagMap.entries())
    .map(([name, { count, color, videos }]) => ({ name, count, color, videoCount: videos.size }))
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
