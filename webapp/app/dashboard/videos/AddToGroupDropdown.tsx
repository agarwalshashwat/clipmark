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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        title="Add to Group"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
          {addingId === 'done' ? 'check_circle' : 'create_new_folder'}
        </span>
        Add
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          right: 0,
          marginBottom: '8px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          border: '1px solid rgba(26,28,29,0.06)',
          zIndex: 100,
          minWidth: '180px',
          overflow: 'hidden',
          padding: '6px'
        }}>
          <p style={{
            margin: '8px 12px 6px',
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#9ca3af'
          }}>Add to Group...</p>

          {initialGroups.length === 0 ? (
            <p style={{ padding: '12px', fontSize: '13px', color: '#545f6c', textAlign: 'center' }}>
              No custom groups found.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {initialGroups.map(g => (
                <button
                  key={g.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAdd(g.id);
                  }}
                  disabled={addingId !== null}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: '#1a1c1d',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#fcfcfd'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                    {g.name}
                  </span>
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

          <a href="/dashboard/groups" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            marginTop: '4px',
            borderTop: '1px solid rgba(26,28,29,0.04)',
            fontSize: '12px',
            fontWeight: 600,
            color: '#14B8A6',
            textDecoration: 'none'
          }}>
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
