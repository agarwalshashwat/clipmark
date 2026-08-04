import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createServerSupabase } from '@/lib/supabase';
import DashboardChrome from './_components/DashboardChrome';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const [{ data: profileData }, { count: dueCount }] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, avatar_url, is_pro')
      .eq('id', user.id)
      .single(),
    supabase
      .from('revisit_reminders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .lte('next_due_at', new Date().toISOString()),
  ]);

  const username = profileData?.username ?? user.email?.split('@')[0] ?? 'curator';
  const avatarUrl = (profileData?.avatar_url as string | null) ?? null;
  const avatarInitial = username[0].toUpperCase();
  const isPro = (profileData?.is_pro as boolean | null) ?? false;
  const dueReminderCount = dueCount ?? 0;

  return (
    <Suspense>
      <DashboardChrome username={username} avatarInitial={avatarInitial} avatarUrl={avatarUrl} isPro={isPro} dueReminderCount={dueReminderCount}>
        {children}
      </DashboardChrome>
    </Suspense>
  );
}
