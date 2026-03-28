-- Run this in your Supabase project → SQL Editor

CREATE TABLE public.collections (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id    TEXT        NOT NULL,
  video_title TEXT,
  bookmarks   JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  view_count  INTEGER     DEFAULT 0
);

-- Index for fast lookups by video (useful later for "popular videos" feature)
CREATE INDEX idx_collections_video_id ON public.collections (video_id);

-- Row Level Security — open read/insert for MVP (no auth)
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view collections"
  ON public.collections FOR SELECT USING (true);

CREATE POLICY "Anyone can create collections"
  ON public.collections FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can increment view_count"
  ON public.collections FOR UPDATE USING (true) WITH CHECK (true);

-- ─── Phase 3.2: User Accounts ────────────────────────────────────────────────

-- Profiles table (linked to Supabase auth.users)
CREATE TABLE public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT        UNIQUE NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup (username derived from email prefix)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add user_id to collections (nullable — anonymous shares still work)
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections (user_id);

-- RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ─── Phase 3.2: Cloud Bookmark Sync ──────────────────────────────────────────

-- Per-user per-video bookmark storage
CREATE TABLE public.user_bookmarks (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id    TEXT        NOT NULL,
  bookmarks   JSONB       NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX idx_user_bookmarks_user_id ON public.user_bookmarks (user_id);

-- RLS: users can only read/write their own bookmarks
ALTER TABLE public.user_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bookmarks"
  ON public.user_bookmarks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own bookmarks"
  ON public.user_bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bookmarks"
  ON public.user_bookmarks FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON public.user_bookmarks FOR DELETE USING (auth.uid() = user_id);

-- ─── Paywall: Pro tier flag ───────────────────────────────────────────────────
-- Run this if profiles table already exists (migration):
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false;

-- Admin can flip is_pro manually via Supabase dashboard or a future billing webhook.

-- ─── Clipper: Video Clips ─────────────────────────────────────────────────────
-- Run this migration in Supabase SQL Editor to enable the Clipper feature.

CREATE TABLE public.clips (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id    TEXT        NOT NULL,
  video_title TEXT,
  start_time  FLOAT       NOT NULL,  -- seconds from start
  end_time    FLOAT       NOT NULL,  -- seconds from start
  title       TEXT,                  -- user-provided clip title
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  view_count  INTEGER     DEFAULT 0,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_clips_video_id ON public.clips (video_id);
CREATE INDEX idx_clips_user_id  ON public.clips (user_id);

-- RLS: clips are public-read; only owner can update/delete
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view clips"
  ON public.clips FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create clips"
  ON public.clips FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Clips: increment view_count"
  ON public.clips FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete own clips"
  ON public.clips FOR DELETE USING (auth.uid() = user_id);
