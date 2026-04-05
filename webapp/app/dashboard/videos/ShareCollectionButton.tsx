'use client';

import { useState } from 'react';
import styles from './page.module.css';

interface ShareCollectionProps {
  videoId: string;
  videoTitle: string;
  bookmarks: any[];
  userId: string;
}

export function ShareCollectionButton({ videoId, videoTitle, bookmarks, userId }: ShareCollectionProps) {
  const [sharing, setSharing] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);

  async function handleShare() {
    setSharing(true);
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, videoTitle, bookmarks, userId }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(err.message || 'Failed to share collection');
        return;
      }

      const { shareId } = await response.json();
      setShareId(shareId);
      window.location.href = `/v/${shareId}`;
    } catch (err) {
      console.error('Share error:', err);
      alert('An unexpected error occurred');
    } finally {
      setSharing(false);
    }
  }

  if (shareId) return null;

  return (
    <button
      className={`${styles.footerBtn} ${styles.footerBtnShare}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleShare();
      }}
      disabled={sharing}
      style={{ opacity: sharing ? 0.7 : 1, cursor: sharing ? 'not-allowed' : 'pointer' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
        {sharing ? 'sync' : 'ios_share'}
      </span>
      {sharing ? 'Sharing...' : 'Share'}
    </button>
  );
}
