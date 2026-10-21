-- 020_explicit_api_grants.sql
-- Make the Data API grants explicit instead of relying on hosted Supabase's
-- schema-level default privileges.
--
-- Supabase stops auto-granting Data API access on newly created public tables on
-- 2026-10-30. Tables that already exist keep their grants, so production is
-- unaffected — but a fresh project, a preview branch or a local `supabase db
-- reset` replays every CREATE TABLE above with NO grants, and every API call then
-- fails with "permission denied". This migration is the grant half of every
-- CREATE TABLE in 001–019.
--
-- Rules it follows:
--   * ADDITIVE ONLY — GRANT, never REVOKE, so on production (where the defaults
--     already gave these and 013/014/017/018/019 already narrowed others) it is
--     a no-op. A blanket "grant CRUD to authenticated" would silently undo those
--     hardening migrations, so it is deliberately not done.
--   * Least privilege, one table at a time: each grant is bounded by the RLS
--     policies that actually exist on the table (grants are table-level, RLS is
--     the row filter). No privilege is granted that no policy or code path uses.
--   * Tables hardened elsewhere keep their narrower shape and are only completed
--     with what's missing: profiles (column-level INSERT/UPDATE from 013/014),
--     feedback + uninstall_feedback (column-level INSERT from 017/019).
--   * pending_refunds and schema_migrations get nothing for anon/authenticated
--     (service-role / superuser only, by design). schema_migrations gets nothing
--     at all: migrate.ts connects as the postgres superuser.
--
-- Idempotent: GRANT is declarative, re-running is a no-op.
-- Every future migration that CREATEs a public table must include its own GRANTs
-- (see migrations/README.md, "Grants: every CREATE TABLE ships its own").

-- ── Publicly readable (RLS: "... viewable by everyone" / "Anyone can view") ────
GRANT SELECT ON public.collections TO anon;
GRANT SELECT ON public.profiles    TO anon;

-- ── Signed-in users: own rows, CRUD bounded by the "own rows" policies ────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_bookmarks    TO authenticated;  -- 002 + 016
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups            TO authenticated;  -- 005
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_collections TO authenticated;  -- 005
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revisit_reminders TO authenticated;  -- 006

-- collections: public SELECT + owner INSERT policies only (013 dropped UPDATE;
-- shares are created/removed through the service role in /api/share).
GRANT SELECT, INSERT ON public.collections TO authenticated;

-- profiles: table-level SELECT only. INSERT (id, username) and UPDATE (username,
-- avatar_url, cancel_at_period_end) are column-level grants from 014/013.
GRANT SELECT ON public.profiles TO authenticated;

-- Read-your-own-row tables: the only policy is SELECT; writes go through the
-- service role (webhook, /r/[code], admin routes).
GRANT SELECT ON public.affiliate_clicks       TO authenticated;  -- 007
GRANT SELECT ON public.affiliate_conversions  TO authenticated;  -- 007
GRANT SELECT ON public.affiliate_applications TO authenticated;  -- 008
GRANT SELECT ON public.referrals              TO authenticated;  -- 010

-- feedback / uninstall_feedback: anon + authenticated INSERT is the column-level
-- grant from 017/019 — nothing to add here.

-- ── service_role: server-side routes (bypasses RLS but still needs privileges) ─
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.collections,
  public.profiles,
  public.user_bookmarks,
  public.groups,
  public.group_collections,
  public.revisit_reminders,
  public.affiliate_clicks,
  public.affiliate_conversions,
  public.affiliate_applications,
  public.referrals,
  public.feedback,
  public.uninstall_feedback,
  public.pending_refunds
TO service_role;
