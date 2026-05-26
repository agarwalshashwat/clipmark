'use client';

import { useState, useTransition } from 'react';
import styles from './page.module.css';
import { createReminder, deleteReminder } from './actions';

interface Target {
  id: string;
  label: string;
  videoId?: string;
  tags?: string[];
  type: 'collection' | 'group';
}

interface Reminder {
  id: string;
  target_id: string;
  target_type: 'collection' | 'group';
  frequency_days: number;
  next_due_at: string;
  targetLabel: string;
  videoId?: string;
}

interface Props {
  dueReminders: Reminder[];
  upcomingReminders: Reminder[];
  collections: Target[];
  groups: Target[];
}

export default function RemindersContent({ dueReminders, upcomingReminders, collections, groups }: Props) {
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [frequency, setFrequency] = useState(7);
  const [isPending, startTransition] = useTransition();

  const allTargets = [...collections, ...groups];
  const selectedTarget = allTargets.find(t => t.id === selectedTargetId);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) return;
    const target = allTargets.find(t => t.id === selectedTargetId)!;
    
    const formData = new FormData();
    formData.append('target_id', target.id);
    formData.append('target_type', target.type);
    formData.append('frequency_days', frequency.toString());

    startTransition(async () => {
      await createReminder(formData);
      setSelectedTargetId('');
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Remove this reminder?')) return;
    startTransition(() => deleteReminder(id));
  };

  return (
    <div>
      <div className={styles.twoCol}>
        {/* Active Selection Panel */}
        <div className={styles.leftPanel}>
          <div className={styles.clipPanelHeader}>
            <span className={styles.clipPanelLabel}>Target Selection</span>
          </div>
          {selectedTarget?.videoId ? (
            <div className={styles.clipThumbWrap}>
              <img 
                src={`https://i.ytimg.com/vi/${selectedTarget.videoId}/mqdefault.jpg`} 
                alt="" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ) : (
            <div style={{ height: 180, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#cbd5e1' }}>
                {selectedTarget?.type === 'group' ? 'folder' : 'smart_display'}
              </span>
            </div>
          )}
          <div className={styles.clipInfo}>
            <p className={styles.videoTitle}>{selectedTarget?.label || 'Select a video or group to start'}</p>
          </div>
        </div>

        {/* Create Reminder Form */}
        <div className={styles.rightPanel}>
          <form onSubmit={handleCreate}>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>target</span>
                  Select Resource
                </label>
                <select 
                  className={styles.select}
                  value={selectedTargetId} 
                  onChange={e => setSelectedTargetId(e.target.value)}
                  required
                >
                  <option value="">— Choose a video or group —</option>
                  <optgroup label="Videos">
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Groups">
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>event_repeat</span>
                  Revisit Frequency
                </label>
                <select 
                  className={styles.select}
                  value={frequency} 
                  onChange={e => setFrequency(Number(e.target.value))}
                >
                  <option value={1}>Every 24 Hours (Review)</option>
                  <option value={3}>Every 3 Days (Learning)</option>
                  <option value={7}>Every Week (Retention)</option>
                  <option value={30}>Every Month (Deep Dive)</option>
                </select>
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={isPending || !selectedTargetId}>
              {isPending ? 'Activating...' : 'Schedule Reminder'}
            </button>
          </form>
        </div>
      </div>

      <div className={styles.remindersList}>
        <div style={{ marginBottom: 48 }}>
          <h2 className={styles.sectionTitle}>Active Queue ({dueReminders.length + upcomingReminders.length})</h2>
          <div className={styles.cardGrid}>
            {[...dueReminders, ...upcomingReminders].map(r => (
              <div key={r.id} className={styles.reminderCard}>
                <span className={styles.nextDue}>
                  {new Date(r.next_due_at) <= new Date() ? 'DUE NOW' : `Next: ${new Date(r.next_due_at).toLocaleDateString()}`}
                </span>
                <h3 className={styles.targetName}>{r.targetLabel}</h3>
                <div className={styles.meta}>
                  <div className={styles.freq}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                    {r.frequency_days}d
                  </div>
                  <div style={{ flex: 1 }} />
                  <button className={styles.removeBtn} onClick={() => handleDelete(r.id)} style={{ position: 'static', opacity: 1 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
