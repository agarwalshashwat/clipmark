import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabase, type Profile, type Collection } from '@/lib/supabase';
import styles from './page.module.css';

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
  if (!profile) return { title: 'User not found — Clipmark' };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clipmark.mithahara.com';
  const ogUrl = `${baseUrl}/api/og?title=${encodeURIComponent(`@${username}'s Profile`)}&count=0`;

  return {
    title: `@${username} — Clipmark`,
    description: `Browse ${username}'s public YouTube bookmark collections on Clipmark.`,
    alternates: {
      canonical: `/u/${username}`,
    },
    openGraph: {
      title: `@${username} — Clipmark`,
      description: `Public shared collections by @${username}. Save and organize your YouTube knowledge.`,
      type: 'profile',
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
      title: `@${username} — Clipmark`,
      description: `Public shared collections by @${username}. Save and organize your YouTube knowledge.`,
      images: [ogUrl],
    },
  };
}

// ─── Structured Data (JSON-LD) ────────────────────────────────────────────────
function generateJsonLd(username: string, profile: Profile) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clipmark.mithahara.com';
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
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Fixed glass header ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <a href="/" className={styles.navLogo}>Clipmark</a>
          <div className={styles.navLinks}>
            <a href={`/u/${username}`} className={`${styles.navLink} ${styles.navLinkActive}`}>Profile</a>
            <a href="/#features" className={styles.navLink}>Explore</a>
            <a href="/upgrade" className={styles.navLink}>Collections</a>
          </div>
          <div className={styles.navActions}>
            <button className={styles.navIconBtn} aria-label="Search">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
            </button>
            <button className={styles.navIconBtn} aria-label="Account">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}
              >
                account_circle
              </span>
            </button>
          </div>
        </div>
      </nav>

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
            <div className={styles.empty}>
              <p>No public collections yet.</p>
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
                        <span style={{ color: b.color || '#14B8A6', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                          {formatTimestamp(b.timestamp)}
                        </span>
                        {' '}
                        {b.description || 'No description'}
                      </p>
                    ))}
                    <span className={styles.cardExploreLink}>
                      Explore Collection
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerCopy}>© 2025 Clipmark. The Digital Curator.</span>
          <nav className={styles.footerLinks}>
            {['Privacy', 'Terms', 'Support'].map(label => (
              <a key={label} href={`/${label.toLowerCase()}`} className={styles.footerLink}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </footer>

    </div>
  );
}
