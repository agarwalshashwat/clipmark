'use client';

import { useState, useTransition } from 'react';
import styles from './page.module.css';
import { createGroup, deleteGroup, addCollectionToGroup, removeCollectionFromGroup, renameGroup, reorderGroup } from './actions';
import type { Collection } from '@/lib/supabase';
import Link from 'next/link';

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
  allCollections: Collection[];
}

export default function GroupsContent({ userGroups, autoTagGroups, allCollections }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<'custom' | 'tag'>('tag');
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleAddVideo = (groupId: string) => {
    if (!selectedVideoId) return;
    startTransition(async () => {
      await addCollectionToGroup(groupId, selectedVideoId);
      setAddingToGroup(null);
      setSelectedVideoId('');
    });
  };

  const handleRemoveVideo = (groupId: string, videoId: string) => {
    startTransition(() => removeCollectionFromGroup(groupId, videoId));
  };

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

  // Mirrors extension/src/popup/dashboard.js's renameGroup (inline
  // contentEditable there); prompt() is simpler here and gives the same
  // capability.
  const handleRename = (groupId: string, currentName: string) => {
    const name = window.prompt('Rename group:', currentName);
    if (!name || !name.trim() || name.trim() === currentName) return;
    startTransition(() => renameGroup(groupId, name.trim()));
  };

  const handleReorder = (groupId: string, direction: 'up' | 'down') => {
    startTransition(() => reorderGroup(groupId, direction));
  };

  return (
    <div>
      {/* ── My Groups ─────────────────────────────── */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>My Groups</h2>
        {!showForm && (
          <button className={styles.newGroupBtn} onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
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
              Smart (Tag Based)
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${formType === 'custom' ? styles.active : ''}`}
              onClick={() => setFormType('custom')}
            >
              Manual
            </button>
          </div>
          <input type="hidden" name="type" value={formType} />
          <div className={styles.formRow}>
            <input
              name="name"
              className={styles.formInput}
              placeholder={formType === 'tag' ? 'Group Name (e.g. Design Inspiration)' : 'Group Name'}
              required
              autoFocus
            />
            {formType === 'tag' && (
              <input
                name="tag_name"
                className={styles.formInput}
                placeholder="Tag (e.g. design)"
                required
              />
            )}
            <button type="submit" className={styles.newGroupBtn} disabled={isPending}>
              Create
            </button>
            <button type="button" className={styles.typeBtn} onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className={styles.groups}>
        {userGroups.map((group, groupIdx) => (
          <div key={group.id} className={styles.group}>
            <div className={styles.groupHeader}>
              <h3 className={styles.groupTag}>{group.name}</h3>
              <span className={styles.groupCount}>
                {group.type === 'tag' ? `Tag: #${group.tag_name}` : 'Manual'} · {group.collections.length} videos
              </span>
              <div style={{ flex: 1 }} />
              <button
                className={styles.removeBtn}
                onClick={() => handleReorder(group.id, 'up')}
                disabled={groupIdx === 0 || isPending}
                style={{ position: 'static', opacity: groupIdx === 0 ? 0.3 : 1 }}
                title="Move up"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_upward</span>
              </button>
              <button
                className={styles.removeBtn}
                onClick={() => handleReorder(group.id, 'down')}
                disabled={groupIdx === userGroups.length - 1 || isPending}
                style={{ position: 'static', opacity: groupIdx === userGroups.length - 1 ? 0.3 : 1 }}
                title="Move down"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_downward</span>
              </button>
              <button
                className={styles.removeBtn}
                onClick={() => handleRename(group.id, group.name)}
                style={{ position: 'static', opacity: 1 }}
                title="Rename group"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
              </button>
              <button
                className={styles.removeBtn}
                onClick={() => handleDelete(group.id)}
                style={{ position: 'static', opacity: 1 }}
                title="Delete group"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </div>

            <div className={styles.groupGrid}>
              {group.collections.map(col => (
                <div key={col.id} className={styles.miniCard}>
                  {group.type === 'custom' && (
                    <button 
                      className={styles.removeBtn}
                      onClick={() => handleRemoveVideo(group.id, col.id)}
                      title="Remove from group"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  )}
                  <Link href={`/dashboard?v=${col.video_id}`}>
                    <div className={styles.miniThumb}>
                      <img 
                        src={`https://i.ytimg.com/vi/${col.video_id}/mqdefault.jpg`} 
                        alt="" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div className={styles.thumbOverlay} />
                    </div>
                    <p className={styles.miniTitle}>{col.video_title || 'Untitled Video'}</p>
                  </Link>
                </div>
              ))}

              {group.type === 'custom' && (
                <div className={styles.addCard}>
                  {addingToGroup === group.id ? (
                    <>
                      <select 
                        className={styles.addSelect}
                        value={selectedVideoId}
                        onChange={(e) => setSelectedVideoId(e.target.value)}
                      >
                        <option value="">Select video...</option>
                        {allCollections
                          .filter(c => !group.collections.find(gc => gc.id === c.id))
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.video_title || c.video_id}</option>
                          ))}
                      </select>
                      <button className={styles.addBtn} onClick={() => handleAddVideo(group.id)}>Add</button>
                      <button className={styles.typeBtn} style={{ fontSize: 11 }} onClick={() => setAddingToGroup(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className={styles.addBtn} style={{ background: 'none', color: 'var(--text-muted)' }} onClick={() => setAddingToGroup(group.id)}>
                      <span className="material-symbols-outlined">add_circle</span>
                      <span style={{ display: 'block', fontSize: 11, marginTop: 4 }}>Add Video</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Auto Tag Groups ─────────────────────────── */}
      <div className={styles.tagsSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>All Tags</h2>
        </div>
        <div className={styles.groups}>
          {autoTagGroups.map(group => (
            <div key={group.tag} className={styles.group}>
              <div className={styles.groupHeader}>
                <h3 className={styles.groupTag}>#{group.tag}</h3>
                <span className={styles.groupCount}>{group.collections.length} videos</span>
              </div>
              <div className={styles.groupGrid}>
                {group.collections.map(col => (
                  <div key={col.id} className={styles.miniCard}>
                    <Link href={`/dashboard?v=${col.video_id}`}>
                      <div className={styles.miniThumb}>
                        <img 
                          src={`https://i.ytimg.com/vi/${col.video_id}/mqdefault.jpg`} 
                          alt="" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div className={styles.thumbOverlay} />
                      </div>
                      <p className={styles.miniTitle}>{col.video_title || 'Untitled Video'}</p>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
