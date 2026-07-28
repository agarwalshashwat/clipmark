# ClipMark — Deployments & Environments

Plain-English runbook for shipping ClipMark safely. If you only read one thing:
**code deploys automatically on merge; database migrations do NOT — you run those
by hand, staging first, then production.**

---

## 1. The two environments

| | **Production** | **Preview / Staging** |
|---|---|---|
| When | `main` is deployed | every PR / non-`main` branch gets its own preview URL |
| Vercel env scope | "Production" | "Preview" |
| Supabase project | **prod** project | a **separate staging** project (see the owner checklist) |
| Dodo mode | **LIVE** keys | **TEST** keys (no real charges) |
| Who sees it | real users | you, for testing before merge |

**Golden rule:** Preview must point at the **staging** Supabase + **Dodo TEST** mode.
Production points at the **prod** Supabase + **Dodo LIVE** mode. They never share
credentials.

---

## 2. The everyday flow

```
create branch  →  open PR  →  Vercel builds a Preview (staging)  →  review + CI green  →  merge to main  →  Vercel deploys Production
```

1. `git checkout -b my-change` off `main`.
2. Push and open a PR. Vercel auto-builds a **Preview** using the Preview env vars.
3. CI runs (unit, integration, smoke). Test the Preview URL.
4. Merge the PR → `main` → Vercel auto-deploys **Production**.
5. **If your change needs a DB migration, run it deliberately (section 3) — the
   build no longer does it for you.**

---

## 3. Database migrations (now a deliberate step)

Migrations used to run automatically on every build (`tsx scripts/migrate.ts &&
next build`). That was risky — a preview build could mutate a database, and a
missing `DATABASE_URL` broke the build. **The build is now just `next build`.**

Migrations are files in `webapp/migrations/` named `NNN_description.sql`, applied
in numeric order. Applied versions are tracked in the `public.schema_migrations`
table, so each file runs **once** per database.

### How to run migrations

Always **staging first, then production**, and eyeball the result before prod.

```bash
cd webapp

# 1) STAGING — point DATABASE_URL at the staging Supabase DB
DATABASE_URL='postgres://…staging…' npm run db:migrate
#   → check the staging app still works

# 2) PRODUCTION — only after staging looks good
DATABASE_URL='postgres://…prod…' npm run db:migrate
```

Where to get `DATABASE_URL`: Supabase dashboard → Settings → Database →
Connection string → **URI** (Session pooler, port 5432). See the owner checklist.

`make db-migrate` does the same (reads `DATABASE_URL` from your env).

### Golden rules for migrations

- **Never edit a migration that has already been applied** to any database.
  Once `012_x.sql` has run, treat it as frozen — write a new higher-numbered file
  to make further changes.
- **Numbered in order, no gaps, no duplicate numbers.** The next new migration is
  the highest existing number + 1.
- **One logical change per file**, with a comment at the top explaining what and why.
- **Run on staging first**, confirm, then production. Never run untested SQL on prod.
- The build must **never** run migrations. Keep `webapp build` = `next build`.

### Rolling back

`migrate.ts` only rolls **forward** (there are no automatic "down" migrations), so
rollback is manual and deliberate:

- **Preferred:** write a new migration that reverses the change (e.g.
  `014_revert_foo.sql`) and apply it staging→prod. This keeps history honest.
- **Emergency:** manually run the inverse SQL in the Supabase SQL editor on the
  affected DB, then record what you did. Fix the migration files afterward so the
  repo matches reality.
- **Before any risky migration:** take a Supabase backup/snapshot first (Supabase
  dashboard → Database → Backups) so you can restore.

---

## 4. Migration hygiene — the current `012` discrepancy (READ BEFORE THE NEXT DEPLOY)

There is a known inconsistency between the repo and the production database that
must be reconciled. Two separate problems:

### 4a. The prod DB recorded a `012_db_helpers.sql` that is not in the repo

The production database's `schema_migrations` table lists **`012_db_helpers.sql`**
as applied — but that file exists in **neither `main` nor any open branch**. So the
repo's migration history and the DB's history have diverged at slot 012.

**Owner must reconcile** by getting the real `012_db_helpers.sql` back into the repo
so history matches:
1. Find the original file — check other branches, closed PRs, or whoever added the
   DB helpers (`git log --all -- 'webapp/migrations/012*'`, search old PRs).
2. If found, commit it to `webapp/migrations/012_db_helpers.sql` **verbatim**.
   Because `schema_migrations` already lists it, `migrate.ts` will **not** re-run it —
   this only makes the repo honest and prevents a future number clash.
3. If it's truly lost, reconstruct it from the live schema: in the Supabase SQL
   editor, dump the objects it created (helper functions/indexes — inspect
   `pg_proc` / `pg_indexes` for anything not created by migrations `001–011`) and
   save that as `012_db_helpers.sql`. Do **not** guess — export the actual DDL.

> ⚠️ Do not fabricate this file's contents. An empty/placeholder `012` would
> misrepresent what's on prod.

### 4b. The launch-hardening migration must be renumbered `012 → 013`

The `fix/launch-blockers` branch (PR #32) adds a migration named
**`012_rls_hardening.sql`**. That number is already taken on prod by
`012_db_helpers.sql` (above), so it must become **`013_rls_hardening.sql`**.

This rename was **intentionally not done in this PR**, because
`012_rls_hardening.sql` only exists on PR #32 (not on `main`). Creating a `013`
here would collide/duplicate with #32's `012` when both merge. Instead, do the
rename **once #32 is merged** (or on #32 before it merges):

```bash
git mv webapp/migrations/012_rls_hardening.sql webapp/migrations/013_rls_hardening.sql
# update the reference in webapp/migrations/README.md (012 → 013)
```

`013_rls_hardening.sql` has **not been applied to prod yet** — the prod `profiles`
table has no `pro_payment_id` column, and the RLS lockdown it contains is not live.
After renumbering, apply it deliberately via section 3 (staging → prod). Until then,
the self-grant-Pro fix and the refund→revoke path are NOT active on prod.

---

## 5. Environment variables per environment

Set these in Vercel (Project → Settings → Environment Variables), scoped to
**Production** and **Preview** separately. See the owner checklist for click-by-click.

| Variable | Production | Preview / Staging | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | **staging** project URL | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | staging anon key | public-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service_role | staging service_role | **secret** — server only |
| `DATABASE_URL` | *(optional now)* prod URI | *(optional)* staging URI | Only needed by `db:migrate`, **not** by the build. Safe to leave out of Vercel entirely and pass it manually when migrating. |
| `DODO_PAYMENTS_API_KEY` | **LIVE** key | **TEST** key | Dodo dashboard (live vs test mode) |
| `DODO_MONTHLY_PRODUCT_ID` | live product id | test product id | must match the mode |
| `DODO_ANNUAL_PRODUCT_ID` | live product id | test product id | |
| `DODO_LIFETIME_PRODUCT_ID` | live product id | test product id | |
| `DODO_PAYMENTS_WEBHOOK_SECRET` | **live** endpoint secret | **test** endpoint secret | Dodo → Webhooks (per-mode) |
| `NEXT_PUBLIC_APP_URL` | `https://clipmark.mithahara.com` | the Preview URL (or a fixed staging domain) | used for checkout `return_url` |
| `ADMIN_USER_IDS` | your prod admin UUID(s) | your staging admin UUID(s) | comma-separated Supabase user UUIDs |
| `YOUTUBE_API_KEY` | prod key | prod or a test key | for the comments proxy |
| `REVALIDATE_SECRET` | random secret | random secret | price-cache busting |
| *(later)* `NEXT_PUBLIC_SENTRY_DSN` | Sentry project DSN | same DSN | when Sentry is wired up (#3) |
| *(later)* `SENTRY_AUTH_TOKEN` | build-time upload token | — | server secret, for source maps |

### ⚠️ Known limitation: the Dodo test/live switch keys off `NODE_ENV`

The Dodo client currently chooses its mode like this:

```ts
environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode'
```

- **Local dev** (`npm run dev`, `NODE_ENV=development`) → `test_mode` automatically. ✅
- **Any Vercel build** — Production **and Preview** — runs with `NODE_ENV=production`
  → `live_mode`. ❗

So a Vercel **Preview** would run the client in `live_mode` even if you give it Dodo
**test** keys — and a test key against the live endpoint will be rejected (or worse,
mismatch). **Putting test keys in Preview is necessary but not sufficient** with the
current switch.

Practical guidance until this is improved:
- **Do full test-mode checkout testing locally** (`npm run dev` → `test_mode`), not on
  the Vercel Preview. This is the money-free path today.
- **Recommended follow-up:** drive the Dodo mode from an explicit env var (e.g.
  `DODO_MODE=test|live`) instead of `NODE_ENV`, so Preview can be a production build
  yet still run Dodo in `test_mode`. Small change in `lib/clients.ts` +
  `app/(marketing)/upgrade/actions.ts`.

---

## 6. Quick reference

```bash
# deploy code: just merge to main (Vercel does the rest)
# run a migration (deliberate, staging → prod):
cd webapp && DATABASE_URL='…staging…' npm run db:migrate
cd webapp && DATABASE_URL='…prod…'    npm run db:migrate
# build locally (no DB needed):
cd webapp && npm run build
```
