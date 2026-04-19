import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export const runtime = 'nodejs';

// POST /api/clip
// Body: { videoId: string, startTime: number, endTime: number }
// Returns: { formats: Format[], title: string } so the client can pick a stream to download.
// The actual video trimming is performed client-side via the MediaRecorder API in the
// extension content script; this endpoint only resolves metadata and stream URLs.
export async function POST(req: NextRequest) {
  let body: { videoId?: string; startTime?: number; endTime?: number };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { videoId, startTime, endTime } = body;

  if (!videoId || typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{6,16}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid or missing videoId' }, { status: 400 });
  }

  if (startTime == null || endTime == null || typeof startTime !== 'number' || typeof endTime !== 'number') {
    return NextResponse.json({ error: 'startTime and endTime are required numbers' }, { status: 400 });
  }

  if (endTime <= startTime) {
    return NextResponse.json({ error: 'endTime must be greater than startTime' }, { status: 400 });
  }

  const duration = endTime - startTime;
  if (duration > 3600) {
    return NextResponse.json({ error: 'Clip duration cannot exceed 3600 seconds' }, { status: 400 });
  }

  try {
    const url  = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const info = await ytdl.getInfo(url);

    const title = info.videoDetails.title;

    // Select suitable formats: prefer muxed (audio+video), fall back to video-only
    const allFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
    const formats = allFormats
      .filter(f => f.container === 'mp4' || f.container === 'webm')
      .map(f => ({
        itag:      f.itag,
        quality:   f.qualityLabel || f.quality || 'unknown',
        container: f.container,
        mimeType:  f.mimeType,
        url:       f.url,
        hasAudio:  f.hasAudio,
        hasVideo:  f.hasVideo,
      }))
      // sort best quality first
      .sort((a, b) => {
        const qa = parseInt((a.quality || '0').replace(/\D/g, ''), 10) || 0;
        const qb = parseInt((b.quality || '0').replace(/\D/g, ''), 10) || 0;
        return qb - qa;
      });

    return NextResponse.json({
      videoId,
      title,
      startTime,
      endTime,
      duration,
      formats: formats.slice(0, 5), // return top 5 formats
    });
  } catch (err: unknown) {
    // Classify the error without exposing internal details (stack traces, paths)
    const message = err instanceof Error ? err.message : '';
    let clientMessage = 'Failed to process request';
    if (message.includes('Status code: 4') || message.includes('No such format') || message.includes('unavailable')) {
      clientMessage = 'Could not retrieve video information';
    } else if (message.includes('Status code: 5')) {
      clientMessage = 'YouTube service unavailable, please try again';
    }
    return NextResponse.json({ error: clientMessage }, { status: 500 });
  }
}
