import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'YouTube Timestamp Bookmarks';
    const videoId = searchParams.get('videoId');

    // `count` used to default to '0', so every card ended in "0 Bookmarks
    // Curated" — fine for a shared collection, nonsense on the pricing or privacy
    // page. Presence, not truthiness, decides: a collection legitimately has 0.
    const count = searchParams.has('count') ? searchParams.get('count') : null;
    // Marketing routes pass a plain strapline here instead of a count.
    const subtitle = searchParams.get('subtitle');

    // Fallback image if YouTube thumbnail doesn't respond
    const imageUrl = videoId 
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` 
      : null;

    return new ImageResponse(
      (
        <div style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111827',   // gray-900 (was the slate ramp)
          padding: '40px',
        }}>
          {/* Background Decorative Gradient */}
          <div style={{
            position: 'absolute',
            top: '-10%',
            left: '-10%',
            width: '120%',
            height: '120%',
            background: 'radial-gradient(circle at 20% 30%, rgba(20, 184, 166, 0.15) 0%, transparent 50%)',
          }} />

          {/* Logo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '40px',
            fontSize: '32px',
            fontWeight: 800,
            color: '#2dd4bf',   // teal-400 — brand ink on a dark surface
          }}>
            ClipMark
          </div>

          {/* Video Preview (if available) */}
          {videoId && (
            <div style={{
              display: 'flex',
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              marginBottom: '40px',
              border: '4px solid rgba(255,255,255,0.1)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl!}
                alt="Thumbnail"
                width="640"
                height="360"
                style={{ objectFit: 'cover' }}
              />
            </div>
          )}

          {/* Title & Count */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            maxWidth: '900px',
          }}>
            <div style={{
              fontSize: '48px',
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.2,
              marginBottom: '20px',
            }}>
              {title}
            </div>
            {count !== null && (
              <div style={{
                fontSize: '24px',
                fontWeight: 600,
                color: '#9ca3af',   // gray-400 (was the slate ramp)
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ color: '#2dd4bf' }}>{count}</span> Bookmarks Curated
              </div>
            )}

            {count === null && subtitle && (
              <div style={{
                fontSize: '26px',
                fontWeight: 500,
                color: '#9ca3af',   // gray-400
                display: 'flex',
                textAlign: 'center',
                lineHeight: 1.4,
              }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (e: any) {
    return new Response(`Failed to generate image`, { status: 500 });
  }
}
