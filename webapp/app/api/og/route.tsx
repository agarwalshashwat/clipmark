import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'YouTube Timestamp Bookmarks';
    const count = searchParams.get('count') || '0';
    const videoId = searchParams.get('videoId');

    return new ImageResponse(
      (
        <div style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0F172A',
          padding: '40px',
        }}>
          {/* Background Decorative Gradient */}
          <div style={{
            position: 'absolute',
            top: '-10%',
            left: '-10%',
            width: '120%',
            height: '120%',
            background: 'radial-gradient(circle at 20% 30%, rgba(20, 184, 166, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
          }} />

          {/* Logo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '40px',
            fontSize: '32px',
            fontWeight: 800,
            color: '#14B8A6',
          }}>
            Clipmark
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
                src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
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
            <div style={{
              fontSize: '24px',
              fontWeight: 600,
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span style={{ color: '#14B8A6' }}>{count}</span> Bookmarks Curated
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (e: any) {
    return new Response(`Failed to generate image`, { status: 500 });
  }
}
