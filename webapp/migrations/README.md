# Migrations

Applied in filename order by `scripts/migrate.ts` (tracked in `public.schema_migrations`).
Run them deliberately with `npm run db:migrate` (needs `DATABASE_URL`); the build no
longer runs migrations. See `docs/DEPLOYMENTS.md` for the full flow.

## `012_db_helpers.sql` is missing from the repo — and it is recoverable

Production's `schema_migrations` records `012_db_helpers.sql` (applied 2026-04-24), but the
file isn't in this tree. **It does exist in git history** — an earlier version of this note
wrongly said it existed in no branch:

```bash
git show 7a5c0ed:webapp/migrations/012_db_helpers.sql > webapp/migrations/012_db_helpers.sql
```

It's on `origin/feature/affiliate-marketing`, 59 lines, and defines
`decrement_referral_credit()` and `expire_gifted_pro()` — both of which exist in the live
database, which is how we know it's the right file. So this is a straight recovery; **no DDL
reconstruction and no placeholder file needed.**

Committing it is safe: `schema_migrations` already lists the filename, so `migrate.ts` will
not re-run it. The only effect is that the repo stops lying about its own history.

### Ledger note: `012_rls_hardening.sql` is a phantom row

The launch-hardening migration was originally numbered `012_rls_hardening.sql` and was
renumbered to `013_rls_hardening.sql` to free the `012` slot. Prod ran **both** names — the
same SQL, ~1.5h apart — so `schema_migrations` holds a `012_rls_hardening.sql` row that
matches no file in any branch. Harmless (the migration is idempotent), but don't be confused
by it, and don't try to "fix" it by re-adding a `012_rls_hardening.sql` file.

## `013_rls_hardening.sql` — applied to production 2026-07-28

Adds `profiles.pro_payment_id` (needed for refund→revoke), restricts writes to the
entitlement columns on `profiles` to the service role, tightens the `collections`
insert/update policies, and enables RLS on `public.schema_migrations` (the CRITICAL Supabase
advisor item).

Verified against the live database: `pro_payment_id` present; RLS enabled on `profiles`,
`collections`, and `schema_migrations`; `anon`/`authenticated` hold no UPDATE grant on the
entitlement columns (only `avatar_url`, `cancel_at_period_end`, `username`); an anonymous
read of `schema_migrations` returns `401 permission denied`.

## `017_feedback.sql` — applied to production 2026-08-10

Creates `public.feedback` for the `/feedback` form. Before it ran, every submission failed
with `save_failed` (500) — the form showed its error state, so nothing was silently dropped,
but nothing was kept either. That's history now; submissions persist.

Read the results with the service role (the Supabase SQL editor / dashboard) — by design
there is no read path for `anon` or `authenticated`:

```sql
SELECT created_at, rating, source, name, email, liked, confusing, feature_request
  FROM public.feedback ORDER BY created_at DESC;
```

The table is deliberately **write-only for the API roles**: an anonymous `INSERT` policy
(so a friend with no account can submit) and no `SELECT`/`UPDATE`/`DELETE` policy at all.
That does mean the anon key can insert directly, skipping `/api/feedback`'s per-IP rate
limit, so the policy's `WITH CHECK` — rating in range, at least one answer, `user_id`
either NULL or the caller's own — is the real bound on what a junk row can be. If spam
ever shows up in practice, the fix is to drop the anon INSERT policy and let the
service-role route be the only writer.

## `018_pending_refunds.sql` — applied to production 2026-08-13

Creates `public.pending_refunds`, the ledger of refunds we owe but couldn't pay
automatically (Dodo returns 409 `INSUFFICIENT_WALLET_FUNDS` when the merchant wallet hasn't
settled). Verified against the live database: table present with all 8 columns; RLS enabled
with **zero policies**; no `SELECT`/`INSERT`/`UPDATE`/`DELETE` grant to `anon` or
`authenticated`; `payment_id` unique; the partial `idx_pending_refunds_unresolved` index in
place. Service-role only, by design — read it from the dashboard:

```sql
SELECT created_at, payment_id, reason, amount_cents, currency
  FROM public.pending_refunds WHERE resolved_at IS NULL ORDER BY created_at;
```

### Cautionary tale: this one was applied by hand, and the ledger got ahead of the schema

The first attempt ran the `INSERT INTO schema_migrations` **without** the migration body, so
production ended up with a ledger row for `018` and no `pending_refunds` table. That's worse
than an unapplied migration: `migrate.ts` derives "pending" from the ledger alone, so
`db-migrate` skipped `018` from then on, while the cancellation path and the
`refund.succeeded` webhook both referenced a table that didn't exist. It went unnoticed until
someone queried the database directly.

If you hand-apply a migration, verify the *objects*, not the ledger row — the ledger is a
claim, the catalog is the fact:

```sql
SELECT to_regclass('public.<new_table>');   -- NULL means the DDL never ran
```

The recovery is to run the migration body with `ON CONFLICT (version) DO NOTHING` on the
ledger insert, which is exactly what happened here — so `018`'s `applied_at` (08:51 UTC)
is the timestamp of the *failed* attempt, a few hours before the DDL actually landed.

## Grants: every `CREATE TABLE` ships its own

From **2026-10-30** Supabase no longer auto-grants Data API access on newly created
`public` tables. A migration that creates a table and doesn't grant on it leaves
supabase-js / PostgREST / GraphQL answering `permission denied` on any project that
replays migrations (fresh project, preview branch, local `supabase db reset`). Tables that
already exist keep their grants, so production is unaffected.

`020_explicit_api_grants.sql` backfills the grants for every table in `001`–`019`. **From
`021` on, a migration that creates a public table must grant in the same file**, least
privilege, bounded by the table's RLS policies (grants are table-level; RLS is the row
filter — never grant what no policy or code path uses, and never enable a grant without
RLS on):

```sql
CREATE TABLE IF NOT EXISTS public.<table> ( ... );
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
-- + CREATE POLICY ... for each operation you grant below

GRANT SELECT ON public.<table> TO anon;                                 -- only if publicly readable
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated; -- only the ops a policy allows
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO service_role;  -- server routes (bypass RLS, still need privileges)
-- Service-role-only table (e.g. pending_refunds): grant to service_role only.
-- Write-only intake (e.g. feedback): column-level INSERT, no SELECT — see 017.
```

Use `GRANT` only, never a table-wide `REVOKE`, unless the table really is hardened (013,
014, 017–019 show the column-level pattern) — a blanket grant on top of those would undo
them. Sequences (`serial`/`identity`) need `GRANT USAGE, SELECT ON SEQUENCE ... TO` the
same roles; none exist today (all ids are `gen_random_uuid()`).

`db:bootstrap` (default privileges in `tests/integration/fixtures/db-admin.ts`) is now
redundant for correctness and **masks a missing grant** in CI; to prove a new migration's
grants, replay it on a database *without* bootstrap and run a query as each API role.
