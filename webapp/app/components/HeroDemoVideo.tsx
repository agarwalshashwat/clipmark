'use client';

/**
 * Custom hero demo-video player: poster + on-brand play button by default,
 * plays inline with sound on click (no muted-autoplay — the video is
 * narrated), native browser chrome fully suppressed in favor of a minimal
 * hover-revealed play/pause + mute overlay. Self-contained so the landing
 * page itself stays a server component.
 */

import { useRef, useState } from 'react';

const VIDEO_SRC = 'https://clipmark-media.mithahara.com/promo/clipmark-demo.mp4';
const POSTER_SRC = 'https://clipmark-media.mithahara.com/promo/clipmark-demo-poster.jpg';

function iconButtonStyle(): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: 9999,
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  };
}

export function HeroDemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hovering, setHovering] = useState(false);

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    // Not a muted-autoplay: play() is only ever called from a real click
    // handler here, so browsers allow unmuted playback — the video is
    // narrated and should be heard from the first frame.
    video.muted = false;
    video.play();
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) play();
    else video.pause();
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleEnded = () => {
    setStarted(false);
    setPlaying(false);
    const video = videoRef.current;
    if (video) video.currentTime = 0;
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        borderRadius: 24,
        overflow: 'hidden',
        background: 'var(--gray-950)',
        cursor: started ? 'pointer' : 'default',
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={started ? togglePlayPause : undefined}
    >
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        poster={POSTER_SRC}
        preload="none"
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      >
        Sorry, your browser doesn&apos;t support embedded video.
      </video>

      {/* Poster overlay + on-brand play button — hides once playback has started. */}
      {!started && (
        <button
          type="button"
          aria-label="Play demo video"
          onClick={(e) => {
            e.stopPropagation();
            setStarted(true);
            play();
          }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `url(${POSTER_SRC}) center/cover, rgba(0,0,0,0.1)`,
            backgroundBlendMode: 'darken',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <span
            style={{
              width: 84,
              height: 84,
              borderRadius: 9999,
              background: 'var(--accent-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 20px 50px rgba(13,148,136,0.45)',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 40, color: 'white', marginLeft: 4 }}>
              play_arrow
            </span>
          </span>
        </button>
      )}

      {/* Minimal control overlay — play/pause + mute only, fades in on hover. */}
      {started && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)',
            opacity: hovering ? 1 : 0,
            transition: 'opacity 0.2s ease',
            pointerEvents: hovering ? 'auto' : 'none',
          }}
        >
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            style={iconButtonStyle()}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20, color: 'white' }}>
              {playing ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            type="button"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={toggleMute}
            style={iconButtonStyle()}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20, color: 'white' }}>
              {muted ? 'volume_off' : 'volume_up'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
