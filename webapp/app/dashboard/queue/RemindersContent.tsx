'use client';

import { useState, useTransition } from 'react';
import styles from './page.module.css';
import { createReminder, deleteReminder, markReminderDone } from './actions';

interface ReminderTarget {
  id: string;
  label: string;
  videoId?: string;
  tags?: string[];
  type: 'collection' | 'group';
}

interface Reminder {
  id: string;
  target_type: 'collection' | 'group';
  target_id: string;
  label: string | null;
  frequency: string;
  next_due_at: string;
  last_done_at: string | null;
  targetLabel: string;
  videoId?: string;
}

interface Props {
  dueReminders: Reminder[];
  upcomingReminders: Reminder[];
  collections: ReminderTarget[];
  groups: ReminderTarget[];
}

const FREQUENCY_LABELS: Record<string, string> = {
  once: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

const FREQUENCIES = [
  { value: 'once', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'daily', label: 'Daily' },
];

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function formatScheduleDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / 86400000);

  if (diffDays <= 0) return 'DUE NOW';

  const timeStr = '9:00 AM';
  if (diffDays === 1) return `TOMORROW, ${timeStr}`;

  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  if (diffDays <= 6) return `${days[date.getDay()]}, ${timeStr}`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() + `, ${timeStr}`;
}

export default function RemindersContent({ dueReminders, upcomingReminders, collections, groups }: Props) {
  const [targetType, setTargetType] = useState<'collection' | 'group'>('collection');
  const [selectedTargetId, setSelectedTargetId] = useState(collections[0]?.id ?? '');
  const [frequency, setFrequency] = useState('once');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const allReminders = [...dueReminders, ...upcomingReminders];
  const targets = targetType === 'collection' ? collections : groups;
  const previewCollection = targetType === 'collection'
    ? collections.find(c => c.id === selectedTargetId)
    : null;

  const handleCreate = (formData: FormData) => {
    startTransition(async () => {
      if (editingReminder) {
        await deleteReminder(editingReminder.id);
      }
      await createReminder(formData);
      setEditingReminder(null);
    });
  };

  const handleEdit = (r: Reminder) => {
    setEditingReminder(r);
    setTargetType(r.target_type);
    setSelectedTargetId(r.target_id);
    setFrequency(r.frequency);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDone = (id: string) => startTransition(() => markReminderDone(id));
  const handleDelete = (id: string) => startTransition(() => deleteReminder(id));

  return (
    <div>
      {/* ── Two-column create area ── */}
      <div className={styles.twoCol}>

        {/* Left — Active Clip preview */}
        <div className={styles.leftPanel}>
          <div className={styles.clipPanelHeader}>
            <span className={styles.clipPanelLabel}>Content Preview</span>
            <button
              type="button"
              className={styles.clipCollapseBtn}
              onClick={() => setPreviewCollapsed(c => !c)}
              title={previewCollapsed ? 'Expand preview' : 'Collapse preview'}
            >
              {previewCollapsed ? 'Show ↓' : 'Hide ↑'}
            </button>
          </div>
          {!previewCollapsed && (
            previewCollection?.videoId ? (
              <>
                <div className={styles.clipThumbWrap}>
                  <span className={styles.clipBadge}>ACTIVE CLIP</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.youtube.com/vi/${previewCollection.videoId}/hqdefault.jpg`}
                    alt={previewCollection.label}
                    className={styles.clipThumb}
                  />
                </div>
                <div className={styles.clipInfo}>
                  <p className={styles.clipTitle}>{previewCollection.label}</p>
                  {(previewCollection.tags ?? []).length > 0 && (
                    <div className={styles.clipTags}>
                      {(previewCollection.tags ?? []).map(t => (
                        <span key={t} className={styles.clipTag}>{t.toUpperCase()}</span>
                      ))}
                    </div>
                  )}
                  <blockquote className={styles.clipQuote}>
                    &ldquo;The purpose of a reminder is not to complete a task, but to re-enter a state of curiosity.&rdquo;
                  </blockquote>
                </div>
              </>
            ) : (
              <div className={styles.clipPlaceholder}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'rgba(0,107,95,0.2)' }}>auto_stories</span>
                <p className={styles.clipPlaceholderText}>
                  {targetType === 'group' ? 'Select a group to revisit its full collection.' : 'Select a video to preview it here.'}
                </p>
                <blockquote className={styles.clipQuote}>
                  &ldquo;The purpose of a reminder is not to complete a task, but to re-enter a state of curiosity.&rdquo;
                </blockquote>
              </div>
            )
          )}
        </div>

        {/* Right — Form */}
        <form action={handleCreate} className={styles.rightPanel}>
          {/* Target type tabs */}
          <p className={styles.formFieldLabel}>TARGET TYPE</p>
          <div className={styles.targetTypeTabs}>
            <button
              type="button"
              className={`${styles.targetTab} ${targetType === 'collection' ? styles.targetTabActive : ''}`}
              onClick={() => { setTargetType('collection'); setSelectedTargetId(collections[0]?.id ?? ''); }}
            >
              <span className={styles.targetTabTitle}>Specific Video</span>
              <span className={styles.targetTabSub}>Revisit a single curated masterpiece</span>
            </button>
            <button
              type="button"
              className={`${styles.targetTab} ${targetType === 'group' ? styles.targetTabActive : ''}`}
              onClick={() => { setTargetType('group'); setSelectedTargetId(groups[0]?.id ?? ''); }}
            >
              <span className={styles.targetTabTitle}>Collection/Group</span>
              <span className={styles.targetTabSub}>Shuffle through a thematic series</span>
            </button>
          </div>
          <input type="hidden" name="target_type" value={targetType} />

          {/* Content selector */}
          <div style={{ marginTop: 20 }}>
            <p className={styles.formFieldLabel}>SELECT CONTENT</p>
            <select
              name="target_id"
              className={styles.contentSelect}
              value={selectedTargetId}
              onChange={e => setSelectedTargetId(e.target.value)}
              required
            >
              {targets.length === 0
                ? <option value="">No {targetType === 'collection' ? 'videos' : 'groups'} found</option>
                : targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)
              }
            </select>
          </div>

          {/* Frequency + Start date row */}
          <div className={styles.freqRow}>
            <div style={{ flex: 1 }}>
              <p className={styles.formFieldLabel}>FREQUENCY</p>
              <div className={styles.freqRadios}>
                {FREQUENCIES.map(f => (
                  <label key={f.value} className={styles.freqRadioLabel}>
                    <input
                      type="radio"
                      name="_freq_display"
                      value={f.value}
                      checked={frequency === f.value}
                      onChange={() => setFrequency(f.value)}
                      className={styles.freqRadioInput}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
              <input type="hidden" name="frequency" value={frequency} />
            </div>
            <div className={styles.startDateWrap}>
              <p className={styles.formFieldLabel}>START DATE</p>
              <input
                type="date"
                name="next_due_at"
                className={styles.dateInput}
                defaultValue={editingReminder
                  ? editingReminder.next_due_at.split('T')[0]
                  : today()}
                required
              />
            </div>
          </div>

          {/* Label */}
          <div style={{ marginTop: 16 }}>
            <p className={styles.formFieldLabel}>OPTIONAL LABEL (EDITORIAL NOTE)</p>
            <input
              name="label"
              className={styles.labelInput}
              placeholder="e.g. Study for the next design sprint"
              defaultValue={editingReminder?.label ?? ''}
            />
          </div>

          {/* Footer */}
          <div className={styles.formFooter}>
            <span className={styles.formHint}>Your reminder will appear in your dashboard and inbox at 9:00 AM.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {editingReminder && (
                <button
                  type="button"
                  className={styles.cancelEditBtn}
                  onClick={() => setEditingReminder(null)}
                >
                  Cancel
                </button>
              )}
              <button type="submit" className={styles.submitBtn} disabled={isPending}>
                {isPending ? 'Saving…' : editingReminder ? 'Update Reminder' : 'Set Reminder'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Active Schedule ── */}
      <div className={styles.scheduleSection}>
        <div className={styles.scheduleHeader}>
          <h2 className={styles.scheduleTitle}>Active Schedule</h2>
          <a href="#" className={styles.viewCalendarLink}>View Full Calendar</a>
        </div>

        {allReminders.length === 0 ? (
          <p className={styles.scheduleEmpty}>
            No reminders scheduled yet. Use the form above to set your first one.
          </p>
        ) : (
          <div className={styles.scheduleCards}>
            {allReminders.map(r => {
              const isDue = dueReminders.some(d => d.id === r.id);
              const ytUrl = r.videoId ? `https://www.youtube.com/watch?v=${r.videoId}` : null;
              return (
                <div key={r.id} className={`${styles.scheduleCard} ${isDue ? styles.scheduleCardDue : ''}`}>
                  {r.videoId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://img.youtube.com/vi/${r.videoId}/mqdefault.jpg`}
                      alt={r.targetLabel}
                      className={styles.scheduleCardThumb}
                    />
                  )}
                  <div className={styles.scheduleCardLeft}>
                    <span className={`${styles.scheduleDate} ${isDue ? styles.scheduleDateDue : ''}`}>
                      {formatScheduleDate(r.next_due_at)}
                    </span>
                    <p className={styles.scheduleCardTitle}>{r.label || r.targetLabel}</p>
                    {r.label && <p className={styles.scheduleCardSub}>{r.targetLabel}</p>}
                    <span className={styles.scheduleFreqBadge}>{FREQUENCY_LABELS[r.frequency] ?? r.frequency}</span>
                  </div>
                  <div className={styles.scheduleCardActions}>
                    {isDue && ytUrl && (
                      <a href={ytUrl} className={styles.scheduleActionBtn} target="_blank" rel="noopener">
                        Revisit ↗
                      </a>
                    )}
                    {isDue && (
                      <button className={styles.scheduleActionBtn} onClick={() => handleDone(r.id)} disabled={isPending}>
                        Mark Done
                      </button>
                    )}
                    <button className={styles.scheduleEditBtn} onClick={() => handleEdit(r)}>
                      Edit →
                    </button>
                    <button
                      className={styles.scheduleDeleteBtn}
                      onClick={() => handleDelete(r.id)}
                      disabled={isPending}
                      title="Delete"
                    >×</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
