import { NextRequest, NextResponse } from 'next/server';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Comments feature not configured' }, { status: 503 });
  }

  const videoId = request.nextUrl.searchParams.get('videoId');
  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
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
