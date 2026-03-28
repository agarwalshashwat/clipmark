import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';
import { ClipPlayer } from './ClipPlayer';
import { DownloadClipButton } from './DownloadClipButton';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Clip {
  id: string;
  video_id: string;
  video_title: string | null;
  start_time: number;
  end_time: number;
  title: string | null;
  created_at: string;
  view_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function getClip(clipId: string): Promise<Clip | null> {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .eq('id', clipId)
    .single();

  if (error || !data) return null;

  // Increment view count (fire-and-forget)
  supabase
    .from('clips')
    .update({ view_count: ((data.view_count as number) ?? 0) + 1 })
    .eq('id', clipId)
    .then(() => {});

  return data as Clip;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ clipId: string }> }
): Promise<Metadata> {
  const { clipId } = await params;
  const clip = await getClip(clipId);
  if (!clip) return { title: 'Not found — Clipmark' };

  const label = clip.title || clip.video_title || 'YouTube Clip';
  const dur = formatTime(clip.end_time - clip.start_time);
  return {
    title: `${label} — Clipmark`,
    description: `A ${dur} clip from "${clip.video_title ?? 'a YouTube video'}" — clipped with Clipmark.`,
    openGraph: {
      title: `${label} — Clipmark`,
      description: `Watch this ${dur} clip from YouTube, shared via Clipmark.`,
      images: [`https://img.youtube.com/vi/${clip.video_id}/maxresdefault.jpg`],
      type: 'video.other',
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function ClipPage(
  { params }: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await params;
  const clip = await getClip(clipId);
  if (!clip) notFound();

  const { video_id, video_title, start_time, end_time, title, created_at, view_count } = clip;
  const displayTitle = title || video_title || 'Untitled Clip';
  const duration = formatTime(end_time - start_time);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com';
  const shareUrl = `${origin}/clip/${clipId}`;

  return (
    <div className={styles.page}>

      {/* ── Nav ── */}
      <header className={styles.nav}>
        <a href="/" className={styles.navLogo}>Clipmark</a>
        <div className={styles.navRight}>
          <a href="/dashboard/clipper" className={styles.navSecondary}>Make a Clip</a>
          <a href="https://chrome.google.com/webstore" className={styles.navCta}>Get Extension</a>
        </div>
      </header>

      {/* ── Main ── */}
      <main className={styles.main}>
        <div className={styles.grid}>

          {/* ── Left: player + meta ── */}
          <div className={styles.leftCol}>

            {/* Player */}
            <ClipPlayer
              videoId={video_id}
              startTime={start_time}
              endTime={end_time}
            />

            {/* Clip meta */}
            <div className={styles.clipMeta}>
              <h1 className={styles.clipTitle}>{displayTitle}</h1>
              {video_title && title && title !== video_title && (
                <p className={styles.videoSource}>
                  from <span className={styles.videoSourceHighlight}>{video_title}</span>
                </p>
              )}
              <div className={styles.metaChips}>
                <span className={styles.chip}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>timer</span>
                  {duration}
                </span>
                <span className={styles.chip}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>play_circle</span>
                  {formatTime(start_time)} – {formatTime(end_time)}
                </span>
              </div>
            </div>

          </div>

          {/* ── Right sidebar ── */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarInner}>

              {/* Details card */}
              <div className={styles.sideCard}>
                <h5 className={styles.sideCardHeading}>Clip Details</h5>
                <ul className={styles.metaList}>
                  <li className={styles.metaRow}>
                    <span className={styles.metaLabel}>Duration</span>
                    <span className={styles.metaValue}>{duration}</span>
                  </li>
                  <li className={styles.metaRow}>
                    <span className={styles.metaLabel}>Start</span>
                    <span className={styles.metaValue}>{formatTime(start_time)}</span>
                  </li>
                  <li className={styles.metaRow}>
                    <span className={styles.metaLabel}>End</span>
                    <span className={styles.metaValue}>{formatTime(end_time)}</span>
                  </li>
                  <li className={styles.metaRow}>
                    <span className={styles.metaLabel}>Created</span>
                    <span className={styles.metaValue}>{formatDate(created_at)}</span>
                  </li>
                  <li className={styles.metaRow}>
                    <span className={styles.metaLabel}>Views</span>
                    <span className={styles.metaValue}>{(view_count ?? 0).toLocaleString()}</span>
                  </li>
                </ul>

                <hr className={styles.sideCardDivider} />

                <div className={styles.sideActions}>
                  <a
                    href={`https://www.youtube.com/watch?v=${video_id}&t=${Math.floor(start_time)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sideBtn}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
                    Watch on YouTube
                  </a>
                  <DownloadClipButton
                    videoId={video_id}
                    startTime={start_time}
                    endTime={end_time}
                    title={displayTitle}
                    className={styles.sideBtnPrimary}
                  />
                </div>
              </div>

              {/* Share card */}
              <div className={styles.shareCard}>
                <p className={styles.shareCardHeading}>Share this clip</p>
                <div className={styles.shareUrlRow}>
                  <input
                    type="text"
                    readOnly
                    defaultValue={shareUrl}
                    className={styles.shareUrlInput}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                </div>
                <div className={styles.shareSocial}>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this clip: "${displayTitle}"`)}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.socialBtn}
                  >
                    <span style={{ fontSize: 14 }}>𝕏</span> Share on X
                  </a>
                </div>
              </div>

              {/* Promo */}
              <div className={styles.promoCard}>
                <div className={styles.promoEmoji}>✂️</div>
                <h6 className={styles.promoTitle}>Make your own clips</h6>
                <p className={styles.promoBody}>
                  Clipmark lets you cut, download, and share precise moments from any YouTube video — for free.
                </p>
                <a href="https://chrome.google.com/webstore" className={styles.promoCta}>
                  Add to Chrome — it&apos;s free
                </a>
              </div>

            </div>
          </aside>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerLogo}>Clipmark</span>
          <span className={styles.footerTagline}>© 2025 Clipmark. The Digital Curator.</span>
          <ul className={styles.footerLinks}>
            <li><a href="/privacy" className={styles.footerLink}>Privacy</a></li>
            <li><a href="/terms" className={styles.footerLink}>Terms</a></li>
          </ul>
        </div>
      </footer>

    </div>
  );
}
