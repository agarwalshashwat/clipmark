import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { supabase, type Collection, type Bookmark } from '@/lib/supabase';
import { APP_URL } from '@/app/lib/constants';

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function getCollection(shareId: string): Promise<Collection | null> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('id', shareId)
    .single();
  return (error || !data) ? null : data as Collection;
}

export async function generateMetadata(
  { params }: { params: Promise<{ shareId: string }> }
): Promise<Metadata> {
  const { shareId } = await params;
  return {
    alternates: {
      canonical: `/embed/${shareId}`,
    },
    // Without its own `url`, the root layout's openGraph (which points at the
    // homepage) is inherited wholesale and og:url disagrees with the canonical.
    openGraph: {
      type: 'website',
      url: `/embed/${shareId}`,
      siteName: 'Clipmark',
      images: [
        {
          url: `${APP_URL}/clipmark-logo.png`,
          width: 512,
          height: 512,
          alt: 'Clipmark — YouTube Bookmark Extension',
        },
      ],
    },
  };
}

export default async function EmbedPage(
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const collection  = await getCollection(shareId);
  if (!collection) notFound();

  const { video_id, video_title, bookmarks } = collection;
  const title = video_title ?? 'YouTube Video';

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
      background: '#ffffff', color: '#111827', height: '100%',
      display: 'flex', flexDirection: 'column',
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* Header */}
      <div style={{
        padding: '10px 14px 8px', borderBottom: '1px solid #f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        flexShrink: 0,
      }}>
        <p style={{
          fontSize: 12, fontWeight: 600, color: '#374151',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
        }}>
          {title}
        </p>
        <a
          href={`https://www.youtube.com/watch?v=${video_id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 600, color: '#14B8A6',
            whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none',
          }}
        >
          Watch ↗
        </a>
      </div>

      {/* Bookmark list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {bookmarks.map((b: Bookmark, i: number) => (
          <a
            key={b.id ?? i}
            href={`https://www.youtube.com/watch?v=${video_id}&t=${Math.floor(b.timestamp)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 14px', borderBottom: '1px solid #f9fafb',
              textDecoration: 'none', color: 'inherit',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{
              fontSize: 11, fontWeight: 700, color: b.color || '#14B8A6',
              letterSpacing: '0.4px', flexShrink: 0, minWidth: 36, paddingTop: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatTimestamp(b.timestamp)}
            </span>
            <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.45 }}>
              {b.description || 'No description'}
            </span>
          </a>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 14px', borderTop: '1px solid #f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>
          {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
        </span>
        <a href="/" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: '#9ca3af', textDecoration: 'none' }}>
          Clipmark
        </a>
      </div>
    </div>
  );
}
