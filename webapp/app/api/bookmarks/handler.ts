import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { supabase, createServerSupabase } from '@/lib/supabase';
import { liveBookmarks, type WireBookmark } from '@/lib/bookmarks';

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

/**
 * Shape check for tombstones riding the bookmarks wire array.
 *
 * A tombstone is exactly `{ id, deleted: true, deletedAt }` — it records a
 * deletion event so other devices delete instead of resurrecting. It must not
 * carry playback fields (`timestamp`/`loop`): a half-live entry would slip
 * past validateLoopFields (which skips loop-less records by design) and later
 * render as a broken bookmark.
 *
 * Entries without `deleted: true` are untouched — live bookmarks keep syncing
 * exactly as before.
 */
export function validateTombstoneFields(bookmarks: unknown[]): string | null {
  for (const entry of bookmarks) {
    if (!entry || typeof entry !== 'object') continue;
    const t = entry as { deleted?: unknown; id?: unknown; deletedAt?: unknown; timestamp?: unknown; loop?: unknown };
    if (t.deleted !== true) continue;

    if (typeof t.id !== 'number' || !Number.isFinite(t.id)) return 'invalid_tombstone';
    if (typeof t.deletedAt !== 'string') return 'invalid_tombstone';
    if (t.timestamp !== undefined || t.loop !== undefined) return 'invalid_tombstone';
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
  // Tombstones stay server-side by default: legacy clients (≤1.0.4) union
  // whatever they receive into local state and would render a tombstone as a
  // broken bookmark. Only the sync engine asks for the raw wire array.
  const includeDeleted = request.nextUrl.searchParams.get('includeDeleted') === '1';
  const shape = (arr: unknown) => (includeDeleted ? (arr ?? []) : liveBookmarks(arr));

  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!await isProUser(admin, auth.user.id)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  if (!videoId) {
    // Return all bookmarks for the user (used by extension dashboard on load)
    const { data, error } = await auth.client
      .from('user_bookmarks')
      .select('video_id, bookmarks, updated_at, revision')
      .eq('user_id', auth.user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 });
    }

    return NextResponse.json({
      videos: (data ?? []).map(row => ({
        videoId: row.video_id,
        bookmarks: shape(row.bookmarks),
        updatedAt: row.updated_at,
        revision: row.revision,
      })),
    });
  }

  const { data, error } = await auth.client
    .from('user_bookmarks')
    .select('bookmarks, updated_at, revision')
    .eq('user_id', auth.user.id)
    .eq('video_id', videoId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 });
  }

  return NextResponse.json({
    bookmarks: shape(data?.bookmarks),
    updatedAt: data?.updated_at ?? null,
    // 0 = "no row yet": the baseRevision a sync client sends to create it.
    revision: data?.revision ?? 0,
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
    const { videoId, bookmarks, baseRevision } = await request.json() as {
      videoId: string;
      bookmarks: WireBookmark[];
      baseRevision?: number;
    };

    if (!videoId || !Array.isArray(bookmarks)) {
      return NextResponse.json({ error: 'videoId and bookmarks are required' }, { status: 400 });
    }
    if (baseRevision !== undefined
        && (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 0)) {
      return NextResponse.json({ error: 'invalid_baseRevision' }, { status: 400 });
    }

    const tombstoneError = validateTombstoneFields(bookmarks);
    if (tombstoneError) {
      return NextResponse.json({ error: tombstoneError }, { status: 400 });
    }
    // Tombstones carry no `loop`, so they pass through here untouched.
    const loopError = validateLoopFields(bookmarks);
    if (loopError) {
      return NextResponse.json({ error: loopError }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 409 payload: the raw wire array (tombstones included) plus its revision,
    // so the sync engine can re-merge and retry against real server state.
    const revisionConflict = async () => {
      const { data: current } = await auth.client
        .from('user_bookmarks')
        .select('bookmarks, updated_at, revision')
        .eq('user_id', auth.user.id)
        .eq('video_id', videoId)
        .maybeSingle();
      return NextResponse.json({
        error:     'revision_conflict',
        bookmarks: current?.bookmarks ?? [],
        revision:  current?.revision ?? 0,
        updatedAt: current?.updated_at ?? null,
      }, { status: 409 });
    };

    if (baseRevision === undefined) {
      // Legacy path (clients without the sync engine): blind last-write-wins
      // upsert, unchanged — but keep the revision moving so sync clients on the
      // same account still detect this write. The read-then-write race here is
      // acceptable: two legacy writers were last-write-wins before too.
      const { data: existing } = await auth.client
        .from('user_bookmarks')
        .select('revision')
        .eq('user_id', auth.user.id)
        .eq('video_id', videoId)
        .maybeSingle();
      const revision = ((existing?.revision as number | undefined) ?? 0) + 1;

      const { error } = await auth.client
        .from('user_bookmarks')
        .upsert({
          user_id:    auth.user.id,
          video_id:   videoId,
          bookmarks,
          updated_at: now,
          revision,
        }, { onConflict: 'user_id,video_id' });

      if (error) {
        console.error('Supabase upsert error:', error);
        return NextResponse.json({ error: 'Failed to save bookmarks' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, revision });
    }

    if (baseRevision === 0) {
      // Client believes the row doesn't exist yet: plain insert. A duplicate
      // key means another device created it first — that's a conflict.
      const { error } = await auth.client
        .from('user_bookmarks')
        .insert({
          user_id:    auth.user.id,
          video_id:   videoId,
          bookmarks,
          updated_at: now,
          revision:   1,
        });

      if (error) {
        if (error.code === '23505') return revisionConflict();
        console.error('Supabase insert error:', error);
        return NextResponse.json({ error: 'Failed to save bookmarks' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, revision: 1 });
    }

    // Compare-and-swap: only overwrite the state the client actually saw. The
    // `.eq('revision', baseRevision)` predicate makes a stale write match zero
    // rows instead of clobbering a newer one. (A missing row also matches zero
    // rows and 409s with revision 0, telling the client to re-create.)
    const { data: swapped, error } = await auth.client
      .from('user_bookmarks')
      .update({
        bookmarks,
        updated_at: now,
        revision:   baseRevision + 1,
      })
      .eq('user_id', auth.user.id)
      .eq('video_id', videoId)
      .eq('revision', baseRevision)
      .select('revision');

    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json({ error: 'Failed to save bookmarks' }, { status: 500 });
    }
    if (!swapped || swapped.length === 0) return revisionConflict();

    return NextResponse.json({ ok: true, revision: baseRevision + 1 });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
