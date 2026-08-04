'use client';

import { useState, useTransition } from 'react';
import styles from './page.module.css';
import { createReminder, deleteReminder, markReminderDone } from './actions';

interface Target {
  id: string;
  label: string;
  videoId?: string;
  tags?: string[];
  type: 'collection' | 'group';
}

// Matches the `revisit_reminders` row shape (see migrations/006_revisit_reminders.sql)
// plus the targetLabel/videoId enrichment added by queue/data.ts.
interface Reminder {
  id: string;
  target_id: string;
  target_type: 'collection' | 'group';
  label: string | null;
  frequency: 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
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

const FREQUENCY_OPTIONS: { value: Reminder['frequency']; label: string }[] = [
  { value: 'once', label: 'One-time' },
  { value: 'daily', label: 'Every 24 Hours (Review)' },
  { value: 'weekly', label: 'Every Week (Retention)' },
  { value: 'biweekly', label: 'Every 2 Weeks' },
  { value: 'monthly', label: 'Every Month (Deep Dive)' },
];

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export default function RemindersContent({ dueReminders, upcomingReminders, collections, groups }: Props) {
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [frequency, setFrequency] = useState<Reminder['frequency']>('once');
  const [nextDueAt, setNextDueAt] = useState(todayStr());
  const [label, setLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allTargets = [...collections, ...groups];
  const selectedTarget = allTargets.find(t => t.id === selectedTargetId);

  const resetForm = () => {
    setEditingId(null);
    setSelectedTargetId('');
    setFrequency('once');
    setNextDueAt(todayStr());
    setLabel('');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId || !nextDueAt) return;
    const target = allTargets.find(t => t.id === selectedTargetId)!;

    const formData = new FormData();
    formData.append('target_id', target.id);
    formData.append('target_type', target.type);
    formData.append('frequency', frequency);
    // 9am local, same convention the extension uses when it creates reminders.
    formData.append('next_due_at', new Date(`${nextDueAt}T09:00:00`).toISOString());
    if (label.trim()) formData.append('label', label.trim());

    const wasEditing = editingId;
    startTransition(async () => {
      // No dedicated update action — mirror the extension's own edit flow
      // (dashboard.js form submit): delete the old row, then create the new one.
      if (wasEditing) await deleteReminder(wasEditing);
      await createReminder(formData);
      resetForm();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Remove this reminder?')) return;
    startTransition(() => deleteReminder(id));
  };

  const handleMarkDone = (id: string) => {
    startTransition(() => markReminderDone(id));
  };

  const handleEdit = (r: Reminder) => {
    setEditingId(r.id);
    setSelectedTargetId(r.target_id);
    setFrequency(r.frequency);
    setNextDueAt(r.next_due_at.split('T')[0]);
    setLabel(r.label ?? '');
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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

        {/* Create / Edit Reminder Form */}
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
                  onChange={e => setFrequency(e.target.value as Reminder['frequency'])}
                >
                  {FREQUENCY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_month</span>
                  Start Date
                </label>
                <input
                  type="date"
                  className={styles.select}
                  value={nextDueAt}
                  onChange={e => setNextDueAt(e.target.value)}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>label</span>
                  Label <span style={{ fontWeight: 500, color: '#94a3b8' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  className={styles.select}
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. Review key points"
                  maxLength={80}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              {editingId && (
                <button
                  type="button"
                  className={styles.submitBtn}
                  style={{ background: '#f1f5f9', color: '#475569', flex: '0 0 auto', width: 'auto', padding: '12px 24px' }}
                  onClick={resetForm}
                >
                  Cancel
                </button>
              )}
              <button type="submit" className={styles.submitBtn} disabled={isPending || !selectedTargetId}>
                {isPending ? (editingId ? 'Updating…' : 'Activating…') : (editingId ? 'Update Reminder' : 'Schedule Reminder')}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className={styles.remindersList}>
        <div style={{ marginBottom: 48 }}>
          <h2 className={styles.sectionTitle}>Active Queue ({dueReminders.length + upcomingReminders.length})</h2>
          <div className={styles.cardGrid}>
            {[...dueReminders, ...upcomingReminders].map(r => {
              const isDue = new Date(r.next_due_at) <= new Date();
              return (
                <div key={r.id} className={styles.reminderCard}>
                  <span className={styles.nextDue}>
                    {isDue ? 'DUE NOW' : `Next: ${new Date(r.next_due_at).toLocaleDateString()}`}
                  </span>
                  <h3 className={styles.cardTitle}>{r.label || r.targetLabel}</h3>
                  <div className={styles.cardMeta}>
                    <div className={styles.freqText}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                      {FREQUENCY_OPTIONS.find(o => o.value === r.frequency)?.label ?? r.frequency}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {isDue && (
                        <button
                          className={styles.removeBtn}
                          onClick={() => handleMarkDone(r.id)}
                          style={{ position: 'static', opacity: 1 }}
                          title="Mark done"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                        </button>
                      )}
                      <button
                        className={styles.removeBtn}
                        onClick={() => handleEdit(r)}
                        style={{ position: 'static', opacity: 1 }}
                        title="Edit"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                      </button>
                      <button
                        className={styles.removeBtn}
                        onClick={() => handleDelete(r.id)}
                        style={{ position: 'static', opacity: 1 }}
                        title="Delete"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
