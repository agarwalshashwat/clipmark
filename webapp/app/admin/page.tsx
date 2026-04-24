import { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import AdminPanel from './_components/AdminPanel';

export const metadata: Metadata = {
  title: 'Admin — Clipmark',
  robots: 'noindex, nofollow',
};

export default async function AdminPage() {
  // Double-check server-side (middleware already guards, this is a belt-and-suspenders check)
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin?redirect=/admin');

  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!adminIds.includes(user.id)) redirect('/');

  return <AdminPanel />;
}
