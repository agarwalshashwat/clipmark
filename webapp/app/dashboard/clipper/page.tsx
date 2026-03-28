'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  // Already a video ID (11 chars, alphanumeric + - + _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('?')[0];
    if (url.hostname.includes('youtube.com')) {
      return url.searchParams.get('v');
    }
  } catch {
    // not a URL
  }
  return null;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTimeInput(val: string): number | null {
  // Accepts "mm:ss", "hh:mm:ss", or plain seconds
  const parts = val.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// ─── YouTube IFrame API types ─────────────────────────────────────────────────
interface YoutubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (opts: { videoId: string; startSeconds?: number; endSeconds?: number }) => void;
  destroy: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YTWindow = typeof window & { YT: any; onYouTubeIframeAPIReady?: () => void };

// ─── Component ────────────────────────────────────────────────────────────────
export default function ClipperPage() {
  const [urlInput, setUrlInput] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [urlError, setUrlError] = useState('');
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [startInput, setStartInput] = useState('0:00');
  const [endInput, setEndInput] = useState('0:00');
  const [clipTitle, setClipTitle] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const playerRef = useRef<YoutubePlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const ytApiLoaded = useRef(false);

  // ── Load YouTube IFrame API ───────────────────────────────────────────────
  useEffect(() => {
    if (ytApiLoaded.current) return;
    ytApiLoaded.current = true;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  }, []);

  const initPlayer = useCallback((vidId: string) => {
    const w = window as YTWindow;
    const initFn = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      playerRef.current = new w.YT.Player('yt-player', {
        videoId: vidId,
        playerVars: { rel: 0, modestbranding: 1, enablejsapi: 1 },
        events: {
          onReady: () => {
            const dur = (playerRef.current as YoutubePlayer | null)?.getDuration() ?? 0;
            setEndTime(dur);
            setEndInput(formatTime(dur));
          },
        },
      }) as YoutubePlayer;
    };

    if (w.YT?.Player) {
      initFn();
    } else {
      w.onYouTubeIframeAPIReady = initFn;
    }
  }, []);

  // ── Load video ────────────────────────────────────────────────────────────
  const handleLoad = () => {
    const id = parseVideoId(urlInput);
    if (!id) {
      setUrlError('Please enter a valid YouTube URL or video ID.');
      return;
    }
    setUrlError('');
    setVideoId(id);
    setStartTime(0);
    setStartInput('0:00');
    setEndTime(0);
    setEndInput('0:00');
    setShareUrl('');
    setPreviewMode(false);
    setClipTitle('');
    // Try to grab title via oEmbed
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
      .then(r => r.json())
      .then(d => setVideoTitle(d.title ?? ''))
      .catch(() => setVideoTitle(''));
    setTimeout(() => initPlayer(id), 50);
  };

  // ── Set start / end from player ───────────────────────────────────────────
  const setStart = () => {
    const t = playerRef.current?.getCurrentTime() ?? 0;
    setStartTime(t);
    setStartInput(formatTime(t));
  };

  const setEnd = () => {
    const t = playerRef.current?.getCurrentTime() ?? 0;
    setEndTime(t);
    setEndInput(formatTime(t));
  };

  const handleStartInputBlur = () => {
    const t = parseTimeInput(startInput);
    if (t !== null) { setStartTime(t); setStartInput(formatTime(t)); }
    else setStartInput(formatTime(startTime));
  };

  const handleEndInputBlur = () => {
    const t = parseTimeInput(endInput);
    if (t !== null) { setEndTime(t); setEndInput(formatTime(t)); }
    else setEndInput(formatTime(endTime));
  };

  const seekToStart = () => { playerRef.current?.seekTo(startTime, true); playerRef.current?.playVideo(); };
  const seekToEnd = () => { playerRef.current?.seekTo(Math.max(0, endTime - 5), true); playerRef.current?.playVideo(); };

  // ── Preview clip ──────────────────────────────────────────────────────────
  const handlePreview = () => {
    if (!videoId) return;
    setPreviewMode(true);
    if (playerRef.current) {
      playerRef.current.loadVideoById({ videoId, startSeconds: startTime, endSeconds: endTime });
    }
  };

  // ── Download clip ─────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!videoId) return;
    if (endTime <= startTime) { alert('End time must be after start time.'); return; }
    setDownloading(true);
    try {
      const res = await fetch('/api/clips/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, startTime, endTime, title: clipTitle || videoTitle }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Download failed. Make sure yt-dlp is installed on the server.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(clipTitle || videoTitle || videoId).replace(/[^\w\s-]/g, '').trim()}_${formatTime(startTime)}-${formatTime(endTime)}.mp4`.replace(/:/g, '-');
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  // ── Share clip ────────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!videoId) return;
    if (endTime <= startTime) { alert('End time must be after start time.'); return; }
    setSharing(true);
    try {
      const res = await fetch('/api/clips/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, startTime, endTime, title: clipTitle || videoTitle, videoTitle }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to create share link.'); return; }
      setShareUrl(data.shareUrl);
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const clipDuration = Math.max(0, endTime - startTime);
  const hasClip = videoId && endTime > startTime;

  return (
    <div className={styles.wrap}>
      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          <span className={styles.titleIcon}>✂️</span>
          Clipper
        </h1>
        <p className={styles.pageSub}>
          Cut, download, and share precise clips from any YouTube video.
        </p>
      </div>

      {/* ── URL Input ── */}
      <div className={styles.urlBar}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6c7a77', flexShrink: 0 }}>link</span>
        <input
          type="text"
          className={styles.urlInput}
          placeholder="Paste a YouTube URL or video ID…"
          value={urlInput}
          onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleLoad()}
        />
        <button className={styles.loadBtn} onClick={handleLoad}>
          Load Video
        </button>
      </div>
      {urlError && <p className={styles.urlError}>{urlError}</p>}

      {/* ── Player + Controls ── */}
      {videoId ? (
        <div className={styles.editorLayout}>

          {/* Player */}
          <div className={styles.playerSection}>
            <div className={styles.playerWrap}>
              <div id="yt-player" ref={playerContainerRef} className={styles.player} />
            </div>

            {videoTitle && (
              <p className={styles.videoMeta}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>play_circle</span>
                {' '}{videoTitle}
              </p>
            )}
          </div>

          {/* Controls panel */}
          <div className={styles.controlsPanel}>

            {/* Clip title */}
            <div className={styles.controlBlock}>
              <label className={styles.controlLabel}>Clip Title (optional)</label>
              <input
                type="text"
                className={styles.titleInput}
                placeholder={videoTitle || 'My clip…'}
                value={clipTitle}
                onChange={e => setClipTitle(e.target.value)}
              />
            </div>

            {/* Start time */}
            <div className={styles.controlBlock}>
              <label className={styles.controlLabel}>Start Time</label>
              <div className={styles.timeRow}>
                <input
                  type="text"
                  className={styles.timeInput}
                  value={startInput}
                  onChange={e => setStartInput(e.target.value)}
                  onBlur={handleStartInputBlur}
                  placeholder="0:00"
                />
                <button className={styles.setBtn} onClick={setStart} title="Set to current player time">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>my_location</span>
                  Set here
                </button>
                <button className={styles.previewSmBtn} onClick={seekToStart} title="Play from start">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                </button>
              </div>
            </div>

            {/* End time */}
            <div className={styles.controlBlock}>
              <label className={styles.controlLabel}>End Time</label>
              <div className={styles.timeRow}>
                <input
                  type="text"
                  className={styles.timeInput}
                  value={endInput}
                  onChange={e => setEndInput(e.target.value)}
                  onBlur={handleEndInputBlur}
                  placeholder="0:00"
                />
                <button className={styles.setBtn} onClick={setEnd} title="Set to current player time">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>my_location</span>
                  Set here
                </button>
                <button className={styles.previewSmBtn} onClick={seekToEnd} title="Preview near end">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                </button>
              </div>
            </div>

            {/* Duration indicator */}
            {hasClip ? (
              <div className={styles.durationChip}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>timer</span>
                <span>Clip duration: <strong>{formatTime(clipDuration)}</strong></span>
              </div>
            ) : (
              <div className={styles.durationChip} style={{ opacity: 0.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>timer</span>
                <span>Set start and end times above</span>
              </div>
            )}

            {/* Preview clip */}
            <button
              className={styles.previewBtn}
              onClick={handlePreview}
              disabled={!hasClip}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>preview</span>
              Preview Clip
            </button>

            {/* Divider */}
            <hr className={styles.divider} />

            {/* Action buttons */}
            <div className={styles.actions}>
              <button
                className={styles.downloadBtn}
                onClick={handleDownload}
                disabled={!hasClip || downloading}
              >
                {downloading ? (
                  <>
                    <span className={styles.spinner} />
                    Downloading…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                    Download MP4
                  </>
                )}
              </button>

              <button
                className={styles.shareBtn}
                onClick={handleShare}
                disabled={!hasClip || sharing}
              >
                {sharing ? (
                  <>
                    <span className={styles.spinner} />
                    Saving…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>ios_share</span>
                    Share Clip
                  </>
                )}
              </button>
            </div>

            {/* Share link */}
            {shareUrl && (
              <div className={styles.shareBox}>
                <p className={styles.shareLabel}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#14B8A6' }}>check_circle</span>
                  {' '}Shareable link ready
                </p>
                <div className={styles.shareRow}>
                  <input
                    type="text"
                    className={styles.shareInput}
                    value={shareUrl}
                    readOnly
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <button className={styles.copyBtn} onClick={handleCopy}>
                    {copySuccess ? (
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span>
                    )}
                  </button>
                </div>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer" className={styles.sharePreviewLink}>
                  Open clip page ↗
                </a>
              </div>
            )}

          </div>{/* /controlsPanel */}
        </div>
      ) : (
        /* Empty state */
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>✂️</div>
          <h3 className={styles.emptyTitle}>Load a video to get started</h3>
          <p className={styles.emptyText}>
            Paste any YouTube link above, then drag the player to your desired moment —
            set a start and end time to cut your clip.
          </p>
          <div className={styles.emptyExamples}>
            <span className={styles.exampleChip}>youtube.com/watch?v=…</span>
            <span className={styles.exampleChip}>youtu.be/…</span>
            <span className={styles.exampleChip}>11-character video ID</span>
          </div>
        </div>
      )}
    </div>
  );
}
