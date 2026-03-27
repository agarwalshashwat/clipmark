import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { supabase, createServerSupabase } from '@/lib/supabase';

async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    return { user, client: userClient };
  }
  const serverClient = await createServerSupabase();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return null;
  return { user, client: serverClient };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

// GET /api/shared — returns the user's shared collections
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, client } = auth;

  const { data, error } = await client
    .from('collections')
    .select('id, video_id, video_title, view_count, bookmarks')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const collections = (data ?? []).map(row => ({
    id: row.id,
    video_id: row.video_id,
    video_title: row.video_title ?? 'Untitled Video',
    view_count: row.view_count ?? 0,
    bookmark_count: Array.isArray(row.bookmarks) ? row.bookmarks.length : 0,
  }));

  return NextResponse.json(collections);
}
