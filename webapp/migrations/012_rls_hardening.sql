-- 012_rls_hardening.sql
-- Pre-launch security hardening for the profiles + collections tables.
--
-- Fixes three critical RLS gaps found in the launch-readiness audit:
--   1. profiles: RLS is row-level, not column-level, so any authenticated user
--      could self-grant Pro/affiliate by writing sensitive columns directly with
--      the public anon key (e.g. is_pro, is_affiliate, commission_rate). We
--      restrict UPDATE for the anon/authenticated roles to a small non-sensitive
--      column allow-list. The service role (webhook, admin routes) bypasses RLS
--      and keeps full access, so entitlement grants still work.
--   2. collections: the UPDATE policy was USING(true)/WITH CHECK(true), letting
--      anyone overwrite or hijack any public share via the anon key. We drop it
--      and expose a SECURITY DEFINER function for the one legitimate anonymous
--      write — incrementing view_count.
--   3. collections: the INSERT policy was WITH CHECK(true) (anonymous mass
--      insert). We scope it to the owning user; /api/share now inserts via the
--      service role after authenticating the caller.

-- ── profiles: column-level UPDATE allow-list ────────────────────────────────
-- Supabase grants UPDATE on all columns to anon/authenticated by default; revoke
-- and re-grant only the columns a user legitimately owns.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (username, avatar_url, cancel_at_period_end)
  ON public.profiles TO authenticated;

-- Column so refunds can reverse a one-time (lifetime) Pro grant.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_payment_id TEXT;

-- ── collections: remove the wide-open UPDATE + INSERT policies ───────────────
DROP POLICY IF EXISTS "Anyone can increment view_count" ON public.collections;
DROP POLICY IF EXISTS "Anyone can create collections"   ON public.collections;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'collections' AND policyname = 'Owners can create their collections'
  ) THEN
    CREATE POLICY "Owners can create their collections"
      ON public.collections FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── view_count increment via SECURITY DEFINER (bypasses RLS safely) ──────────
CREATE OR REPLACE FUNCTION public.increment_collection_view(collection_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.collections
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = collection_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_collection_view(UUID) TO anon, authenticated;
