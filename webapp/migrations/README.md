# Migrations

Applied in filename order by `scripts/migrate.ts` (tracked in `public.schema_migrations`).
Run them deliberately with `npm run db:migrate` (needs `DATABASE_URL`); the build no
longer runs migrations. See `docs/DEPLOYMENTS.md` for the full flow.

## ⚠️ `012` discrepancy the owner must reconcile

There are **two different "012" migrations** in play:

- The **production database's `schema_migrations`** records **`012_db_helpers.sql`** as
  applied — but that file exists in **neither this repo nor any branch**.
- This repo's launch-hardening migration was originally numbered `012_rls_hardening.sql`
  and has now been **renumbered to `013_rls_hardening.sql`** so it no longer clashes with
  the `012_db_helpers.sql` slot that prod already used.

**What the owner still needs to do — recover `012_db_helpers.sql` into the repo** so the
repo's history matches the database's:

1. Find the original file: `git log --all -- 'webapp/migrations/012*'`, check closed PRs,
   or whoever added the DB helpers.
2. If found, commit it verbatim as `webapp/migrations/012_db_helpers.sql`. Because
   `schema_migrations` already lists it, `migrate.ts` will **not** re-run it — this only
   makes the repo honest and keeps numbering gap-free.
3. If it's truly lost, reconstruct it from the live schema: in the Supabase SQL editor,
   dump whatever objects it created (helper functions/indexes not created by `001–011`)
   and save that as `012_db_helpers.sql`. **Do not guess or ship an empty placeholder** —
   export the actual DDL.

> Until this is done, a fresh `db:migrate` on prod applies `013_rls_hardening.sql`
> (its filename isn't in prod's `schema_migrations`, so it runs once) and prod ends up
> with both `012_db_helpers.sql` and `013_rls_hardening.sql` recorded — functional, but
> the repo is missing `012_db_helpers.sql` until step 2/3 above.

## `013_rls_hardening.sql` — not yet applied to prod

This migration closes the self-grant-Pro RLS hole, locks down `collections`
insert/update, adds `profiles.pro_payment_id` (needed for refund→revoke), and enables
RLS on `public.schema_migrations` (the CRITICAL Supabase advisor item). It has **not**
been applied to the production database yet — apply it deliberately (local test →
manual backup → prod) per `docs/DEPLOYMENTS.md`.

## Accepted assumption: migrations rely on hosted Supabase's default grants

These migrations **do not** explicitly `GRANT` table-level data privileges to the API
roles (`anon`, `authenticated`, `service_role`). They assume hosted Supabase grants them
via schema-level default privileges — so production works as-is.

- `013_rls_hardening.sql` `REVOKE`s UPDATE on `profiles` and re-grants specific columns;
  this only makes sense *on top of* an existing base grant.
- A bare local `supabase start` does **not** apply those default grants, so the
  integration harness applies `ALTER DEFAULT PRIVILEGES` **before** migrations
  (`tests/integration/fixtures/db-admin.ts` → `npm run db:bootstrap`). Test-harness
  concern only; hosted Supabase already has the grants.

**TODO (future self-host / hardening pass):** make grants explicit in the migrations
instead of relying on the platform default. Deferred intentionally.
