import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI features not configured' }, { status: 503 });
  }

  try {
    const { description, transcript } = await request.json() as {
      description: string;
      transcript?: string;
    };

    if (!description?.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    const context = transcript ? `\nTranscript context: "${transcript}"` : '';
    const prompt = `Suggest 1-3 short tags for a YouTube video bookmark.

Bookmark description: "${description}"${context}

Available named tags (use these when relevant): important, review, note, question, todo, key

Rules:
- Return only lowercase single-word tags (letters and numbers only)
- Prefer named tags when they fit
- Add 1 custom tag if none of the named tags fit
- Respond with only a JSON array of strings, no markdown, e.g. ["important", "auth"]`;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const tags: string[] = JSON.parse(text);

    return NextResponse.json({ tags });
  } catch (err) {
    console.error('Suggest-tags error:', err);
    return NextResponse.json({ error: 'Failed to suggest tags' }, { status: 500 });
  }
}
