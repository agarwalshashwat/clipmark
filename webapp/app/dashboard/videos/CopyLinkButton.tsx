'use client';

import { useState, type MouseEvent } from 'react';
import styles from './page.module.css';

export function CopyLinkButton({ videoId }: { videoId: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function handleCopy(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${videoId}`);
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 2000);
    }
  }

  return (
    <button
      className={`${styles.footerBtn} ${styles.footerBtnGhost}`}
      onClick={handleCopy}
      title={copyError ? 'Failed to copy YouTube link' : 'Copy YouTube link'}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
        {copyError ? 'error' : copied ? 'check_circle' : 'content_copy'}
      </span>
      {copyError ? 'Copy failed' : copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
