'use client';

import { useState, useRef, useEffect } from 'react';
import { addCollectionToGroup } from '../groups/actions';
import styles from './page.module.css';

interface AddToGroupProps {
  videoId: string;
  initialGroups: { id: string; name: string }[];
}

export function AddToGroupDropdown({ videoId, initialGroups }: AddToGroupProps) {
  const [open, setOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuId = `group-menu-${videoId}`;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  async function handleAdd(groupId: string) {
    setAddingId(groupId);
    try {
      await addCollectionToGroup(groupId, videoId);
      setAddingId('done');
      setTimeout(() => {
        setAddingId(null);
        setOpen(false);
      }, 800);
    } catch (err) {
      console.error('Failed to add to group:', err);
      alert('Error adding to group');
      setAddingId(null);
    }
  }

  return (
    <div className={styles.dropdownWrap} ref={dropdownRef}>
      <button
        className={`${styles.footerBtn} ${styles.footerBtnGhost} ${open ? styles.footerBtnGhostActive : ''}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="Add to Group"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
          {addingId === 'done' ? 'check_circle' : 'create_new_folder'}
        </span>
        Add
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Add to group"
          className={styles.dropdownMenu}
        >
          <p className={styles.dropdownMenuLabel}>Add to Group...</p>

          {initialGroups.length === 0 ? (
            <p className={styles.dropdownMenuEmpty}>No custom groups found.</p>
          ) : (
            <div className={styles.dropdownMenuList}>
              {initialGroups.map(g => (
                <button
                  key={g.id}
                  role="menuitem"
                  className={styles.dropdownMenuItem}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAdd(g.id);
                  }}
                  disabled={addingId !== null}
                >
                  <span className={styles.dropdownMenuItemLabel}>{g.name}</span>
                  {addingId === g.id && (
                    <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>sync</span>
                  )}
                  {addingId === 'done' && (
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#14B8A6' }}>check_circle</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <a href="/dashboard/groups" className={styles.dropdownMenuFooter}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Manage Groups
          </a>
        </div>
      )}
      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
