-- User-created groups (custom or tag-based)
CREATE TABLE IF NOT EXISTS public.groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('custom', 'tag')),
  tag_name    TEXT,       -- only for type='tag'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table for custom group → collection membership
CREATE TABLE IF NOT EXISTS public.group_collections (
  group_id      UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, collection_id)
);

CREATE INDEX IF NOT EXISTS idx_groups_user_id ON public.groups (user_id);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_collections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'groups' AND policyname = 'Users manage own groups'
  ) THEN
    CREATE POLICY "Users manage own groups" ON public.groups
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'group_collections' AND policyname = 'Users manage own group_collections'
  ) THEN
    CREATE POLICY "Users manage own group_collections" ON public.group_collections
      USING (EXISTS (
        SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.user_id = auth.uid()
      ));
  END IF;
END $$;
