import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';

interface ShareBody {
  videoId: string;
  startTime: number;
  endTime: number;
  title?: string;
  videoTitle?: string;
}

// ─── POST /api/clips/share ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: ShareBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { videoId, startTime, endTime, title, videoTitle } = body;

  if (!videoId || typeof startTime !== 'number' || typeof endTime !== 'number') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (endTime <= startTime) {
    return NextResponse.json({ error: 'endTime must be greater than startTime' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('clips')
    .insert({
      video_id: videoId,
      video_title: videoTitle || null,
      start_time: startTime,
      end_time: endTime,
      title: title || videoTitle || null,
      user_id: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[clips/share] Supabase insert error:', error);
    return NextResponse.json({ error: 'Failed to save clip.' }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com';
  const shareUrl = `${origin}/clip/${data.id}`;

  return NextResponse.json({ shareUrl, clipId: data.id });
}
