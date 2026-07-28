import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { supabase, type Collection, type Bookmark } from '@/lib/supabase';
import styles from './page.module.css';
import { CopyLinkButton } from './CopyLinkButton';
import { APP_URL, SUPPORT_EMAIL } from '@/app/lib/constants';

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
  const base = color || '#14B8A6';
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

  // Increment view count (fire-and-forget) via a SECURITY DEFINER RPC.
  // Direct UPDATEs on collections are no longer allowed for the anon role
  // (see migration 012) — the RPC is the only sanctioned view_count write.
  supabase
    .rpc('increment_collection_view', { collection_id: shareId })
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
  const baseUrl = APP_URL;
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
  const baseUrl = APP_URL;
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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
                Curated via{' '}
                <span className={styles.sharedByHighlight}>Clipmark</span>
              </p>
            </div>

            {/* Curation highlights / timeline */}
            <div className={styles.highlights}>
              <h3 className={styles.highlightsHeading}>
                Curation Highlights
                <span className={styles.clipsCount}>
                  {bookmarks.length} Moment{bookmarks.length !== 1 ? 's' : ''}
                </span>
              </h3>

              <ul className={styles.timelineList}>
                {bookmarks.map((b: Bookmark, i: number) => (
                  <li key={b.id ?? i} className={styles.timelineItem}>
                    <div className={styles.timelineDot}>
                      <span className="material-symbols-rounded" style={{ color: '#14B8A6', fontSize: 24 }}>bookmark_heart</span>
                    </div>
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
                  <CopyLinkButton url={`${APP_URL}/v/${shareId}`} className={styles.sideBtnSecondary} />
                </div>
              </div>

              {/* Promo card — viral acquisition CTA */}
              <div className={styles.promoCard} style={{
                background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, rgba(0,107,95,0.06) 100%)',
                border: '1px solid rgba(20,184,166,0.25)',
              }}>
                <div style={{ 
                  width: 48, height: 48, background: 'rgba(20, 184, 166, 0.1)', 
                  borderRadius: '50%', display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', margin: '0 auto 20px' 
                }}>
                  <span className="material-symbols-rounded" style={{ color: '#14B8A6' }}>extension</span>
                </div>
                <h6 className={styles.promoTitle} style={{ fontSize: 18, marginBottom: 12 }}>
                  Create your own collections
                </h6>
                <p className={styles.promoBody} style={{ fontSize: 14, marginBottom: 24 }}>
                  Clipmark is a free extension that lets you save, tag, and share
                  timestamped highlights from any YouTube video — in one click.
                </p>
                <a
                  href="https://chrome.google.com/webstore"
                  className={styles.sideBtn}
                  style={{
                    background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
                    marginBottom: 12,
                  }}
                >
                  Add to Chrome — it&apos;s free
                </a>
                <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', margin: 0 }}>
                  No sign-up required to start
                </p>
              </div>

              {/* Social share box */}
              <div className={`${styles.sideCard} ${styles.socialBox}`}>
                <h5 className={styles.sideCardHeading}>Share this Curation</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Bookmarked key moments from "${title}" — check them out`)}&url=${encodeURIComponent(`${APP_URL}/v/${video_id}`)}&via=clipmarkapp`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sideBtnSecondary}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>share</span> Share on X / Twitter
                  </a>
                </div>
              </div>

            </div>
          </aside>

        </div>
      </main>
    </>
  );
}
