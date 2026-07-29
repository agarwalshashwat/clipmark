-- 014_profiles_insert_grant_hardening.sql
-- Defense-in-depth follow-up to 013. No behaviour change today.
--
-- 013 closed the self-grant-Pro path by revoking UPDATE on public.profiles from
-- anon/authenticated and re-granting a small column allow-list. It did not touch
-- INSERT or DELETE, which Supabase grants on every column by default. Those are
-- currently unreachable for the API roles only because profiles has no INSERT and
-- no DELETE policy, so RLS default-denies them.
--
-- That makes the safety of the entitlement columns depend on a *policy absence*
-- rather than on a privilege. The moment anyone adds a permissive INSERT policy —
-- e.g. to let a user create their own profile row on first login — is_pro,
-- is_affiliate and commission_rate become settable by the client at insert time,
-- which is the same hole 013 just closed, reached through INSERT instead of UPDATE.
--
-- So we apply the 013 pattern to INSERT: revoke, then re-grant only the columns a
-- user could legitimately supply for their own row.
--
-- IMPORTANT — why (id, username) is re-granted rather than revoking INSERT
-- outright: webapp/app/auth/callback/route.ts upserts { id, username } into
-- profiles using the anon key plus the caller's session, i.e. as the
-- `authenticated` role. That is the safety net for a user whose auth.users row
-- exists but whose profiles row does not (the on_auth_user_created trigger only
-- fires on the first-ever INSERT into auth.users). Revoking INSERT wholesale would
-- permanently break that path the moment an INSERT policy is added. Keeping the
-- two harmless columns insertable preserves it while removing every entitlement
-- column from the insertable set.
--
-- Profile creation itself is unaffected either way: handle_new_user() is
-- SECURITY DEFINER and owned by postgres, so it executes with the definer's
-- privileges, not the caller's.
--
-- DELETE and TRUNCATE are revoked with no re-grant — nothing in the app deletes a
-- profile row through a user-scoped client, and TRUNCATE bypasses RLS entirely, so
-- leaving it granted is pure downside even though PostgREST cannot issue it.
--
-- Idempotent: REVOKE/GRANT are declarative, so re-running is a no-op.

-- ── profiles: column-level INSERT allow-list (mirrors 013's UPDATE treatment) ──
REVOKE INSERT ON public.profiles FROM anon, authenticated;
GRANT  INSERT (id, username) ON public.profiles TO authenticated;

-- ── profiles: no row removal, and no RLS-bypassing truncation, via the API ─────
REVOKE DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;

-- Note: the service role bypasses RLS and retains full access, so the Dodo
-- webhook, admin routes, and handle_new_user() are all unaffected.
