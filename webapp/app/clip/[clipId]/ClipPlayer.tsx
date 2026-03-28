'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './page.module.css';

interface Props {
  videoId: string;
  startTime: number;
  endTime: number;
}

interface YTPlayer {
  getCurrentTime: () => number;
  seekTo: (s: number, allow?: boolean) => void;
  playVideo: () => void;
  destroy: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YTWindow = typeof window & { YT: any; onYouTubeIframeAPIReady?: () => void };

export function ClipPlayer({ videoId, startTime, endTime }: Props) {
  const [ready, setReady] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const w = window as YTWindow;

    const initPlayer = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playerRef.current = new w.YT.Player('clip-yt-player', {
        videoId,
        playerVars: {
          start: Math.floor(startTime),
          end: Math.ceil(endTime),
          rel: 0,
          modestbranding: 1,
          autoplay: 0,
        },
        events: {
          onReady: () => setReady(true),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: { data: number }) => {
            const PLAYING = w.YT?.PlayerState?.PLAYING ?? 1;
            if (e.data === PLAYING) {
              intervalRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime() ?? 0;
                if (t >= endTime) {
                  playerRef.current?.seekTo(startTime, true);
                  if (intervalRef.current) clearInterval(intervalRef.current);
                }
              }, 500);
            } else {
              if (intervalRef.current) clearInterval(intervalRef.current);
            }
          },
        },
      }) as YTPlayer;
    };

    if (w.YT?.Player) {
      initPlayer();
    } else {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        initPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      playerRef.current?.destroy();
    };
  }, [videoId, startTime, endTime]);

  return (
    <div className={styles.playerWrap}>
      <div id="clip-yt-player" className={styles.player} />
      {!ready && (
        <div className={styles.playerLoading}>
          <span className={styles.loadingDot} />
        </div>
      )}
    </div>
  );
}
