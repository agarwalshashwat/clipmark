import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabase, type Profile, type Collection } from '@/lib/supabase';
import styles from './page.module.css';
import { APP_URL } from '@/app/lib/constants';
import { ogImageUrl } from '@/app/lib/seo';

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function getProfile(username: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single();
  return data as Profile | null;
}

async function getUserCollections(userId: string): Promise<Collection[]> {
  const { data } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as Collection[];
}

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: 'User not found — ClipMark' };

  // A subtitle rather than `count=0`, which rendered a literal
  // "0 Bookmarks Curated" on every profile card regardless of what the profile
  // actually holds. The card has no per-profile total to show here, so it says
  // what the page is instead of asserting a number that is always wrong.
  const ogUrl = ogImageUrl(
    `@${username} on ClipMark`,
    'Public collections of timestamped YouTube moments.',
  );

  return {
    title: `@${username} — ClipMark`,
    description: `Browse ${username}'s public YouTube bookmark collections on ClipMark.`,
    alternates: {
      canonical: `/u/${username}`,
    },
    openGraph: {
      title: `@${username} — ClipMark`,
      description: `Public shared collections by @${username}. Save and organize your YouTube knowledge.`,
      type: 'profile',
      url: `/u/${username}`,
      siteName: 'ClipMark',
      username: username,
      images: [
        {
          url: ogUrl,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `@${username} — ClipMark`,
      description: `Public shared collections by @${username}. Save and organize your YouTube knowledge.`,
      images: [ogUrl],
    },
  };
}

// ─── Structured Data (JSON-LD) ────────────────────────────────────────────────
function generateJsonLd(username: string, profile: Profile) {
  const baseUrl = APP_URL;
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    'mainEntity': {
      '@type': 'Person',
      'name': username,
      'alternateName': `@${username}`,
      'identifier': profile.id,
      'image': profile.avatar_url,
      'url': `${baseUrl}/u/${username}`,
    }
  };
}

export default async function UserProfilePage(
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) notFound();

  const collections = await getUserCollections(profile.id);
  const jsonLd = generateJsonLd(username, profile);

  // Derive stats
  const totalClips = collections.reduce((sum, c) => sum + (c.bookmarks?.length ?? 0), 0);
  const totalViews = collections.reduce((sum, c) => sum + (c.view_count ?? 0), 0);

  const avatarInitial = username[0].toUpperCase();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className={styles.main}>

        {/* ── Profile hero ── */}
        <section className={styles.hero}>
          <div className={styles.avatarWrap}>
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={username} className={styles.avatarImg} />
            ) : (
              <div className={styles.avatarFallback}>{avatarInitial}</div>
            )}
          </div>

          <h1 className={styles.displayName}>{username}</h1>
          <p className={styles.handle}>@{username}</p>

          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statNum}>{totalClips}</span>
              <span className={styles.statLabel}>Clips</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statNum}>{collections.length}</span>
              <span className={styles.statLabel}>Collections</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statNum}>{totalViews >= 1000 ? `${(totalViews / 1000).toFixed(1)}k` : totalViews}</span>
              <span className={styles.statLabel}>Views</span>
            </div>
          </div>
        </section>

        {/* ── Collections grid ── */}
        <section className={styles.collectionsSection}>
          <div className={styles.collectionsHeader}>
            <h2 className={styles.collectionsHeading}>Public Collections</h2>
            <div className={styles.sortBtns}>
              <button className={`${styles.sortBtn} ${styles.sortBtnActive}`}>Latest</button>
              <button className={styles.sortBtn}>Popular</button>
            </div>
          </div>

          {collections.length === 0 ? (
            <div className={styles.empty} style={{ textAlign: 'center', padding: '80px 0' }}>
              <div className="cm-icon-badge" style={{ margin: '0 auto 24px', width: 64, height: 64 }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 32 }}>folder_off</span>
              </div>
              <p style={{ fontSize: 18, color: 'var(--text-muted)', fontWeight: 600 }}>No public collections yet.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {collections.map(c => (
                <a key={c.id} href={`/v/${c.id}`} className={styles.card}>
                  <div className={styles.cardThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://img.youtube.com/vi/${c.video_id}/hqdefault.jpg`}
                      alt={c.video_title ?? 'YouTube video'}
                      className={styles.cardThumbImg}
                    />
                    <div className={styles.cardClipCount}>
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>bookmark</span>
                      {c.bookmarks?.length ?? 0} clips
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.cardTitle}>
                      {c.video_title ?? 'Untitled Video'}
                    </h3>
                    <p className={styles.cardMeta}>
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    {c.bookmarks?.slice(0, 1).map((b, i) => (
                      <p key={i} className={styles.cardSnippet}>
                        <span style={{ color: b.color || 'var(--accent)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                          [{formatTimestamp(b.timestamp)}]
                        </span>
                        {' '}
                        {b.description || 'No description'}
                      </p>
                    ))}
                    <span className={styles.cardExploreLink}>
                      Explore Collection
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>arrow_forward</span>
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
