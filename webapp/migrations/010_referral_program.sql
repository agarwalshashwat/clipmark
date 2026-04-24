-- Migration 010: User Referral Program
-- Allows any user to share a referral link and earn free subscription months
-- when their referred friends convert to Pro.
-- This is distinct from the affiliate program (010 = user-to-user, 007 = marketer-to-brand).

-- ── 1. Extend profiles ────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code          TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_months_credit INTEGER NOT NULL DEFAULT 0;

-- ── 2. Auto-generate a referral code for every profile ───────────────────────
-- Uses first 8 chars of md5(id) for a short, URL-safe code.
-- Applied retroactively to existing rows and via trigger for new rows.

UPDATE public.profiles
  SET referral_code = lower(substring(md5(id::text) from 1 for 8))
  WHERE referral_code IS NULL;

CREATE OR REPLACE FUNCTION public.auto_set_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := lower(substring(md5(NEW.id::text) from 1 for 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_referral_code ON public.profiles;
CREATE TRIGGER trg_auto_set_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_referral_code();

-- ── 3. Referrals table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referrals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'rewarded', 'cancelled')),
  reward_months    INTEGER     NOT NULL DEFAULT 3,
  reward_applied_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id
  ON public.referrals (referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id
  ON public.referrals (referred_user_id);

-- RLS: users can only see referrals where they are the referrer
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referrals"
  ON public.referrals FOR SELECT
  USING (referrer_id = (SELECT id FROM public.profiles WHERE id = auth.uid() LIMIT 1));
