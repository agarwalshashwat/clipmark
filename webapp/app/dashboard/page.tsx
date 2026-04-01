import { Suspense } from 'react';
import { createServerSupabase, type Collection, type Bookmark } from '@/lib/supabase';
import DashboardContent from './_components/DashboardContent';
import styles from './page.module.css';

export const metadata = { title: 'Dashboard — Clipmark' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; success?: string }>;
}) {
  const { view = 'library', success } = await searchParams;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: userBookmarksData }, { data: profileData }, { data: groupsData }] = await Promise.all([
    supabase
      .from('user_bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', user.id)
      .single(),
    supabase
      .from('groups')
      .select('id, name, type')
      .eq('user_id', user.id)
      .eq('type', 'custom')
      .order('created_at', { ascending: false }),
  ]);

  const isPro = (profileData?.is_pro as boolean | null) ?? false;

  const collections: Collection[] = (userBookmarksData ?? []).map(row => ({
    id: row.video_id as string,
    video_id: row.video_id as string,
    video_title: ((row.bookmarks as Bookmark[]) ?? [])
      .slice()
      .sort((a: Bookmark, b: Bookmark) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .find((b: Bookmark) => b.videoTitle)?.videoTitle ?? null,
    bookmarks: (row.bookmarks as Bookmark[]) ?? [],
    created_at: row.updated_at as string,
    view_count: 0,
    user_id: row.user_id as string,
  }));

  const successBanner = success ? (
    <div style={{
      background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)',
      borderRadius: 10, padding: '14px 24px', marginBottom: 24,
      textAlign: 'center', fontSize: 15, color: '#006b5f',
      fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      Payment successful — welcome to Clipmark Pro! 🎉
    </div>
  ) : undefined;

  return (
    <Suspense fallback={<div className={styles.empty}>Loading…</div>}>
      <DashboardContent
        collections={collections}
        isPro={isPro}
        initialView={view}
        successBanner={successBanner}
        groups={(groupsData ?? []).map(g => ({ id: g.id as string, name: g.name as string }))}
      />
    </Suspense>
  );
}
