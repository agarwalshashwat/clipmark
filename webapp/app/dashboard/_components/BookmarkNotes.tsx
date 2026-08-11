'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import styles from './toolbar.module.css';
import { updateBookmarkNotes } from '../actions';
import type { Bookmark } from '@/lib/supabase';

/**
 * Extended Notes (Pro) — a per-bookmark textarea, autosaved.
 *
 * Mirrors extension/src/popup/dashboard.js's .vc-notes-btn / .vc-notes-panel
 * (debounced autosave on input, immediate save on blur/Ctrl+Enter, Esc to
 * close). The extension only gates this client-side; the webapp also
 * re-checks Pro server-side in actions.ts::updateBookmarkNotes, so `isPro`
 * here is a UX shortcut, not the enforcement point.
 */

const SAVE_DEBOUNCE_MS = 800;

interface Props {
  videoId: string;
  bookmark: Bookmark;
  isPro: boolean;
  onUpgradeNeeded: () => void;
}

export default function BookmarkNotes({ videoId, bookmark, isPro, onUpgradeNeeded }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(bookmark.notes ?? '');
  const [hint, setHint] = useState('Auto-saves · Esc to close');
  const [isPending, startTransition] = useTransition();
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const hasNotes = !!(bookmark.notes && bookmark.notes.trim());

  const save = () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setHint('Saving…');
    startTransition(async () => {
      try {
        await updateBookmarkNotes(videoId, bookmark.id, value);
        setHint('Saved ✓');
        setTimeout(() => setHint('Auto-saves · Esc to close'), 1800);
      } catch {
        setHint('Failed to save');
      }
    });
  };

  const handleToggle = () => {
    if (!isPro) { onUpgradeNeeded(); return; }
    setOpen(o => !o);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    dirtyRef.current = true;
    setHint('Auto-saves · Esc to close');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, SAVE_DEBOUNCE_MS);
  };

  return (
    <>
      <button
        className={styles.notesBtn}
        onClick={handleToggle}
        title={`Extended notes${hasNotes ? ' (has notes)' : ''}${!isPro ? ' — Pro' : ''}`}
        aria-label="Extended notes"
        type="button"
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 14 }}>
          {hasNotes ? 'sticky_note_2' : 'note_add'}
        </span>
      </button>
      {open && isPro && (
        <div className={styles.notesPanel}>
          <textarea
            className={styles.notesTextarea}
            placeholder="Add a longer note, context, or key insight…"
            rows={2}
            value={value}
            onChange={handleChange}
            onBlur={save}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); save(); }
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          <div className={styles.notesHint}>{isPending ? 'Saving…' : hint}</div>
        </div>
      )}
    </>
  );
}
