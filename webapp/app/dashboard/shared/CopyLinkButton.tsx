'use client';

import { useState } from 'react';
import styles from './page.module.css';

export function DashboardCopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      className={styles.copyBtn}
      onClick={handleCopy}
      title="Copy link"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        borderRadius: '12px',
        background: copied ? '#006B5F15' : '#f3f3f4',
        border: '1px solid rgba(26,28,29,0.06)',
        color: copied ? '#006B5F' : '#1A1C1D',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 600,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        minWidth: '120px',
        justifyContent: 'center',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
        {copied ? 'check_circle' : 'content_copy'}
      </span>
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  );
}
