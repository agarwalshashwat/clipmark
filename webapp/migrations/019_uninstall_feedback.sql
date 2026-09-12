-- Migration 019: uninstall feedback (the /uninstall page)
--
-- One row per uninstall survey response. Chrome opens the URL registered with
-- chrome.runtime.setUninstallURL() when the extension is removed, so by
-- definition the submitter has just deleted the product, is not signed in, and
-- owes us nothing. The table is shaped for that: no user_id, no session, no
-- identifiers — the only thing that arrives from the URL is the extension
-- version, and the page will not store anything else it finds there.
--
-- Same write-only posture as 017_feedback.sql:
--
--   * anon + authenticated may INSERT (nothing else). RLS has no SELECT,
--     UPDATE or DELETE policy, so PostgREST returns "permission denied" for
--     every read attempt with a publishable key.
--   * reading responses is the service role's job (it bypasses RLS) — the
--     Supabase dashboard / SQL editor, or a future admin route.
--
-- Deliberate trade-off, restated because it applies here too: an anonymous
-- INSERT grant is an unauthenticated write endpoint on the database itself.
-- /api/uninstall-feedback adds a per-IP rate limit, but a client holding the
-- publishable anon key can insert directly and skip it. The WITH CHECK below is
-- therefore the real floor — it bounds every field's size and constrains
-- `reason` to the options the form actually offers, so the worst case is
-- bounded junk rows rather than arbitrary stored payloads.
--
-- Note the consequence of putting the reason allowlist in the WITH CHECK:
-- adding a new option to the form needs a migration too. That is the intended
-- direction of the trade — the constraint is what stops a direct anon insert
-- writing whatever it likes into a column we later read as an enum.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), like every migration here.
-- NOT YET APPLIED TO PRODUCTION — see migrations/README.md.

CREATE TABLE IF NOT EXISTS public.uninstall_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One of the form's options; see the allowlist in the policy below.
  reason            TEXT        NOT NULL CHECK (char_length(reason) <= 40),
  -- "Anything we could've done better?" — optional.
  message           TEXT        CHECK (message IS NULL OR char_length(message) <= 4000),
  -- Optional, and the only contact detail on the page. Nothing else here can
  -- identify the submitter.
  email             TEXT        CHECK (email IS NULL OR char_length(email) <= 254),
  -- From ?v= on the uninstall URL, which the extension appends. Version string
  -- only — the page refuses to store anything that isn't version-shaped.
  extension_version TEXT        CHECK (extension_version IS NULL OR char_length(extension_version) <= 32)
);

-- Read newest-first, and grouped by reason when the question is which
-- complaint is growing.
CREATE INDEX IF NOT EXISTS idx_uninstall_feedback_created_at ON public.uninstall_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uninstall_feedback_reason     ON public.uninstall_feedback (reason);

ALTER TABLE public.uninstall_feedback ENABLE ROW LEVEL SECURITY;

-- ── Grants: INSERT only, and only on the columns a submitter owns ────────────
-- Hosted Supabase grants ALL on new public tables to anon/authenticated via
-- schema-level default privileges (see migrations/README.md), so the base grant
-- has to be revoked rather than merely not given. `id` and `created_at` are
-- excluded from the re-grant so a caller cannot choose its own primary key or
-- backdate a row; both have defaults, so inserts don't need them.
REVOKE ALL ON public.uninstall_feedback FROM anon, authenticated;
GRANT INSERT (reason, message, email, extension_version)
  ON public.uninstall_feedback TO anon, authenticated;

-- ── RLS: anonymous INSERT, no read path ─────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can submit uninstall feedback" ON public.uninstall_feedback;
CREATE POLICY "Anyone can submit uninstall feedback"
  ON public.uninstall_feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Mirrors REASONS in app/lib/uninstall-feedback.ts. Keep the two in step:
    -- the app copy decides what the form offers, this one decides what the
    -- database will accept from anyone at all.
    reason IN (
      'expectations',
      'missing_feature',
      'too_confusing',
      'better_tool',
      'just_trying',
      'other'
    )
  );

-- No SELECT / UPDATE / DELETE policy exists on purpose: with RLS enabled, the
-- absence of a policy is a denial for anon and authenticated. The service role
-- bypasses RLS and keeps full access.
