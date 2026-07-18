# Migrations

Applied in filename order by `scripts/migrate.ts` (tracked in `public.schema_migrations`).
`migrate.ts` needs `DATABASE_URL`; it disables SSL for local hosts and requires it otherwise.

## ⚠️ Accepted assumption: migrations rely on hosted Supabase's default grants

These migrations **do not** explicitly `GRANT` table-level data privileges
(SELECT/INSERT/UPDATE/DELETE) to the API roles (`anon`, `authenticated`,
`service_role`). They assume the hosting platform grants them automatically —
which hosted Supabase does via schema-level default privileges, so production
works as-is.

Consequences to keep on record:

- **Migration `012_rls_hardening.sql`** `REVOKE`s UPDATE on `profiles` from
  `anon`/`authenticated` and re-grants specific columns. This only makes sense
  *on top of* an existing base grant. If the base grants are ever absent, the
  security model degrades in confusing ways (e.g. `service_role` losing SELECT).
- **A bare local `supabase start` does NOT apply those default grants** to
  tables these migrations create — the roles get only non-data privileges and
  every PostgREST query fails `42501 permission denied`. The integration harness
  works around this by applying `ALTER DEFAULT PRIVILEGES` **before** migrations
  (`tests/integration/fixtures/db-admin.ts` → `npm run db:bootstrap`).

**TODO (future self-host / hardening pass):** if ClipMark is ever self-hosted or
we want migrations to be portable/standalone, make the grants explicit in the
migrations (or add a dedicated grants migration) instead of relying on the
platform default. Decision deferred intentionally — see docs/TEST_PLAN_launch.md.
