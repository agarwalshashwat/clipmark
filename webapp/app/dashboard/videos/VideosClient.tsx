'use client';

import { useState } from 'react';
import type { Bookmark } from '@/lib/supabase';
import styles from './page.module.css';
import { ShareCollectionButton } from './ShareCollectionButton';
import { AddToGroupDropdown } from './AddToGroupDropdown';
import { CopyLinkButton } from './CopyLinkButton';

export type VideoData = {
  videoId: string;
  videoTitle: string | null;
  bookmarkCount: number;
  lastSaved: string;
  timeAgoStr: string;
  tags: string[];
  timeRange: string | null;
  bookmarks: Bookmark[];
};

interface VideosClientProps {
  videos: VideoData[];
  groups: { id: string; name: string }[];
  userId: string;
}

export function VideosClient({ videos, groups, userId }: VideosClientProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = Array.from(new Set(videos.flatMap(v => v.tags))).sort();
  const filtered = activeTag ? videos.filter(v => v.tags.includes(activeTag)) : videos;

  return (
    <>
      {allTags.length > 0 && (
        <div className={styles.tagFilterBar}>
          <button
            className={`${styles.tagFilterChip} ${!activeTag ? styles.tagFilterChipActive : ''}`}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              className={`${styles.tagFilterChip} ${activeTag === tag ? styles.tagFilterChipActive : ''}`}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={styles.emptyFilter}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(0,107,95,0.3)' }}>filter_list_off</span>
          <p>No videos tagged <strong>#{activeTag}</strong></p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(v => (
            <div key={v.videoId} className={styles.card}>
              <a
                href={`https://www.youtube.com/watch?v=${v.videoId}`}
                className={styles.cardContent}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className={styles.thumbWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`}
                    alt={v.videoTitle ?? 'Video'}
                    className={styles.thumb}
                  />
                  <div className={styles.thumbOverlay} />
                  <span className={styles.badge}>
                    <span className="material-symbols-outlined" style={{ fontSize: 10, verticalAlign: 'middle' }}>bookmark</span>
                    {' '}{v.bookmarkCount}
                  </span>
                  <div className={styles.playBtn}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.title}>{v.videoTitle ?? 'Untitled Video'}</h3>
                  {v.timeRange && <p className={styles.timeRange}>{v.timeRange}</p>}
                  {v.tags.length > 0 && (
                    <div className={styles.tagRow}>
                      {v.tags.map(tag => (
                        <span key={tag} className={styles.tagChip}>#{tag}</span>
                      ))}
                    </div>
                  )}
                  <p className={styles.meta}>{v.timeAgoStr}</p>
                </div>
              </a>
              <div className={styles.cardFooter}>
                <div className={styles.footerActions}>
                  <ShareCollectionButton
                    videoId={v.videoId}
                    videoTitle={v.videoTitle ?? 'Untitled Video'}
                    bookmarks={v.bookmarks}
                    userId={userId}
                  />
                  <CopyLinkButton videoId={v.videoId} />
                  <AddToGroupDropdown
                    videoId={v.videoId}
                    initialGroups={groups}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
