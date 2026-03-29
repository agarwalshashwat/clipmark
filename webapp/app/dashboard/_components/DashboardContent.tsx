'use client';

import { useState, useRef, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../page.module.css';
import toolbarStyles from './toolbar.module.css';
import { deleteBookmark, bulkDeleteBookmarks, importBookmarks } from '../actions';
import type { Collection, Bookmark } from '@/lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatMonthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

function formatDayLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

type BookmarkWithCollection = Bookmark & { collection: Collection };

function groupBookmarksByMonth(bookmarks: BookmarkWithCollection[]): Map<string, BookmarkWithCollection[]> {
  const map = new Map<string, BookmarkWithCollection[]>();
  for (const b of bookmarks) {
    const key = formatMonthLabel(b.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return map;
}

type TimelineGroup = { dayLabel: string; collection: Collection; items: BookmarkWithCollection[] };

function buildTimelineGroups(bookmarks: BookmarkWithCollection[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  const indexMap = new Map<string, number>();
  for (const b of bookmarks) {
    const dayLabel = formatDayLabel(b.createdAt);
    const key = `${dayLabel}::${b.collection.video_id}`;
    if (indexMap.has(key)) {
      groups[indexMap.get(key)!].items.push(b);
    } else {
      indexMap.set(key, groups.length);
      groups.push({ dayLabel, collection: b.collection, items: [b] });
    }
  }
  return groups;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(collections: Collection[]) {
  const data = collections.map(c => ({
    videoId: c.video_id,
    videoTitle: c.video_title,
    bookmarks: c.bookmarks,
  }));
  downloadFile(JSON.stringify(data, null, 2), 'clipmark-bookmarks.json', 'application/json');
}

function exportCSV(collections: Collection[]) {
  const rows = ['Video ID,Video Title,Timestamp,Description,Tags,Created At'];
  for (const c of collections) {
    for (const b of (c.bookmarks ?? [])) {
      const row = [
        c.video_id,
        `"${(c.video_title ?? '').replace(/"/g, '""')}"`,
        formatTimestamp(b.timestamp),
        `"${(b.description ?? '').replace(/"/g, '""')}"`,
        `"${(b.tags ?? []).join(', ')}"`,
        b.createdAt,
      ];
      rows.push(row.join(','));
    }
  }
  downloadFile(rows.join('\n'), 'clipmark-bookmarks.csv', 'text/csv');
}

function exportMarkdown(collections: Collection[]) {
  const lines: string[] = ['# Clipmark Bookmarks\n'];
  for (const c of collections) {
    lines.push(`## ${c.video_title ?? 'Untitled'}`);
    lines.push(`[Open on YouTube](https://www.youtube.com/watch?v=${c.video_id})\n`);
    for (const b of (c.bookmarks ?? [])) {
      const ts = formatTimestamp(b.timestamp);
      const tags = (b.tags ?? []).map((t: string) => `#${t}`).join(' ');
      lines.push(`- **[${ts}](https://www.youtube.com/watch?v=${c.video_id}&t=${Math.floor(b.timestamp)}s)** — ${b.description || 'No note'} ${tags}`);
    }
    lines.push('');
  }
  downloadFile(lines.join('\n'), 'clipmark-bookmarks.md', 'text/markdown');
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  collections: Collection[];
  isPro: boolean;
  initialView: string;
  successBanner?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardContent({ collections, isPro, initialView, successBanner }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'timestamp'>('newest');
  const [viewMode, setViewMode] = useState<'library' | 'timeline'>(
    initialView === 'timeline' ? 'timeline' : 'library'
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cardSize, setCardSize] = useState<'large' | 'medium' | 'small'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dash_cardSize') as 'large' | 'medium' | 'small') || 'large';
    }
    return 'large';
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [copyToast, setCopyToast] = useState('');
  const [expandedVideos, setExpandedVideos] = useState<Set<string>>(new Set());
  const importInputRef = useRef<HTMLInputElement>(null);

  // ── Filtering ───────────────────────────────────────────────────────────────

  const filteredCollections = (() => {
    const q = query.trim().toLowerCase();
    let cols = q
      ? collections.filter(c =>
          (c.video_title ?? '').toLowerCase().includes(q) ||
          (c.bookmarks ?? []).some((b: Bookmark) =>
            (b.description ?? '').toLowerCase().includes(q) ||
            (b.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
          )
        )
      : collections;

    if (sortOrder === 'oldest') {
      cols = [...cols].reverse();
    } else if (sortOrder === 'timestamp') {
      cols = [...cols].map(c => ({
        ...c,
        bookmarks: [...(c.bookmarks ?? [])].sort((a, b) => a.timestamp - b.timestamp),
      }));
    }
    return cols;
  })();

  const allBookmarks: BookmarkWithCollection[] = filteredCollections
    .flatMap(c => (c.bookmarks ?? []).map((b: Bookmark) => ({ ...b, collection: c })))
    .sort((a, b) => {
      if (sortOrder === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortOrder === 'timestamp') return a.timestamp - b.timestamp;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const grouped = groupBookmarksByMonth(allBookmarks);

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalBookmarks = collections.reduce((s, c) => s + (c.bookmarks?.length ?? 0), 0);
  const uniqueTags = Array.from(new Set(collections.flatMap(c => (c.bookmarks ?? []).flatMap((b: Bookmark) => b.tags ?? []))));
  const lastSaved = collections[0]?.created_at ?? null;

  // ── View toggle ─────────────────────────────────────────────────────────────

  const switchView = (mode: 'library' | 'timeline') => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', mode);
    router.replace(`/dashboard?${params.toString()}`);
  };

  const cycleCardSize = () => {
    const cycle: Record<string, 'large' | 'medium' | 'small'> = { large: 'medium', medium: 'small', small: 'large' };
    const next = cycle[cardSize] || 'large';
    setCardSize(next);
    localStorage.setItem('dash_cardSize', next);
  };

  // ── Selection ───────────────────────────────────────────────────────────────

  const toggleSelect = (videoId: string, bookmarkId: number) => {
    const key = `${videoId}:${bookmarkId}`;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = useCallback((videoId: string, bookmarkId: number) => {
    startTransition(async () => {
      await deleteBookmark(videoId, bookmarkId);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(`${videoId}:${bookmarkId}`);
        return next;
      });
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const pairs = Array.from(selectedIds).map(key => {
      const [videoId, bookmarkId] = key.split(':');
      return { videoId, bookmarkId: parseInt(bookmarkId, 10) };
    });
    startTransition(async () => {
      await bulkDeleteBookmarks(pairs);
      setSelectedIds(new Set());
    });
  }, [selectedIds]);

  // ── Copy timestamp link ──────────────────────────────────────────────────────

  const copyLink = async (videoId: string, timestamp: number) => {
    const url = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp)}s`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyToast('Link copied!');
      setTimeout(() => setCopyToast(''), 2000);
    } catch {
      setCopyToast('Copy failed');
      setTimeout(() => setCopyToast(''), 2000);
    }
  };

  // ── Import ───────────────────────────────────────────────────────────────────

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const groups: { videoId: string; bookmarks: Bookmark[] }[] = Array.isArray(parsed)
        ? parsed
            .filter((g: { videoId?: string; bookmarks?: unknown }) => g.videoId && Array.isArray(g.bookmarks))
            .map((g: { videoId: string; bookmarks: Bookmark[] }) => ({ videoId: g.videoId, bookmarks: g.bookmarks }))
        : [];
      if (groups.length === 0) { alert('No valid bookmarks found in file.'); return; }
      startTransition(async () => {
        await importBookmarks(groups);
      });
    } catch {
      alert('Failed to parse JSON file.');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={viewMode === 'timeline' ? styles.timelineWrap : styles.libraryWrap}>
      {successBanner}

      {/* ── Toolbar ── */}
      <div className={toolbarStyles.toolbar}>
        <div className={toolbarStyles.toolbarLeft}>
          <div className={toolbarStyles.searchWrap}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6c7a77' }}>search</span>
            <input
              type="text"
              placeholder="Search bookmarks…"
              className={toolbarStyles.searchInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button className={toolbarStyles.clearBtn} onClick={() => setQuery('')} title="Clear">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            )}
          </div>
          <select
            className={toolbarStyles.sortSelect}
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="timestamp">By timestamp</option>
          </select>
        </div>

        <div className={toolbarStyles.toolbarRight}>
          {/* View toggle */}
          <div className={toolbarStyles.viewToggle}>
            <button
              className={`${toolbarStyles.viewBtn} ${viewMode === 'library' ? toolbarStyles.viewBtnActive : ''}`}
              onClick={() => switchView('library')}
              title="Library view"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>grid_view</span>
            </button>
            <button
              className={`${toolbarStyles.viewBtn} ${viewMode === 'timeline' ? toolbarStyles.viewBtnActive : ''}`}
              onClick={() => switchView('timeline')}
              title="Timeline view"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>timeline</span>
            </button>
          </div>

          {/* Card size toggle */}
          {viewMode === 'library' && (
            <button
              className={toolbarStyles.toolbarBtn}
              onClick={cycleCardSize}
              title={`Card size: ${cardSize}`}
              style={{ fontSize: 13, fontWeight: 700, fontFamily: 'inherit', minWidth: 32 }}
            >
              {cardSize === 'large' ? 'L' : cardSize === 'medium' ? 'M' : 'S'}
            </button>
          )}

          {/* Export / Import */}
          <div className={toolbarStyles.exportWrap}>
            <button
              className={toolbarStyles.toolbarBtn}
              onClick={() => setExportOpen(o => !o)}
              title="Export / Import"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_horiz</span>
            </button>
            {exportOpen && (
              <>
                <div className={toolbarStyles.exportBackdrop} onClick={() => setExportOpen(false)} />
                <div className={toolbarStyles.exportPopover}>
                  <p className={toolbarStyles.exportSection}>Export</p>
                  <button className={toolbarStyles.exportBtn} onClick={() => { exportJSON(collections); setExportOpen(false); }}>↓ JSON</button>
                  <button className={toolbarStyles.exportBtn} onClick={() => { exportCSV(collections); setExportOpen(false); }}>↓ CSV</button>
                  <button className={toolbarStyles.exportBtn} onClick={() => { exportMarkdown(collections); setExportOpen(false); }}>↓ Markdown</button>
                  <hr className={toolbarStyles.exportDivider} />
                  <button className={toolbarStyles.exportBtn} onClick={() => { importInputRef.current?.click(); setExportOpen(false); }}>↑ Import JSON</button>
                </div>
              </>
            )}
          </div>

          <input ref={importInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </div>
      </div>

      {/* ── Bulk delete bar ── */}
      {selectedIds.size > 0 && (
        <div className={toolbarStyles.bulkBar}>
          <span className={toolbarStyles.bulkCount}>{selectedIds.size} selected</span>
          <button
            className={toolbarStyles.bulkDeleteBtn}
            onClick={handleBulkDelete}
            disabled={isPending}
          >
            Delete selected
          </button>
          <button className={toolbarStyles.bulkCancelBtn} onClick={() => setSelectedIds(new Set())}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Copy toast ── */}
      {copyToast && <div className={toolbarStyles.copyToast}>{copyToast}</div>}

      {/* ── Loading overlay ── */}
      {isPending && <div className={toolbarStyles.pendingBar} />}

      {/* ── Library header (stats) ── */}
      {viewMode === 'library' && (
        <section className={styles.libraryHeader}>
          <div>
            <h1 className={styles.pageTitle}>Knowledge Stream</h1>
            <p className={styles.pageSub}>Your curated editorial journey through the web.</p>
          </div>
          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Bookmarks</span>
              <span className={styles.statNum}>{totalBookmarks}</span>
            </div>
            <div className={`${styles.statItem} ${styles.statBorder}`}>
              <span className={styles.statLabel}>Videos</span>
              <span className={styles.statNum}>{collections.length}</span>
            </div>
            <div className={`${styles.statItem} ${styles.statBorder}`}>
              <span className={styles.statLabel}>Unique Tags</span>
              <span className={styles.statNum}>{uniqueTags.length}</span>
            </div>
            <div className={`${styles.statItem} ${styles.statBorder}`}>
              <span className={styles.statLabel}>Last Saved</span>
              <span className={`${styles.statNum} ${styles.statNumSecondary}`}>
                {lastSaved ? timeAgo(lastSaved) : '—'}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ── Timeline header ── */}
      {viewMode === 'timeline' && (
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Knowledge Stream</h1>
          <p className={styles.pageSub}>Your curated editorial journey through the web.</p>
        </div>
      )}

      {/* ── Empty state ── */}
      {filteredCollections.length === 0 && (
        query ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(0,107,95,0.3)' }}>search_off</span>
            </div>
            <h3 className={styles.emptyTitle}>No matches found</h3>
            <p className={styles.emptyText}>Try a different search term or clear the filter.</p>
          </div>
        ) : (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(0,107,95,0.3)' }}>video_call</span>
            </div>
            <h3 className={styles.emptyTitle}>No collections yet</h3>
            <p className={styles.emptyText}>
              Install the extension and bookmark moments from YouTube videos to see them here.
            </p>
          </div>
        )
      )}

      {/* ── Library view ── */}
      {viewMode === 'library' && filteredCollections.length > 0 && (
        <div className={`${styles.videoGrid}${cardSize === 'medium' ? ' ' + styles.videoGridMedium : cardSize === 'small' ? ' ' + styles.videoGridSmall : ''}`}>
          {filteredCollections.map(c => (
            <div key={c.id} className={styles.videoCard}>
              <div className={styles.videoLeft}>
                <a href={`https://www.youtube.com/watch?v=${c.video_id}`} className={styles.videoThumbWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.youtube.com/vi/${c.video_id}/hqdefault.jpg`}
                    alt={c.video_title ?? 'Video'}
                    className={styles.videoThumbImg}
                  />
                  <div className={styles.videoThumbOverlay} />
                  <div className={styles.videoMeta}>
                    <span className={styles.videoBadge}>YouTube</span>
                  </div>
                  <div className={styles.videoPlayBtn}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                  </div>
                </a>
                <div className={styles.scrubber}>
                  <div className={styles.scrubberTrack}>
                    {(c.bookmarks ?? []).map((b: Bookmark, i: number, arr: Bookmark[]) => {
                      const pos = arr.length > 1 ? (i / (arr.length - 1)) * 90 + 5 : 50;
                      return (
                        <div
                          key={i}
                          className={styles.scrubberMarker}
                          style={{ left: `${pos}%`, borderColor: b.color || '#006b5f' }}
                          title={formatTimestamp(b.timestamp)}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className={styles.videoActions}>
                  <a href={`https://www.youtube.com/watch?v=${c.video_id}`} className={styles.videoActionBtn}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                    Revisit
                  </a>
                </div>
              </div>

              <div className={styles.videoRight}>
                <div className={styles.videoInfo}>
                  <h2 className={styles.videoTitle}>{c.video_title ?? 'Untitled Video'}</h2>
                  <p className={styles.videoSubMeta}>
                    <span className={styles.videoClipCount}>{c.bookmarks?.length ?? 0} Bookmarks</span>
                    <span className={styles.metaDot} />
                    <span>{new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </p>
                </div>
                <div className={styles.bookmarkThread}>
                  <div className={styles.threadLine} />
                  {(c.bookmarks ?? []).slice(0, 4).map((b: Bookmark, i: number) => {
                    const selKey = `${c.video_id}:${b.id}`;
                    const isSelected = selectedIds.has(selKey);
                    return (
                      <div key={i} className={`${styles.threadItem} ${toolbarStyles.threadItemHover} ${isSelected ? toolbarStyles.threadItemSelected : ''}`}>
                        <input
                          type="checkbox"
                          className={toolbarStyles.checkbox}
                          checked={isSelected}
                          onChange={() => toggleSelect(c.video_id, b.id)}
                          title="Select"
                        />
                        <div className={styles.threadDot} style={{ borderColor: b.color || '#006b5f' }} />
                        <div className={styles.threadContent}>
                          <div className={styles.threadMeta}>
                            <span className={styles.threadTime} style={{ color: b.color || '#006b5f', background: `${b.color || '#006b5f'}12` }}>
                              {formatTimestamp(b.timestamp)}
                            </span>
                            <span className={styles.threadType}>
                              {b.description ? 'Annotated Bookmark' : 'Quick Clip'}
                            </span>
                            <div className={toolbarStyles.bookmarkActions}>
                              <button
                                className={toolbarStyles.actionBtn}
                                title="Copy timestamp link"
                                onClick={() => copyLink(c.video_id, b.timestamp)}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>
                              </button>
                              <button
                                className={`${toolbarStyles.actionBtn} ${toolbarStyles.actionBtnDanger}`}
                                title="Delete bookmark"
                                onClick={() => handleDelete(c.video_id, b.id)}
                                disabled={isPending}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                              </button>
                            </div>
                          </div>
                          <p className={styles.threadNote}>{b.description || 'No note added.'}</p>
                          {(b.tags ?? []).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {(b.tags ?? []).map((tag: string) => (
                                <span key={tag} className={styles.entryTag}>#{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {(c.bookmarks?.length ?? 0) > 4 && (() => {
                    const isExpanded = expandedVideos.has(c.video_id);
                    const remaining = (c.bookmarks?.length ?? 0) - 4;
                    const toggle = () => setExpandedVideos(prev => {
                      const next = new Set(prev);
                      if (next.has(c.video_id)) next.delete(c.video_id); else next.add(c.video_id);
                      return next;
                    });
                    return (
                      <>
                        <div className={`${styles.extraBookmarks} ${isExpanded ? styles.extraBookmarksOpen : ''}`}>
                          <div className={styles.extraBookmarksInner}>
                            {(c.bookmarks ?? []).slice(4).map((b: Bookmark, i: number) => {
                              const selKey = `${c.video_id}:${b.id}`;
                              const isSelected = selectedIds.has(selKey);
                              return (
                                <div key={i + 4} className={`${styles.threadItem} ${toolbarStyles.threadItemHover} ${isSelected ? toolbarStyles.threadItemSelected : ''}`}>
                                  <input
                                    type="checkbox"
                                    className={toolbarStyles.checkbox}
                                    checked={isSelected}
                                    onChange={() => toggleSelect(c.video_id, b.id)}
                                    title="Select"
                                  />
                                  <div className={styles.threadDot} style={{ borderColor: b.color || '#006b5f' }} />
                                  <div className={styles.threadContent}>
                                    <div className={styles.threadMeta}>
                                      <span className={styles.threadTime} style={{ color: b.color || '#006b5f', background: `${b.color || '#006b5f'}12` }}>
                                        {formatTimestamp(b.timestamp)}
                                      </span>
                                      <span className={styles.threadType}>
                                        {b.description ? 'Annotated Bookmark' : 'Quick Clip'}
                                      </span>
                                      <div className={toolbarStyles.bookmarkActions}>
                                        <button className={toolbarStyles.actionBtn} title="Copy timestamp link" onClick={() => copyLink(c.video_id, b.timestamp)}>
                                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>
                                        </button>
                                        <button className={`${toolbarStyles.actionBtn} ${toolbarStyles.actionBtnDanger}`} title="Delete bookmark" onClick={() => handleDelete(c.video_id, b.id)} disabled={isPending}>
                                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                                        </button>
                                      </div>
                                    </div>
                                    <p className={styles.threadNote}>{b.description || 'No note added.'}</p>
                                    {(b.tags ?? []).length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                        {(b.tags ?? []).map((tag: string) => (
                                          <span key={tag} className={styles.entryTag}>#{tag}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <button className={styles.expandLink} onClick={toggle}>
                          {isExpanded ? 'Show Less' : `Show ${remaining} More`}
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}

          <div className={styles.suggestionCard}>
            <div className={styles.suggestionIcon}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'rgba(0,107,95,0.35)' }}>video_call</span>
            </div>
            <h3 className={styles.suggestionTitle}>Add more variety</h3>
            <p className={styles.suggestionText}>
              Keep curating. AI-powered summaries are available for premium curators.
            </p>
            {!isPro && <a href="/upgrade" className={styles.suggestionCta}>Explore Pro</a>}
          </div>
        </div>
      )}

      {/* ── Timeline view ── */}
      {viewMode === 'timeline' && allBookmarks.length > 0 && (
        <div className={styles.timeline}>
          <div className={styles.timelineLine} />
          {Array.from(grouped.entries()).map(([month, bookmarks]) => (
            <div key={month}>
              <div className={styles.monthMarker}>
                <div className={styles.monthDot} />
                <span className={styles.monthLabel}>{month}</span>
              </div>
              {buildTimelineGroups(bookmarks).map((group, gi) => (
                <div key={`${group.dayLabel}::${group.collection.video_id}-${gi}`} className={styles.timelineEntry}>
                  <div className={styles.entryDate}>
                    <span className={styles.dayLabel}>{group.dayLabel}</span>
                  </div>
                  <div className={`${styles.entryCard} ${toolbarStyles.entryCardHover}`} style={{ position: 'relative' }}>
                    <div className={styles.entryInner}>
                      <a href={`https://www.youtube.com/watch?v=${group.collection.video_id}`} className={styles.entryThumb}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://img.youtube.com/vi/${group.collection.video_id}/hqdefault.jpg`}
                          alt={group.collection.video_title ?? 'Video'}
                          className={styles.entryThumbImg}
                        />
                        {group.items.length > 1 && (
                          <span className={styles.entryTimestamp}>{group.items.length} clips</span>
                        )}
                      </a>
                      <div className={styles.entryBody}>
                        <h3 className={styles.entryTitle}>{group.collection.video_title ?? 'Untitled Video'}</h3>
                      </div>
                    </div>
                    <div className={styles.groupedClips}>
                      {group.items.map((b, ci) => {
                        const selKey = `${group.collection.video_id}:${b.id}`;
                        const isSelected = selectedIds.has(selKey);
                        return (
                          <div key={ci} className={`${styles.clipRow} ${isSelected ? toolbarStyles.entrySelected : ''}`}>
                            <input
                              type="checkbox"
                              className={toolbarStyles.checkbox}
                              checked={isSelected}
                              onChange={() => toggleSelect(group.collection.video_id, b.id)}
                              title="Select"
                            />
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.color || '#006b5f', flexShrink: 0 }} />
                            <a
                              href={`https://www.youtube.com/watch?v=${group.collection.video_id}&t=${Math.floor(b.timestamp)}s`}
                              className={styles.clipTimestamp}
                              style={{ color: b.color || '#006b5f', background: `${b.color || '#006b5f'}12` }}
                            >
                              {formatTimestamp(b.timestamp)}
                            </a>
                            <span className={styles.clipRowNote}>{b.description || 'No note added.'}</span>
                            <div className={toolbarStyles.bookmarkActions}>
                              <button className={toolbarStyles.actionBtn} title="Copy timestamp link" onClick={() => copyLink(group.collection.video_id, b.timestamp)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>
                              </button>
                              <button className={`${toolbarStyles.actionBtn} ${toolbarStyles.actionBtnDanger}`} title="Delete bookmark" onClick={() => handleDelete(group.collection.video_id, b.id)} disabled={isPending}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
