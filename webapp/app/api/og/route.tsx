import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

/**
 * Social card renderer, 1200x630. Two shapes off one template:
 *
 *   ?title=…&count=N[&videoId=…]   collection card — the share surfaces pass a
 *                                  bookmark count and a YouTube thumbnail.
 *   ?title=…&subtitle=…            marketing card — every static route via
 *                                  buildPageMetadata() in app/lib/seo.ts.
 *
 * `count` is read as "absent means don't claim a number". It used to default to
 * '0', which was harmless while only the share pages called this route, but any
 * marketing page reusing it would have rendered "0 Bookmarks Curated" under its
 * own headline.
 *
 * Satori resolves no CSS custom properties, so every colour here is a literal —
 * they are still held to the ClipMark ramps by scripts/design-audit.mjs (R1),
 * which lists this file as literal-only rather than exempt.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'YouTube Timestamp Bookmarks';
    const rawCount = searchParams.get('count');
    const count = rawCount !== null && rawCount !== '' ? rawCount : null;
    const subtitle = searchParams.get('subtitle');
    const videoId = searchParams.get('videoId');

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
              // A thumbnail already takes 360px of the 630, so a long collection
              // title has to sit on a smaller type size to stay inside the card.
              fontSize: videoId ? '48px' : '60px',
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.2,
              marginBottom: '20px',
            }}>
              {title}
            </div>
            {subtitle && (
              <div style={{
                fontSize: '26px',
                fontWeight: 500,
                color: '#d1d5db',   // gray-300
                lineHeight: 1.45,
                marginBottom: count !== null ? '18px' : '0',
              }}>
                {subtitle}
              </div>
            )}
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
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (e: any) {
    return new Response(`Failed to generate image`, { status: 500 });
  }
}
