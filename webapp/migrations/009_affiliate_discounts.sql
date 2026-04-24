-- Migration 009: Affiliate discount support
-- Adds per-affiliate discount configuration and stores the Dodo discount code
-- that is automatically created when an affiliate is approved.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS affiliate_discount_pct SMALLINT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS dodo_discount_code TEXT;
