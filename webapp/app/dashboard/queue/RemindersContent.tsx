'use client';

import { useState, useTransition } from 'react';
import styles from './page.module.css';
import { createReminder, deleteReminder, markReminderDone } from './actions';

interface ReminderTarget {
  id: string;
  label: string;
  videoId?: string; // for collections
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
  // resolved from target
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

function daysUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export default function RemindersContent({ dueReminders, upcomingReminders, collections, groups }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [targetType, setTargetType] = useState<'collection' | 'group'>('collection');
  const [isPending, startTransition] = useTransition();

  const allReminders = [...dueReminders, ...upcomingReminders];
  const isEmpty = allReminders.length === 0;

  const handleCreate = (formData: FormData) => {
    startTransition(async () => {
      await createReminder(formData);
      setShowForm(false);
    });
  };

  const handleDone = (id: string) => {
    startTransition(() => markReminderDone(id));
  };

  const handleDelete = (id: string) => {
    startTransition(() => deleteReminder(id));
  };

  const targets = targetType === 'collection' ? collections : groups;

  return (
    <div>
      {/* ── Add reminder button (always visible when not in form) ── */}
      {!showForm && !isEmpty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button className={styles.newReminderBtn} onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Set Reminder
          </button>
        </div>
      )}

      {/* ── Create form ──────────────── */}
      {showForm && (
        <form action={handleCreate} className={styles.createForm}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <p className={styles.formLabel}>Target type</p>
              <select
                name="target_type"
                className={styles.formSelect}
                value={targetType}
                onChange={e => setTargetType(e.target.value as 'collection' | 'group')}
              >
                <option value="collection">Video</option>
                <option value="group">Group</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <p className={styles.formLabel}>{targetType === 'collection' ? 'Video' : 'Group'}</p>
              <select name="target_id" className={styles.formSelect} required>
                {targets.length === 0
                  ? <option value="">No {targetType === 'collection' ? 'videos' : 'groups'} found</option>
                  : targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)
                }
              </select>
            </div>
            <div className={styles.formGroup}>
              <p className={styles.formLabel}>Frequency</p>
              <select name="frequency" className={styles.formSelect}>
                <option value="once">One-time</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <p className={styles.formLabel}>Start date</p>
              <input type="date" name="next_due_at" className={styles.formDate} defaultValue={today()} required />
            </div>
          </div>
          <div className={styles.formGroup}>
            <p className={styles.formLabel}>Label (optional)</p>
            <input name="label" className={styles.formInput} placeholder="e.g. Weekly review of ML notes" />
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.formCancel} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={styles.formSubmit} disabled={isPending}>
              {isPending ? 'Saving…' : 'Set Reminder'}
            </button>
          </div>
        </form>
      )}

      {/* ── Due today ──────────────── */}
      {dueReminders.length > 0 && (
        <div>
          <p className={styles.sectionLabel}>Due now</p>
          <div className={styles.list}>
            {dueReminders.map(r => (
              <ReminderRow key={r.id} reminder={r} isDue onDone={handleDone} onDelete={handleDelete} isPending={isPending} />
            ))}
          </div>
        </div>
      )}

      {/* ── Upcoming ──────────────── */}
      {upcomingReminders.length > 0 && (
        <div className={dueReminders.length > 0 ? styles.sectionGap : ''}>
          <p className={styles.sectionLabel}>Upcoming</p>
          <div className={styles.list}>
            {upcomingReminders.map(r => (
              <ReminderRow key={r.id} reminder={r} isDue={false} onDone={handleDone} onDelete={handleDelete} isPending={isPending} />
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────── */}
      {isEmpty && !showForm && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(0,107,95,0.3)' }}>notifications</span>
          </div>
          <h3 className={styles.emptyTitle}>No reminders yet</h3>
          <p className={styles.emptyText}>
            Set up a reminder to revisit a video or group on a schedule that works for you.
          </p>
          <button className={styles.newReminderBtn} onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Set First Reminder
          </button>
        </div>
      )}
    </div>
  );
}

function ReminderRow({ reminder, isDue, onDone, onDelete, isPending }: {
  reminder: Reminder;
  isDue: boolean;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}) {
  const ytUrl = reminder.videoId
    ? `https://www.youtube.com/watch?v=${reminder.videoId}`
    : null;

  return (
    <div className={styles.reminderCard}>
      {reminder.videoId && (
        <div className={styles.reminderThumb}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://img.youtube.com/vi/${reminder.videoId}/hqdefault.jpg`} alt="" />
        </div>
      )}
      <div className={styles.reminderBody}>
        <p className={styles.reminderLabel}>{reminder.label || reminder.targetLabel}</p>
        <span className={styles.reminderMeta}>
          {reminder.label ? `${reminder.targetLabel} · ` : ''}{FREQUENCY_LABELS[reminder.frequency] ?? reminder.frequency}
        </span>
        <span className={`${styles.reminderDue} ${isDue ? styles.reminderDueSoon : styles.reminderDueUpcoming}`}>
          {daysUntil(reminder.next_due_at)}
        </span>
      </div>
      <div className={styles.reminderActions}>
        {isDue && ytUrl && (
          <a href={ytUrl} className={styles.reminderActionBtn} target="_blank" rel="noopener">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>play_circle</span>
            Revisit
          </a>
        )}
        {isDue && (
          <button className={styles.reminderActionBtn} onClick={() => onDone(reminder.id)} disabled={isPending}>
            Done
          </button>
        )}
        <button
          className={`${styles.reminderActionBtn} ${styles.reminderActionBtnDanger}`}
          onClick={() => onDelete(reminder.id)}
          disabled={isPending}
          title="Delete reminder"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
        </button>
      </div>
    </div>
  );
}
