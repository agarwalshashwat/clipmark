import { createServerSupabase, type Collection, type Bookmark } from '@/lib/supabase';
import styles from './page.module.css';

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatMonthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

function formatDayLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

type BookmarkWithCollection = Bookmark & { collection: Collection };

function groupBookmarksByMonth(bookmarks: BookmarkWithCollection[]): Map<string, BookmarkWithCollection[]> {
  const map = new Map<string, BookmarkWithCollection[]>();
  for (const b of bookmarks) {
    const key = formatMonthLabel(b.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return map;
}

export const metadata = { title: 'Dashboard — Clipmark' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; success?: string }>;
}) {
  const { view = 'library', success } = await searchParams;
  const isTimeline = view === 'timeline';

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  // auth is already guarded by layout, but keep type safety
  if (!user) return null;

  const { data: userBookmarksData } = await supabase
    .from('user_bookmarks')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  // Adapt user_bookmarks rows to the Collection shape used throughout this page
  const collections: Collection[] = (userBookmarksData ?? []).map(row => ({
    id: row.video_id as string,
    video_id: row.video_id as string,
    video_title: ((row.bookmarks as Bookmark[])?.[0]?.videoTitle) ?? null,
    bookmarks: (row.bookmarks as Bookmark[]) ?? [],
    created_at: row.updated_at as string,
    view_count: 0,
    user_id: row.user_id as string,
  }));
  const totalBookmarks = collections.reduce((sum, c) => sum + (c.bookmarks?.length ?? 0), 0);
  const uniqueTags = Array.from(new Set(collections.flatMap(c => (c.bookmarks ?? []).flatMap((b: Bookmark) => b.tags ?? []))));
  const lastSaved = collections[0]?.created_at ?? null;

  const allBookmarks: BookmarkWithCollection[] = collections
    .flatMap(c => (c.bookmarks ?? []).map(b => ({ ...b, collection: c })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const grouped = groupBookmarksByMonth(allBookmarks);

  const successBanner = success ? (
    <div style={{
      background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)',
      borderRadius: 10, padding: '14px 24px', marginBottom: 24,
      textAlign: 'center', fontSize: 15, color: '#006b5f',
      fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      Payment successful — welcome to Clipmark Pro! 🎉
    </div>
  ) : null;

  return isTimeline ? (
    <div className={styles.timelineWrap}>
      {successBanner}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Knowledge Stream</h1>
        <p className={styles.pageSub}>Your curated editorial journey through the web.</p>
      </div>

      {allBookmarks.length === 0 ? (
        <div className={styles.empty}>
          <p>No bookmarks yet. Save moments from YouTube videos using the extension.</p>
        </div>
      ) : (
        <div className={styles.timeline}>
          <div className={styles.timelineLine} />
          {Array.from(grouped.entries()).map(([month, bookmarks]) => (
            <div key={month}>
              <div className={styles.monthMarker}>
                <div className={styles.monthDot} />
                <span className={styles.monthLabel}>{month}</span>
              </div>
              {bookmarks.map((b, i) => (
                <div key={`${b.collection.id}-${b.timestamp}-${i}`} className={styles.timelineEntry}>
                  <div className={styles.entryDate}>
                    <span className={styles.dayLabel}>{formatDayLabel(b.createdAt)}</span>
                  </div>
                  <a href={`https://www.youtube.com/watch?v=${b.collection.video_id}`} className={styles.entryCard}>
                    <div className={styles.entryInner}>
                      <div className={styles.entryThumb}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://img.youtube.com/vi/${b.collection.video_id}/hqdefault.jpg`}
                          alt={b.collection.video_title ?? 'Video'}
                          className={styles.entryThumbImg}
                        />
                        <span className={styles.entryTimestamp}>{formatTimestamp(b.timestamp)}</span>
                      </div>
                      <div className={styles.entryBody}>
                        <div className={styles.entryTitleRow}>
                          <h3 className={styles.entryTitle}>{b.collection.video_title ?? 'Untitled Video'}</h3>
                        </div>
                        <p className={styles.entryNote}>{b.description || 'No note added.'}</p>
                        {b.tags?.length > 0 && (
                          <div className={styles.entryTags}>
                            {b.tags.slice(0, 3).map((tag: string) => (
                              <span key={tag} className={styles.entryTag}>#{tag}</span>
                            ))}
                          </div>
                        )}
                        <span className={styles.jumpLink}>
                          Jump to moment
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                        </span>
                      </div>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className={styles.libraryWrap}>
      {successBanner}
      <section className={styles.libraryHeader}>
        <div>
          <h1 className={styles.pageTitle}>Knowledge Stream</h1>
          <p className={styles.pageSub}>Your curated editorial journey through the web.</p>
        </div>
        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Bookmarks</span>
            <span className={styles.statNum}>{totalBookmarks}</span>
          </div>
          <div className={`${styles.statItem} ${styles.statBorder}`}>
            <span className={styles.statLabel}>Videos</span>
            <span className={styles.statNum}>{collections.length}</span>
          </div>
          <div className={`${styles.statItem} ${styles.statBorder}`}>
            <span className={styles.statLabel}>Unique Tags</span>
            <span className={styles.statNum}>{uniqueTags.length}</span>
          </div>
          <div className={`${styles.statItem} ${styles.statBorder}`}>
            <span className={styles.statLabel}>Last Saved</span>
            <span className={`${styles.statNum} ${styles.statNumSecondary}`}>
              {lastSaved ? timeAgo(lastSaved) : '—'}
            </span>
          </div>
        </div>
      </section>

      {collections.length === 0 ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(0,107,95,0.3)' }}>video_call</span>
          </div>
          <h3 className={styles.emptyTitle}>No collections yet</h3>
          <p className={styles.emptyText}>
            Install the extension and bookmark moments from YouTube videos to see them here.
          </p>
        </div>
      ) : (
        <div className={styles.videoGrid}>
          {collections.map(c => (
            <div key={c.id} className={styles.videoCard}>
              <div className={styles.videoLeft}>
                <a href={`https://www.youtube.com/watch?v=${c.video_id}`} className={styles.videoThumbWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.youtube.com/vi/${c.video_id}/hqdefault.jpg`}
                    alt={c.video_title ?? 'Video'}
                    className={styles.videoThumbImg}
                  />
                  <div className={styles.videoThumbOverlay} />
                  <div className={styles.videoMeta}>
                    <span className={styles.videoBadge}>YouTube</span>
                  </div>
                  <div className={styles.videoPlayBtn}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                  </div>
                </a>
                <div className={styles.scrubber}>
                  <div className={styles.scrubberTrack}>
                    {(c.bookmarks ?? []).map((b, i, arr) => {
                      const pos = arr.length > 1 ? (i / (arr.length - 1)) * 90 + 5 : 50;
                      return (
                        <div
                          key={i}
                          className={styles.scrubberMarker}
                          style={{ left: `${pos}%`, borderColor: b.color || '#006b5f' }}
                          title={formatTimestamp(b.timestamp)}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className={styles.videoActions}>
                  <a href={`https://www.youtube.com/watch?v=${c.video_id}`} className={styles.videoActionBtn}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                    Revisit
                  </a>
                  <button className={`${styles.videoActionBtn} ${styles.videoActionBtnSecondary}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>folder</span>
                    Group
                  </button>
                </div>
              </div>

              <div className={styles.videoRight}>
                <div className={styles.videoInfo}>
                  <h2 className={styles.videoTitle}>{c.video_title ?? 'Untitled Video'}</h2>
                  <p className={styles.videoSubMeta}>
                    <span className={styles.videoClipCount}>{c.bookmarks?.length ?? 0} Bookmarks</span>
                    <span className={styles.metaDot} />
                    <span>{new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </p>
                </div>
                <div className={styles.bookmarkThread}>
                  <div className={styles.threadLine} />
                  {(c.bookmarks ?? []).slice(0, 4).map((b, i) => (
                    <div key={i} className={styles.threadItem}>
                      <div className={styles.threadDot} style={{ borderColor: b.color || '#006b5f' }} />
                      <div className={styles.threadContent}>
                        <div className={styles.threadMeta}>
                          <span className={styles.threadTime} style={{ color: b.color || '#006b5f', background: `${b.color || '#006b5f'}12` }}>
                            {formatTimestamp(b.timestamp)}
                          </span>
                          <span className={styles.threadType}>
                            {b.description ? 'Annotated Bookmark' : 'Quick Clip'}
                          </span>
                        </div>
                        <p className={styles.threadNote}>{b.description || 'No note added.'}</p>
                      </div>
                    </div>
                  ))}
                  {(c.bookmarks?.length ?? 0) > 4 && (
                    <a href={`https://www.youtube.com/watch?v=${c.video_id}`} className={styles.expandLink}>
                      Expand All Curations
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className={styles.suggestionCard}>
            <div className={styles.suggestionIcon}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'rgba(0,107,95,0.35)' }}>video_call</span>
            </div>
            <h3 className={styles.suggestionTitle}>Add more variety</h3>
            <p className={styles.suggestionText}>
              Keep curating. AI-powered summaries are available for premium curators.
            </p>
            <a href="/upgrade" className={styles.suggestionCta}>Explore Pro</a>
          </div>
        </div>
      )}
    </div>
  );
}
