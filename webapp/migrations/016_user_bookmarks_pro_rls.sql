-- 016_user_bookmarks_pro_rls.sql
-- Move the cloud-sync Pro gate from "route only" to "route AND database".
--
-- Found while adding the saved A–B loop feature (loops are stored as ordinary
-- bookmarks, so they inherit this table's gate — there is no separate route to
-- protect).
--
-- The gap: /api/bookmarks checks profiles.is_pro before it upserts, but the RLS
-- policies from 002_user_accounts.sql only check OWNERSHIP:
--
--     FOR INSERT WITH CHECK (auth.uid() = user_id)
--     FOR UPDATE USING      (auth.uid() = user_id)
--
-- The anon key is public by design and the extension holds the user's own JWT,
-- so a non-Pro user could POST straight to PostgREST
-- (/rest/v1/user_bookmarks) and sync anyway — the paid feature was enforced
-- only by the code path clients are asked to use. This is the same shape as the
-- profiles self-grant hole closed in 013.
--
-- The fix: require Pro in the write policies too, via a SECURITY DEFINER helper
-- so the policy does not depend on the caller's own read access to profiles.
--
-- Deliberately UNCHANGED:
--   * SELECT — a lapsed subscriber must still be able to read back data they
--     already own; the product's gate on reading down is the route's 403.
--   * DELETE — likewise, a lapsed user must always be able to delete their data.
--   * service_role — bypasses RLS entirely, so the webhook and admin routes are
--     unaffected.
--
-- No behaviour change for legitimate clients: a non-Pro user already got 403
-- from the route, and Pro users satisfy the new check.
--
-- Idempotent: safe to re-run.

-- ── Pro check usable from inside a policy ───────────────────────────────────
-- SECURITY DEFINER so it reads profiles regardless of the caller's own RLS, and
-- a pinned search_path so the body can't be hijacked by a client-set path.
-- Mirrors isProUser() in app/api/bookmarks/handler.ts: is_pro, nothing else.
CREATE OR REPLACE FUNCTION public.current_user_is_pro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT p.is_pro FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.current_user_is_pro() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_pro() TO anon, authenticated, service_role;

-- ── user_bookmarks: writes now require Pro as well as ownership ─────────────
DROP POLICY IF EXISTS "Users can upsert own bookmarks" ON public.user_bookmarks;
DROP POLICY IF EXISTS "Pro users can insert own bookmarks" ON public.user_bookmarks;
CREATE POLICY "Pro users can insert own bookmarks"
  ON public.user_bookmarks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.current_user_is_pro());

DROP POLICY IF EXISTS "Users can update own bookmarks" ON public.user_bookmarks;
DROP POLICY IF EXISTS "Pro users can update own bookmarks" ON public.user_bookmarks;
CREATE POLICY "Pro users can update own bookmarks"
  ON public.user_bookmarks
  FOR UPDATE
  USING      (auth.uid() = user_id AND public.current_user_is_pro())
  WITH CHECK (auth.uid() = user_id AND public.current_user_is_pro());
