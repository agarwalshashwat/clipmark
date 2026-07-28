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
