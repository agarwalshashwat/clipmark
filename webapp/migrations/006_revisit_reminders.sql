-- Revisit reminders: schedule recurring or one-time revisits for a video or group
CREATE TABLE IF NOT EXISTS public.revisit_reminders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type  TEXT        NOT NULL CHECK (target_type IN ('collection', 'group')),
  target_id    TEXT        NOT NULL,
  label        TEXT,
  frequency    TEXT        NOT NULL CHECK (frequency IN ('once', 'daily', 'weekly', 'biweekly', 'monthly')),
  next_due_at  TIMESTAMPTZ NOT NULL,
  last_done_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revisit_reminders_user_id ON public.revisit_reminders (user_id);
CREATE INDEX IF NOT EXISTS idx_revisit_reminders_due ON public.revisit_reminders (user_id, next_due_at);

ALTER TABLE public.revisit_reminders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'revisit_reminders' AND policyname = 'Users manage own reminders'
  ) THEN
    CREATE POLICY "Users manage own reminders" ON public.revisit_reminders
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
