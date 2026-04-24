-- Migration 012: DB helpers for referral reversal and gifted Pro expiry enforcement
--
-- 1. decrement_referral_credit(p_user_id, p_months)
--    Used by the webhook to reverse referral credits on refund/cancellation.
--    Clamps at 0 so credits never go negative.
--
-- 2. expire_gifted_pro()
--    Revokes is_pro for users whose gifted Pro has expired.
--    Call this via pg_cron (see comment below) or manually.

-- ── 1. Referral credit decrement ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_referral_credit(
  p_user_id UUID,
  p_months  INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET    referral_months_credit = GREATEST(0, referral_months_credit - p_months)
  WHERE  id = p_user_id;
END;
$$;

-- ── 2. Gifted Pro expiry enforcement ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_gifted_pro()
RETURNS INTEGER   -- returns count of users whose gift was revoked
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE public.profiles
  SET
    is_pro              = CASE WHEN subscription_id IS NOT NULL THEN true ELSE false END,
    is_gifted_pro       = false,
    gifted_pro_expires_at = NULL
  WHERE
    is_gifted_pro = true
    AND gifted_pro_expires_at IS NOT NULL
    AND gifted_pro_expires_at < NOW();

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$;

-- ── pg_cron schedule (run once, requires pg_cron extension enabled in Supabase) ──
-- To enable: Supabase dashboard → Database → Extensions → search "pg_cron" → enable
-- Then run this once in the SQL editor:
--
--   SELECT cron.schedule(
--     'expire-gifted-pro',        -- job name
--     '0 2 * * *',                -- daily at 02:00 UTC
--     $$ SELECT public.expire_gifted_pro(); $$
--   );
