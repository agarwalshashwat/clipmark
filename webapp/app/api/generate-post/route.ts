import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

type Bookmark = { timestamp: number; description: string };

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

  const { bookmarks, videoTitle, shareUrl, platform } = await request.json() as {
    bookmarks: Bookmark[];
    videoTitle: string;
    shareUrl: string;
    platform: 'twitter' | 'linkedin' | 'threads';
  };

  if (!bookmarks?.length || !platform) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const charLimits: Record<string, number> = { twitter: 260, linkedin: 2800, threads: 480 };
  const limit = charLimits[platform] ?? 280;

  const lines = bookmarks
    .slice(0, 12)
    .map((b: Bookmark) => `[${fmt(b.timestamp)}] ${b.description}`)
    .join('\n');

  const platformGuide: Record<string, string> = {
    twitter:  'Punchy, max 2-3 lines, 1-2 relevant hashtags at end, no emojis overload',
    linkedin: 'Professional tone, use short paragraphs with line breaks, 3-5 bullet key takeaways, end with CTA',
    threads:  'Casual and conversational, 2-4 short paragraphs, relatable hook, 1-2 emojis max',
  };

  const prompt = `You are helping someone share insights they captured from a YouTube video.

Video: "${videoTitle || 'YouTube video'}"
Platform: ${platform}
Style guide: ${platformGuide[platform]}
Character limit: ~${limit} chars

Their bookmarks (timestamp + note):
${lines}

Write a ${platform} post that:
- Opens with an engaging hook about the video topic
- Highlights 2-4 key insights from the bookmarks
- Ends with "Full collection: [SHARE_URL]" on its own line (use the literal placeholder [SHARE_URL])
- Stays under the character limit

Return ONLY the post text. No preamble, no explanation.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw  = (msg.content[0] as { text: string }).text.trim();
    const post = shareUrl ? raw.replace('[SHARE_URL]', shareUrl) : raw.replace('[SHARE_URL]', '');

    return NextResponse.json({ post });
  } catch (err) {
    console.error('generate-post error', err);
    return NextResponse.json({ error: 'Failed to generate post' }, { status: 500 });
  }
}
