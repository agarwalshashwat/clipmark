-- Migration 017: early-user feedback capture (the /feedback page)
--
-- One row per submission from the public /feedback form. The form is for
-- friends, family and first users, so it must work for a visitor who has never
-- signed in — hence a WRITE-ONLY table for the API roles:
--
--   * anon + authenticated may INSERT (nothing else). RLS has no SELECT,
--     UPDATE or DELETE policy, so PostgREST returns "permission denied" for
--     every read attempt with a publishable key.
--   * reading feedback is the service role's job (it bypasses RLS) — i.e. the
--     Supabase dashboard / SQL editor, or a future admin route.
--
-- Deliberate trade-off: an anonymous INSERT grant is, by construction, an
-- unauthenticated write endpoint on the database itself. /api/feedback adds a
-- per-IP rate limit, but a client holding the publishable anon key can insert
-- directly and skip it. The WITH CHECK below is therefore the real floor: it
-- bounds every field's size and rejects feedback attributed to a user the
-- caller is not, so the worst case is bounded junk rows rather than a way to
-- forge someone else's feedback or store arbitrary payloads.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), like every migration here.
-- NOT YET APPLIED TO PRODUCTION — see migrations/README.md.

CREATE TABLE IF NOT EXISTS public.feedback (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rating          INT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  liked           TEXT        CHECK (liked           IS NULL OR char_length(liked)           <= 4000),
  confusing       TEXT        CHECK (confusing       IS NULL OR char_length(confusing)       <= 4000),
  feature_request TEXT        CHECK (feature_request IS NULL OR char_length(feature_request) <= 4000),
  name            TEXT        CHECK (name  IS NULL OR char_length(name)  <= 120),
  email           TEXT        CHECK (email IS NULL OR char_length(email) <= 254),
  -- Free-form provenance ('site', 'extension', 'side-panel', a ?from= value…)
  -- so a submission can be attributed to the surface it came from.
  source          TEXT        CHECK (source IS NULL OR char_length(source) <= 120),
  -- NULL for anonymous submissions; stamped server-side from the verified
  -- session when the submitter happens to be signed in. References auth.users
  -- rather than public.profiles because that is the table auth.uid() (and the
  -- WITH CHECK below) speaks for — a signed-in user whose profiles row hasn't
  -- been created yet must still be able to submit.
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Read newest-first, and filtered by surface when the question is whether the
-- extension or the site produced a note.
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_source     ON public.feedback (source);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- ── Grants: INSERT only, and only on the columns a submitter owns ────────────
-- Hosted Supabase grants ALL on new public tables to anon/authenticated via
-- schema-level default privileges (see migrations/README.md), so the base grant
-- has to be revoked rather than merely not given. `id` and `created_at` are
-- excluded from the re-grant so a caller cannot choose its own primary key or
-- backdate a row; both have defaults, so inserts don't need them.
REVOKE ALL ON public.feedback FROM anon, authenticated;
GRANT INSERT (rating, liked, confusing, feature_request, name, email, source, user_id)
  ON public.feedback TO anon, authenticated;

-- ── RLS: anonymous INSERT, no read path ─────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;
CREATE POLICY "Anyone can submit feedback"
  ON public.feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    rating BETWEEN 1 AND 5
    -- At least one of the three questions actually answered, mirroring the
    -- client-side and /api/feedback rules so a direct insert can't be emptier
    -- than a form submission.
    AND (
      char_length(COALESCE(liked, '')) > 0
      OR char_length(COALESCE(confusing, '')) > 0
      OR char_length(COALESCE(feature_request, '')) > 0
    )
    -- Anonymous callers must leave user_id NULL; a signed-in caller may only
    -- attribute feedback to itself.
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- No SELECT / UPDATE / DELETE policy exists on purpose: with RLS enabled, the
-- absence of a policy is a denial for anon and authenticated. The service role
-- bypasses RLS and keeps full access.
