import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { supabase, type Collection, type Bookmark } from '@/lib/supabase';
import styles from './page.module.css';
import { CopyLinkButton } from './CopyLinkButton';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function ytUrl(videoId: string, timestamp: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp)}`;
}

function ytThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Derive a stable tag color from the tag string or bookmark color
function tagStyle(color: string | null | undefined): { background: string; color: string } {
  const base = color || '#006b5f';
  return {
    background: `${base}18`,
    color: base,
  };
}

// ─── Fetch data (server-side) ─────────────────────────────────────────────────
async function getCollection(shareId: string): Promise<Collection | null> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('id', shareId)
    .single();

  if (error || !data) return null;

  // Increment view count (fire-and-forget)
  supabase
    .from('collections')
    .update({ view_count: (data.view_count ?? 0) + 1 })
    .eq('id', shareId)
    .then(() => {});

  return data as Collection;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ shareId: string }> }
): Promise<Metadata> {
  const { shareId } = await params;
  const collection = await getCollection(shareId);
  if (!collection) return { title: 'Not found — Clipmark' };

  const title = collection.video_title || 'YouTube Video';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clipmark.mithahara.com';
  const ogUrl = `${baseUrl}/api/og?title=${encodeURIComponent(title)}&videoId=${collection.video_id}&count=${collection.bookmarks.length}`;

  return {
    title: `${title} — Clipmark`,
    description: `${collection.bookmarks.length} timestamped bookmarks for "${title}"`,
    alternates: {
      canonical: `/v/${shareId}`,
    },
    openGraph: {
      title: `${title} — Clipmark`,
      description: `${collection.bookmarks.length} curated moments from this video.`,
      type: 'video.other',
      images: [
        {
          url: ogUrl,
          width: 1200,
          height: 630,
          alt: `Clipmark shared bookmarks for ${title}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — Clipmark`,
      description: `${collection.bookmarks.length} curated moments from this video.`,
      images: [ogUrl],
    },
  };
}

// ─── Structured Data (JSON-LD) ────────────────────────────────────────────────
function generateJsonLd(collection: Collection, shareId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clipmark.mithahara.com';
  const url = `${baseUrl}/v/${shareId}`;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': collection.video_title,
    'description': `${collection.bookmarks.length} timestamped bookmarks for this video`,
    'url': url,
    'numberOfItems': collection.bookmarks.length,
    'itemListElement': collection.bookmarks.map((bm, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': bm.description || `Bookmark at ${formatTimestamp(bm.timestamp)}`,
      'url': `${url}#bm-${bm.id}`,
    })),
    'mainEntity': {
      '@type': 'VideoObject',
      'name': collection.video_title,
      'description': collection.video_title,
      'thumbnailUrl': ytThumbnailUrl(collection.video_id),
      'uploadDate': collection.created_at,
      'contentUrl': `https://www.youtube.com/watch?v=${collection.video_id}`,
      'embedUrl': `https://www.youtube.com/embed/${collection.video_id}`,
    }
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function SharePage(
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const collection = await getCollection(shareId);
  if (!collection) notFound();

  const { video_id, video_title, bookmarks, created_at, view_count } = collection;
  const title = video_title || 'Untitled Video';
  const ytBase = `https://www.youtube.com/watch?v=${video_id}`;
  const thumbnailUrl = ytThumbnailUrl(video_id);

  const jsonLd = generateJsonLd(collection, shareId);

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Fixed glass nav ── */}
      <header className={styles.nav}>
        <a href="/" className={styles.navLogo}>Clipmark</a>

        <a href="/login" className={styles.navSecondaryAction}>
          Save this Collection
        </a>

        <a href="https://chrome.google.com/webstore" className={styles.heroCta}>
          Get Extension
        </a>
      </header>

      {/* ── Main content ── */}
      <main className={styles.main}>
        <div className={styles.grid}>

          {/* ── Left column (8-col) ── */}
          <div className={styles.leftCol}>

            {/* Video area */}
            <div className={styles.videoArea}>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                <Image
                  src={thumbnailUrl}
                  alt={`Thumbnail for ${title}`}
                  fill
                  className={styles.videoThumb}
                  style={{ objectFit: 'cover' }}
                  priority
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              </div>
              <div className={styles.videoOverlay}>
                <a
                  href={ytBase}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.playButton}
                  aria-label="Watch on YouTube"
                >
                  <span className={styles.playIcon} />
                </a>
              </div>
            </div>

            {/* Editorial header */}
            <div className={styles.editorialHeader}>
              <h1 className={styles.videoTitle}>{title}</h1>
              <p className={styles.sharedBy}>
                Shared via{' '}
                <span className={styles.sharedByHighlight}>Clipmark</span>
              </p>
            </div>

            {/* Curation highlights / timeline */}
            <div className={styles.highlights}>
              <h3 className={styles.highlightsHeading}>
                Curation Highlights
                <span className={styles.clipsCount}>
                  {bookmarks.length} Clip{bookmarks.length !== 1 ? 's' : ''}
                </span>
              </h3>

              <ul className={styles.timelineList}>
                {bookmarks.map((b: Bookmark, i: number) => (
                  <li key={b.id ?? i} className={styles.timelineItem}>
                    <span className={styles.timelineDot} />
                    <div className={styles.timelineItemBody}>
                      <a
                        href={ytUrl(video_id, b.timestamp)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.tsLink}
                      >
                        {formatTimestamp(b.timestamp)}
                      </a>
                      {b.description && (
                        <h4 className={styles.bookmarkTitle}>
                          {b.description}
                        </h4>
                      )}
                      {b.tags && b.tags.length > 0 && (
                        <div className={styles.tagList}>
                          {b.tags.map(tag => (
                            <span
                              key={tag}
                              className={styles.tagPill}
                              style={tagStyle(b.color)}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

          </div>{/* /leftCol */}

          {/* ── Right sidebar (4-col) ── */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarInner}>

              {/* Collection details card */}
              <div className={styles.sideCard}>
                <div>
                  <h5 className={styles.sideCardHeading}>Collection Details</h5>
                  <ul className={styles.metaList}>
                    <li className={styles.metaRow}>
                      <span className={styles.metaLabel}>Shared Date</span>
                      <span className={styles.metaValue}>
                        {formatDate(created_at)}
                      </span>
                    </li>
                    <li className={styles.metaRow}>
                      <span className={styles.metaLabel}>Total Clips</span>
                      <span className={styles.metaValue}>
                        {bookmarks.length.toString().padStart(2, '0')}
                      </span>
                    </li>
                    <li className={styles.metaRow}>
                      <span className={styles.metaLabel}>Total Views</span>
                      <span className={styles.metaValue}>
                        {(view_count ?? 0).toLocaleString()}
                      </span>
                    </li>
                  </ul>
                </div>

                <hr className={styles.sideCardDivider} />

                <div className={styles.sideCardActions}>
                  <a
                    href={ytBase}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sideBtn}
                  >
                    Watch on YouTube
                  </a>
                  <button className={styles.sideBtnSecondary}>
                    Share this collection
                  </button>
                </div>
              </div>

              {/* Promo card — viral acquisition CTA */}
              <div className={styles.promoCard} style={{
                background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, rgba(0,107,95,0.06) 100%)',
                border: '1px solid rgba(20,184,166,0.25)',
              }}>
                <div style={{ fontSize: 22, marginBottom: 10 }}>📌</div>
                <h6 className={styles.promoTitle} style={{ fontSize: 16, marginBottom: 8 }}>
                  Bookmark YouTube moments like these
                </h6>
                <p className={styles.promoBody} style={{ fontSize: 13, marginBottom: 18 }}>
                  Clipmark is a free Chrome extension that lets you save, tag, and share
                  timestamped highlights from any YouTube video — in one click.
                </p>
                <a
                  href="https://chrome.google.com/webstore"
                  style={{
                    display: 'block', textAlign: 'center',
                    padding: '12px 20px',
                    background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
                    color: 'white', borderRadius: 10,
                    fontSize: 14, fontWeight: 700, textDecoration: 'none',
                    boxShadow: '0 4px 16px rgba(0,107,95,0.22)',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    marginBottom: 10,
                  }}
                >
                  Add to Chrome — it&apos;s free
                </a>
                <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', margin: 0 }}>
                  No sign-up required to start bookmarking
                </p>
              </div>

              {/* Social share buttons */}
              <div style={{
                background: '#ffffff',
                border: '1px solid rgba(26,28,29,0.08)',
                borderRadius: 14, padding: 22,
                marginTop: 16,
              }}>
                <p style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 12, fontWeight: 700, color: '#545f6c',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  marginBottom: 12, marginTop: 0,
                }}>
                  Share this collection
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Bookmarked key moments from "${title}" — check them out`)}&url=${encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com'}/v/${video_id}`)}&via=clipmarkapp`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 8,
                      background: '#f9f9fa', border: '1px solid rgba(26,28,29,0.08)',
                      color: '#1a1c1d', textDecoration: 'none',
                      fontSize: 13, fontWeight: 600,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 15 }}>𝕏</span> Share on X / Twitter
                  </a>
                  <CopyLinkButton url={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com'}/v/${shareId}`} />
                </div>
              </div>

            </div>
          </aside>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.footerLogo}>Clipmark</span>
            <span className={styles.footerTagline}>© 2025 Clipmark. The Digital Curator.</span>
          </div>
          <ul className={styles.footerLinks}>
            <li><a href="/privacy" className={styles.footerLink}>Privacy</a></li>
            <li><a href="/terms" className={styles.footerLink}>Terms</a></li>
            <li><a href="mailto:support@clipmark.app" className={styles.footerLink}>Support</a></li>
          </ul>
        </div>
      </footer>

    </div>
  );
}
