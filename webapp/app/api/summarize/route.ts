import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { Bookmark } from '@/lib/supabase';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI features not configured' }, { status: 503 });
  }

  try {
    const { bookmarks, videoTitle } = await request.json() as {
      bookmarks: Bookmark[];
      videoTitle?: string;
    };

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return NextResponse.json({ error: 'bookmarks array is required' }, { status: 400 });
    }

    const sorted = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);
    const bookmarkLines = sorted.map(b => {
      const ts = formatTimestamp(b.timestamp);
      const tags = b.tags?.length ? ` [${b.tags.join(', ')}]` : '';
      return `- ${ts}${tags}: ${b.description}`;
    }).join('\n');

    const prompt = `You are summarizing a set of bookmarks a user saved while watching a YouTube video.
${videoTitle ? `Video: "${videoTitle}"` : ''}

Bookmarks (timestamp: description):
${bookmarkLines}

Respond with a JSON object (no markdown) in this exact shape:
{
  "summary": "2-3 sentence overview of what this video covers based on the bookmarks",
  "topics": ["up to 5 key topics covered"],
  "actionItems": ["any action items or todos found in the bookmarks, empty array if none"]
}`;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    // Strip markdown code fences if present (model sometimes wraps JSON)
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const result = JSON.parse(text);

    return NextResponse.json(result);
  } catch (err) {
    console.error('Summarize error:', err);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
