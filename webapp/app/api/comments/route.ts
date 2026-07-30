import { NextRequest, NextResponse } from 'next/server';

// This route is intentionally unauthenticated (called for logged-out viewers
// too — see extension/src/popup/side-panel.js), which otherwise made it an
// open proxy for our own YOUTUBE_API_KEY quota. No shared store (Redis/etc.)
// exists in this codebase, so an in-memory fixed-window counter is the
// lightweight fix: it caps abuse from a single serverless instance's lifetime.
// It resets on cold start and is per-instance under scale-out, so it's not a
// hard guarantee against a distributed abuser — just enough to stop the
// trivial single-client hammering case.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestTimestamps = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestTimestamps.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestTimestamps.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  // Checked first, ahead of config/validation, so abusive traffic never
  // reaches the (real, costly) proxied YouTube API call.
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Comments feature not configured' }, { status: 503 });
  }

  const videoId = request.nextUrl.searchParams.get('videoId');
  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 });
  }

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('videoId', videoId);
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('maxResults', '20');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // Comments disabled or video not found
      if (res.status === 403 || res.status === 404) {
        return NextResponse.json({ comments: [] });
      }
      return NextResponse.json(
        { error: (err as { error?: { message?: string } }).error?.message || 'YouTube API error' },
        { status: res.status }
      );
    }

    const data = await res.json() as {
      items?: Array<{
        snippet: {
          topLevelComment: {
            snippet: {
              authorDisplayName: string;
              textDisplay: string;
              likeCount: number;
              publishedAt: string;
            };
          };
        };
      }>;
    };

    const comments = (data.items || []).map(item => {
      const s = item.snippet.topLevelComment.snippet;
      return {
        author: s.authorDisplayName,
        text: s.textDisplay,
        likeCount: s.likeCount,
        publishedAt: s.publishedAt,
      };
    });

    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}
