import { createServerSupabase, type Bookmark } from '@/lib/supabase';
import styles from './page.module.css';

export const metadata = { title: 'Videos — Clipmark' };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default async function VideosPage() {
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
    return {
      videoId: row.video_id as string,
      videoTitle: bookmarks[0]?.videoTitle ?? null,
      bookmarkCount: bookmarks.length,
      lastSaved: row.updated_at as string,
    };
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Videos</h1>
        <p className={styles.pageSub}>{videos.length} video{videos.length !== 1 ? 's' : ''} with bookmarks</p>
      </div>

      {videos.length === 0 ? (
        <div className={styles.empty}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'rgba(0,107,95,0.3)' }}>video_library</span>
          <h3>No videos yet</h3>
          <p>Bookmark moments from YouTube videos to see them here.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {videos.map(v => (
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
                <p className={styles.meta}>{timeAgo(v.lastSaved)}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
