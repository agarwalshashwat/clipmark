import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { supabase, createServerSupabase } from '@/lib/supabase';
import type { Bookmark } from '@/lib/supabase';

// Service-role client for is_pro check (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function isProUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('is_pro')
    .eq('id', userId)
    .single();
  return data?.is_pro === true;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

// Authenticate via Bearer token (extension) or cookie session (webapp)
async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // Validate the token
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    // Create an authenticated client that sends the user's JWT so RLS auth.uid() works
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

// GET /api/bookmarks?videoId=xxx
export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('videoId');
  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!await isProUser(auth.user.id)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const { data, error } = await auth.client
    .from('user_bookmarks')
    .select('bookmarks, updated_at')
    .eq('user_id', auth.user.id)
    .eq('video_id', videoId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 });
  }

  return NextResponse.json({
    bookmarks: data?.bookmarks ?? [],
    updatedAt: data?.updated_at ?? null,
  });
}

// PUT /api/bookmarks
export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!await isProUser(auth.user.id)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  try {
    const { videoId, bookmarks } = await request.json() as {
      videoId: string;
      bookmarks: Bookmark[];
    };

    if (!videoId || !Array.isArray(bookmarks)) {
      return NextResponse.json({ error: 'videoId and bookmarks are required' }, { status: 400 });
    }

    const { error } = await auth.client
      .from('user_bookmarks')
      .upsert({
        user_id:    auth.user.id,
        video_id:   videoId,
        bookmarks,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,video_id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json({ error: 'Failed to save bookmarks' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
