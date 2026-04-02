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

// GET /api/reminders — returns { due, upcoming } for the authenticated user
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { client } = auth;
  const now = new Date().toISOString();

  const { data: reminders, error } = await client
    .from('revisit_reminders')
    .select('*')
    .order('next_due_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with target labels
  type BookmarkRow = { video_id: string; bookmarks: { videoTitle?: string }[] };
  type GroupRow = { id: string; name: string };

  const [{ data: userBookmarks }, { data: groups }] = await Promise.all([
    client.from('user_bookmarks').select('video_id, bookmarks'),
    client.from('groups').select('id, name'),
  ]);

  const bookmarkMap = new Map<string, string>(
    (userBookmarks as BookmarkRow[] ?? []).map(r => [r.video_id, r.bookmarks?.[0]?.videoTitle ?? 'Untitled Video'])
  );
  const groupMap = new Map<string, string>(
    (groups as GroupRow[] ?? []).map(g => [g.id, g.name])
  );

  const enriched = (reminders ?? []).map(r => {
    let targetLabel = 'Unknown';
    let videoId: string | undefined;
    if (r.target_type === 'collection') {
      targetLabel = bookmarkMap.get(r.target_id) ?? 'Untitled Video';
      videoId = r.target_id;
    } else {
      targetLabel = groupMap.get(r.target_id) ?? 'Unknown Group';
    }
    return { ...r, targetLabel, videoId };
  });

  return NextResponse.json({
    due: enriched.filter(r => r.next_due_at <= now),
    upcoming: enriched.filter(r => r.next_due_at > now),
  });
}

// POST /api/reminders — create a reminder (called from extension)
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { client } = auth;
  let body: { target_type?: string; target_id?: string; frequency?: string; next_due_at?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { target_type, target_id, frequency, next_due_at, label } = body;
  const validTypes = ['collection', 'group'];
  const validFreqs = ['once', 'daily', 'weekly', 'biweekly', 'monthly'];

  if (!validTypes.includes(target_type ?? '') || !target_id || !validFreqs.includes(frequency ?? '') || !next_due_at) {
    return NextResponse.json({ error: 'Invalid fields' }, { status: 400 });
  }

  const { data, error } = await client
    .from('revisit_reminders')
    .insert({
      target_type,
      target_id,
      frequency,
      next_due_at: new Date(next_due_at).toISOString(),
      label: label?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
