'use server';

import { createServerSupabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

function advanceDate(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':    d.setDate(d.getDate() + 1); break;
    case 'weekly':   d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly':  d.setMonth(d.getMonth() + 1); break;
  }
  return d;
}

export async function createReminder(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const targetType = formData.get('target_type') as string;
  const targetId = formData.get('target_id') as string;
  const frequency = formData.get('frequency') as string;
  const nextDueAt = formData.get('next_due_at') as string;
  const label = ((formData.get('label') as string) ?? '').trim() || null;

  if (!['collection', 'group'].includes(targetType)) throw new Error('Invalid target type');
  if (!['once', 'daily', 'weekly', 'biweekly', 'monthly'].includes(frequency)) throw new Error('Invalid frequency');
  if (!targetId || !nextDueAt) throw new Error('Missing required fields');

  await supabase.from('revisit_reminders').insert({
    user_id: user.id,
    target_type: targetType,
    target_id: targetId,
    frequency,
    next_due_at: new Date(nextDueAt).toISOString(),
    label,
  });

  revalidatePath('/dashboard/queue');
}

export async function deleteReminder(reminderId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('revisit_reminders').delete().eq('id', reminderId).eq('user_id', user.id);
  revalidatePath('/dashboard/queue');
}

export async function markReminderDone(reminderId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: reminder } = await supabase
    .from('revisit_reminders')
    .select('frequency, next_due_at')
    .eq('id', reminderId)
    .eq('user_id', user.id)
    .single();

  if (!reminder) throw new Error('Reminder not found');

  const now = new Date();
  if (reminder.frequency === 'once') {
    await supabase.from('revisit_reminders').delete().eq('id', reminderId);
  } else {
    const nextDue = advanceDate(new Date(reminder.next_due_at), reminder.frequency);
    // Ensure next_due is in the future
    while (nextDue <= now) {
      nextDue.setTime(advanceDate(nextDue, reminder.frequency).getTime());
    }
    await supabase.from('revisit_reminders').update({
      last_done_at: now.toISOString(),
      next_due_at: nextDue.toISOString(),
    }).eq('id', reminderId);
  }

  revalidatePath('/dashboard/queue');
}
