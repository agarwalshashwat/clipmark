import { createClient } from '@supabase/supabase-js';
import { createServerClient as _createServerClient, createBrowserClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Bookmark {
  id: number;
  videoId: string;
  timestamp: number;
  description: string;
  tags: string[];
  color: string;
  createdAt: string;
  videoTitle: string | null;
  // Spaced-recall state. Written by the extension and synced verbatim into the
  // bookmarks JSONB, so it may be absent on older rows — hence optional.
  reviewSchedule?: number[];
  lastReviewed?: string | null;
  recallStreak?: number;
  // Extended Notes (Pro). Written by either surface, synced verbatim into
  // the bookmarks JSONB — absent unless the user has added notes.
  notes?: string;
  // Last-mutation stamp (Phase 10a sync) — used by the sync engine's
  // per-bookmark last-write-wins merge. Absent on rows written before it.
  updatedAt?: string;
  // Saved A–B loop. Present only on loop records: `timestamp` is the A point
  // and `loop.end` is B, so a loop is an ordinary bookmark with a range rather
  // than a separate entity. Written by the extension (src/loop.js) and synced
  // verbatim into the bookmarks JSONB. See validateLoopFields in
  // app/api/bookmarks/handler.ts for the server-side shape check.
  loop?: { end: number };
}

export interface Collection {
  id: string;
  video_id: string;
  video_title: string | null;
  bookmarks: Bookmark[];
  created_at: string;
  view_count: number;
  user_id: string | null;
}

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

// ─── Anonymous client (for API routes that don't need user context) ──────────
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Server client (reads cookies for auth session) ──────────────────────────
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return _createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options as never)
        );
      },
    },
  });
}

// ─── Browser client (for Client Components) ──────────────────────────────────
export function createBrowserSupabase() {
  return createBrowserClient(supabaseUrl, supabaseKey);
}
