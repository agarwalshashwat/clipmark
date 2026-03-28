'use client';

import { useState } from 'react';

interface Props {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  className?: string;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}-${sec.toString().padStart(2, '0')}`;
}

export function DownloadClipButton({ videoId, startTime, endTime, title, className }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clips/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, startTime, endTime, title }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Download failed.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^\w\s-]/g, '').trim()}_${formatTime(startTime)}-${formatTime(endTime)}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading} className={className} style={{ cursor: loading ? 'wait' : 'pointer' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
        {loading ? 'hourglass_empty' : 'download'}
      </span>
      {loading ? 'Downloading…' : 'Download MP4'}
    </button>
  );
}
