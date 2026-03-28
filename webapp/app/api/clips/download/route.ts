import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DownloadBody {
  videoId: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  title?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
}

function formatSecs(s: number): string {
  // yt-dlp / ffmpeg expects "HH:MM:SS.mmm"
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(3);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.padStart(6, '0')}`;
}

function spawnProcess(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const proc = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

// ─── POST /api/clips/download ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: DownloadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { videoId, startTime, endTime, title } = body;

  if (!videoId || typeof startTime !== 'number' || typeof endTime !== 'number') {
    return NextResponse.json({ error: 'Missing required fields: videoId, startTime, endTime' }, { status: 400 });
  }
  if (endTime <= startTime) {
    return NextResponse.json({ error: 'endTime must be greater than startTime' }, { status: 400 });
  }
  if (endTime - startTime > 600) {
    return NextResponse.json({ error: 'Clip duration is limited to 10 minutes' }, { status: 400 });
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const safeTitle = sanitizeFilename(title || videoId);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipmark-'));
  const outputFile = path.join(tmpDir, `${safeTitle}.mp4`);

  try {
    // ── Step 1: Download full video (best mp4 quality, no playlist) ──────────
    // We use --download-sections to let yt-dlp cut on the fly (requires ffmpeg)
    const ytdlpArgs = [
      '--no-playlist',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
      '--merge-output-format', 'mp4',
      '--download-sections', `*${formatSecs(startTime)}-${formatSecs(endTime)}`,
      '--force-keyframes-at-cuts',
      '-o', outputFile,
      '--no-warnings',
      '--quiet',
      videoUrl,
    ];

    const { code, stderr } = await spawnProcess('yt-dlp', ytdlpArgs);

    if (code !== 0) {
      console.error('[clips/download] yt-dlp failed:', stderr);
      return NextResponse.json(
        { error: 'Download failed. Make sure yt-dlp and ffmpeg are installed on the server.' },
        { status: 500 }
      );
    }

    // ── Step 2: Read file and stream it back ──────────────────────────────────
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(outputFile);
    } catch {
      return NextResponse.json({ error: 'Output file not found after download.' }, { status: 500 });
    }

    const downloadName = `${safeTitle}_clip.mp4`;

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });

  } finally {
    // Cleanup temp files (fire-and-forget)
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
