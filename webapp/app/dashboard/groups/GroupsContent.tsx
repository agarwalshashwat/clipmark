'use client';

import { useState, useTransition } from 'react';
import styles from './page.module.css';
import { createGroup, deleteGroup } from './actions';
import type { Collection } from '@/lib/supabase';

interface UserGroup {
  id: string;
  name: string;
  type: 'custom' | 'tag';
  tag_name: string | null;
  collections: Collection[];
}

interface AutoTagGroup {
  tag: string;
  collections: Collection[];
}

interface Props {
  userGroups: UserGroup[];
  autoTagGroups: AutoTagGroup[];
}

export default function GroupsContent({ userGroups, autoTagGroups }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<'custom' | 'tag'>('tag');
  const [isPending, startTransition] = useTransition();

  const handleCreate = (formData: FormData) => {
    startTransition(async () => {
      await createGroup(formData);
      setShowForm(false);
    });
  };

  const handleDelete = (groupId: string) => {
    if (!confirm('Delete this group? The bookmarks inside are not affected.')) return;
    startTransition(() => deleteGroup(groupId));
  };

  return (
    <div>
      {/* ── My Groups ─────────────────────────────── */}
      <div className={styles.sectionHeader}>
        <p className={styles.sectionTitle}>My Groups</p>
        {!showForm && (
          <button className={styles.newGroupBtn} onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New Group
          </button>
        )}
      </div>

      {showForm && (
        <form action={handleCreate} className={styles.createForm}>
          <div className={styles.typeToggle}>
            <button
              type="button"
              className={`${styles.typeBtn} ${formType === 'tag' ? styles.active : ''}`}
              onClick={() => setFormType('tag')}
            >
              By Tag
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${formType === 'custom' ? styles.active : ''}`}
              onClick={() => setFormType('custom')}
            >
              Custom
            </button>
          </div>
          <input type="hidden" name="type" value={formType} />
          <div className={styles.formRow}>
            <input
              name="name"
              className={styles.formInput}
              placeholder={formType === 'tag' ? 'Group name (e.g. Learning Resources)' : 'Group name'}
              required
              autoFocus
            />
            {formType === 'tag' && (
              <input
                name="tag_name"
                className={styles.formInput}
                placeholder="Tag (e.g. idea)"
                required
                style={{ flex: '0 0 160px' }}
              />
            )}
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.formCancel} onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className={styles.formSubmit} disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Group'}
            </button>
          </div>
        </form>
      )}

      {userGroups.length === 0 && !showForm && (
        <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 32 }}>
          No custom groups yet. Create one above to organise your videos.
        </p>
      )}

      {userGroups.length > 0 && (
        <div className={styles.groups} style={{ marginBottom: 48 }}>
          {userGroups.map(g => (
            <div key={g.id} className={styles.group}>
              <div className={styles.groupHeaderRow}>
                <span className={styles.groupName}>{g.name}</span>
                {g.type === 'tag' && g.tag_name && (
                  <span className={styles.groupCount}>#{g.tag_name}</span>
                )}
                <span className={styles.groupCount}>{g.collections.length} video{g.collections.length !== 1 ? 's' : ''}</span>
                <button
                  className={styles.groupDeleteBtn}
                  title="Delete group"
                  onClick={() => handleDelete(g.id)}
                  disabled={isPending}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                </button>
              </div>
              {g.collections.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9ca3af' }}>
                  {g.type === 'tag' ? 'No bookmarks with this tag yet.' : 'No videos added to this group yet.'}
                </p>
              ) : (
                <div className={styles.groupGrid}>
                  {g.collections.slice(0, 4).map(c => (
                    <a key={c.id} href={`/v/${c.id}`} className={styles.groupCard}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${c.video_id}/hqdefault.jpg`}
                        alt={c.video_title ?? 'Video'}
                        className={styles.groupCardImg}
                      />
                      <div className={styles.groupCardOverlay}>
                        <p className={styles.groupCardTitle}>{c.video_title ?? 'Untitled Video'}</p>
                        <span className={styles.groupCardClips}>{c.bookmarks?.length ?? 0} clips</span>
                      </div>
                    </a>
                  ))}
                  {g.collections.length > 4 && (
                    <div className={styles.groupMore}>+{g.collections.length - 4} more</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Auto Groups (from tags) ────────────────── */}
      {autoTagGroups.length > 0 && (
        <>
          <hr className={styles.divider} />
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Auto Groups <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 12 }}>— from bookmark tags</span></p>
          </div>
          <div className={styles.groups}>
            {autoTagGroups.map(({ tag, collections: cols }) => (
              <div key={tag} className={styles.group}>
                <div className={styles.groupHeader}>
                  <span className={styles.groupTag}>#{tag}</span>
                  <span className={styles.groupCount}>{cols.length} video{cols.length !== 1 ? 's' : ''}</span>
                </div>
                <div className={styles.groupGrid}>
                  {cols.slice(0, 4).map(c => (
                    <a key={c.id} href={`/v/${c.id}`} className={styles.groupCard}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${c.video_id}/hqdefault.jpg`}
                        alt={c.video_title ?? 'Video'}
                        className={styles.groupCardImg}
                      />
                      <div className={styles.groupCardOverlay}>
                        <p className={styles.groupCardTitle}>{c.video_title ?? 'Untitled Video'}</p>
                        <span className={styles.groupCardClips}>{c.bookmarks?.length ?? 0} clips</span>
                      </div>
                    </a>
                  ))}
                  {cols.length > 4 && (
                    <div className={styles.groupMore}>+{cols.length - 4} more</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
