import { Suspense } from 'react';
import { createServerSupabase, type Bookmark } from '@/lib/supabase';
import styles from './page.module.css';
import VideosSortSelect from './VideosSortSelect';

export const metadata = { title: 'Videos — Clipmark' };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatTs(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort = 'recently_updated' } = await searchParams;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from('user_bookmarks')
    .select('video_id, bookmarks, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  const videos = (rows ?? []).map(row => {
    const bookmarks = (row.bookmarks as Bookmark[]) ?? [];
    const timestamps = bookmarks.map(b => b.timestamp).sort((a, b) => a - b);
    return {
      videoId: row.video_id as string,
      videoTitle: bookmarks
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .find(b => b.videoTitle)?.videoTitle ?? null,
      bookmarkCount: bookmarks.length,
      lastSaved: row.updated_at as string,
      tags: Array.from(new Set(bookmarks.flatMap(b => b.tags ?? []))).slice(0, 4),
      timeRange: timestamps.length >= 2
        ? `${formatTs(timestamps[0])} – ${formatTs(timestamps[timestamps.length - 1])}`
        : timestamps.length === 1 ? formatTs(timestamps[0]) : null,
    };
  });

  const sorted = sort === 'most_bookmarks'
    ? [...videos].sort((a, b) => b.bookmarkCount - a.bookmarkCount)
    : sort === 'oldest_first'
    ? [...videos].sort((a, b) => new Date(a.lastSaved).getTime() - new Date(b.lastSaved).getTime())
    : videos;

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <h1 className={styles.pageTitle}>Videos</h1>
          <p className={styles.pageSub}>{sorted.length} video{sorted.length !== 1 ? 's' : ''} with bookmarks</p>
        </div>
        <Suspense fallback={null}>
          <VideosSortSelect current={sort} className={styles.sortSelect} />
        </Suspense>
      </div>

      {sorted.length === 0 ? (
        <div className={styles.empty}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'rgba(0,107,95,0.3)' }}>video_library</span>
          <h3>No videos yet</h3>
          <p>Bookmark moments from YouTube videos to see them here.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {sorted.map(v => (
            <a
              key={v.videoId}
              href={`https://www.youtube.com/watch?v=${v.videoId}`}
              className={styles.card}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className={styles.thumbWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`}
                  alt={v.videoTitle ?? 'Video'}
                  className={styles.thumb}
                />
                <div className={styles.thumbOverlay} />
                <span className={styles.badge}>{v.bookmarkCount} {v.bookmarkCount === 1 ? 'bookmark' : 'bookmarks'}</span>
                <div className={styles.playBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                </div>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.title}>{v.videoTitle ?? 'Untitled Video'}</h3>
                {v.timeRange && <p className={styles.timeRange}>{v.timeRange}</p>}
                {v.tags.length > 0 && (
                  <div className={styles.tagRow}>
                    {v.tags.map(tag => (
                      <span key={tag} className={styles.tagChip}>#{tag}</span>
                    ))}
                  </div>
                )}
                <p className={styles.meta}>{timeAgo(v.lastSaved)}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
