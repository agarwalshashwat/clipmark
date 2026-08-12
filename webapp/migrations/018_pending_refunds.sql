-- Migration 018: durable record of refunds we owe but could not pay automatically
--
-- Dodo pays refunds from the merchant wallet's *available* balance rather than
-- by reversing the original charge, so a refund requested inside the 7-day
-- money-back window fails with 409 INSUFFICIENT_WALLET_FUNDS whenever the
-- wallet hasn't settled yet. cancelSubscription() treats that as recoverable:
-- it cancels the subscription anyway and leaves the refund for a human.
--
-- Until now the *only* trace of that obligation was a Sentry issue tagged
-- `refund_needs_manual_processing`. Sentry is an alerting surface, not a
-- ledger — issues get resolved, auto-archived after 30 days, or simply missed,
-- and once one is, nothing in the system remembers that a customer is owed
-- money. This table is the ledger: one row per owed refund, queryable, with an
-- explicit resolved_at rather than an implicit "someone dealt with it".
--
-- Access model — SERVICE ROLE ONLY. RLS is enabled and NO policy is created,
-- which under RLS is a denial for every API role; the base grants that hosted
-- Supabase hands out via schema-level default privileges are revoked on top
-- (see migrations/README.md for why that revoke is needed at all). The service
-- role bypasses RLS entirely and keeps full access, which is what the server
-- action and the webhook handler use. Nothing here is ever read by a browser:
-- these rows say which customers are owed money and how much, and the customer
-- already learns their own status from the cancellation UI.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), like every migration here.
-- NOT YET APPLIED TO PRODUCTION — see migrations/README.md.

CREATE TABLE IF NOT EXISTS public.pending_refunds (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dodo's opaque payment id — the handle whoever works the queue types into
  -- the Dodo dashboard. UNIQUE because a payment is refunded at most once, so
  -- a retried cancellation must not stack duplicate obligations for it. The
  -- write path relies on this: it inserts and treats 23505 as "already
  -- recorded", which is the correct outcome rather than an error.
  payment_id   TEXT        NOT NULL UNIQUE,
  -- References auth.users (not public.profiles) to match the rest of the
  -- schema's user_id columns, and ON DELETE SET NULL so that deleting an
  -- account never silently erases the fact that we still owe it money.
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Nullable: the cancellation path knows the payment id but not the amount
  -- (profiles stores no price), and re-querying Dodo mid-failure to find out
  -- would be another call in the exact path that is already failing. The Dodo
  -- dashboard shows the amount against payment_id, so this is a convenience
  -- column for when a caller does happen to know it, not a source of truth.
  amount_cents INT         CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency     TEXT        CHECK (currency IS NULL OR char_length(currency) <= 8),
  -- Why this refund is owed, e.g. 'insufficient_wallet_funds'. Free-form but
  -- bounded; grep-able in aggregate.
  reason       TEXT        NOT NULL CHECK (char_length(reason) <= 200),
  -- NULL while the refund is still owed. Stamped when refund.succeeded lands
  -- for this payment_id — whether the refund was issued by hand from the Dodo
  -- dashboard or eventually went through automatically. Querying
  -- `WHERE resolved_at IS NULL` is the whole point of the table.
  resolved_at  TIMESTAMPTZ
);

-- The one query that matters: what do we still owe, oldest first.
CREATE INDEX IF NOT EXISTS idx_pending_refunds_unresolved
  ON public.pending_refunds (created_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.pending_refunds ENABLE ROW LEVEL SECURITY;

-- ── Grants: none for the API roles ──────────────────────────────────────────
-- Hosted Supabase grants ALL on new public tables to anon/authenticated via
-- schema-level default privileges, so the base grant has to be revoked rather
-- than merely not given. With RLS enabled and no policy below, this is
-- belt-and-braces — but it means a future policy added by mistake still can't
-- expose the table without someone also re-granting on purpose.
REVOKE ALL ON public.pending_refunds FROM anon, authenticated;

-- No SELECT / INSERT / UPDATE / DELETE policy exists on purpose: with RLS
-- enabled, the absence of a policy is a denial for anon and authenticated.
-- The service role bypasses RLS and keeps full access. Dropping first keeps
-- this re-runnable if a policy is ever added and then reverted.
DROP POLICY IF EXISTS "Service role only" ON public.pending_refunds;
