import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase';
import styles from './page.module.css';
import RemindersContent from './RemindersContent';
import { loadRemindersQueue } from './data';

export const metadata = { title: 'Reminders — ClipMark' };

export default async function RemindersPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const data = await loadRemindersQueue(supabase, user.id);
  if (data.blocked) redirect('/upgrade');

  return (
    <div className={styles.pageWrap}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Reminders &amp; Re-engagement</h1>
        <p className={styles.sub}>Set intentional moments to revisit your curated content. Use the editorial scheduler to keep your learning loop continuous.</p>
      </div>

      <RemindersContent
        dueReminders={data.dueReminders}
        upcomingReminders={data.upcomingReminders}
        collections={data.collectionTargets}
        groups={data.groupTargets}
      />
    </div>
  );
}
