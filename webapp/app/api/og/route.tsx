/**
 * Generated 1200x630 social cards.
 *
 * Two shapes, chosen by whether a `count` is supplied:
 *
 *   collection card  ?title=…&videoId=…&count=…   — a shared collection or
 *                    profile: video thumbnail plus "N Bookmarks Curated".
 *   brand card       ?title=…&subtitle=…          — a marketing route.
 *
 * The brand shape exists because every marketing page used to advertise
 * /clipmark-logo.png as its og:image: a *square* 450x450 file that the metadata
 * additionally declared as 512x512. Twitter/X and LinkedIn letterbox a square
 * into a summary_large_image slot, so the card rendered as a small logo floating
 * in grey bars with copy that didn't match the page it came from.
 *
 * `count` is read with has() rather than a `|| '0'` default so that a brand card
 * omits the line entirely instead of boasting "0 Bookmarks Curated" — the old
 * default did exactly that for /u/[username], which passes count=0 explicitly
 * and still gets the collection shape.
 */
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

/** Satori has no text-overflow, so long titles must be trimmed by hand. */
function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const title = clamp(searchParams.get('title') || 'YouTube Timestamp Bookmarks', 90);
    const subtitle = searchParams.get('subtitle');
    const videoId = searchParams.get('videoId');
    const count = searchParams.has('count') ? searchParams.get('count') : null;

    const imageUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#111827', // gray-900
            padding: '60px',
          }}
        >
          {/* Background decorative gradient */}
          <div
            style={{
              position: 'absolute',
              top: '-10%',
              left: '-10%',
              width: '120%',
              height: '120%',
              background:
                'radial-gradient(circle at 20% 30%, rgba(20, 184, 166, 0.18) 0%, transparent 50%)',
            }}
          />

          {/* Wordmark */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: videoId ? 36 : 28,
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '-0.5px',
              color: '#2dd4bf', // teal-400 — brand ink on a dark surface
            }}
          >
            ClipMark
          </div>

          {/* Video preview, collection cards only */}
          {imageUrl && (
            <div
              style={{
                display: 'flex',
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                marginBottom: '36px',
                border: '4px solid rgba(255,255,255,0.1)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Thumbnail"
                width="560"
                height="315"
                style={{ objectFit: 'cover' }}
              />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              maxWidth: 1000,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: videoId ? 46 : 58,
                fontWeight: 800,
                color: 'white',
                lineHeight: 1.15,
                letterSpacing: '-1px',
                marginBottom: 20,
              }}
            >
              {title}
            </div>

            {subtitle && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 26,
                  fontWeight: 500,
                  color: '#9ca3af', // gray-400
                  lineHeight: 1.4,
                  maxWidth: 880,
                }}
              >
                {clamp(subtitle, 130)}
              </div>
            )}

            {count !== null && (
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ color: '#2dd4bf' }}>{count}</span> Bookmarks Curated
              </div>
            )}
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch {
    return new Response('Failed to generate image', { status: 500 });
  }
}
