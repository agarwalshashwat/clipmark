'use client';

import { useState } from 'react';
import styles from './page.module.css';

export function CopyLinkButton({ videoId }: { videoId: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${videoId}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      className={`${styles.footerBtn} ${styles.footerBtnGhost}`}
      onClick={handleCopy}
      title="Copy YouTube link"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
        {copied ? 'check_circle' : 'content_copy'}
      </span>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
