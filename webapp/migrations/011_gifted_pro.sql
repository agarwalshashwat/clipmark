-- Migration 011: Gifted Pro Accounts (Partner/Creator Seeding)
-- Allows admins to grant Pro access to partners, influencers and big creators
-- without requiring a Dodo payment. Gifted Pro is audited separately from paid Pro
-- so real subscribers and gifted accounts are never conflated in analytics.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_gifted_pro      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gifted_pro_expires_at TIMESTAMPTZ,         -- NULL = permanent gift
  ADD COLUMN IF NOT EXISTS gifted_by_note     TEXT;                   -- admin memo e.g. "Ali Abdaal collab Q2 2026"
