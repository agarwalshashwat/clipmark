import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, createServerSupabase, type Bookmark } from '@/lib/supabase';

const FREE_SHARE_LIMIT = 10;

// Injectable dependencies so the handler can be unit-tested with fakes.
export interface ShareDeps {
  // Service-role client for Pro + collection-count checks and the insert (bypasses RLS).
  admin: SupabaseClient;
  // Resolves the verified caller's user id (Bearer token or cookie session), or null.
  getUserId: (request: NextRequest) => Promise<string | null>;
}

// Authenticate via Bearer token (extension) or cookie session (webapp).
// Returns the verified user id, or null when the request is unauthenticated.
export async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  }

  const serverClient = await createServerSupabase();
  const { data: { user } } = await serverClient.auth.getUser();
  return user?.id ?? null;
}

export async function handleShare(request: NextRequest, { admin, getUserId }: ShareDeps) {
  try {
    // Sharing requires an authenticated user: the owner is derived from the
    // verified token, never trusted from the request body. This prevents
    // attribution spoofing and free-tier-limit bypass.
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { videoId, videoTitle, bookmarks } = body as {
      videoId: string;
      videoTitle: string;
      bookmarks: Bookmark[];
    };

    if (!videoId || !Array.isArray(bookmarks) || bookmarks.length === 0) {
      return NextResponse.json(
        { error: 'videoId and a non-empty bookmarks array are required' },
        { status: 400 }
      );
    }

    // ── Free-tier limit check ────────────────────────────────────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('is_pro')
      .eq('id', userId)
      .single();

    const isPro = profile?.is_pro === true;

    if (!isPro) {
      const { count } = await admin
        .from('collections')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if ((count ?? 0) >= FREE_SHARE_LIMIT) {
        return NextResponse.json(
          {
            error: 'free_limit_reached',
            message: `Free plan allows ${FREE_SHARE_LIMIT} shared collections. Upgrade to ClipMark Pro for unlimited sharing.`,
            limit: FREE_SHARE_LIMIT,
            count,
          },
          { status: 403 }
        );
      }
    }

    // Sort bookmarks by timestamp before storing
    const sorted = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);

    const { data, error } = await admin
      .from('collections')
      .insert({
        video_id:    videoId,
        video_title: videoTitle || null,
        bookmarks:   sorted,
        user_id:     userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to save collection' }, { status: 500 });
    }

    // Return current collection count for free-tier nudge in the extension
    const { count } = await admin
      .from('collections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    return NextResponse.json(
      { shareId: data.id, collectionsUsed: count ?? null, freeLimit: FREE_SHARE_LIMIT },
      { status: 201 }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
