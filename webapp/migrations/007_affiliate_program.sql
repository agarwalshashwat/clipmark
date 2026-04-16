-- Migration 007: Affiliate Program
-- Adds invite-only affiliate tracking: clicks and commission-based conversions.
-- Admin enables affiliates by setting is_affiliate=true and affiliate_code on profiles.

-- ── 1. Extend profiles table ─────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_affiliate       BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS affiliate_code     TEXT          UNIQUE,
  ADD COLUMN IF NOT EXISTS commission_rate    DECIMAL(4,2)  NOT NULL DEFAULT 0.30;

-- ── 2. Affiliate clicks (anonymous, no PII) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_code  TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_code
  ON public.affiliate_clicks (affiliate_code);

-- RLS: inserts only via service role (API route); affiliates can read their own count
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates can view their own clicks"
  ON public.affiliate_clicks FOR SELECT
  USING (
    affiliate_code = (
      SELECT affiliate_code FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ── 3. Affiliate conversions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id  UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  plan              TEXT          NOT NULL CHECK (plan IN ('monthly', 'annual', 'lifetime')),
  amount_usd        DECIMAL(10,2) NOT NULL,
  commission_usd    DECIMAL(10,2) NOT NULL,
  commission_rate   DECIMAL(4,2)  NOT NULL,
  status            TEXT          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'approved', 'paid')),
  dodo_payment_id   TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_affiliate_id
  ON public.affiliate_conversions (affiliate_id);

-- RLS: affiliates read only their own rows; all writes via service role
ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates can view their own conversions"
  ON public.affiliate_conversions FOR SELECT
  USING (affiliate_id = auth.uid());
