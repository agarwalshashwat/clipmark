-- Migration 008: Self-service affiliate applications
-- Pro users with accounts ≥30 days old can apply; eligible applicants are auto-approved.

CREATE TABLE IF NOT EXISTS public.affiliate_applications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_url   TEXT        NOT NULL,
  reason        TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewer_note TEXT,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_user_id
  ON public.affiliate_applications (user_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_status
  ON public.affiliate_applications (status);

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own application"
  ON public.affiliate_applications FOR SELECT
  USING (user_id = auth.uid());
