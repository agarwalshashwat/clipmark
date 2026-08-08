import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { supabase, createServerSupabase } from '@/lib/supabase';
import type { Bookmark } from '@/lib/supabase';

// Result of authenticating a request: the user + a Supabase client scoped to
// that user's JWT (so RLS auth.uid() applies), or null when unauthenticated.
type AuthedUser = { user: { id: string }; client: SupabaseClient };

// Injectable dependencies so the handlers can be unit-tested with fakes.
export interface BookmarksDeps {
  // Service-role client for the is_pro check (bypasses RLS).
  admin: SupabaseClient;
  // Resolves the verified caller + a JWT-scoped client, or null.
  getAuthedUser: (request: NextRequest) => Promise<AuthedUser | null>;
}

async function isProUser(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('profiles')
    .select('is_pro')
    .eq('id', userId)
    .single();
  return data?.is_pro === true;
}

/**
 * Server-side shape check for saved A–B loops.
 *
 * Loops ride the existing bookmarks payload (`loop: { end }` alongside the A
 * point in `timestamp`), so they inherit this route's Pro gate: a free account
 * gets 403 before reaching here, which is the entitlement line the client-side
 * cap only *mirrors*. This function is the second half of that — it stops a
 * malformed or inverted range from being persisted and later driving the
 * player, regardless of what the client claims.
 *
 * Records WITHOUT a `loop` field are untouched: existing bookmarks (including
 * pre-loop rows) must keep syncing unchanged.
 *
 * @returns an error code, or null when every loop record is well-formed.
 */
export function validateLoopFields(bookmarks: unknown[]): string | null {
  for (const entry of bookmarks) {
    if (!entry || typeof entry !== 'object') continue;
    const bm = entry as { timestamp?: unknown; loop?: unknown };
    if (bm.loop === undefined || bm.loop === null) continue;

    if (typeof bm.loop !== 'object' || Array.isArray(bm.loop)) return 'invalid_loop';
    const end = (bm.loop as { end?: unknown }).end;
    if (typeof end !== 'number' || !Number.isFinite(end)) return 'invalid_loop';
    if (typeof bm.timestamp !== 'number' || !Number.isFinite(bm.timestamp)) return 'invalid_loop';
    // B must come after A — an inverted or zero-length range would make the
    // loop watchdog seek on every single frame.
    if (end <= bm.timestamp) return 'invalid_loop';
  }
  return null;
}

// Authenticate via Bearer token (extension) or cookie session (webapp)
export async function getAuthenticatedUser(request: NextRequest) {
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

// GET /api/bookmarks?videoId=xxx  — single video
// GET /api/bookmarks               — all videos (for full cross-device sync)
export async function handleGetBookmarks(request: NextRequest, { admin, getAuthedUser }: BookmarksDeps) {
  const videoId = request.nextUrl.searchParams.get('videoId');

  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!await isProUser(admin, auth.user.id)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  if (!videoId) {
    // Return all bookmarks for the user (used by extension dashboard on load)
    const { data, error } = await auth.client
      .from('user_bookmarks')
      .select('video_id, bookmarks, updated_at')
      .eq('user_id', auth.user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 });
    }

    return NextResponse.json({
      videos: (data ?? []).map(row => ({
        videoId: row.video_id,
        bookmarks: row.bookmarks,
        updatedAt: row.updated_at,
      })),
    });
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
export async function handlePutBookmarks(request: NextRequest, { admin, getAuthedUser }: BookmarksDeps) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!await isProUser(admin, auth.user.id)) {
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

    const loopError = validateLoopFields(bookmarks);
    if (loopError) {
      return NextResponse.json({ error: loopError }, { status: 400 });
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
