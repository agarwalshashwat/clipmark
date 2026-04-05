import { createServerSupabase, type Collection } from '@/lib/supabase';
import styles from './page.module.css';
import { DashboardCopyLinkButton } from './CopyLinkButton';

export const metadata = { title: 'Shared Collections — Clipmark' };

export default async function SharedPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch collections that have been shared (view_count > 0 means they've been accessed)
  const { data: collectionsData } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', user.id)
    .order('view_count', { ascending: false });

  const collections = (collectionsData ?? []) as Collection[];
  const shared = collections.filter(c => (c.view_count ?? 0) > 0);
  const unshared = collections.filter(c => (c.view_count ?? 0) === 0);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com';

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Shared Collections</h1>
        <p className={styles.sub}>Collections others can view — share a link and they{'\u2019'}re live instantly.</p>
      </div>

      {collections.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(0,107,95,0.3)' }}>ios_share</span>
          </div>
          <h3 className={styles.emptyTitle}>Nothing shared yet</h3>
          <p className={styles.emptyText}>
            Share any of your collections via a public link. Viewers can explore your bookmarks without an account.
          </p>
        </div>
      ) : (
        <>
          {shared.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>link</span>
                Active Shares
              </h2>
              <div className={styles.list}>
                {shared.map(c => (
                  <div key={c.id} className={styles.card}>
                    <div className={styles.cardLeft}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${c.video_id}/hqdefault.jpg`}
                        alt={c.video_title ?? 'Video'}
                        className={styles.cardThumb}
                      />
                      <div className={styles.cardInfo}>
                        <p className={styles.cardTitle}>{c.video_title ?? 'Untitled Video'}</p>
                        <p className={styles.cardMeta}>
                          <span className={styles.cardViews}>{c.view_count} view{c.view_count !== 1 ? 's' : ''}</span>
                          <span className={styles.metaDot} />
                          <span>{c.bookmarks?.length ?? 0} bookmarks</span>
                        </p>
                        <div className={styles.urlRow}>
                          <code className={styles.urlCode}>{origin}/v/{c.id}</code>
                          <a href={`/v/${c.id}`} target="_blank" rel="noopener noreferrer" className={styles.urlOpen}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <DashboardCopyLinkButton url={`${origin}/v/${c.id}`} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {unshared.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>lock</span>
                Private Collections
              </h2>
              <p className={styles.sectionSub}>Share these via a public link — no viewer account needed.</p>
              <div className={styles.list}>
                {unshared.map(c => (
                  <div key={c.id} className={`${styles.card} ${styles.cardPrivate}`}>
                    <div className={styles.cardLeft}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${c.video_id}/hqdefault.jpg`}
                        alt={c.video_title ?? 'Video'}
                        className={styles.cardThumb}
                      />
                      <div className={styles.cardInfo}>
                        <p className={styles.cardTitle}>{c.video_title ?? 'Untitled Video'}</p>
                        <p className={styles.cardMeta}>
                          <span>{c.bookmarks?.length ?? 0} bookmarks</span>
                          <span className={styles.metaDot} />
                          <span>Not yet shared</span>
                        </p>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <a href={`/v/${c.id}`} className={styles.shareBtn}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>ios_share</span>
                        Share
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
