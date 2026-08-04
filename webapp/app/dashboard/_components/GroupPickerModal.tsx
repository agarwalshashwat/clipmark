'use client';

import { useState, useTransition } from 'react';
import { addCollectionToGroup, createGroup } from '../groups/actions';

interface Group { id: string; name: string; }

interface Props {
  videoId: string;
  videoTitle: string | null;
  groups: Group[];
  onClose: () => void;
}

export default function GroupPickerModal({ videoId, videoTitle, groups: initialGroups, onClose }: Props) {
  // Local copy so a group created inline (below) appears immediately without
  // waiting on the parent page to re-fetch — mirrors the extension's
  // floating group picker (dashboard.js's showGroupPicker), which lets you
  // create a group and pick it in one flow instead of leaving to
  // /dashboard/groups first.
  const [groups, setGroups] = useState(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isCreating, startCreating] = useTransition();
  const [done, setDone] = useState(false);

  const handleAdd = () => {
    if (!selectedGroupId) return;
    startTransition(async () => {
      await addCollectionToGroup(selectedGroupId, videoId);
      setDone(true);
      setTimeout(onClose, 800);
    });
  };

  const handleCreateAndSelect = () => {
    const name = newGroupName.trim();
    if (!name) return;
    startCreating(async () => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('type', 'custom');
      const { id } = await createGroup(formData);
      if (id) {
        setGroups(prev => [...prev, { id, name }]);
        setSelectedGroupId(id);
      }
      setNewGroupName('');
    });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, padding: '28px 32px',
        width: 360, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a2421' }}>Add to Group</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6c7a77', fontSize: 20, lineHeight: 1 }}
          >×</button>
        </div>

        {videoTitle && (
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6c7a77', lineHeight: 1.4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>play_circle</span>
            {videoTitle}
          </p>
        )}

        {groups.length === 0 ? (
          <p style={{ fontSize: 14, color: '#6c7a77', textAlign: 'center', padding: '8px 0 16px' }}>
            No custom groups yet — create one below.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 10, border: 'none',
                  background: selectedGroupId === g.id ? 'rgba(0,107,95,0.1)' : '#f3f3f4',
                  color: selectedGroupId === g.id ? '#006b5f' : '#1a2421',
                  fontWeight: selectedGroupId === g.id ? 700 : 500,
                  fontSize: 14, cursor: 'pointer', textAlign: 'left',
                  outline: selectedGroupId === g.id ? '2px solid rgba(0,107,95,0.3)' : 'none',
                  transition: 'background 0.15s, outline 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>folder</span>
                {g.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            type="text"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateAndSelect(); } }}
            placeholder="New group…"
            maxLength={40}
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #e0e0e0',
              fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1a2421',
            }}
          />
          <button
            onClick={handleCreateAndSelect}
            disabled={!newGroupName.trim() || isCreating}
            title="Create group"
            style={{
              padding: '0 14px', borderRadius: 10, border: 'none',
              background: newGroupName.trim() ? '#1a2421' : '#e0e0e0',
              color: newGroupName.trim() ? '#fff' : '#9ca3af',
              fontSize: 16, fontWeight: 700, cursor: newGroupName.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            +
          </button>
        </div>

        {done ? (
          <p style={{ textAlign: 'center', color: '#006b5f', fontWeight: 700, fontSize: 15 }}>Added ✓</p>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e0e0e0',
                background: '#fff', color: '#545f6c', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedGroupId || isPending}
              style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: selectedGroupId ? '#006b5f' : '#ccc',
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: selectedGroupId ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'background 0.15s',
              }}
            >
              {isPending ? 'Adding…' : 'Add to Group'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
